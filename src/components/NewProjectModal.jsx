// Small modal to create a new project.
// Required: name. Optional: client name + address.

import { useState } from 'react'
import { createProject } from '../api/projects.js'

export default function NewProjectModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [clientAddress, setClientAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!open) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const project = await createProject({
        name: name.trim(),
        client_name: clientName.trim() || null,
        client_address: clientAddress.trim() || null,
      })
      // Reset form for next time
      setName('')
      setClientName('')
      setClientAddress('')
      onCreated?.(project)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Failed to create project')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">New Project</h2>
        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Project name <span className="field-required">*</span></span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Smith Backyard"
              required
              autoFocus
            />
          </label>
          <label className="field">
            <span>Client name</span>
            <input
              type="text"
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="John Smith"
            />
          </label>
          <label className="field">
            <span>Address</span>
            <input
              type="text"
              value={clientAddress}
              onChange={e => setClientAddress(e.target.value)}
              placeholder="123 Main St, Coeur d'Alene, ID"
            />
          </label>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
