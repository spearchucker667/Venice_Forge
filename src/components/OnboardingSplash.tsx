import React, { useEffect, useRef, useState } from 'react'
import { useProfileStore } from '../stores/profile-store'
import { useSettingsStore } from '../stores/settings-store'
import { AccessibleDialog } from './ui/AccessibleDialog'
import { VeniceLogo } from './ui/logo'
import { Meteocon } from './ui/Meteocon'

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
      icon: <VeniceLogo className="w-16 h-16 mb-4 text-accent" />
    },
    {
      title: 'Profiles',
      description: 'Create profiles for separate renderer settings and libraries. Some desktop vault files and shared caches remain machine-level.',
      icon: <Meteocon name="code-purple" size={48} className="mb-4" />
    },
    {
      title: 'Secure by Default',
      description: 'Passwords and secrets are encrypted via OS native keychain (macOS) or Credential Manager (Windows). Never stored in plaintext.',
      icon: <Meteocon name="umbrella" size={48} className="mb-4" />
    },
    {
      title: 'Family Safe Mode',
      description: 'A master password is required before Family Safe Mode can be turned on or off. Family Safe Mode also forces provider safe_mode where supported.',
      icon: <Meteocon name="weather-alarm" size={48} className="mb-4" />
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
      title={<div className="sr-only">{steps[step].title}</div>}
      description={<div className="sr-only">{steps[step].description}</div>}
      panelRef={dialogRef}
      initialFocusRef={primaryActionRef}
      panelClassName="max-w-xl mesh-surface-elevated overflow-hidden p-0"
    >
      <div className="flex flex-col sm:flex-row">
        {/* Left branding panel */}
        <div className="hidden sm:flex flex-col bg-accent/5 w-1/3 p-6 border-r border-border/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Meteocon name="star" size={96} className="text-accent" />
          </div>
          <VeniceLogo className="w-8 h-8 text-accent mb-4 z-10" />
          <h2 className="text-xl font-bold text-text-primary mt-auto z-10 leading-tight">
            Venice Forge
          </h2>
          <p className="text-sm text-text-secondary mt-2 z-10">
            The private local workbench.
          </p>
        </div>

        {/* Right content panel */}
        <div className="flex flex-col items-center p-8 text-center sm:w-2/3 min-h-[360px] justify-center relative">

          <div className="mb-2 animate-scale-in">
            {steps[step].icon}
          </div>
          <h3 className="text-2xl font-bold text-text-primary mb-3">{steps[step].title}</h3>
          <p className="text-text-secondary text-[15px] leading-relaxed mb-8">{steps[step].description}</p>

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
              className="w-full py-2.5 bg-button-primary-bg text-button-primary-fg rounded-lg font-medium hover:bg-accent-hover transition-colors shadow-sm"
            >
              Get Started
            </button>
            <button
              type="button"
              onClick={handleCreateProfile}
              className="w-full py-2.5 bg-surface border border-border text-text-secondary rounded-lg font-medium hover:text-text-primary hover:bg-surface-elevated transition-colors"
            >
              Create Profile
            </button>
          </div>
        ) : (
          <button
            ref={primaryActionRef}
            type="button"
            onClick={nextStep}
            className="w-full py-2.5 bg-button-primary-bg text-button-primary-fg rounded-lg font-medium hover:bg-accent-hover transition-colors shadow-sm"
          >
            Continue
          </button>
        )}
        </div>
      </div>
    </AccessibleDialog>
  )
}
