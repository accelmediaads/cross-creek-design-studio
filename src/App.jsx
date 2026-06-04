import { useState } from 'react'
import accelLogo from './assets/accel-logo.png'
import Header from './components/Header'
import ProjectsList from './components/ProjectsList'
import ProjectDetail from './components/ProjectDetail.jsx'
import { AuthProvider, useAuth } from './auth/AuthProvider.jsx'
import LoginScreen from './auth/LoginScreen.jsx'

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

function Gate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="app boot-loading">
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return <LoginScreen />
  }

  return <AuthenticatedApp />
}

/**
 * After login, the app is a simple state machine:
 *   view = 'list'    → ProjectsList (home screen)
 *   view = 'project' → ProjectDetail (single project)  — built in task #7
 *
 * We use plain state rather than react-router because v1 is single-device
 * (Randy's iPad) and we don't need shareable URLs yet. If we want bookmarkable
 * project URLs later, we layer in routing without changing data flow.
 */
function AuthenticatedApp() {
  const [view, setView] = useState('list')
  const [currentProject, setCurrentProject] = useState(null)

  function openProject(project) {
    setCurrentProject(project)
    setView('project')
  }

  function backToList() {
    setCurrentProject(null)
    setView('list')
  }

  return (
    <div className="app">
      <Header />

      <main className="main-content">
        {view === 'list' && <ProjectsList onOpenProject={openProject} />}
        {view === 'project' && currentProject && (
          <ProjectDetail
            project={currentProject}
            onBack={backToList}
          />
        )}
      </main>

      <footer className="app-footer">
        <span>Web app built by</span>
        <a href="https://accelmedia.co" target="_blank" rel="noopener noreferrer">
          <img src={accelLogo} alt="Accel Media" className="accel-logo" />
        </a>
      </footer>
    </div>
  )
}

