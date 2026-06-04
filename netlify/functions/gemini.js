// POST /api/gemini — proxies a request to Google Generative Language API
// for the Nano Banana Pro image model.
//
// The frontend sends { contents, generationConfig } (the body shape Gemini
// expects). We add the server's API key as a query param and forward.
//
// Requires a valid Supabase session.

import { requireAuth, json } from './_authMiddleware.js'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent'

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return json({ error: 'Server misconfigured: GEMINI_API_KEY missing' }, 500)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // Whitelist what we forward, matching the shape api/gemini.js sends.
  const upstreamBody = {
    contents: body.contents,
    generationConfig: body.generationConfig,
    safetySettings: body.safetySettings,
  }
  for (const k of Object.keys(upstreamBody)) {
    if (upstreamBody[k] === undefined) delete upstreamBody[k]
  }

  let upstream
  try {
    upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(upstreamBody),
    })
  } catch (err) {
    return json({ error: `Upstream fetch failed: ${err.message}` }, 502)
  }

  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  })
}

export const config = {
  path: '/api/gemini',
}
