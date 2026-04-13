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
