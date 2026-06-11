// POST /api/signup — gated self-serve signup.
//
// Body: { email, password, signupCode }
//
// Flow:
//   1. Validate signup code against the server-side env (SIGNUP_CODE).
//   2. If valid, use the Supabase SECRET key to admin-create the user
//      with email_confirm=true so they can sign in immediately.
//   3. Return { ok: true } on success, or { error: "..." } with a 4xx.
//
// Notes:
//   - The signup code stays server-side. The browser never sees the real
//     code, only knows whether its attempt succeeded.
//   - We rate-limit by IP at the Netlify level if needed later; for now we
//     just trust the signup code as the only barrier.
//   - We DON'T sign the user in here. The frontend signs them in with
//     supabase.auth.signInWithPassword(email, password) after a successful
//     signup, using the credentials it just sent.

import { createClient } from '@supabase/supabase-js'
import { json } from './_authMiddleware.js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY
const SIGNUP_CODE = process.env.SIGNUP_CODE

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return json({ error: 'Server misconfigured: Supabase env vars missing' }, 500)
  }
  if (!SIGNUP_CODE) {
    return json({ error: 'Server misconfigured: SIGNUP_CODE not set' }, 500)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const signupCode = (body.signupCode || '').trim()

  if (!email || !password) {
    return json({ error: 'Email and password are required' }, 400)
  }
  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400)
  }
  // Simple constant-time-ish compare. The code is short so the difference
  // doesn't really matter for timing — but be polite.
  if (!safeEqual(signupCode, SIGNUP_CODE)) {
    return json({ error: 'Invalid signup code' }, 403)
  }

  // Admin-create the user (auto-confirmed so they can log in immediately).
  const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    // Common case: user already exists. Surface a friendly message.
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      return json({ error: 'An account with that email already exists. Try signing in instead.' }, 409)
    }
    return json({ error: error.message || 'Failed to create account' }, 400)
  }

  return json({ ok: true, userId: data?.user?.id || null })
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export const config = {
  path: '/api/signup',
}
