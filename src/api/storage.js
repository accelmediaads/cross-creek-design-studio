// Thin wrappers around Supabase Storage for the two buckets we use:
//   project-photos  (uploaded site photos + topo maps)
//   generations     (AI-generated images)
//
// Buckets are private; reads happen via short-lived signed URLs.

import { supabase } from './supabase.js'

const SIGNED_URL_TTL = 60 * 60 // 1 hour — plenty for a session, expires on its own

/**
 * Upload a File or Blob to a bucket at a specific path.
 * Returns the full storage_path (matches what we store in the DB).
 *
 * Path convention:
 *   project-photos: <projectId>/<random>.<ext>
 *   generations:    <projectId>/<random>.<ext>
 */
export async function uploadToBucket(bucket, path, fileOrBlob, contentType) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, fileOrBlob, {
      cacheControl: '3600',
      upsert: false,
      contentType: contentType || fileOrBlob.type || 'application/octet-stream',
    })
  if (error) throw error
  return path
}

/**
 * Get a temporary signed URL for displaying a stored file in the browser.
 */
export async function getSignedUrl(bucket, path, ttlSeconds = SIGNED_URL_TTL) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds)
  if (error) throw error
  return data.signedUrl
}

/**
 * Batch helper: sign many paths at once. Returns an object mapping
 * path → signedUrl.
 */
export async function getSignedUrls(bucket, paths, ttlSeconds = SIGNED_URL_TTL) {
  if (!paths || paths.length === 0) return {}
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, ttlSeconds)
  if (error) throw error
  const out = {}
  for (const row of data) {
    if (row.path && row.signedUrl) out[row.path] = row.signedUrl
  }
  return out
}

/**
 * Delete a stored object.
 */
export async function deleteFromBucket(bucket, path) {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}

/**
 * Convenience: download a stored object as a base64 data URI.
 * Used when handing photos to the Gemini proxy (which wants inline base64).
 */
export async function downloadAsDataUri(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  return await blobToDataUri(data)
}

export function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Random-ish filename helper. Don't use crypto.randomUUID because we want
 * something short for the storage path.
 */
export function randomId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function fileExt(file) {
  const m = (file?.name || '').match(/\.([a-z0-9]+)$/i)
  if (m) return m[1].toLowerCase()
  // Fall back from the MIME type.
  if (file?.type === 'image/jpeg') return 'jpg'
  if (file?.type === 'image/png') return 'png'
  if (file?.type === 'image/webp') return 'webp'
  if (file?.type === 'image/heic') return 'heic'
  return 'bin'
}
