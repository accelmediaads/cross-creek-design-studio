// Project-native generation flow.
//
// Two phases:
//
//   PHASE A — Options (first ever generation on this project):
//     Three Claude-written prompt variations within the chosen style fan out
//     to three parallel Gemini calls. Randy sees three side-by-side options
//     and taps "Use this one" on his favorite. That tap:
//       - Sets project.selected_generation_id
//       - Has Claude write a design brief from the chosen prompt
//       - Persists project.design_brief
//     The OTHER two stay in the gallery as alternates (kind='initial'),
//     so the client can see what was considered.
//
//   PHASE B — Single (post-lock):
//     Standard single-generation flow per remaining angle. Each gen uses
//     the locked design brief so the look stays consistent across angles.
//     A "Generate for all remaining angles" batch button runs them in
//     parallel for properties with many photos.
//
// We pick the phase by inspecting the project + existing generations:
//   - Phase A iff (selected_generation_id is null && generations.length == 0)
//   - Phase B otherwise
// Legacy projects (pre-feature, with generations but no selected id) stay
// in phase B so we don't disrupt Randy's existing work.

import { useEffect, useMemo, useState } from 'react'
import {
  generateDesignPrompt,
  generateThreeDesignPromptVariations,
  generateRevisionPrompt,
  generateDesignBrief,
} from '../api/claude.js'
import { generateDesignImage, reviseDesignImage } from '../api/gemini.js'
import { saveGeneration } from '../api/generations.js'
import { updateProject } from '../api/projects.js'
import { downloadAsDataUri } from '../api/storage.js'

export default function ProjectGenerator({
  project: initialProject,
  sitePhotos,
  topoPhoto,
  sketches = [],
  onBack,
}) {
  const [project, setProject] = useState(initialProject)

  // Local results this session — only used by the post-lock single flow
  // (and revisions). The phase-A options are stored separately.
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [busyMsg, setBusyMsg] = useState('')
  const [designBrief, setDesignBrief] = useState(project.design_brief || '')

  // Source photo picker (post-lock phase). Defaults to first.
  const [sourceIndex, setSourceIndex] = useState(0)
  const sourcePhoto = sitePhotos[sourceIndex] || null

  // Revision state
  const [revisingIndex, setRevisingIndex] = useState(null)
  const [revisionText, setRevisionText] = useState('')

  // Phase-A state: 3 candidate generations + their dataUris
  const [options, setOptions] = useState([])  // [{ generation, dataUri, label }]

  // Opt-in toggle for the 3-option-with-lock flow. Default OFF: Randy gets
  // a normal single generation. He flips it on only when he wants to pick
  // from three. Lives in component state — no DB persistence; it's a per-
  // session preference, decided right before he taps Generate.
  const [useOptions, setUseOptions] = useState(false)

  const prefs = useMemo(() => normalizePrefs(project.prefs), [project.prefs])
  const photoCount = sitePhotos.length
  const hasTopo = !!topoPhoto

  const conceptLocked = !!project.selected_generation_id
  // The 3-option phase is only available when this is a fresh project AND
  // Randy has explicitly opted in via the toggle.
  const phaseAEligible =
    !conceptLocked &&
    photoCount > 0 &&
    !!prefs.style &&
    options.length === 0 &&
    useOptions
  // The toggle itself is only visible at the very start (no prior gens, not
  // locked, has photos + style) — past that point the question is moot.
  const optionsToggleVisible =
    !conceptLocked &&
    options.length === 0 &&
    results.length === 0 &&
    photoCount > 0 &&
    !!prefs.style

  // ----------------------------------------------------------------------------
  // PHASE A — Generate three options
  // ----------------------------------------------------------------------------

  async function handleGenerateThreeOptions() {
    if (loading) return
    if (!sourcePhoto) { setError('Add at least one site photo first.'); return }
    if (!prefs.style) { setError('Pick a Design Style in the project preferences.'); return }

    setLoading(true)
    setError(null)
    setBusyMsg('Loading photos…')

    try {
      // Hydrate all the source images once.
      const photoUri = await downloadAsDataUri('project-photos', sourcePhoto.storage_path)
      const topoUri = topoPhoto ? await downloadAsDataUri('project-photos', topoPhoto.storage_path) : null
      const sketchUris = await Promise.all(
        sketches.map(s => downloadAsDataUri('project-photos', s.storage_path))
      )

      setBusyMsg('Writing three design directions…')
      const { variations, labels } = await generateThreeDesignPromptVariations({
        photoCount,
        hasTopoMap: hasTopo,
        sketchCount: sketches.length,
        style: prefs.style,
        features: prefs.features,
        budget: prefs.budget || 'Not specified',
        materials: prefs.materials,
        lighting: prefs.lighting || 'Dusk/Golden Hour',
        notes: prefs.notes || '',
      })

      setBusyMsg('Generating 3 options in parallel (30–60s)…')

      // Fire all three image calls in parallel. saveGeneration is also fine
      // to run inline since each is independent.
      const settled = await Promise.allSettled(variations.map(async (variantPrompt, i) => {
        const result = await generateDesignImage(variantPrompt, [photoUri, ...sketchUris], topoUri)
        const gen = await saveGeneration({
          projectId: project.id,
          sourcePhotoId: sourcePhoto.id,
          kind: 'initial',
          prompt: variantPrompt,
          prefsSnapshot: prefs,
          imageBase64: result.imageBase64,
          mimeType: result.mimeType,
        })
        return { generation: gen, dataUri: result.dataUri, label: labels[i] }
      }))

      const successes = settled.filter(s => s.status === 'fulfilled').map(s => s.value)
      const failures = settled.filter(s => s.status === 'rejected')

      if (successes.length === 0) {
        throw new Error(failures[0]?.reason?.message || 'All three options failed to generate.')
      }
      if (failures.length > 0) {
        // Continue with whatever succeeded; surface a soft warning.
        console.warn(`[options] ${failures.length} of 3 failed:`, failures.map(f => f.reason?.message))
      }

      setOptions(successes)
    } catch (err) {
      setError(err.message || 'Generation failed')
    } finally {
      setLoading(false)
      setBusyMsg('')
    }
  }

  async function handleChooseOption(option) {
    if (loading) return
    setLoading(true)
    setError(null)
    setBusyMsg('Locking in the design…')

    try {
      // Write the design brief based on the CHOSEN option's prompt.
      let brief = ''
      try {
        brief = await generateDesignBrief(option.generation.prompt, prefs)
      } catch (e) {
        console.warn('Design brief generation failed (non-critical):', e)
      }

      // Persist: selected_generation_id + design_brief on the project
      const updated = await updateProject(project.id, {
        selected_generation_id: option.generation.id,
        design_brief: brief || project.design_brief || '',
      })
      setProject(updated)
      setDesignBrief(updated.design_brief || '')

      // Move the chosen option's data-uri into `results` so it shows in the
      // session results immediately, then clear options.
      setResults([{
        id: option.generation.id,
        generation: option.generation,
        dataUri: option.dataUri,
        sourcePhotoId: sourcePhoto.id,
      }])
      setOptions([])

      // After locking, jump to the next source photo (if any) so Randy is
      // primed to generate the next angle.
      if (sitePhotos.length > 1) setSourceIndex(1)
    } catch (err) {
      setError(err.message || 'Failed to lock the design')
    } finally {
      setLoading(false)
      setBusyMsg('')
    }
  }

  // ----------------------------------------------------------------------------
  // PHASE B — Single-photo generations using the locked brief
  // ----------------------------------------------------------------------------

  async function handleGenerate() {
    if (loading) return
    if (!sourcePhoto) { setError('No source photo selected.'); return }
    if (!prefs.style) { setError('Pick a Design Style in the project preferences.'); return }

    setLoading(true)
    setError(null)
    setBusyMsg('Loading photo…')

    try {
      const photoUri = await downloadAsDataUri('project-photos', sourcePhoto.storage_path)
      const topoUri = topoPhoto ? await downloadAsDataUri('project-photos', topoPhoto.storage_path) : null
      const sketchUris = await Promise.all(
        sketches.map(s => downloadAsDataUri('project-photos', s.storage_path))
      )

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
        angleIndex: results.filter(r => r.generation.kind !== 'revision').length,
      })

      setBusyMsg('Generating design (15–30s)…')
      const result = await generateDesignImage(prompt, [photoUri, ...sketchUris], topoUri)

      setBusyMsg('Saving…')
      const generation = await saveGeneration({
        projectId: project.id,
        sourcePhotoId: sourcePhoto.id,
        kind: results.length === 0 ? 'initial' : 'variation',
        prompt,
        prefsSnapshot: prefs,
        imageBase64: result.imageBase64,
        mimeType: result.mimeType,
      })

      setResults(prev => [...prev, {
        id: generation.id,
        generation,
        dataUri: result.dataUri,
        sourcePhotoId: sourcePhoto.id,
      }])
    } catch (err) {
      setError(err.message || 'Generation failed')
    } finally {
      setLoading(false)
      setBusyMsg('')
    }
  }

  // Generate for every site photo we haven't generated against yet this
  // session. Useful for "I have 5 angles, just run them all."
  async function handleGenerateAllRemaining() {
    if (loading) return
    const generatedSourceIds = new Set(results.map(r => r.sourcePhotoId))
    const remaining = sitePhotos.filter(p => !generatedSourceIds.has(p.id))
    if (remaining.length === 0) {
      setError('Every angle has already been generated this session.')
      return
    }

    setLoading(true)
    setError(null)
    setBusyMsg(`Generating ${remaining.length} angles in parallel…`)

    try {
      const topoUri = topoPhoto ? await downloadAsDataUri('project-photos', topoPhoto.storage_path) : null
      const sketchUris = await Promise.all(
        sketches.map(s => downloadAsDataUri('project-photos', s.storage_path))
      )

      const settled = await Promise.allSettled(remaining.map(async (photo, i) => {
        const photoUri = await downloadAsDataUri('project-photos', photo.storage_path)
        const angleIndex = results.length + i // sequential angle indices for the consistency prompt
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
          angleIndex,
        })
        const result = await generateDesignImage(prompt, [photoUri, ...sketchUris], topoUri)
        const generation = await saveGeneration({
          projectId: project.id,
          sourcePhotoId: photo.id,
          kind: 'variation',
          prompt,
          prefsSnapshot: prefs,
          imageBase64: result.imageBase64,
          mimeType: result.mimeType,
        })
        return { id: generation.id, generation, dataUri: result.dataUri, sourcePhotoId: photo.id }
      }))

      const successes = settled.filter(s => s.status === 'fulfilled').map(s => s.value)
      const failures = settled.filter(s => s.status === 'rejected')

      setResults(prev => [...prev, ...successes])

      if (failures.length > 0) {
        const msg = failures.map(f => f.reason?.message || 'unknown').join(', ')
        setError(`${failures.length} of ${remaining.length} angles failed: ${msg}`)
      }
    } catch (err) {
      setError(err.message || 'Batch generation failed')
    } finally {
      setLoading(false)
      setBusyMsg('')
    }
  }

  // ----------------------------------------------------------------------------
  // Revisions
  // ----------------------------------------------------------------------------

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

      setResults(prev => [...prev, {
        id: generation.id,
        generation,
        dataUri: result.dataUri,
        sourcePhotoId: target.sourcePhotoId,
      }])
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

  // Phase decision (only one big-CTA block renders at a time)
  const renderPhase =
    options.length > 0          ? 'options-pick'
    : phaseAEligible            ? 'options-start'
    : conceptLocked             ? 'locked-single'
    : 'legacy-single'

  return (
    <div className="project-generator">
      <div className="detail-toolbar">
        <button className="btn btn-secondary" onClick={onBack}>← Back to project</button>
        <div className="muted small">
          {conceptLocked ? '✓ Design direction locked' : results.length === 0 ? 'No designs yet this session' : `${results.length} design${results.length === 1 ? '' : 's'} this session`}
        </div>
      </div>

      {/* Source photo picker — only meaningful in single-gen modes */}
      {renderPhase !== 'options-start' && renderPhase !== 'options-pick' && sitePhotos.length > 1 && (
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
          conceptLocked={conceptLocked}
        />
      </section>

      {/* ---- PHASE A: Start (only when toggle is on) ---- */}
      {renderPhase === 'options-start' && (
        <div className="generate-cta-row">
          <button
            className="btn btn-primary btn-large"
            onClick={handleGenerateThreeOptions}
            disabled={loading}
          >
            ✨ Generate 3 design options
          </button>
          <p className="muted small" style={{ maxWidth: 560, textAlign: 'center' }}>
            Each option is a different interpretation of {prefs.style ? <strong>{prefs.style}</strong> : 'your chosen style'} —
            layout-forward, softscape-forward, hardscape-forward. Pick the one
            the client likes best and it locks in the look for every other angle.
          </p>
          <label className="options-toggle" style={{ marginTop: 6 }}>
            <input
              type="checkbox"
              checked={useOptions}
              onChange={e => setUseOptions(e.target.checked)}
            />
            <span>Generate 3 options to compare (≈3× the AI cost)</span>
          </label>
        </div>
      )}

      {/* ---- PHASE A: Pick from 3 ---- */}
      {renderPhase === 'options-pick' && (
        <section className="detail-section">
          <SectionHeader
            title="Pick the direction"
            subtitle="Tap the option the client likes best. It locks the look for the rest of the angles."
          />
          <div className="options-grid">
            {options.map(opt => (
              <div key={opt.generation.id} className="option-card">
                <span className="option-label">{opt.label}</span>
                <img src={opt.dataUri} alt={opt.label} className="option-img" />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleChooseOption(opt)}
                  disabled={loading}
                >
                  Use this one
                </button>
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            The two you don't pick stay in the gallery as alternates — useful if the client wants to revisit them later.
          </p>
        </section>
      )}

      {/* ---- PHASE B + legacy: Single generation ---- */}
      {(renderPhase === 'locked-single' || renderPhase === 'legacy-single') && (
        <div className="generate-cta-row">
          <button
            className="btn btn-primary btn-large"
            onClick={handleGenerate}
            disabled={loading || !sourcePhoto || !prefs.style}
          >
            {results.length === 0
              ? '✨ Generate first design'
              : '✨ Add another generation'}
          </button>
          {sitePhotos.length > 1 && (
            <button
              className="btn btn-secondary"
              onClick={handleGenerateAllRemaining}
              disabled={loading}
              title="Generate for every angle we haven't run this session — all in parallel"
            >
              Generate every remaining angle
            </button>
          )}
          {/* Opt-in: 3-option flow. Only shown on a truly fresh project so
              Randy can pick "compare 3 vs just one" right before he taps
              Generate. Disappears as soon as he has results. */}
          {optionsToggleVisible && (
            <label className="options-toggle">
              <input
                type="checkbox"
                checked={useOptions}
                onChange={e => setUseOptions(e.target.checked)}
              />
              <span>Generate 3 options to compare (≈3× the AI cost) — pick your favorite to lock the look</span>
            </label>
          )}
          {!sourcePhoto && <p className="muted small">Add at least one site photo.</p>}
          {!prefs.style && <p className="muted small">Pick a Design Style in the project preferences.</p>}
        </div>
      )}

      {loading && (
        <div className="loading-state">
          <div className="spinner" />
          <p>{busyMsg || 'Working…'}</p>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
          <button className="btn btn-small btn-secondary" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Session results — newest at the bottom */}
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
                    /* autoFocus so the iPad keyboard pops as soon as the
                       panel opens — no second tap needed. inputMode + enterKeyHint
                       give iOS Safari explicit virtual-keyboard hints that
                       fix a quirk where some inline panels swallow focus. */
                    autoFocus
                    inputMode="text"
                    enterKeyHint="send"
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

      {/* Bottom-of-screen repeat CTA in single modes */}
      {(renderPhase === 'locked-single' || renderPhase === 'legacy-single') && results.length > 0 && !loading && (
        <div className="generate-cta-row sticky-bottom">
          <button
            className="btn btn-primary btn-large"
            onClick={handleGenerate}
            disabled={loading || !sourcePhoto}
          >
            ✨ Add another generation
          </button>
        </div>
      )}
    </div>
  )
}

function SummaryGrid({ project, prefs, photoCount, hasTopo, sketchCount, conceptLocked }) {
  const rows = [
    { label: 'Project', value: project.name },
    prefs.style && { label: 'Style', value: prefs.style },
    (prefs.features || []).length > 0 && { label: 'Features', value: prefs.features.join(', ') },
    prefs.budget && { label: 'Budget', value: prefs.budget },
    (prefs.materials || []).length > 0 && { label: 'Materials', value: prefs.materials.join(', ') },
    prefs.lighting && { label: 'Lighting', value: prefs.lighting },
    prefs.notes && { label: 'Style notes', value: prefs.notes },
    { label: 'Site photos', value: `${photoCount} uploaded` },
    { label: 'Topo / scan', value: hasTopo ? 'Included' : 'Not included' },
    sketchCount > 0 && { label: 'Reference sketches', value: `${sketchCount} included` },
    conceptLocked && { label: 'Concept', value: '✓ Locked — angles will stay consistent' },
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

function SectionHeader({ title, subtitle }) {
  return (
    <div className="section-header">
      <h2 className="section-title">{title}</h2>
      {subtitle && <p className="section-subtitle">{subtitle}</p>}
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
