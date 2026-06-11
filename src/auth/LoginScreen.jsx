// Sign-in / sign-up screen, shown when no Supabase session exists.
//
// iPad-friendly: large tap targets, autocomplete hints so the browser will
// offer to save the password the first time, and a clear error state.
//
// Two modes:
//   - 'signin' (default): email + password.
//   - 'signup': email + password + signup code. Verified server-side via
//     /api/signup. New users go into the shared workspace (same RLS as
//     Randy/office), so they see everything once logged in.

import { useState } from 'react'
import { useAuth } from './AuthProvider.jsx'
import Logo from '../components/Logo.jsx'

export default function LoginScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')   // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupCode, setSignupCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) return
    if (isSignup && !signupCode) {
      setError('Signup code is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (isSignup) {
        await signUp(email.trim(), password, signupCode.trim())
      } else {
        await signIn(email.trim(), password)
      }
      // AuthProvider's onAuthStateChange will swap us to the app view.
    } catch (err) {
      setError(err.message || `${isSignup ? 'Sign-up' : 'Sign-in'} failed`)
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError(null)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <Logo />
        </div>
        <h1 className="login-title">Cross Creek Design Studio</h1>
        <p className="login-subtitle">
          {isSignup ? 'Create your account' : 'Sign in to continue'}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete={isSignup ? 'email' : 'username'}
              inputMode="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck="false"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@crosscreek.studio"
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={isSignup ? 8 : undefined}
              placeholder={isSignup ? 'At least 8 characters' : undefined}
            />
          </label>

          {isSignup && (
            <label className="login-field">
              <span>Signup code</span>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                value={signupCode}
                onChange={e => setSignupCode(e.target.value)}
                required
                placeholder="Ask Randy or the office"
              />
            </label>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary btn-large"
            disabled={busy || !email || !password || (isSignup && !signupCode)}
          >
            {busy
              ? (isSignup ? 'Creating account…' : 'Signing in…')
              : (isSignup ? 'Create account' : 'Sign in')}
          </button>
        </form>

        <div className="login-mode-switch">
          {isSignup ? (
            <button type="button" className="login-switch-link" onClick={() => switchMode('signin')}>
              Already have an account? Sign in
            </button>
          ) : (
            <button type="button" className="login-switch-link" onClick={() => switchMode('signup')}>
              New here? Create an account
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
