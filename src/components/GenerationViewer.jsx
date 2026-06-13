// Fullscreen lightbox for viewing a generation.
//
// Used from the project gallery (tap a card → opens this) and later as the
// host for the Pencil markup view (task #21). Built to feel iPad-native:
//
//   - Pinch-to-zoom uses Safari's built-in image pinch behavior — we don't
//     fight it, just let the <img> live inside a wrapper that allows it.
//   - Swipe left/right between generations in the project.
//   - Tap the dim backdrop or press Esc to dismiss.
//   - Download button uses the signed URL with `download` attr.
//   - Share button uses navigator.share (works on iPad Safari) with the
//     image file payload — opens the native iOS share sheet.
//
// Props:
//   generations  array of { id, signedUrl, prompt, created_at, kind, ... }
//   index        current index within the array
//   onClose      called when the viewer should close
//   onChangeIndex(nextIndex) — optional callback to keep the URL in sync
//   onMarkup     optional — when present, shows "Mark up & revise" button
//                that calls onMarkup(generation) (task #21 wires this)

import { useEffect, useRef, useState } from 'react'

export default function GenerationViewer({ generations, index, onClose, onChangeIndex, onMarkup }) {
  const safeIdx = Math.max(0, Math.min(index, generations.length - 1))
  const current = generations[safeIdx]
  const [shareBusy, setShareBusy] = useState(false)
  const touchStartRef = useRef(null)

  // Keyboard: Esc to close, arrows to navigate
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIdx, generations.length])

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function go(delta) {
    const next = safeIdx + delta
    if (next < 0 || next >= generations.length) return
    onChangeIndex?.(next)
  }

  function onTouchStart(e) {
    if (e.touches.length !== 1) return
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    // Vertical swipe down (and not mostly-horizontal) → close
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { onClose?.(); return }
    // Horizontal swipe → navigate
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? 1 : -1)
    }
  }

  async function handleShare() {
    if (!current?.signedUrl) return
    setShareBusy(true)
    try {
      const res = await fetch(current.signedUrl)
      const blob = await res.blob()
      const filename = `cross-creek-${current.kind || 'design'}-${shortDate(current.created_at)}.png`
      const file = new File([blob], filename, { type: blob.type || 'image/png' })

      // Prefer file share (iOS shows Save to Files, AirDrop, Mail, Messages, etc.)
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename })
      } else if (navigator.share) {
        // Fall back to URL share (some Safari versions don't allow file share for cross-origin)
        await navigator.share({ url: current.signedUrl, title: filename })
      } else {
        // Last resort — just trigger a download
        triggerDownload(current.signedUrl, filename)
      }
    } catch (err) {
      // AbortError means the user dismissed the sheet; that's fine
      if (err?.name !== 'AbortError') {
        console.warn('[share] failed:', err.message)
        // Fall back to download
        triggerDownload(current.signedUrl, defaultFilename(current))
      }
    } finally {
      setShareBusy(false)
    }
  }

  if (!current) return null

  return (
    <div
      className="lightbox-backdrop"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Generation viewer"
    >
      <div className="lightbox-topbar" onClick={e => e.stopPropagation()}>
        <button className="lightbox-btn" onClick={onClose} aria-label="Close">×</button>
        <div className="lightbox-meta">
          <span className={`gen-kind kind-${current.kind}`}>{current.kind}</span>
          <span className="lightbox-counter">{safeIdx + 1} of {generations.length}</span>
          <span className="lightbox-time">{new Date(current.created_at).toLocaleString()}</span>
        </div>
        <div className="lightbox-actions">
          <a
            className="lightbox-btn lightbox-btn-text"
            href={current.signedUrl}
            download={defaultFilename(current)}
            onClick={e => e.stopPropagation()}
          >
            Download
          </a>
          <button
            className="lightbox-btn lightbox-btn-text"
            onClick={handleShare}
            disabled={shareBusy}
          >
            {shareBusy ? '…' : 'Share'}
          </button>
          {onMarkup && (
            <button
              className="lightbox-btn lightbox-btn-text lightbox-btn-primary"
              onClick={() => onMarkup(current)}
            >
              Mark up & revise
            </button>
          )}
        </div>
      </div>

      <div className="lightbox-stage" onClick={e => e.stopPropagation()}>
        {current.signedUrl ? (
          <img
            src={current.signedUrl}
            alt="Generated design"
            className="lightbox-img"
          />
        ) : (
          <div className="muted">Image unavailable</div>
        )}
      </div>

      {generations.length > 1 && (
        <>
          {safeIdx > 0 && (
            <button
              className="lightbox-nav lightbox-nav-prev"
              onClick={e => { e.stopPropagation(); go(-1) }}
              aria-label="Previous generation"
            >
              ‹
            </button>
          )}
          {safeIdx < generations.length - 1 && (
            <button
              className="lightbox-nav lightbox-nav-next"
              onClick={e => { e.stopPropagation(); go(1) }}
              aria-label="Next generation"
            >
              ›
            </button>
          )}
        </>
      )}
    </div>
  )
}

function shortDate(iso) {
  if (!iso) return 'design'
  const d = new Date(iso)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}
function pad(n) { return String(n).padStart(2, '0') }

function defaultFilename(gen) {
  return `cross-creek-${gen?.kind || 'design'}-${shortDate(gen?.created_at)}.png`
}

function triggerDownload(url, filename) {
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
