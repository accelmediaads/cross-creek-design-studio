import { useState, useEffect } from 'react'

export default function ApiKeyModal({ open, onClose }) {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [geminiKey, setGeminiKey] = useState('')

  useEffect(() => {
    if (open) {
      setAnthropicKey(localStorage.getItem('cc_anthropic_key') || import.meta.env.VITE_ANTHROPIC_API_KEY || '')
      setGeminiKey(localStorage.getItem('cc_gemini_key') || import.meta.env.VITE_GEMINI_API_KEY || '')
    }
  }, [open])

  if (!open) return null

  function handleSave() {
    if (anthropicKey) localStorage.setItem('cc_anthropic_key', anthropicKey)
    if (geminiKey) localStorage.setItem('cc_gemini_key', geminiKey)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>API Keys</h2>
        <p className="modal-hint">Keys are stored locally on this device only.</p>

        <label className="field-label">
          Anthropic API Key (Claude)
          <input
            type="password"
            value={anthropicKey}
            onChange={e => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
            className="field-input"
          />
        </label>

        <label className="field-label">
          Google AI Studio API Key (Gemini)
          <input
            type="password"
            value={geminiKey}
            onChange={e => setGeminiKey(e.target.value)}
            placeholder="AIza..."
            className="field-input"
          />
        </label>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Keys</button>
        </div>
      </div>
    </div>
  )
}
