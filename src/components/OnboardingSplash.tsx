import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfileStore } from '../stores/profile-store'
import { useSettingsStore } from '../stores/settings-store'
import { AccessibleDialog } from './ui/AccessibleDialog'
import { VeniceLogo } from './ui/logo'
import { Meteocon } from './ui/Meteocon'
import { SUPPORTED_LOCALES, SUPPORTED_LOCALE_CODES, resolveEffectiveLocale } from '../i18n/locales'
import type { LocaleSetting } from '../i18n/locale-types'

export function OnboardingSplash() {
  const { t } = useTranslation(['onboarding', 'common'])
  const { globalOnboardingCompleted, setGlobalOnboardingCompleted } = useProfileStore()
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const setPendingSettingsSection = useSettingsStore((s) => s.setPendingSettingsSection)
  const uiLocale = useSettingsStore((s) => s.uiLocale)
  const setUiLocale = useSettingsStore((s) => s.setUiLocale)

  const [step, setStep] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const primaryActionRef = useRef<HTMLButtonElement>(null)

  const steps = [
    {
      title: t('onboarding:steps.welcome.title', 'Welcome to Venice Forge'),
      description: t(
        'onboarding:steps.welcome.description',
        'A local desktop workbench that stores app data on this device and sends requests to the remote providers you configure.',
      ),
      icon: <VeniceLogo className="w-16 h-16 mb-4 text-accent" />,
    },
    {
      title: t('onboarding:steps.profiles.title', 'Profiles'),
      description: t(
        'onboarding:steps.profiles.description',
        'Create profiles for separate renderer settings and libraries. Some desktop vault files and shared caches remain machine-level.',
      ),
      icon: <Meteocon name="code-purple" size={48} className="mb-4" />,
    },
    {
      title: t('onboarding:steps.security.title', 'Secure by Default'),
      description: t(
        'onboarding:steps.security.description',
        'Passwords and secrets are encrypted via OS native keychain (macOS) or Credential Manager (Windows). Never stored in plaintext.',
      ),
      icon: <Meteocon name="umbrella" size={48} className="mb-4" />,
    },
    {
      title: t('onboarding:steps.safety.title', 'Family Safe Mode'),
      description: t(
        'onboarding:steps.safety.description',
        'A master password is required before Family Safe Mode can be turned on or off. Family Safe Mode is controlled independently of provider safe_mode.',
      ),
      icon: <Meteocon name="weather-alarm" size={48} className="mb-4" />,
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
      setStep((s) => s + 1)
    }
  }

  const handleCreateProfile = () => {
    setGlobalOnboardingCompleted(true)
    setPendingSettingsSection('profiles')
    setActiveTab('settings')
  }

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUiLocale(e.target.value as LocaleSetting)
  }

  return (
    <AccessibleDialog
      title={<div className="sr-only">{steps[step].title}</div>}
      description={<div className="sr-only">{steps[step].description}</div>}
      panelRef={dialogRef}
      initialFocusRef={primaryActionRef}
      panelClassName="max-w-xl overflow-hidden p-0"
    >
      <div className="flex flex-col sm:flex-row">
        {/* Left branding panel */}
        <div className="hidden sm:flex flex-col bg-accent/5 w-1/3 p-6 border-r border-vf-panel-border relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Meteocon name="star" size={96} className="text-accent" />
          </div>
          <VeniceLogo className="w-8 h-8 text-accent mb-4 z-10" />
          <h2 className="text-xl font-bold text-text-primary mt-auto z-10 leading-tight">
            Venice Forge
          </h2>
          <p className="text-sm text-text-secondary mt-2 z-10">
            {t('common:appSubtitle', 'The private local workbench.')}
          </p>
        </div>

        {/* Right content panel */}
        <div className="flex flex-col items-center p-8 text-center sm:w-2/3 min-h-[380px] justify-center relative">
          <div className="mb-2 animate-scale-in">{steps[step].icon}</div>
          <h3 className="text-2xl font-bold text-text-primary mb-3">{steps[step].title}</h3>
          <p className="text-text-secondary text-[15px] leading-relaxed mb-6">{steps[step].description}</p>

          {/* Optional Language Selector on Step 0 */}
          {step === 0 && (
            <div className="w-full mb-6 text-left">
              <label
                htmlFor="onboarding-language-select"
                className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5"
              >
                {t('onboarding:languageSelectorLabel', 'Application Language')}
              </label>
              <select
                id="onboarding-language-select"
                aria-label={t('onboarding:selectLanguage', 'Select language')}
                value={uiLocale}
                onChange={handleLanguageChange}
                className="w-full px-3 py-2 bg-vf-panel-bg border border-vf-panel-border rounded-lg text-sm text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
              >
                <option value="system">
                  {t('onboarding:systemLanguageOption', { defaultValue: 'System language ({{language}})', language: SUPPORTED_LOCALES[resolveEffectiveLocale('system')]?.nativeName, })}
                </option>
                {SUPPORTED_LOCALE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {SUPPORTED_LOCALES[code].nativeName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            className="flex items-center gap-2 mb-6"
            role="group"
            aria-label={t('onboarding:stepIndicator', { defaultValue: 'Onboarding step {{current}} of {{total}}', current: step + 1,
              total: steps.length, })}
          >
            {steps.map((_, i) => (
              <span
                key={i}
                aria-current={i === step ? 'step' : undefined}
                className={`h-2 w-2 rounded-full ${i === step ? 'bg-accent ring-2 ring-focus-ring' : 'bg-border'}`}
              />
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
                {t('onboarding:getStarted', 'Get Started')}
              </button>
              <button
                type="button"
                onClick={handleCreateProfile}
                className="w-full py-2.5 bg-vf-panel-bg border border-vf-panel-border text-text-secondary rounded-lg font-medium hover:text-text-primary hover:bg-vf-panel-bg-raised transition-colors"
              >
                {t('onboarding:createProfile', 'Create Profile')}
              </button>
            </div>
          ) : (
            <button
              ref={primaryActionRef}
              type="button"
              onClick={nextStep}
              className="w-full py-2.5 bg-button-primary-bg text-button-primary-fg rounded-lg font-medium hover:bg-accent-hover transition-colors shadow-sm"
            >
              {t('onboarding:continue', 'Continue')}
            </button>
          )}
        </div>
      </div>
    </AccessibleDialog>
  )
}
