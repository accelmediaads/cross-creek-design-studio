// Shared Supabase JWT verification for the API proxy functions.
//
// Why: the proxies forward to paid APIs (Anthropic, Gemini). Anyone who finds
// the URLs could otherwise burn through credits. We require a valid Supabase
// session — i.e. Randy or office logged in.
//
// The browser sends `Authorization: Bearer <supabase_access_token>`. We hand
// it to Supabase, which verifies the signature + expiry and returns the user.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // Don't crash module load — surface in the request handler so the request
  // returns a useful error instead of a silent 500.
  console.warn('[auth] Missing SUPABASE env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Netlify env.')
}

/**
 * Verify the bearer token on a request and return the Supabase user, or a
 * Response (error) if the token is missing/invalid.
 *
 * Usage:
 *   const auth = await requireAuth(request)
 *   if (auth instanceof Response) return auth
 *   const { user } = auth
 */
export async function requireAuth(request) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return json({ error: 'Server misconfigured: Supabase env vars missing' }, 500)
  }

  const authHeader = request.headers.get('authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return json({ error: 'Missing Authorization: Bearer <token>' }, 401)
  }
  const token = match[1]

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    return json({ error: 'Invalid or expired session' }, 401)
  }

  return { user: data.user }
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...extraHeaders,
    },
  })
}
