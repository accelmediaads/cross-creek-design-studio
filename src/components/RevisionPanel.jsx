import { useState } from 'react'

export default function RevisionPanel({ onSubmit, loading, onCancel }) {
  const [text, setText] = useState('')

  function handleSubmit() {
    if (text.trim()) onSubmit(text.trim())
  }

  return (
    <div className="revision-panel">
      <h3 className="pref-heading">Revise This Design</h3>
      <textarea
        className="field-textarea"
        placeholder='e.g. "Remove the pool and add a larger patio" or "Change the pavers to flagstone" or "Add landscape lighting"'
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        disabled={loading}
      />
      <div className="revision-actions">
        <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!text.trim() || loading}
        >
          {loading ? 'Revising…' : 'Apply Revision'}
        </button>
      </div>
    </div>
  )
}
