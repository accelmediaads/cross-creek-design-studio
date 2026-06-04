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

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
