import { downloadBase64Image } from '../utils/imageUtils'

export default function ResultImage({ result, index, onRevise }) {
  const filename = `cross-creek-design-${index + 1}.png`

  return (
    <div className="result-card">
      <img
        src={result.dataUri}
        alt={`Generated landscape design ${index + 1}`}
        className="result-img"
      />
      <p className="result-disclaimer">
        AI-generated concept for visualization only. Not a construction document. Actual designs will be refined based on site conditions, engineering requirements, and construction feasibility.
      </p>
      <div className="result-actions">
        <button
          className="btn btn-secondary"
          onClick={() => downloadBase64Image(result.dataUri, filename)}
        >
          Save to Photos
        </button>
        <button className="btn btn-primary" onClick={() => onRevise(index)}>
          Revise This Design
        </button>
      </div>
    </div>
  )
}
