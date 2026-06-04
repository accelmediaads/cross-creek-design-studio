// Singleton Supabase client for the frontend.
//
// Uses the publishable key (browser-safe) + RLS policies on the database side.
// Auth session is persisted in localStorage so iPad reloads keep Randy signed in.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.local).'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
})

/**
 * Get the current session's access token (JWT), refreshing if needed.
 * Returns null if there is no session.
 *
 * Used to authorize calls to our /api/claude and /api/gemini proxies.
 */
export async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.warn('[supabase] getSession error:', error.message)
    return null
  }
  return data?.session?.access_token ?? null
}
