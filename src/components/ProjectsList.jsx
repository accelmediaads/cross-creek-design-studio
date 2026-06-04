// Home screen after login. Lists projects, sorted by most recent activity.
// Tapping a project navigates to ProjectDetail; "New Project" opens the
// creation modal.

import { useEffect, useState } from 'react'
import { listProjects } from '../api/projects.js'
import NewProjectModal from './NewProjectModal.jsx'

export default function ProjectsList({ onOpenProject }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showNew, setShowNew] = useState(false)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const rows = await listProjects()
      setProjects(rows)
    } catch (err) {
      setError(err.message || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleCreated(project) {
    // Immediately jump into the new project so Randy can start uploading.
    onOpenProject?.(project)
    // (refresh() happens automatically next time he comes back to the list)
  }

  return (
    <div className="projects-screen">
      <div className="projects-header">
        <h1 className="projects-title">Projects</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + New Project
        </button>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading projects…</p>
        </div>
      )}

      {error && !loading && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
          <button className="btn btn-small btn-secondary" onClick={refresh}>Retry</button>
        </div>
      )}

      {!loading && !error && projects.length === 0 && (
        <div className="empty-state">
          <h2>No projects yet</h2>
          <p>Start a new design project to upload photos, save preferences, and generate concepts.</p>
          <button className="btn btn-primary btn-large" onClick={() => setShowNew(true)}>
            + Create your first project
          </button>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="projects-grid">
          {projects.map(p => (
            <button
              key={p.id}
              className="project-card"
              onClick={() => onOpenProject?.(p)}
              type="button"
            >
              <div className="project-card-header">
                <h3 className="project-card-name">{p.name}</h3>
                <span className={`project-card-status status-${p.status}`}>{p.status}</span>
              </div>
              {p.client_name && (
                <div className="project-card-client">{p.client_name}</div>
              )}
              {p.client_address && (
                <div className="project-card-address">{p.client_address}</div>
              )}
              <div className="project-card-meta">
                Updated {formatRelativeDate(p.updated_at)}
              </div>
            </button>
          ))}
        </div>
      )}

      <NewProjectModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}

function formatRelativeDate(iso) {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.max(1, Math.floor((now - then) / 1000))
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}
