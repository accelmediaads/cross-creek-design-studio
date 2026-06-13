// Single-project view.
//
// Layout: one scrolling page with stacked sections:
//   1. Header (project name + client info, editable)
//   2. Site Photos (upload + grid + delete)
//   3. Topo Map (optional, single photo)
//   4. Preferences (inline Preferences form)
//   5. Generations (gallery + "Generate" CTA — task #8 wires the actual generate)
//   6. Notes (textarea, debounced save — Wispr-Flow / iOS dictation friendly)
//
// Everything persists to Supabase as the user edits. No "Save" button on the
// notes / prefs / header — debounced auto-save matches how Randy will use it
// (he'll close the iPad mid-conversation; we need it saved).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getProject, updateProject } from '../api/projects.js'
import {
  listProjectPhotos,
  uploadProjectPhoto,
  deleteProjectPhoto,
} from '../api/photos.js'
import { listProjectGenerations } from '../api/generations.js'
import Preferences from './Preferences.jsx'
import ProjectGenerator from './ProjectGenerator.jsx'
import GenerationViewer from './GenerationViewer.jsx'
import PencilMarkup from './PencilMarkup.jsx'
import { generatePencilRevisionPrompt } from '../api/claude.js'
import { reviseDesignImage } from '../api/gemini.js'
import { saveGeneration } from '../api/generations.js'

export default function ProjectDetail({ project: initialProject, onBack }) {
  const [project, setProject] = useState(initialProject)
  const [photos, setPhotos] = useState([])         // kind === 'site_photo'
  const [topoPhotos, setTopoPhotos] = useState([]) // kind === 'topo_map'
  const [sketches, setSketches] = useState([])     // kind === 'sketch' (concept references)
  const [generations, setGenerations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(null) // null = closed; otherwise index into generations
  const [markupGen, setMarkupGen] = useState(null)      // generation being marked up with Pencil
  const [markupBusy, setMarkupBusy] = useState(false)

  const projectId = project.id

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fresh, allPhotos, gens] = await Promise.all([
        getProject(projectId),
        listProjectPhotos(projectId),
        listProjectGenerations(projectId),
      ])
      setProject(fresh)
      setPhotos(allPhotos.filter(p => p.kind === 'site_photo'))
      setTopoPhotos(allPhotos.filter(p => p.kind === 'topo_map'))
      setSketches(allPhotos.filter(p => p.kind === 'sketch'))
      setGenerations(gens)
    } catch (err) {
      setError(err.message || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { refresh() }, [refresh])

  // ---- Inline editable header ----------------------------------------------

  async function saveHeaderField(patch) {
    try {
      const updated = await updateProject(projectId, patch)
      setProject(updated)
    } catch (err) {
      setError(err.message || 'Failed to save')
    }
  }

  // ---- Photo uploads -------------------------------------------------------

  const [uploading, setUploading] = useState(0) // count of in-flight uploads

  async function handlePhotoUpload(files, kind) {
    const list = Array.from(files || [])
    if (list.length === 0) return
    setUploading(n => n + list.length)
    setError(null)
    try {
      // Sequential uploads — Supabase Storage handles parallel fine but
      // sequential gives cleaner ordering and easier debugging on iPad.
      for (const file of list) {
        await uploadProjectPhoto(projectId, file, { kind })
      }
      // Refresh after the batch
      const all = await listProjectPhotos(projectId)
      setPhotos(all.filter(p => p.kind === 'site_photo'))
      setTopoPhotos(all.filter(p => p.kind === 'topo_map'))
      setSketches(all.filter(p => p.kind === 'sketch'))
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(n => Math.max(0, n - list.length))
    }
  }

  async function handlePhotoDelete(photo) {
    if (!confirm('Delete this photo?')) return
    try {
      await deleteProjectPhoto(photo)
      if (photo.kind === 'topo_map') {
        setTopoPhotos(prev => prev.filter(p => p.id !== photo.id))
      } else if (photo.kind === 'sketch') {
        setSketches(prev => prev.filter(p => p.id !== photo.id))
      } else {
        setPhotos(prev => prev.filter(p => p.id !== photo.id))
      }
    } catch (err) {
      setError(err.message || 'Delete failed')
    }
  }

  // ---- Pencil markup → AI revision ----------------------------------------

  async function handleMarkupSubmit({ compositeDataUri, captionText, original }) {
    if (markupBusy) return
    setMarkupBusy(true)
    setError(null)
    try {
      const prompt = await generatePencilRevisionPrompt(captionText)
      const result = await reviseDesignImage(prompt, compositeDataUri)
      await saveGeneration({
        projectId: projectId,
        sourcePhotoId: original.source_photo_id || null,
        parentGenerationId: original.id,
        kind: 'revision',
        prompt: `[pencil markup] ${captionText}\n\n${prompt}`,
        prefsSnapshot: project.prefs || {},
        imageBase64: result.imageBase64,
        mimeType: result.mimeType,
      })
      setMarkupGen(null)
      setViewerIndex(null)
      // Refresh the project so the new revision appears in the gallery.
      refresh()
    } catch (err) {
      setError(err.message || 'Markup revision failed')
      // Leave the markup view open so Randy can fix his caption and retry
      throw err
    } finally {
      setMarkupBusy(false)
    }
  }

  // ---- Preferences (debounced save) ----------------------------------------

  const prefsValue = useMemo(() => normalizePrefs(project.prefs), [project.prefs])

  const setPrefs = useDebouncedSave({
    initialValue: prefsValue,
    onSave: next => updateProject(projectId, { prefs: next }).then(setProject),
    delay: 600,
  })

  // ---- Notes (debounced save) ----------------------------------------------

  const setNotes = useDebouncedSave({
    initialValue: project.notes || '',
    onSave: next => updateProject(projectId, { notes: next }).then(setProject),
    delay: 600,
  })

  // ---- Render --------------------------------------------------------------

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading project…</p>
      </div>
    )
  }

  if (showGenerate) {
    return (
      <ProjectGenerator
        project={project}
        sitePhotos={photos}
        topoPhoto={topoPhotos[0] || null}
        sketches={sketches}
        onBack={() => {
          setShowGenerate(false)
          // Refresh so the project gallery picks up any new generations.
          refresh()
        }}
      />
    )
  }

  return (
    <div className="project-detail">
      {/* ---- Sticky top toolbar with Back + Generate CTA ---- */}
      <div className="detail-toolbar">
        <button className="btn btn-secondary" onClick={onBack}>← Projects</button>
        <button
          className="btn btn-primary"
          onClick={() => setShowGenerate(true)}
          disabled={!canGenerate({ photos, prefs: prefsValue })}
          title={canGenerate({ photos, prefs: prefsValue }) ? '' : 'Add at least one photo and pick a Design Style first'}
        >
          ✨ Generate Designs
        </button>
      </div>

      {/* ---- 1. Header ---- */}
      <section className="detail-section">
        <ProjectHeader project={project} onSave={saveHeaderField} />
      </section>

      {/* ---- 2. Notes ----
        Notes sits HIGH on the page — right after the header — because Randy
        flagged that the Notes box "wasn't working." Diagnosis: it worked fine,
        but was buried at the bottom of the page below 5 generations, and he
        was using the "Style notes for AI" textarea inside Preferences instead,
        thinking that was the notes box. Surfacing it here makes it the first
        thing he sees on a project, which matches how he actually uses it
        (capturing client conversation on arrival). */}
      <section className="detail-section">
        <SectionHeader
          title="Notes"
          subtitle="Saved automatically. Use voice dictation on iPad — Wispr Flow, iOS Dictation, anything that types into text fields."
        />
        <textarea
          className="notes-textarea"
          defaultValue={project.notes || ''}
          onChange={e => setNotes(e.target.value)}
          placeholder="Site walk observations, client preferences mentioned in conversation, next-step reminders…"
          rows={6}
        />
      </section>

      {/* ---- 3. Site Photos ---- */}
      <section className="detail-section">
        <SectionHeader title="Site Photos" subtitle={`${photos.length} uploaded`} />
        <PhotoGrid
          photos={photos}
          onAdd={files => handlePhotoUpload(files, 'site_photo')}
          onDelete={handlePhotoDelete}
          uploading={uploading > 0}
          emptyText="No site photos yet. Add a few wide-angle shots of the property."
          accept="image/*"
          /* No `capture` here — iOS only offers the camera if `capture` is set.
             Without it Randy gets the native sheet with Photo Library + Take Photo
             + Choose Files, which matches how he actually shoots (often photos he
             took earlier in the visit, not live in the moment). */
          multiple
        />
      </section>

      {/* ---- 4. Topo Map / Site Measurements ----
        Accepts any topo-related file: images of paper surveys, PDFs from a
        surveyor, AND 3D scan exports from Polycam etc (USDZ, OBJ, PLY, GLB).
        The 3D files aren't fed to the generation model — they just live
        with the project for reference / handoff to office. */}
      <section className="detail-section">
        <SectionHeader
          title="Topo / Site Scan"
          subtitle="Optional — paper surveys, topo PDFs, or 3D scans from Polycam / similar iPad LiDAR apps. Improves project handoff accuracy."
        />
        <PhotoGrid
          photos={topoPhotos}
          onAdd={files => handlePhotoUpload(files, 'topo_map')}
          onDelete={handlePhotoDelete}
          uploading={uploading > 0}
          emptyText="No topo or scan yet. Drop a survey PDF, image, or a Polycam export."
          accept="image/*,application/pdf,.pdf,.usdz,.obj,.ply,.glb,.gltf,.stl,.fbx,.dae,.xyz,.las,.laz"
          multiple
          addLabel="Add file"
        />
      </section>

      {/* ---- 5. Reference Sketches ----
        Randy can sketch his envisioned design in the iPad Notes app and
        screenshot it. Uploaded here, sketches accompany the source site
        photo into every generation. Claude is instructed to treat them
        as design INSPIRATION (layout, features, vibe) rather than literal
        style — so the final image stays photoreal. */}
      <section className="detail-section">
        <SectionHeader
          title="Reference Sketches"
          subtitle="Optional — hand-drawn or rough concept images that show what you're envisioning. The AI will use these as design inspiration alongside the site photo."
        />
        <PhotoGrid
          photos={sketches}
          onAdd={files => handlePhotoUpload(files, 'sketch')}
          onDelete={handlePhotoDelete}
          uploading={uploading > 0}
          emptyText="No sketches yet. Take a screenshot of your iPad Notes sketch and add it here."
          accept="image/*"
          multiple
        />
      </section>

      {/* ---- 6. Preferences ---- */}
      <section className="detail-section">
        <SectionHeader
          title="Design Preferences"
          subtitle="Walk through these with the homeowner. Changes save automatically."
        />
        <Preferences
          prefs={prefsValue}
          setPrefs={setPrefs}
          inline
          /* Keying the inner uncontrolled textarea by project id so it
             remounts (and picks up the new project's notes) when Randy
             switches between projects. See Preferences.jsx for details. */
          prefsKey={projectId}
        />
      </section>

      {/* ---- 7. Generations gallery ---- */}
      <section className="detail-section">
        <SectionHeader
          title="Generations"
          subtitle={generations.length === 0 ? 'No designs yet' : `${generations.length} design${generations.length === 1 ? '' : 's'}`}
        />
        {generations.length === 0 && (
          <p className="muted">
            Once you've added photos and picked a style, tap{' '}
            <strong>✨ Generate Designs</strong> to create your first concept.
          </p>
        )}
        {generations.length > 0 && (
          <div className="gen-grid">
            {generations.map((g, i) => (
              <button
                key={g.id}
                type="button"
                className="gen-card"
                onClick={() => setViewerIndex(i)}
                aria-label={`Open generation from ${new Date(g.created_at).toLocaleString()}`}
              >
                {g.signedUrl ? (
                  <img src={g.signedUrl} alt="Generated design" />
                ) : (
                  <div className="gen-card-fallback">Image unavailable</div>
                )}
                <div className="gen-card-meta">
                  <span className={`gen-kind kind-${g.kind}`}>{g.kind}</span>
                  <span className="gen-time">{new Date(g.created_at).toLocaleString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {viewerIndex !== null && !markupGen && (
        <GenerationViewer
          generations={generations}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onChangeIndex={setViewerIndex}
          onMarkup={gen => setMarkupGen(gen)}
        />
      )}

      {markupGen && (
        <PencilMarkup
          generation={markupGen}
          onCancel={() => setMarkupGen(null)}
          onSubmit={handleMarkupSubmit}
        />
      )}

      {error && (
        <div className="alert alert-error sticky-error">
          <strong>Error:</strong> {error}
          <button className="btn btn-small btn-secondary" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function ProjectHeader({ project, onSave }) {
  const [name, setName] = useState(project.name || '')
  const [clientName, setClientName] = useState(project.client_name || '')
  const [clientAddress, setClientAddress] = useState(project.client_address || '')
  const [status, setStatus] = useState(project.status || 'active')

  // Debounce text saves so we don't slam the DB on every keystroke
  const saveName = useDebounced((v) => onSave({ name: v.trim() || 'Untitled' }), 500)
  const saveClientName = useDebounced((v) => onSave({ client_name: v.trim() || null }), 500)
  const saveAddress = useDebounced((v) => onSave({ client_address: v.trim() || null }), 500)

  return (
    <div className="detail-header">
      <input
        className="detail-name"
        value={name}
        onChange={e => { setName(e.target.value); saveName(e.target.value) }}
        aria-label="Project name"
      />
      <input
        className="detail-subline"
        value={clientName}
        placeholder="Client name"
        onChange={e => { setClientName(e.target.value); saveClientName(e.target.value) }}
        aria-label="Client name"
      />
      <input
        className="detail-subline"
        value={clientAddress}
        placeholder="Address"
        onChange={e => { setClientAddress(e.target.value); saveAddress(e.target.value) }}
        aria-label="Client address"
      />
      <div className="detail-status-row">
        <label className="detail-status-label">Status:</label>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); onSave({ status: e.target.value }) }}
          className="detail-status-select"
        >
          <option value="active">Active</option>
          <option value="handed_off">Handed off</option>
          <option value="archived">Archived</option>
        </select>
      </div>
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

function PhotoGrid({ photos, onAdd, onDelete, uploading, emptyText, accept, capture, multiple, addLabel }) {
  const inputRef = useRef(null)

  return (
    <div>
      <div className="photo-grid">
        {photos.map(p => {
          const isImage = isImagePath(p.storage_path)
          return (
            <div key={p.id} className="photo-tile">
              {isImage ? (
                p.signedUrl ? (
                  <img src={p.signedUrl} alt={p.caption || ''} />
                ) : (
                  <div className="photo-tile-fallback">Loading…</div>
                )
              ) : (
                <FileTile path={p.storage_path} signedUrl={p.signedUrl} />
              )}
              <button
                type="button"
                className="photo-delete-btn"
                onClick={() => onDelete(p)}
                aria-label="Delete file"
              >
                ×
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="photo-add-tile"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <span className="photo-add-plus">+</span>
          <span className="photo-add-label">
            {uploading ? 'Uploading…' : (addLabel || (multiple ? 'Add photos' : 'Add photo'))}
          </span>
        </button>
      </div>
      {photos.length === 0 && !uploading && (
        <p className="muted small">{emptyText}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        hidden
        onChange={e => {
          onAdd(e.target.files)
          e.target.value = '' // reset so re-picking the same file fires onChange
        }}
      />
    </div>
  )
}

/* Non-image file card: shows extension badge + filename so Randy can tell a
   Polycam USDZ from a PDF survey from a 3D OBJ. Clicking opens the file in
   a new tab via the signed URL — most browsers handle PDFs inline and offer
   to download anything else. */
function FileTile({ path, signedUrl }) {
  const ext = (path?.split('.').pop() || '').toUpperCase()
  const filename = path?.split('/').pop() || 'file'
  return (
    <a
      className="file-tile"
      href={signedUrl || undefined}
      target="_blank"
      rel="noopener noreferrer"
      title={filename}
      onClick={e => { if (!signedUrl) e.preventDefault() }}
    >
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span className="file-tile-ext">.{ext}</span>
      <span className="file-tile-name">{filename}</span>
    </a>
  )
}

function isImagePath(path) {
  if (!path) return true // optimistic — fallback to image render
  const ext = path.split('.').pop().toLowerCase()
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'avif'].includes(ext)
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

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

function canGenerate({ photos, prefs }) {
  return photos.length > 0 && !!prefs?.style
}

/**
 * Debounce a single function. Returns a stable callback.
 * The latest value wins (trailing edge).
 */
function useDebounced(fn, delay = 500) {
  const timerRef = useRef(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  return useCallback((value) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fnRef.current(value), delay)
  }, [delay])
}

/**
 * Like useState, but also debounces a save callback.
 * Returns a setter that the parent calls with the new value (object or string);
 * after `delay` ms of quiet, onSave runs with the latest value.
 *
 * The component manages its own internal state — the parent only needs to
 * provide the initial value and the persistence callback.
 */
function useDebouncedSave({ initialValue, onSave, delay = 500 }) {
  const ref = useRef(initialValue)
  ref.current = ref.current ?? initialValue
  const timerRef = useRef(null)
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  return useCallback((nextValue) => {
    ref.current = typeof nextValue === 'function' ? nextValue(ref.current) : nextValue
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      Promise.resolve(onSaveRef.current(ref.current)).catch(err => {
        console.warn('[debounced save] failed:', err.message)
      })
    }, delay)
  }, [delay])
}

