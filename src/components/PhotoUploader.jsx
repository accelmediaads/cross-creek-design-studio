import { useRef } from 'react'
import { fileToBase64 } from '../utils/imageUtils'

export default function PhotoUploader({ photos, setPhotos, onNext }) {
  const inputRef = useRef()

  async function handleFiles(e) {
    const files = Array.from(e.target.files)
    const newPhotos = await Promise.all(
      files.map(async file => ({
        name: file.name,
        dataUri: await fileToBase64(file),
      }))
    )
    setPhotos(prev => [...prev, ...newPhotos])
    e.target.value = ''
  }

  function removePhoto(index) {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="step-content">
      <h2 className="step-title">Site Photos</h2>
      <p className="step-desc">
        Upload drone photos and ground-level shots of the property. Multiple angles help maintain design consistency.
      </p>

      <div
        className="upload-zone"
        onClick={() => inputRef.current.click()}
        role="button"
        tabIndex={0}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        <span>Tap to add photos</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          style={{ display: 'none' }}
        />
      </div>

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((photo, i) => (
            <div key={i} className="photo-thumb">
              <img src={photo.dataUri} alt={photo.name} />
              <button className="photo-remove" onClick={() => removePhoto(i)} aria-label="Remove photo">
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="step-actions">
        <div />
        <button
          className="btn btn-primary"
          disabled={photos.length === 0}
          onClick={onNext}
        >
          Next: Topo Map
        </button>
      </div>
    </div>
  )
}
