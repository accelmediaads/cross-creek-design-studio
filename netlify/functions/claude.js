// POST /api/claude — proxies a request to Anthropic Messages API.
//
// The frontend sends exactly what it would have sent to Anthropic directly
// (model, messages, system, max_tokens, etc.) MINUS the API key. We add the
// server-side key and forward.
//
// Requires a valid Supabase session (verified by requireAuth).

import { requireAuth, json } from './_authMiddleware.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const auth = await requireAuth(request)
  if (auth instanceof Response) return auth

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json({ error: 'Server misconfigured: ANTHROPIC_API_KEY missing' }, 500)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // Defensive: don't let the client override our auth / inject headers.
  // Whitelisted fields only — matches what the existing frontend sends.
  const upstreamBody = {
    model: body.model,
    max_tokens: body.max_tokens,
    system: body.system,
    messages: body.messages,
    temperature: body.temperature,
    top_p: body.top_p,
    stop_sequences: body.stop_sequences,
  }
  // Drop undefined keys so Anthropic doesn't complain.
  for (const k of Object.keys(upstreamBody)) {
    if (upstreamBody[k] === undefined) delete upstreamBody[k]
  }

  let upstream
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(upstreamBody),
    })
  } catch (err) {
    return json({ error: `Upstream fetch failed: ${err.message}` }, 502)
  }

  // Pass through Anthropic's response verbatim — same status code, same body.
  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': 'application/json' },
  })
}

// Netlify v2 function config — surfaces at /api/claude via the redirect in netlify.toml
export const config = {
  path: '/api/claude',
}
