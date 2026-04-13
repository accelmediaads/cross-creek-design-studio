export default function PromptPreview({ prompt, onClose }) {
  if (!prompt) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <h2>Generated Prompt</h2>
        <p className="modal-hint">This is what Claude wrote for Nano Banana Pro.</p>
        <pre className="prompt-preview-text">{prompt}</pre>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
