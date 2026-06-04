// Frontend wrapper around our /api/gemini proxy.
//
// The proxy adds the server-side GEMINI_API_KEY and forwards to Google's
// Generative Language API for the Nano Banana Pro image model.

import { parseDataUri } from '../utils/imageUtils.js'
import { getAccessToken } from './supabase.js'

async function callGemini(body) {
  const token = await getAccessToken()
  if (!token) throw new Error('Not signed in')

  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message || err.error || `Gemini proxy error: ${response.status}`)
  }
  return response.json()
}

/**
 * Generate a landscape design image using Nano Banana Pro (Gemini).
 *
 * @param {string} prompt - The optimized prompt from Claude
 * @param {string[]} photoDataUris - Array of base64 data URIs for site photos
 * @param {string|null} topoDataUri - Optional topo map data URI
 * @returns {{ imageBase64: string, mimeType: string, text: string, dataUri: string }}
 */
export async function generateDesignImage(prompt, photoDataUris, topoDataUri = null) {
  const parts = [{ text: prompt }]

  for (const uri of photoDataUris) {
    const { mimeType, base64 } = parseDataUri(uri)
    parts.push({ inlineData: { mimeType, data: base64 } })
  }
  if (topoDataUri) {
    const { mimeType, base64 } = parseDataUri(topoDataUri)
    parts.push({ inlineData: { mimeType, data: base64 } })
  }

  const data = await callGemini({
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  })
  return extractImageFromResponse(data)
}

/**
 * Revise an existing generated image using Nano Banana Pro.
 *
 * @param {string} prompt - The revision prompt from Claude
 * @param {string} imageDataUri - The generated image to revise (data URI)
 * @returns {{ imageBase64: string, mimeType: string, text: string, dataUri: string }}
 */
export async function reviseDesignImage(prompt, imageDataUri) {
  const { mimeType, base64 } = parseDataUri(imageDataUri)
  const parts = [
    { text: prompt },
    { inlineData: { mimeType, data: base64 } },
  ]

  const data = await callGemini({
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  })
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
