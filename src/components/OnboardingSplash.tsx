import React, { useEffect, useRef, useState } from 'react'
import { useProfileStore } from '../stores/profile-store'
import { useSettingsStore } from '../stores/settings-store'
import { AccessibleDialog } from './ui/AccessibleDialog'

export function OnboardingSplash() {
  const { globalOnboardingCompleted, setGlobalOnboardingCompleted } = useProfileStore()
  const setActiveTab = useSettingsStore(s => s.setActiveTab)
  const setPendingSettingsSection = useSettingsStore(s => s.setPendingSettingsSection)
  const [step, setStep] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const primaryActionRef = useRef<HTMLButtonElement>(null)

  const steps = [
    {
      title: 'Welcome to Venice Forge',
      description: 'A local desktop workbench that stores app data on this device and sends requests to the remote providers you configure.',
    },
    {
      title: 'Profiles',
      description: 'Create profiles for separate renderer settings and libraries. Some desktop vault files and shared caches remain machine-level.',
    },
    {
      title: 'Secure by Default',
      description: 'Passwords and secrets are encrypted via OS native keychain (macOS) or Credential Manager (Windows). Never stored in plaintext.',
    },
    {
      title: 'Family Safe Mode',
      description: 'A master password is required before Family Safe Mode can be turned on or off. Family Safe Mode also forces provider safe_mode where supported.',
    },
  ]

  const isLast = step === steps.length - 1

  useEffect(() => {
    if (globalOnboardingCompleted) return
    primaryActionRef.current?.focus()
  }, [globalOnboardingCompleted, step])

  if (globalOnboardingCompleted) return null

  const nextStep = () => {
    if (isLast) {
      setGlobalOnboardingCompleted(true)
    } else {
      setStep(s => s + 1)
    }
  }

  const handleCreateProfile = () => {
    setGlobalOnboardingCompleted(true)
    setPendingSettingsSection('profiles')
    setActiveTab('settings')
  }

  return (
    <AccessibleDialog
      title={steps[step].title}
      description={steps[step].description}
      panelRef={dialogRef}
      initialFocusRef={primaryActionRef}
      panelClassName="max-w-md"
    >
      <div className="flex flex-col items-center p-6 text-center">
        
        <div className="flex items-center gap-2 mb-8" role="group" aria-label={`Onboarding step ${step + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <span key={i} aria-current={i === step ? 'step' : undefined} className={`h-2 w-2 rounded-full ${i === step ? 'bg-accent ring-2 ring-focus-ring' : 'bg-border'}`} />
          ))}
        </div>

        {isLast ? (
          <div className="flex flex-col gap-3 w-full">
            <button
              ref={primaryActionRef}
              type="button"
              onClick={nextStep}
              className="w-full py-2 bg-button-primary-bg text-button-primary-fg rounded font-medium hover:bg-accent-hover transition-colors"
            >
              Get Started
            </button>
            <button
              type="button"
              onClick={handleCreateProfile}
              className="w-full py-2 bg-transparent border border-[var(--venice-border)] text-[var(--venice-fg)] rounded font-medium hover:bg-[var(--venice-surface)] transition-colors"
            >
              Create Profile
            </button>
          </div>
        ) : (
          <button
            ref={primaryActionRef}
            type="button"
            onClick={nextStep}
            className="w-full py-2 bg-button-primary-bg text-button-primary-fg rounded font-medium hover:bg-accent-hover transition-colors"
          >
            Next
          </button>
        )}
      </div>
    </AccessibleDialog>
  )
}
