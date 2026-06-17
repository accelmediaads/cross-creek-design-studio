// Apple Pencil markup → AI revision.
//
// Randy opens an existing generation in the lightbox, taps "Mark up & revise",
// draws on the design with Pencil (red default), types a caption explaining
// what he wants changed ("make these walls 2ft taller, swap turf for gravel"),
// and submits. We composite the canvas onto the original image, send the
// flattened result + caption to Gemini via the existing revision flow, and
// save the result as a kind='revision' generation linked to the original.
//
// iPad notes:
//   - PointerEvents work for Apple Pencil out of the box on iPad Safari.
//     event.pressure ∈ [0, 1] (Pencil reports real pressure; fingers/mouse
//     report 0.5). We use pressure to vary stroke width.
//   - We block touch scrolling on the canvas (touch-action: none) so a
//     palm rest doesn't drag the page.

import { useCallback, useEffect, useRef, useState } from 'react'

const COLORS = [
  { name: 'Red',   value: '#e84343' },
  { name: 'Cream', value: '#e4e0d4' },
  { name: 'Black', value: '#1a1a1a' },
]

export default function PencilMarkup({ generation, onCancel, onSubmit }) {
  const containerRef = useRef(null)
  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const lastPointRef = useRef(null)
  const strokesRef = useRef([])    // history for undo, list of off-screen canvases
  const currentStrokeRef = useRef(null)

  const [color, setColor] = useState(COLORS[0].value)
  const [caption, setCaption] = useState('')
  const [imgReady, setImgReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [busyMsg, setBusyMsg] = useState('')
  const [error, setError] = useState(null)
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 })

  // ---- Canvas sizing -------------------------------------------------------

  // When the image loads, size the canvas to match its NATURAL dimensions so
  // strokes land at full resolution. CSS scales it down to fit.
  function handleImgLoad() {
    const img = imgRef.current
    if (!img) return
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    const canvas = canvasRef.current
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctxRef.current = ctx
    setImgDims({ w, h })
    setImgReady(true)
  }

  // Translate pointer coords into canvas (image-resolution) coords.
  function pointerToCanvas(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height
    return { x, y }
  }

  // ---- Drawing ------------------------------------------------------------

  function onPointerDown(e) {
    if (busy) return
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    const p = pointerToCanvas(e)
    lastPointRef.current = p
    // Snapshot canvas state BEFORE this stroke so we can undo.
    const snapshot = ctxRef.current.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
    currentStrokeRef.current = { snapshot }
  }

  function onPointerMove(e) {
    if (busy || !lastPointRef.current) return
    e.preventDefault()
    const last = lastPointRef.current
    const p = pointerToCanvas(e)
    const ctx = ctxRef.current
    const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5
    // Stroke width relative to canvas height so it scales with image size.
    const base = Math.max(3, canvasRef.current.height * 0.005)
    ctx.strokeStyle = color
    ctx.lineWidth = base * (0.5 + pressure * 1.5)
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPointRef.current = p
  }

  function onPointerUp() {
    if (currentStrokeRef.current) {
      strokesRef.current.push(currentStrokeRef.current.snapshot)
      currentStrokeRef.current = null
    }
    lastPointRef.current = null
  }

  function handleUndo() {
    const last = strokesRef.current.pop()
    if (last && ctxRef.current) {
      ctxRef.current.putImageData(last, 0, 0)
    }
  }
  function handleClear() {
    if (!ctxRef.current) return
    strokesRef.current.push(
      ctxRef.current.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
    )
    ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
  }

  // ---- Submit -------------------------------------------------------------

  async function buildComposite() {
    // Render the original image + our overlay into one PNG data URI.
    // We have to re-fetch the original via canvas so cross-origin isn't an
    // issue — but Supabase signed URLs do let us draw via crossOrigin="anonymous"
    // when the bucket policy allows. We requested that on upload via Storage.
    const img = imgRef.current
    const composite = document.createElement('canvas')
    composite.width = canvasRef.current.width
    composite.height = canvasRef.current.height
    const cctx = composite.getContext('2d')
    cctx.drawImage(img, 0, 0, composite.width, composite.height)
    cctx.drawImage(canvasRef.current, 0, 0, composite.width, composite.height)
    return composite.toDataURL('image/png')
  }

  async function handleSubmit() {
    if (busy) return
    if (!caption.trim()) {
      setError('Add a short caption explaining what should change.')
      return
    }
    if (strokesRef.current.length === 0) {
      setError('Add at least one pencil mark first.')
      return
    }
    setBusy(true)
    setError(null)
    setBusyMsg('Compositing your markup…')
    try {
      const compositeDataUri = await buildComposite()
      setBusyMsg('Generating revision (15–30s)…')
      await onSubmit({ compositeDataUri, captionText: caption.trim(), original: generation })
      // Parent will close us on success.
    } catch (err) {
      setError(err.message || 'Revision failed')
    } finally {
      setBusy(false)
      setBusyMsg('')
    }
  }

  // ---- Render -------------------------------------------------------------

  return (
    <div className="lightbox-backdrop" role="dialog" aria-modal="true" aria-label="Mark up & revise">
      <div className="lightbox-topbar">
        <button className="lightbox-btn" onClick={onCancel} aria-label="Close">×</button>
        <div className="lightbox-meta">
          <span className="gen-kind kind-revision">Mark up</span>
          <span className="lightbox-time">Use Apple Pencil to draw on the design</span>
        </div>
        <div className="lightbox-actions">
          {COLORS.map(c => (
            <button
              key={c.value}
              type="button"
              className={`color-swatch ${color === c.value ? 'color-swatch-active' : ''}`}
              style={{ background: c.value }}
              onClick={() => setColor(c.value)}
              aria-label={c.name}
              aria-pressed={color === c.value}
              disabled={busy}
            />
          ))}
          <button className="lightbox-btn lightbox-btn-text" onClick={handleUndo} disabled={busy}>Undo</button>
          <button className="lightbox-btn lightbox-btn-text" onClick={handleClear} disabled={busy}>Clear</button>
        </div>
      </div>

      <div className="lightbox-stage markup-stage" ref={containerRef}>
        <div className="markup-canvas-wrap" style={imgDims.w ? { aspectRatio: `${imgDims.w} / ${imgDims.h}` } : undefined}>
          <img
            ref={imgRef}
            src={generation.signedUrl}
            alt="Generation to mark up"
            className="markup-img"
            crossOrigin="anonymous"
            onLoad={handleImgLoad}
            draggable={false}
          />
          <canvas
            ref={canvasRef}
            className="markup-canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ touchAction: 'none' }}
          />
        </div>
      </div>

      <div className="markup-footer">
        <label className="login-field" style={{ flex: 1 }}>
          <span>What should change?</span>
          <input
            type="text"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="e.g. 'Stone walls 2 ft taller, swap turf in front of patio for gravel'"
            disabled={busy}
            /* iOS Safari sometimes refuses to bring up the keyboard for
               inputs inside fixed-position modals — especially when an
               adjacent canvas captures pointer events. These attributes
               give iOS explicit hints (virtual keyboard kind + Enter key
               label), and the onClick handler issues an explicit focus()
               on user gesture as a belt-and-suspenders against the quirk. */
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            onClick={e => e.currentTarget.focus()}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary btn-large"
          onClick={handleSubmit}
          disabled={busy || !imgReady || !caption.trim()}
        >
          {busy ? (busyMsg || 'Working…') : 'Apply revision'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ margin: '0 16px 16px' }}>
          <strong>Error:</strong> {error}
          <button className="btn btn-small btn-secondary" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
