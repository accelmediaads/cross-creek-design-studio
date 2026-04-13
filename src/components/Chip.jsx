export default function Chip({ label, selected, onClick }) {
  return (
    <button
      className={`chip ${selected ? 'chip-selected' : ''}`}
      onClick={onClick}
      type="button"
    >
      {selected && <span className="chip-check">&#10003;</span>}
      {label}
    </button>
  )
}
