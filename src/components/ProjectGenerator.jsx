// Project-native generation flow.
//
// Replaces the legacy in-memory GenerateView. Differences:
//
//   - Source photos come from the project (Supabase Storage). The user
//     picks WHICH photo to generate against.
//   - The project's prefs are used as-is (and shown read-only with an
//     "Edit prefs" hint that scrolls back to the detail page).
//   - Every generation is persisted: the image bytes go to the `generations`
//     bucket, a row goes to the `generations` table, and the gallery in the
//     parent ProjectDetail picks it up on next refresh.
//   - "Add another generation" stays on this screen — Randy never has to
//     back out to start a new one. He sees his last result(s) and can fire
//     more without losing context.
//   - Revisions are tracked with parent_generation_id so we can show
//     revision lineage in the gallery.
//
// Multi-angle consistency: when there are multiple site photos and Randy
// generates more than one, we save the Claude-written design brief on the
// project (`design_brief` column) after the first gen and feed it back into
// later prompts. Same behavior the legacy view had — just persisted.

import { useEffect, useMemo, useState } from 'react'
import {
  generateDesignPrompt,
  generateRevisionPrompt,
  generateDesignBrief,
} from '../api/claude.js'
import { generateDesignImage, reviseDesignImage } from '../api/gemini.js'
import { saveGeneration } from '../api/generations.js'
import { updateProject } from '../api/projects.js'
import { downloadAsDataUri } from '../api/storage.js'

export default function ProjectGenerator({
  project,
  sitePhotos,         // [{ id, signedUrl, storage_path, ... }]
  topoPhoto,          // single photo row or null
  sketches = [],      // [{ id, signedUrl, storage_path, ... }] — hand-drawn concept refs
  onBack,             // called when Randy is done — parent refreshes the gallery
}) {
  // Local state for this generation session. These results are also persisted
  // to the DB; they're kept in local state so Randy sees them stack on screen
  // as he generates without a refresh round-trip.
  const [results, setResults] = useState([])  // [{ id, generation, dataUri, sourcePhotoId }]
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busyMsg, setBusyMsg] = useState('')
  const [designBrief, setDesignBrief] = useState(project.design_brief || '')

  // The photo currently selected as the generation source. Defaults to first.
  const [sourceIndex, setSourceIndex] = useState(0)
  const sourcePhoto = sitePhotos[sourceIndex] || null

  // Revision state — when set, the user is editing a revision of results[revisingIndex]
  const [revisingIndex, setRevisingIndex] = useState(null)
  const [revisionText, setRevisionText] = useState('')

  const prefs = useMemo(() => normalizePrefs(project.prefs), [project.prefs])
  const photoCount = sitePhotos.length
  const hasTopo = !!topoPhoto

  // Disable generation when we don't have enough to work with.
  const canGenerate = !!sourcePhoto && !!prefs.style

  async function handleGenerate() {
    if (!canGenerate || loading) return
    setLoading(true)
    setError(null)
    setBusyMsg('Loading photos…')

    try {
      // 1. Pull the source photo + topo + all sketches from Storage as data URIs.
      // Order matters: site photo first (Image 1), topo second (Image 2 if present),
      // sketches last. The Claude prompt explains each role.
      const photoUri = await downloadAsDataUri('project-photos', sourcePhoto.storage_path)
      const topoUri = topoPhoto
        ? await downloadAsDataUri('project-photos', topoPhoto.storage_path)
        : null
      const sketchUris = await Promise.all(
        sketches.map(s => downloadAsDataUri('project-photos', s.storage_path))
      )

      // 2. Ask Claude for an optimized prompt.
      setBusyMsg('Writing prompt…')
      const prompt = await generateDesignPrompt({
        photoCount,
        hasTopoMap: hasTopo,
        sketchCount: sketches.length,
        style: prefs.style,
        features: prefs.features,
        budget: prefs.budget || 'Not specified',
        materials: prefs.materials,
        lighting: prefs.lighting || 'Dusk/Golden Hour',
        notes: prefs.notes || '',
        designBrief,
        // For multi-angle consistency: if we've already generated at least one
        // result for this session, treat this as angle N+1.
        angleIndex: results.filter(r => r.generation.kind !== 'revision').length,
      })

      // 3. Ask Gemini for the image. Site photo + sketches all flow as
      //    "photoDataUris"; topo stays as the dedicated topo arg.
      setBusyMsg('Generating design (15–30s)…')
      const result = await generateDesignImage(prompt, [photoUri, ...sketchUris], topoUri)

      // 4. Persist: upload image + insert row.
      setBusyMsg('Saving…')
      const isFirst = results.length === 0
      const generation = await saveGeneration({
        projectId: project.id,
        sourcePhotoId: sourcePhoto.id,
        kind: isFirst ? 'initial' : 'variation',
        prompt,
        prefsSnapshot: prefs,
        imageBase64: result.imageBase64,
        mimeType: result.mimeType,
      })

      setResults(prev => [
        ...prev,
        { id: generation.id, generation, dataUri: result.dataUri, sourcePhotoId: sourcePhoto.id },
      ])

      // 5. After the first generation, ask Claude for a design brief and persist
      // it to the project. Future generations (same session OR later) use it.
      if (isFirst && !designBrief) {
        try {
          const brief = await generateDesignBrief(prompt, prefs)
          setDesignBrief(brief)
          await updateProject(project.id, { design_brief: brief })
        } catch (e) {
          console.warn('Design brief generation failed (non-critical):', e)
        }
      }
    } catch (err) {
      setError(err.message || 'Generation failed')
    } finally {
      setLoading(false)
      setBusyMsg('')
    }
  }

  async function handleRevisionSubmit() {
    if (revisingIndex === null || !revisionText.trim() || loading) return
    setLoading(true)
    setError(null)
    setBusyMsg('Writing revision prompt…')

    try {
      const target = results[revisingIndex]

      const prompt = await generateRevisionPrompt(revisionText.trim())

      setBusyMsg('Applying revision (15–30s)…')
      const result = await reviseDesignImage(prompt, target.dataUri)

      setBusyMsg('Saving…')
      const generation = await saveGeneration({
        projectId: project.id,
        sourcePhotoId: target.sourcePhotoId,
        parentGenerationId: target.generation.id,
        kind: 'revision',
        prompt,
        prefsSnapshot: prefs,
        imageBase64: result.imageBase64,
        mimeType: result.mimeType,
      })

      setResults(prev => [
        ...prev,
        { id: generation.id, generation, dataUri: result.dataUri, sourcePhotoId: target.sourcePhotoId },
      ])
      setRevisingIndex(null)
      setRevisionText('')
    } catch (err) {
      setError(err.message || 'Revision failed')
    } finally {
      setLoading(false)
      setBusyMsg('')
    }
  }

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  return (
    <div className="project-generator">
      <div className="detail-toolbar">
        <button className="btn btn-secondary" onClick={onBack}>← Back to project</button>
        <div className="muted small">
          {results.length === 0 ? 'No designs yet this session' : `${results.length} design${results.length === 1 ? '' : 's'} this session`}
        </div>
      </div>

      {/* Source photo picker */}
      {sitePhotos.length > 1 && (
        <section className="detail-section">
          <h3 className="pref-heading">Source photo</h3>
          <div className="angle-grid">
            {sitePhotos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`angle-btn ${i === sourceIndex ? 'angle-btn-active' : ''}`}
                onClick={() => setSourceIndex(i)}
                disabled={loading}
              >
                {p.signedUrl ? (
                  <img src={p.signedUrl} alt={`Angle ${i + 1}`} className="angle-thumb" />
                ) : (
                  <div className="angle-thumb angle-thumb-fallback" />
                )}
                <span>Angle {i + 1}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Prefs summary — read-only here, edited on the project detail page */}
      <section className="detail-section">
        <SummaryGrid
          project={project}
          prefs={prefs}
          photoCount={photoCount}
          hasTopo={hasTopo}
          sketchCount={sketches.length}
        />
      </section>

      {/* Big generate CTA */}
      <div className="generate-cta-row">
        <button
          className="btn btn-primary btn-large"
          onClick={handleGenerate}
          disabled={loading || !canGenerate}
        >
          {results.length === 0 ? '✨ Generate first design' : '✨ Add another generation'}
        </button>
        {!canGenerate && (
          <p className="muted small">
            {sitePhotos.length === 0 ? 'Add at least one site photo to the project.' : 'Pick a Design Style in the project preferences.'}
          </p>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>{busyMsg || 'Working…'}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
          <button className="btn btn-small btn-secondary" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Results (this session) — newest at the bottom so the latest gen is visible */}
      <div className="results-list">
        {results.map((r, i) => {
          const original = sitePhotos.find(p => p.id === r.sourcePhotoId)
          const isRevision = r.generation.kind === 'revision'
          return (
            <div key={r.id} className="result-block">
              {!isRevision && original?.signedUrl && (
                <div className="compare-pair">
                  <div className="compare-card">
                    <span className="compare-label">Original</span>
                    <img src={original.signedUrl} alt="Original photo" className="compare-img" />
                  </div>
                  <div className="compare-card">
                    <span className="compare-label">AI Concept</span>
                    <img src={r.dataUri} alt={`Generated design ${i + 1}`} className="compare-img" />
                  </div>
                </div>
              )}
              {isRevision && (
                <div className="compare-card">
                  <span className="compare-label">Revised concept</span>
                  <img src={r.dataUri} alt={`Revised design ${i + 1}`} className="compare-img" />
                </div>
              )}
              <div className="result-actions">
                <a
                  className="btn btn-secondary btn-small"
                  href={r.dataUri}
                  download={`cross-creek-${project.name || 'design'}-${i + 1}.png`}
                >
                  Download
                </a>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => { setRevisingIndex(i); setRevisionText('') }}
                  disabled={loading}
                >
                  Revise
                </button>
              </div>

              {revisingIndex === i && (
                <div className="revision-panel">
                  <textarea
                    className="field-textarea"
                    placeholder="Describe the changes you want…"
                    rows={3}
                    value={revisionText}
                    onChange={e => setRevisionText(e.target.value)}
                  />
                  <div className="revision-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => { setRevisingIndex(null); setRevisionText('') }}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleRevisionSubmit}
                      disabled={loading || !revisionText.trim()}
                    >
                      Apply revision
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom-of-screen repeat CTA so Randy doesn't have to scroll up after a long gen */}
      {results.length > 0 && !loading && (
        <div className="generate-cta-row sticky-bottom">
          <button
            className="btn btn-primary btn-large"
            onClick={handleGenerate}
            disabled={loading || !canGenerate}
          >
            ✨ Add another generation
          </button>
        </div>
      )}
    </div>
  )
}

function SummaryGrid({ project, prefs, photoCount, hasTopo, sketchCount }) {
  const rows = [
    { label: 'Project', value: project.name },
    prefs.style && { label: 'Style', value: prefs.style },
    (prefs.features || []).length > 0 && { label: 'Features', value: prefs.features.join(', ') },
    prefs.budget && { label: 'Budget', value: prefs.budget },
    (prefs.materials || []).length > 0 && { label: 'Materials', value: prefs.materials.join(', ') },
    prefs.lighting && { label: 'Lighting', value: prefs.lighting },
    prefs.notes && { label: 'Notes', value: prefs.notes },
    { label: 'Site photos', value: `${photoCount} uploaded` },
    { label: 'Topo map', value: hasTopo ? 'Included' : 'Not included' },
    sketchCount > 0 && { label: 'Reference sketches', value: `${sketchCount} included` },
  ].filter(Boolean)

  return (
    <div className="summary-grid">
      {rows.map(r => (
        <div key={r.label} className="summary-row">
          <span className="summary-label">{r.label}</span>
          <span className="summary-value">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

function normalizePrefs(p) {
  return {
    style: p?.style || '',
    features: Array.isArray(p?.features) ? p.features : [],
    budget: p?.budget || '',
    materials: Array.isArray(p?.materials) ? p.materials : [],
    lighting: p?.lighting || '',
    notes: p?.notes || '',
  }
}
