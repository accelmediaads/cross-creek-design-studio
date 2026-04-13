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

export default function Preferences({ prefs, setPrefs, onNext, onBack }) {
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
    <div className="step-content">
      <h2 className="step-title">Client Preferences</h2>
      <p className="step-desc">Walk through these with the homeowner.</p>

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
        <h3 className="pref-heading">Additional Notes</h3>
        <textarea
          className="field-textarea"
          placeholder="e.g. '3 kids under 10, need safe pool area' or 'Low maintenance plantings' or 'Entertaining space for 20+ people' or 'Want privacy from neighbors'"
          value={prefs.notes || ''}
          onChange={e => setSingle('notes', e.target.value)}
          rows={3}
        />
      </section>

      <div className="step-actions">
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
        <button className="btn btn-primary" disabled={!canProceed} onClick={onNext}>
          Next: Generate
        </button>
      </div>
    </div>
  )
}
