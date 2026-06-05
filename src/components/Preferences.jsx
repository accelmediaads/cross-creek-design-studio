import Chip from './Chip'

const STYLES = [
  'Modern/Contemporary',
  'Craftsman/Rustic',
  'Mediterranean',
  'Pacific Northwest Natural',
  'Desert/Xeriscape',
  'Traditional/Classic',
]

const FEATURES = [
  'Fire Pit',
  'Outdoor Kitchen',
  'Water Feature',
  'Pergola/Covered Patio',
  'Pool/Spa',
  'Putting Green',
  'Retaining Walls',
  'Landscape Lighting',
  'Built-in Seating',
  'Outdoor Fireplace',
  'Sport Court',
  'Garden Beds',
]

const BUDGETS = [
  '$25K–$50K',
  '$50K–$100K',
  '$100K–$200K',
  '$200K–$400K',
  '$400K+',
]

const MATERIALS = [
  'Natural Stone',
  'Pavers',
  'Concrete',
  'Wood/Cedar',
  'Composite Decking',
  'River Rock',
  'Flagstone',
  'Brick',
  'Stucco',
  'Steel/Metal Accents',
]

const LIGHTING = [
  'Dusk/Golden Hour',
  'Midday Sun',
  'Night/Landscape Lighting',
  'Overcast/Soft Light',
]

/**
 * Preferences form. Two usage modes:
 *
 *   Wizard mode (legacy): pass onNext + onBack, get Back / Next: Generate buttons.
 *   Inline mode (project detail): pass `inline` and omit nav callbacks. Form
 *     fields render without any nav chrome; the parent controls when to save.
 */
export default function Preferences({ prefs, setPrefs, onNext, onBack, inline = false, title }) {
  function toggleMulti(key, value) {
    setPrefs(prev => {
      const arr = prev[key] || []
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      }
    })
  }

  function setSingle(key, value) {
    setPrefs(prev => ({ ...prev, [key]: value }))
  }

  const canProceed = prefs.style && (prefs.features || []).length >= 1

  return (
    <div className={inline ? 'pref-form' : 'step-content'}>
      {!inline && <h2 className="step-title">{title || 'Client Preferences'}</h2>}
      {!inline && <p className="step-desc">Walk through these with the homeowner.</p>}

      <section className="pref-section">
        <h3 className="pref-heading">Design Style</h3>
        <div className="chip-grid">
          {STYLES.map(s => (
            <Chip key={s} label={s} selected={prefs.style === s} onClick={() => setSingle('style', s)} />
          ))}
        </div>
      </section>

      <section className="pref-section">
        <h3 className="pref-heading">Features <span className="pref-hint">(select all that apply)</span></h3>
        <div className="chip-grid">
          {FEATURES.map(f => (
            <Chip key={f} label={f} selected={(prefs.features || []).includes(f)} onClick={() => toggleMulti('features', f)} />
          ))}
        </div>
      </section>

      <section className="pref-section">
        <h3 className="pref-heading">Investment Range</h3>
        <div className="chip-grid">
          {BUDGETS.map(b => (
            <Chip key={b} label={b} selected={prefs.budget === b} onClick={() => setSingle('budget', b)} />
          ))}
        </div>
      </section>

      <section className="pref-section">
        <h3 className="pref-heading">Materials <span className="pref-hint">(select all that apply)</span></h3>
        <div className="chip-grid">
          {MATERIALS.map(m => (
            <Chip key={m} label={m} selected={(prefs.materials || []).includes(m)} onClick={() => toggleMulti('materials', m)} />
          ))}
        </div>
      </section>

      <section className="pref-section">
        <h3 className="pref-heading">Time of Day / Lighting</h3>
        <div className="chip-grid">
          {LIGHTING.map(l => (
            <Chip key={l} label={l} selected={prefs.lighting === l} onClick={() => setSingle('lighting', l)} />
          ))}
        </div>
      </section>

      <section className="pref-section">
        <h3 className="pref-heading">
          Style notes for the AI
          <span className="pref-hint"> (steers the design — not your visit notes)</span>
        </h3>
        <textarea
          className="field-textarea"
          placeholder="Constraints the design model should respect. e.g. '3 kids under 10, need safe pool area' or 'Low maintenance plantings' or 'Want privacy from neighbors'. For client conversation notes, use the Notes section at the top of the project."
          value={prefs.notes || ''}
          onChange={e => setSingle('notes', e.target.value)}
          rows={3}
        />
      </section>

      {!inline && (
        <div className="step-actions">
          <button className="btn btn-secondary" onClick={onBack}>Back</button>
          <button className="btn btn-primary" disabled={!canProceed} onClick={onNext}>
            Next: Generate
          </button>
        </div>
      )}
    </div>
  )
}
