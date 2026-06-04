/**
 * Convert a File object to a base64 data URI string.
 */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Extract the raw base64 string (no data URI prefix) and MIME type from a data URI.
 */
export function parseDataUri(dataUri) {
  const match = dataUri.match(/^data:(.+?);base64,(.+)$/)
  if (!match) throw new Error('Invalid data URI')
  return { mimeType: match[1], base64: match[2] }
}

/**
 * Trigger a browser download for a base64-encoded image.
 */
export function downloadBase64Image(base64, filename = 'cross-creek-design.png') {
  const link = document.createElement('a')
  link.href = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Resize an image File so the longest side is at most `maxDim` pixels,
 * re-encoded as JPEG. Returns a new File suitable for upload.
 *
 * Why: iPad photos can be 5–10MB. The Gemini proxy carries base64-encoded
 * image bytes in the request body; Netlify Functions cap request body at
 * ~6MB. Resizing to 2048px JPEG keeps each photo well under 1MB while
 * preserving more than enough detail for Nano Banana Pro to work with.
 *
 * Falls back to the original file if the browser can't decode it
 * (rare for normal photos but possible for unusual formats).
 */
export async function resizeImageForUpload(file, { maxDim = 2048, quality = 0.85 } = {}) {
  // Skip non-images and tiny files where resize would be a waste.
  if (!file || !file.type?.startsWith('image/')) return file
  if (file.size < 500_000) return file // <500KB — already small enough

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    const longest = Math.max(width, height)

    // Already small enough — skip the canvas round-trip.
    if (longest <= maxDim) {
      bitmap.close?.()
      return file
    }

    const scale = maxDim / longest
    const newW = Math.round(width * scale)
    const newH = Math.round(height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = newW
    canvas.height = newH
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, newW, newH)
    bitmap.close?.()

    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    )
    if (!blob) return file

    // Preserve original name with a .jpg extension since we re-encoded
    const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '')
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
  } catch (err) {
    console.warn('[imageUtils] resize failed, using original:', err.message)
    return file
  }
}
