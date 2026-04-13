import { useState } from 'react'
import accelLogo from './assets/accel-logo.png'
import Header from './components/Header'
import StepNav from './components/StepNav'
import ApiKeyModal from './components/ApiKeyModal'
import PhotoUploader from './components/PhotoUploader'
import TopoUploader from './components/TopoUploader'
import Preferences from './components/Preferences'
import GenerateView from './components/GenerateView'

export default function App() {
  const [step, setStep] = useState(0)
  const [showKeys, setShowKeys] = useState(false)
  const [photos, setPhotos] = useState([])
  const [topoMap, setTopoMap] = useState(null)
  const [prefs, setPrefs] = useState({
    style: '',
    features: [],
    budget: '',
    materials: [],
    lighting: '',
    notes: '',
  })

  return (
    <div className="app">
      <Header onSettingsClick={() => setShowKeys(true)} />
      <StepNav currentStep={step} onStepClick={setStep} />

      <main className="main-content">
        {step === 0 && (
          <PhotoUploader
            photos={photos}
            setPhotos={setPhotos}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <TopoUploader
            topoMap={topoMap}
            setTopoMap={setTopoMap}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <Preferences
            prefs={prefs}
            setPrefs={setPrefs}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <GenerateView
            photos={photos}
            topoMap={topoMap}
            prefs={prefs}
            onBack={() => setStep(2)}
          />
        )}
      </main>

      <footer className="app-footer">
        <span>Web app built by</span>
        <a href="https://accelmedia.co" target="_blank" rel="noopener noreferrer">
          <img src={accelLogo} alt="Accel Media" className="accel-logo" />
        </a>
      </footer>

      <ApiKeyModal open={showKeys} onClose={() => setShowKeys(false)} />
    </div>
  )
}
