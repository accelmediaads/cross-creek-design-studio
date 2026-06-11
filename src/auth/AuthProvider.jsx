// Supabase Auth context.
//
// Subscribes to auth state changes once at the root and exposes `user`,
// `session`, and the auth actions to the whole app via useAuth().
//
// The Supabase client is configured with persistSession:true (see
// src/api/supabase.js) so a successful login survives reloads / iPad sleeps
// — Randy logs in once and stays signed in until he explicitly signs out.

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../api/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // Pull the existing session on first paint (from localStorage cache).
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data?.session ?? null)
      setLoading(false)
    })

    // Subscribe to future auth changes (login, logout, token refresh).
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
    })

    return () => {
      mounted = false
      subscription?.subscription?.unsubscribe?.()
    }
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  /**
   * Self-serve signup. Goes through our server-side /api/signup function
   * so we can gate on the signup code (kept as a Netlify env var, never in
   * the browser bundle). On success, immediately signs the new user in.
   */
  async function signUp(email, password, signupCode) {
    const response = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, signupCode }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || `Signup failed: ${response.status}`)
    }
    // Account created (auto-confirmed server-side). Now sign them in.
    return signIn(email, password)
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signIn,
    signUp,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
