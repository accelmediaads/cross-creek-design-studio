const STEPS = ['Site Photos', 'Topo Map', 'Preferences', 'Generate']

export default function StepNav({ currentStep, onStepClick }) {
  return (
    <nav className="step-nav">
      {STEPS.map((label, i) => (
        <button
          key={label}
          className={`step-nav-item ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}`}
          onClick={() => i < currentStep && onStepClick(i)}
          disabled={i > currentStep}
        >
          <span className="step-num">{i + 1}</span>
          <span className="step-label">{label}</span>
        </button>
      ))}
    </nav>
  )
}
