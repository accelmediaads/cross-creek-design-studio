// CRUD for project_photos + the matching files in the project-photos bucket.

import { supabase } from './supabase.js'
import {
  uploadToBucket,
  deleteFromBucket,
  getSignedUrls,
  randomId,
  fileExt,
} from './storage.js'
import { resizeImageForUpload } from '../utils/imageUtils.js'

const BUCKET = 'project-photos'

/**
 * List photos for a project. Returns rows + a signedUrl on each row.
 */
export async function listProjectPhotos(projectId) {
  const { data, error } = await supabase
    .from('project_photos')
    .select('id, project_id, kind, storage_path, caption, ordering, created_at')
    .eq('project_id', projectId)
    .order('ordering', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = data || []
  const paths = rows.map(r => r.storage_path)
  const urlByPath = await getSignedUrls(BUCKET, paths)
  return rows.map(r => ({ ...r, signedUrl: urlByPath[r.storage_path] || null }))
}

/**
 * Upload a file to storage and insert a row.
 * @param {string} projectId
 * @param {File} file
 * @param {{ kind?: 'site_photo'|'topo_map', caption?: string, ordering?: number }} opts
 */
export async function uploadProjectPhoto(projectId, file, opts = {}) {
  const kind = opts.kind || 'site_photo'

  // Resize iPad photos before upload so:
  //   - Storage doesn't fill up with huge originals
  //   - The Gemini proxy stays under Netlify's request body limit when
  //     this photo is later sent for generation (it inlines as base64).
  const uploadFile = await resizeImageForUpload(file)

  const ext = fileExt(uploadFile)
  const storage_path = `${projectId}/${randomId()}.${ext}`

  await uploadToBucket(BUCKET, storage_path, uploadFile, uploadFile.type)

  const { data: userData } = await supabase.auth.getUser()
  const uploaded_by = userData?.user?.id ?? null

  const { data, error } = await supabase
    .from('project_photos')
    .insert({
      project_id: projectId,
      uploaded_by,
      kind,
      storage_path,
      caption: opts.caption ?? null,
      ordering: opts.ordering ?? 0,
    })
    .select()
    .single()
  if (error) {
    // Best-effort: roll back the uploaded blob so we don't leak storage.
    try { await deleteFromBucket(BUCKET, storage_path) } catch {}
    throw error
  }
  return data
}

export async function deleteProjectPhoto(photo) {
  // Delete the storage object first; if the DB delete fails we can re-clean later.
  try {
    await deleteFromBucket(BUCKET, photo.storage_path)
  } catch (err) {
    console.warn('[photos] storage delete failed (continuing):', err.message)
  }
  const { error } = await supabase.from('project_photos').delete().eq('id', photo.id)
  if (error) throw error
}
