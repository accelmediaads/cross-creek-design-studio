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

export default function ProjectDetail({ project: initialProject, onBack }) {
  const [project, setProject] = useState(initialProject)
  const [photos, setPhotos] = useState([])
  const [topoPhotos, setTopoPhotos] = useState([]) // kind === 'topo_map'
  const [generations, setGenerations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showGenerate, setShowGenerate] = useState(false)

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
      } else {
        setPhotos(prev => prev.filter(p => p.id !== photo.id))
      }
    } catch (err) {
      setError(err.message || 'Delete failed')
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

      {/* ---- 2. Site Photos ---- */}
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

      {/* ---- 3. Topo Map ---- */}
      <section className="detail-section">
        <SectionHeader title="Topo Map" subtitle="Optional — improves AI design accuracy" />
        <PhotoGrid
          photos={topoPhotos}
          onAdd={files => handlePhotoUpload(files, 'topo_map')}
          onDelete={handlePhotoDelete}
          uploading={uploading > 0}
          emptyText="No topo map. Drop a survey or topo PDF/image if the client has one."
          accept="image/*"
          multiple={false}
        />
      </section>

      {/* ---- 4. Preferences ---- */}
      <section className="detail-section">
        <SectionHeader
          title="Design Preferences"
          subtitle="Walk through these with the homeowner. Changes save automatically."
        />
        <Preferences prefs={prefsValue} setPrefs={setPrefs} inline />
      </section>

      {/* ---- 5. Generations gallery ---- */}
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
            {generations.map(g => (
              <div key={g.id} className="gen-card">
                {g.signedUrl ? (
                  <img src={g.signedUrl} alt="Generated design" />
                ) : (
                  <div className="gen-card-fallback">Image unavailable</div>
                )}
                <div className="gen-card-meta">
                  <span className={`gen-kind kind-${g.kind}`}>{g.kind}</span>
                  <span className="gen-time">{new Date(g.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- 6. Notes ---- */}
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
          rows={8}
        />
      </section>

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

function PhotoGrid({ photos, onAdd, onDelete, uploading, emptyText, accept, capture, multiple }) {
  const inputRef = useRef(null)

  return (
    <div>
      <div className="photo-grid">
        {photos.map(p => (
          <div key={p.id} className="photo-tile">
            {p.signedUrl ? (
              <img src={p.signedUrl} alt={p.caption || ''} />
            ) : (
              <div className="photo-tile-fallback">Loading…</div>
            )}
            <button
              type="button"
              className="photo-delete-btn"
              onClick={() => onDelete(p)}
              aria-label="Delete photo"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="photo-add-tile"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <span className="photo-add-plus">+</span>
          <span className="photo-add-label">
            {uploading ? 'Uploading…' : multiple ? 'Add photos' : 'Add photo'}
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

