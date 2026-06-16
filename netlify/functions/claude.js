// POST /api/claude — proxies a request to Anthropic Messages API.
//
// The frontend sends model + messages + system + max_tokens. We add the
// server-side key and forward.
//
// SELF-HEALING MODEL FALLBACK
// ---------------------------
// Anthropic deprecates dated model snapshots periodically. When the model
// we're pinned to returns 404 not_found_error, the function automatically
// retries with the next known-good model in MODEL_FALLBACKS. The first one
// that doesn't 404 gets the request. The successful model name comes back
// to the client in `x-cc-model-used` so we can spot when the pinned model
// has been silently swapped out, and update the pin on our next session.
//
// The client-supplied model is used as the FIRST candidate (so the frontend
// can still steer model choice). After that, our server-side fallbacks
// take over — Randy doesn't see an error, his generation just works.
//
// Requires a valid Supabase session.

import { requireAuth, json } from './_authMiddleware.js'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

// Order matters. Add new pins to the FRONT as Anthropic ships new versions.
// Keep at least one known-good fallback at the tail so we always degrade
// gracefully when the head gets deprecated.
const MODEL_FALLBACKS = [
  'claude-sonnet-4-6',     // current Sonnet alias (as of 2026-06-16)
  'claude-sonnet-4-5',     // previous Sonnet — used as backstop
  'claude-opus-4-8',       // emergency fallback to Opus if Sonnet is gone entirely
]

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

  // Whitelist what we forward (defensive — don't let the client inject headers).
  const upstreamBody = {
    max_tokens: body.max_tokens,
    system: body.system,
    messages: body.messages,
    temperature: body.temperature,
    top_p: body.top_p,
    stop_sequences: body.stop_sequences,
  }
  for (const k of Object.keys(upstreamBody)) {
    if (upstreamBody[k] === undefined) delete upstreamBody[k]
  }

  // Try the client-supplied model first (if any + still in our allowed family),
  // then walk the fallback chain. De-dupe so we don't retry the same ID twice.
  const candidates = []
  if (body.model && typeof body.model === 'string') candidates.push(body.model)
  for (const m of MODEL_FALLBACKS) if (!candidates.includes(m)) candidates.push(m)

  let lastErrText = ''
  let lastStatus = 0

  for (const model of candidates) {
    let upstream
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ ...upstreamBody, model }),
      })
    } catch (err) {
      // Network-level failure — try the next candidate (rare but possible)
      lastErrText = `Upstream fetch failed: ${err.message}`
      lastStatus = 502
      continue
    }

    const text = await upstream.text()

    // 404 not_found_error on the model? Anthropic deprecation signal — try next.
    if (upstream.status === 404 && /not[_-]?found[_-]?error|model:/i.test(text)) {
      console.warn(`[claude proxy] model ${model} returned 404 — falling back`)
      lastErrText = text
      lastStatus = 404
      continue
    }

    // Anything else (success, rate limit, server error, etc.) — return as-is.
    return new Response(text, {
      status: upstream.status,
      headers: {
        'content-type': 'application/json',
        // Surface which model actually served the request so the frontend
        // (or a dev poking the response headers) can see when fallback
        // kicked in. Useful for "wait, when did the model change?" debugging.
        'x-cc-model-used': model,
      },
    })
  }

  // All candidates 404'd. Surface a clear error so the user knows what to do.
  return new Response(
    JSON.stringify({
      error: 'All known Claude model IDs were rejected by Anthropic (deprecation). The app needs its model fallback list updated.',
      upstream_status: lastStatus,
      upstream_body: lastErrText,
      tried: candidates,
    }),
    { status: 502, headers: { 'content-type': 'application/json' } }
  )
}

// Netlify v2 function config — surfaces at /api/claude via the redirect in netlify.toml
export const config = {
  path: '/api/claude',
}
