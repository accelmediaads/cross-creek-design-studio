import { useRef } from 'react'
import { fileToBase64 } from '../utils/imageUtils'

export default function TopoUploader({ topoMap, setTopoMap, onNext, onBack }) {
  const inputRef = useRef()

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const dataUri = await fileToBase64(file)
    setTopoMap({ name: file.name, dataUri })
    e.target.value = ''
  }

  return (
    <div className="step-content">
      <h2 className="step-title">Topography Map</h2>
      <p className="step-desc">
        Upload a top-down site map (survey plat, FARO Scene export, or overhead image). This helps the AI understand elevation, boundaries, and existing features.
      </p>
      <p className="step-optional">Optional — skip if not available</p>

      {!topoMap ? (
        <div
          className="upload-zone"
          onClick={() => inputRef.current.click()}
          role="button"
          tabIndex={0}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <span>Tap to add topo map</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
        </div>
      ) : (
        <div className="topo-preview">
          <img src={topoMap.dataUri} alt="Topography map" />
          <button className="btn btn-secondary" onClick={() => setTopoMap(null)}>
            Remove
          </button>
        </div>
      )}

      <div className="step-actions">
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={onNext}>
          Next: Preferences
        </button>
      </div>
    </div>
  )
}
