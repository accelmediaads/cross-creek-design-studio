// CRUD for the generations table + the matching files in the generations bucket.

import { supabase } from './supabase.js'
import {
  uploadToBucket,
  deleteFromBucket,
  getSignedUrls,
  randomId,
} from './storage.js'

const BUCKET = 'generations'

/**
 * List generations for a project, newest first. Each row gets a signedUrl.
 */
export async function listProjectGenerations(projectId) {
  const { data, error } = await supabase
    .from('generations')
    .select('id, project_id, source_photo_id, parent_generation_id, kind, prompt, storage_path, prefs_snapshot, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = data || []
  const paths = rows.map(r => r.storage_path)
  const urlByPath = await getSignedUrls(BUCKET, paths)
  return rows.map(r => ({ ...r, signedUrl: urlByPath[r.storage_path] || null }))
}

/**
 * Persist a generation: uploads the image bytes to the bucket and
 * inserts a row in `generations`.
 *
 * @param {Object} params
 * @param {string} params.projectId
 * @param {string|null} params.sourcePhotoId
 * @param {string|null} params.parentGenerationId
 * @param {'initial'|'variation'|'revision'} params.kind
 * @param {string} params.prompt
 * @param {object} params.prefsSnapshot
 * @param {string} params.imageBase64
 * @param {string} params.mimeType
 */
export async function saveGeneration({
  projectId,
  sourcePhotoId = null,
  parentGenerationId = null,
  kind = 'initial',
  prompt,
  prefsSnapshot = {},
  imageBase64,
  mimeType = 'image/png',
}) {
  // Convert base64 → Blob for upload.
  const blob = base64ToBlob(imageBase64, mimeType)
  const ext = mimeType.split('/')[1]?.split('+')[0] || 'png'
  const storage_path = `${projectId}/${randomId()}.${ext}`

  await uploadToBucket(BUCKET, storage_path, blob, mimeType)

  const { data: userData } = await supabase.auth.getUser()
  const created_by = userData?.user?.id ?? null

  const { data, error } = await supabase
    .from('generations')
    .insert({
      project_id: projectId,
      source_photo_id: sourcePhotoId,
      parent_generation_id: parentGenerationId,
      kind,
      prompt,
      storage_path,
      prefs_snapshot: prefsSnapshot,
      created_by,
    })
    .select()
    .single()
  if (error) {
    try { await deleteFromBucket(BUCKET, storage_path) } catch {}
    throw error
  }
  return data
}

export async function deleteGeneration(generation) {
  try {
    await deleteFromBucket(BUCKET, generation.storage_path)
  } catch (err) {
    console.warn('[generations] storage delete failed (continuing):', err.message)
  }
  const { error } = await supabase.from('generations').delete().eq('id', generation.id)
  if (error) throw error
}

function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64)
  const len = byteChars.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = byteChars.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}
