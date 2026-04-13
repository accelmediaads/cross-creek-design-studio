import { parseDataUri } from '../utils/imageUtils.js'

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'

function getApiKey() {
  return import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('cc_gemini_key') || ''
}

/**
 * Generate a landscape design image using Nano Banana Pro (Gemini).
 *
 * @param {string} prompt - The optimized prompt from Claude
 * @param {string[]} photoDataUris - Array of base64 data URIs for site photos
 * @param {string|null} topoDataUri - Optional topo map data URI
 * @returns {{ imageBase64: string, mimeType: string, text: string }}
 */
export async function generateDesignImage(prompt, photoDataUris, topoDataUri = null) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Gemini API key not configured')

  // Build the parts array: text prompt first, then images
  const parts = [{ text: prompt }]

  for (const uri of photoDataUris) {
    const { mimeType, base64 } = parseDataUri(uri)
    parts.push({
      inlineData: { mimeType, data: base64 },
    })
  }

  if (topoDataUri) {
    const { mimeType, base64 } = parseDataUri(topoDataUri)
    parts.push({
      inlineData: { mimeType, data: base64 },
    })
  }

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      err.error?.message || `Gemini API error: ${response.status}`
    )
  }

  const data = await response.json()
  return extractImageFromResponse(data)
}

/**
 * Revise an existing generated image using Nano Banana Pro.
 *
 * @param {string} prompt - The revision prompt from Claude
 * @param {string} imageDataUri - The generated image to revise (data URI)
 * @returns {{ imageBase64: string, mimeType: string, text: string }}
 */
export async function reviseDesignImage(prompt, imageDataUri) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('Gemini API key not configured')

  const { mimeType, base64 } = parseDataUri(imageDataUri)

  const parts = [
    { text: prompt },
    { inlineData: { mimeType, data: base64 } },
  ]

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(
      err.error?.message || `Gemini API error: ${response.status}`
    )
  }

  const data = await response.json()
  return extractImageFromResponse(data)
}

function extractImageFromResponse(data) {
  let imageBase64 = null
  let mimeType = 'image/png'
  let text = ''

  const parts = data.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    if (part.inlineData) {
      imageBase64 = part.inlineData.data
      mimeType = part.inlineData.mimeType || 'image/png'
    }
    if (part.text) {
      text = part.text
    }
  }

  if (!imageBase64) {
    throw new Error('No image returned from Gemini. The model may have refused the request or returned text only.')
  }

  return {
    imageBase64,
    mimeType,
    dataUri: `data:${mimeType};base64,${imageBase64}`,
    text,
  }
}
