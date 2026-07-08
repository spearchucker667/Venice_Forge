import React, { useState } from 'react'
import { useProfileStore } from '../stores/profile-store'

export function OnboardingSplash() {
  const { globalOnboardingCompleted, setGlobalOnboardingCompleted } = useProfileStore()
  const [step, setStep] = useState(0)

  if (globalOnboardingCompleted) return null

  const steps = [
    {
      title: 'Welcome to Venice Forge',
      description: 'Your secure, local AI workbench. Everything runs here, staying private and fast.',
    },
    {
      title: 'Profiles',
      description: 'Create isolated profiles for different workflows. API keys, settings, and histories are strictly sandboxed per profile.',
    },
    {
      title: 'Secure by Default',
      description: 'Passwords and secrets are encrypted via OS native keychain (macOS) or Credential Manager (Windows). Never stored in plaintext.',
    },
    {
      title: 'Family Safe Mode',
      description: 'You can protect settings with a Master Password. Family Safe Mode requires this password to bypass.',
    },
  ]

  const isLast = step === steps.length - 1

  const nextStep = () => {
    if (isLast) {
      setGlobalOnboardingCompleted(true)
    } else {
      setStep(s => s + 1)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[var(--venice-app-bg)] border border-[var(--venice-border)] rounded-lg p-6 shadow-2xl flex flex-col items-center text-center">
        <h2 className="text-2xl font-bold mb-4">{steps[step].title}</h2>
        <p className="text-[var(--venice-muted)] mb-8 h-20">{steps[step].description}</p>
        
        <div className="flex items-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div key={i} className={`h-2 w-2 rounded-full ${i === step ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>

        <button
          onClick={nextStep}
          className="w-full py-2 bg-button-primary-bg text-button-primary-fg rounded font-medium hover:bg-accent-hover transition-colors"
          autoFocus
        >
          {isLast ? 'Get Started' : 'Next'}
        </button>
      </div>
    </div>
  )
}
