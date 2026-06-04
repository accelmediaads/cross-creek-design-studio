import Logo from './Logo'
import { useAuth } from '../auth/AuthProvider.jsx'

export default function Header() {
  const { user, signOut } = useAuth()

  return (
    <header className="app-header">
      <Logo />
      {user && (
        <div className="header-user">
          <span className="header-user-email" title={user.email}>{user.email}</span>
          <button
            className="header-signout-btn"
            onClick={signOut}
            aria-label="Sign out"
            type="button"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}
