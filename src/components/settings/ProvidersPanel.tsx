import React, { useState } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { useSettingsStore } from '../../stores/settings-store'
import { PROVIDER_REGISTRY, type ProviderId } from '../../types/provider'
import { PrimaryButton } from '../ui/shared'

export function resolveFeatureAvailability(providerId: string, feature: string): boolean {
  if (providerId === 'venice') return true
  const def = PROVIDER_REGISTRY[providerId as ProviderId]
  if (!def) return false
  return (def.supportedTypes as string[]).includes(feature)
}

const ALL_FEATURES = ['chat', 'image', 'video', 'audio', 'embeddings', 'vision'] as const


export function ProvidersPanel() {
  const { configuredProviders, setProviderApiKey, clearProviderApiKey } = useAuthStore()
  const { enabledProviders, setEnabledProvider } = useSettingsStore()

  // Track local input state per provider so we don't pollute global state while typing
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({})
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({})

  const handleKeyChange = (providerId: string, val: string) => {
    setKeyInputs(prev => ({ ...prev, [providerId]: val }))
  }

  const handleSaveKey = async (providerId: string) => {
    const val = keyInputs[providerId]?.trim()
    if (!val) return

    setIsSaving(prev => ({ ...prev, [providerId]: true }))
    setErrorMsg(prev => ({ ...prev, [providerId]: '' }))

    try {
      await setProviderApiKey(providerId, val)
      setKeyInputs(prev => ({ ...prev, [providerId]: '' }))
    } catch (err) {
      setErrorMsg(prev => ({ 
        ...prev, 
        [providerId]: err instanceof Error ? err.message : String(err) 
      }))
    } finally {
      setIsSaving(prev => ({ ...prev, [providerId]: false }))
    }
  }

  const handleClearKey = async (providerId: string) => {
    setIsSaving(prev => ({ ...prev, [providerId]: true }))
    setErrorMsg(prev => ({ ...prev, [providerId]: '' }))
    try {
      await clearProviderApiKey(providerId)
      setEnabledProvider(providerId, false)
    } catch (err) {
      setErrorMsg(prev => ({ 
        ...prev, 
        [providerId]: err instanceof Error ? err.message : String(err) 
      }))
    } finally {
      setIsSaving(prev => ({ ...prev, [providerId]: false }))
    }
  }

  const handleToggleEnable = (providerId: string, enabled: boolean) => {
    if (enabled && !configuredProviders[providerId]) {
      setErrorMsg(prev => ({ ...prev, [providerId]: 'Cannot enable provider without an API key.' }))
      return
    }
    setErrorMsg(prev => ({ ...prev, [providerId]: '' }))
    setEnabledProvider(providerId, enabled)
  }

  const providers = Object.values(PROVIDER_REGISTRY)
    // Don't show Venice in fallback providers list, it's the primary provider managed in ApiKeysPanel
    .filter(p => p.id !== 'venice')

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Fallback Providers</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Configure API keys for fallback providers. These will only be used if explicitly enabled and when Venice models are unavailable or you request a specific fallback model.
        </p>
      </div>

      <div className="space-y-4">
        {providers.map(provider => {
          const isConfigured = !!configuredProviders[provider.id]
          const isEnabled = !!enabledProviders[provider.id]
          const saving = !!isSaving[provider.id]
          const error = errorMsg[provider.id]

          return (
            <div key={provider.id} className="p-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{provider.label}</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">{provider.description}</p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {ALL_FEATURES.map(f => {
                      const isAvailable = resolveFeatureAvailability(provider.id, f)
                      return (
                        <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${isAvailable ? 'bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]' : 'bg-transparent text-[var(--color-text-muted)] opacity-50 line-through'}`}>
                          {f}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => handleToggleEnable(provider.id, !isEnabled)}
                    disabled={!isConfigured}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 /* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */ ${
                      isEnabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-tertiary)]'
                    } ${!isConfigured ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="sr-only">Enable {provider.label}</span>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out /* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */ ${
                        isEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-500 bg-red-500/10 p-2 rounded">
                  {error}
                </div>
              )}

              <div className="flex gap-2 items-center">
                {isConfigured ? (
                  <>
                    <div className="text-sm text-[var(--color-success)] flex items-center gap-1.5 flex-1">
                      <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                      API Key Configured
                    </div>
                    <button
                      className="px-3 py-1.5 text-sm rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
                      onClick={() => handleClearKey(provider.id)}
                      disabled={saving}
                    >
                      Remove Key
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="password"
                      placeholder="Enter API Key"
                      value={keyInputs[provider.id] || ''}
                      onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg-primary)] text-sm"
                      disabled={saving}
                    />
                    <PrimaryButton
                      onClick={() => handleSaveKey(provider.id)}
                      disabled={saving || !(keyInputs[provider.id]?.trim())}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </PrimaryButton>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
