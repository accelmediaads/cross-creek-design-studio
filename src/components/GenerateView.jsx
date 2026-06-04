import { useState } from 'react'
import { generateDesignPrompt, generateRevisionPrompt, generateDesignBrief } from '../api/claude'
import { generateDesignImage, reviseDesignImage } from '../api/gemini'
import ResultImage from './ResultImage'
import RevisionPanel from './RevisionPanel'
import PromptPreview from './PromptPreview'

export default function GenerateView({ photos, topoMap, prefs, onBack }) {
  const [results, setResults] = useState([])        // array of { dataUri, prompt, mimeType }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastPrompt, setLastPrompt] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)
  const [revisingIndex, setRevisingIndex] = useState(null)
  const [revisionLoading, setRevisionLoading] = useState(false)
  const [designBrief, setDesignBrief] = useState('')
  const [showBrief, setShowBrief] = useState(false)
  const [editingBrief, setEditingBrief] = useState(false)
  const [briefDraft, setBriefDraft] = useState('')
  const [generatingAngle, setGeneratingAngle] = useState(null) // which photo index

  // API keys are now server-side (Netlify Functions). The proxy will fail
  // with a clear error message if anything is misconfigured, so we don't
  // need a client-side pre-check.

  async function handleGenerate(angleIndex = 0) {
    setLoading(true)
    setError(null)
    setGeneratingAngle(angleIndex)

    try {
      // Step 1: Claude generates the prompt
      const prompt = await generateDesignPrompt({
        photoCount: photos.length,
        hasTopoMap: !!topoMap,
        style: prefs.style,
        features: prefs.features || [],
        budget: prefs.budget || 'Not specified',
        materials: prefs.materials || [],
        lighting: prefs.lighting || 'Dusk/Golden Hour',
        notes: prefs.notes || '',
        designBrief,
        angleIndex,
      })
      setLastPrompt(prompt)

      // Step 2: Nano Banana Pro generates the image
      const photoUris = [photos[angleIndex].dataUri]
      const topoUri = topoMap?.dataUri || null

      const result = await generateDesignImage(prompt, photoUris, topoUri)

      setResults(prev => [...prev, { ...result, prompt, angleIndex }])

      // Step 3: After first generation, create a design brief for consistency
      if (!designBrief && angleIndex === 0) {
        try {
          const brief = await generateDesignBrief(prompt, prefs)
          setDesignBrief(brief)
        } catch (e) {
          console.warn('Design brief generation failed (non-critical):', e)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setGeneratingAngle(null)
    }
  }

  async function handleRevision(revisionText) {
    if (revisingIndex === null) return
    setRevisionLoading(true)
    setError(null)

    try {
      const targetResult = results[revisingIndex]

      // Claude writes the revision prompt
      const prompt = await generateRevisionPrompt(revisionText)
      setLastPrompt(prompt)

      // Nano Banana Pro applies the revision
      const result = await reviseDesignImage(prompt, targetResult.dataUri)

      setResults(prev => [...prev, { ...result, prompt, revision: true, revisionOf: revisingIndex }])
      setRevisingIndex(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setRevisionLoading(false)
    }
  }

  // Summary of selections
  const summaryItems = [
    { label: 'Style', value: prefs.style },
    { label: 'Features', value: (prefs.features || []).join(', ') },
    { label: 'Budget', value: prefs.budget },
    { label: 'Materials', value: (prefs.materials || []).join(', ') },
    { label: 'Lighting', value: prefs.lighting },
    prefs.notes && { label: 'Notes', value: prefs.notes },
  ].filter(Boolean)

  return (
    <div className="step-content">
      <h2 className="step-title">Generate Design Concepts</h2>

      {/* Project Summary */}
      <div className="summary-card">
        <h3 className="pref-heading">Project Summary</h3>
        <div className="summary-grid">
          {summaryItems.map(item => (
            <div key={item.label} className="summary-row">
              <span className="summary-label">{item.label}</span>
              <span className="summary-value">{item.value}</span>
            </div>
          ))}
          <div className="summary-row">
            <span className="summary-label">Photos</span>
            <span className="summary-value">{photos.length} uploaded</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Topo Map</span>
            <span className="summary-value">{topoMap ? 'Included' : 'Not included'}</span>
          </div>
        </div>
      </div>

      {/* Design Brief (appears after first generation) */}
      {designBrief && (
        <div className="summary-card">
          <div className="brief-header">
            <h3 className="pref-heading">Design Brief</h3>
            <button
              className="btn btn-small btn-secondary"
              onClick={() => { setShowBrief(!showBrief) }}
            >
              {showBrief ? 'Hide' : 'Show'}
            </button>
          </div>
          {showBrief && (
            <>
              {editingBrief ? (
                <>
                  <textarea
                    className="field-textarea"
                    value={briefDraft}
                    onChange={e => setBriefDraft(e.target.value)}
                    rows={5}
                  />
                  <div className="revision-actions">
                    <button className="btn btn-secondary" onClick={() => setEditingBrief(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => { setDesignBrief(briefDraft); setEditingBrief(false) }}>Save</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="brief-text">{designBrief}</p>
                  <button
                    className="btn btn-small btn-secondary"
                    onClick={() => { setBriefDraft(designBrief); setEditingBrief(true) }}
                  >
                    Edit Brief
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Generation Controls */}
      <div className="generate-controls">
        {photos.length > 1 ? (
          <div className="angle-controls">
            <p className="step-desc">Generate for each angle:</p>
            <div className="angle-grid">
              {photos.map((photo, i) => (
                <button
                  key={i}
                  className="angle-btn"
                  onClick={() => handleGenerate(i)}
                  disabled={loading}
                >
                  <img src={photo.dataUri} alt={`Angle ${i + 1}`} className="angle-thumb" />
                  <span>Angle {i + 1}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            className="btn btn-primary btn-large"
            onClick={() => handleGenerate(0)}
            disabled={loading}
          >
            {loading ? 'Generating…' : 'Generate Design'}
          </button>
        )}

        {results.length > 0 && (
          <button
            className="btn btn-secondary"
            onClick={() => handleGenerate(generatingAngle || 0)}
            disabled={loading}
          >
            Generate Another Variation
          </button>
        )}

        <button className="btn btn-secondary" onClick={() => setShowPrompt(true)} disabled={!lastPrompt}>
          View Prompt
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Generating design concept… (15–30 seconds)</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Results */}
      <div className="results-list">
        {results.map((result, i) => {
          // Find the original photo for this result
          const originalPhoto = result.revision
            ? null  // revisions show the image they revised, not the original photo
            : photos[result.angleIndex ?? 0]

          return (
            <div key={i}>
              {originalPhoto && (
                <div className="compare-pair">
                  <div className="compare-card">
                    <span className="compare-label">Original</span>
                    <img src={originalPhoto.dataUri} alt="Original photo" className="compare-img" />
                  </div>
                  <div className="compare-card">
                    <span className="compare-label">AI Concept</span>
                    <img src={result.dataUri} alt={`Generated design ${i + 1}`} className="compare-img" />
                  </div>
                </div>
              )}
              <ResultImage
                result={result}
                index={i}
                onRevise={(idx) => setRevisingIndex(idx)}
              />
              {revisingIndex === i && (
                <RevisionPanel
                  onSubmit={handleRevision}
                  loading={revisionLoading}
                  onCancel={() => setRevisingIndex(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Prompt Preview Modal */}
      <PromptPreview prompt={showPrompt ? lastPrompt : null} onClose={() => setShowPrompt(false)} />

      <div className="step-actions">
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
        <div />
      </div>
    </div>
  )
}
