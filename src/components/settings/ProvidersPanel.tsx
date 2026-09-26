import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/auth-store'
import { useSettingsStore } from '../../stores/settings-store'
import {
  AVAILABLE_FALLBACK_PROVIDER_IDS,
  DEFERRED_PROVIDER_IDS,
  PROVIDER_REGISTRY,
  requiresStructuredCredential,
  type ProviderId,
  type ProviderCredential,
} from '../../types/provider'
import { PrimaryButton } from '../ui/shared'
import { desktopProviderSettings, isElectron } from '../../services/desktopBridge'

export function resolveFeatureAvailability(providerId: string, feature: string): boolean {
  if (providerId === 'venice') return true
  const def = PROVIDER_REGISTRY[providerId as ProviderId]
  if (!def || def.unavailable) return false
  return (def.supportedTypes as string[]).includes(feature)
}

const ALL_FEATURES = ['chat', 'image', 'video', 'audio', 'embeddings', 'vision'] as const


export function ProvidersPanel() {
  const { t } = useTranslation(['settings', 'common'])
  const { configuredProviders, setProviderApiKey, clearProviderApiKey, setProviderCredential, clearProviderCredential } = useAuthStore()
  const {
    enabledProviders,
    setEnabledProvider,
    autoFallbackEnabled,
    setAutoFallbackEnabled,
    fallbackOrdering,
    setFallbackOrdering,
  } = useSettingsStore()

  // Track local input state per provider so we don't pollute global state while typing
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const [structuredInputs, setStructuredInputs] = useState<Record<string, Record<string, string>>>({})
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({})
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({})
  const [fallbackInput, setFallbackInput] = useState<string>(fallbackOrdering.join(', '))
  const [routerError, setRouterError] = useState('')

  useEffect(() => {
    if (!isElectron()) return
    let cancelled = false
    void desktopProviderSettings.get().then((settings) => {
      if (cancelled) return
      setFallbackInput(settings.fallbackOrdering.join(', '))
    }).catch((error: unknown) => {
      if (!cancelled) setRouterError(error instanceof Error ? error.message : t('settings:providers.errors.loadFailed', 'Failed to load provider settings.'))
    })
    return () => { cancelled = true }
  }, [t])

  const persistRoutingSettings = async (update: {
    enabledProviders?: Record<string, boolean>
    autoFallbackEnabled?: boolean
    fallbackOrdering?: string[]
  }) => {
    if (!isElectron()) return true
    const result = await desktopProviderSettings.update(update)
    if (!result.ok) {
      setRouterError(result.error || t('settings:providers.errors.saveFailed', 'Failed to save provider settings.'))
      return false
    }
    setRouterError('')
    return true
  }

  const handleKeyChange = (providerId: string, val: string) => {
    setKeyInputs(prev => ({ ...prev, [providerId]: val }))
  }

  const handleStructuredChange = (providerId: string, field: string, val: string) => {
    setStructuredInputs(prev => ({ ...prev, [providerId]: { ...prev[providerId], [field]: val } }))
  }

  function buildStructuredCredential(providerId: ProviderId, fields: Record<string, string>): ProviderCredential {
    switch (providerId) {
      case 'azure_openai':
        return {
          providerId,
          resourceName: fields.resourceName?.trim() ?? '',
          deploymentName: fields.deploymentName?.trim() ?? '',
          apiVersion: fields.apiVersion?.trim() ?? '',
          apiKey: fields.apiKey?.trim() ?? '',
        } as ProviderCredential
      case 'aws_bedrock':
        return {
          providerId,
          region: fields.region?.trim() ?? '',
          apiKey: fields.apiKey?.trim() ?? '',
        } as ProviderCredential
      case 'google_vertex':
        // VF-AUD-20260831-P2-007: only Express Mode (API key) is supported.
        // The previous "full" branch was selectable but guaranteed to fail.
        return {
          providerId,
          authMode: 'express',
          apiKey: fields.apiKey?.trim() ?? '',
        } as ProviderCredential
      default:
        throw new Error(`Unsupported structured provider: ${providerId}`)
    }
  }

  const handleSaveKey = async (providerId: string) => {
    const isStructured = requiresStructuredCredential(providerId as ProviderId)
    const val = keyInputs[providerId]?.trim()
    if (!isStructured && !val) return

    setIsSaving(prev => ({ ...prev, [providerId]: true }))
    setErrorMsg(prev => ({ ...prev, [providerId]: '' }))

    try {
      if (isStructured) {
        const credential = buildStructuredCredential(providerId as ProviderId, structuredInputs[providerId] ?? {})
        await setProviderCredential(providerId as ProviderId, credential)
        setStructuredInputs(prev => ({ ...prev, [providerId]: {} }))
      } else {
        await setProviderApiKey(providerId, val!)
        setKeyInputs(prev => ({ ...prev, [providerId]: '' }))
      }
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
      if (requiresStructuredCredential(providerId as ProviderId)) {
        await clearProviderCredential(providerId as ProviderId)
      } else {
        await clearProviderApiKey(providerId)
      }
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

  const handleToggleEnable = async (providerId: string, enabled: boolean) => {
    if (enabled && !configuredProviders[providerId]) {
      setErrorMsg(prev => ({ ...prev, [providerId]: t('settings:providers.errors.enableWithoutKey', 'Cannot enable provider without an API key.') }))
      return
    }
    setErrorMsg(prev => ({ ...prev, [providerId]: '' }))
    const nextEnabled = { ...enabledProviders, [providerId]: enabled }
    if (await persistRoutingSettings({ enabledProviders: nextEnabled })) {
      setEnabledProvider(providerId, enabled)
    }
  }

  const providers = Object.values(PROVIDER_REGISTRY)
    // Don't show Venice in fallback providers list, it's the primary provider managed in ApiKeysPanel
    .filter(p => p.id !== 'venice')
  const availableProviderIds = new Set<string>(AVAILABLE_FALLBACK_PROVIDER_IDS)

  // The Primary API Route control is colocated with the Venice API key
  // controls per the FRATERNA handoff §3.1 ("Settings → API Keys or a small
  // primary-routing subsection immediately adjacent to the Venice API key
  // controls"). It is NOT rendered here. See
  // `src/components/settings/PrimaryApiRoutePanel.tsx` for the canonical
  // control, which is rendered from `VeniceApiKeysPanel.tsx`.

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{t('settings:providers.title', 'Fallback Providers')}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {t('settings:providers.description', 'Configure API keys for fallback providers. These will only be used if explicitly enabled and when Venice models are unavailable or you request a specific fallback model.')}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {t('settings:providers.deferredNotice', { defaultValue: 'Deferred in this release (no key entry, routing, or traffic): {{deferred}}. Provider keys are replaced or removed manually; scheduled key rotation is not implemented.', deferred: DEFERRED_PROVIDER_IDS.join(', ') })}
        </p>
      </div>

      <div className="p-4 rounded-md border border-[var(--color-border)] bg-vf-panel-bg-inset space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">{t('settings:providers.autoFallback.title', 'Automatic Fallback Router')}</h3>
            <p className="text-xs text-[var(--color-text-secondary)]">
              {t('settings:providers.autoFallback.description', 'Automatically route requests to fallback providers if Venice is unavailable or returns an error.')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoFallbackEnabled}
            onClick={() => {
              const next = !autoFallbackEnabled
              void persistRoutingSettings({ autoFallbackEnabled: next }).then((saved) => {
                if (saved) setAutoFallbackEnabled(next)
              })
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 /* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */ ${
              autoFallbackEnabled ? 'bg-accent' : 'bg-vf-panel-bg-inset'
            }`}
          >
            <span className="sr-only">{t('settings:providers.autoFallback.enableAria', 'Enable Automatic Fallback')}</span>
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out /* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */ ${
                autoFallbackEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
        {autoFallbackEnabled && (
          <div>
            <label className="block text-sm font-medium mb-1">{t('settings:providers.autoFallback.orderingLabel', 'Fallback Ordering (comma-separated provider IDs)')}</label>
            <input
              type="text"
              className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm"
              placeholder={t('settings:providers.autoFallback.orderingPlaceholder', 'together, groq, anthropic')}
              value={fallbackInput}
              onChange={(e) => {
                setFallbackInput(e.target.value);
                const parts = e.target.value.split(',').map(s => s.trim()).filter(s => availableProviderIds.has(s));
                setFallbackOrdering(parts);
              }}
              onBlur={() => { void persistRoutingSettings({ fallbackOrdering }) }}
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {t('settings:providers.autoFallback.orderingNotice', { defaultValue: 'Providers will be tried in this exact order. Ensure you have enabled them below. Available: {{available}}', available: AVAILABLE_FALLBACK_PROVIDER_IDS.join(', ') })}
            </p>
          </div>
        )}
        {routerError && <p role="alert" className="text-sm text-[var(--color-danger)]">{routerError}</p>}
      </div>

      <div className="space-y-4">
        {providers.map(provider => {
          const isConfigured = !!configuredProviders[provider.id]
          const isEnabled = !!enabledProviders[provider.id]
          const saving = !!isSaving[provider.id]
          const error = errorMsg[provider.id]
          const isUnavailable = !!provider.unavailable

          return (
            <div key={provider.id} className={`p-4 rounded-md border border-[var(--color-border)] bg-vf-panel-bg-inset space-y-3 ${isUnavailable ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium flex items-center gap-2">
                    {provider.label}
                    {isUnavailable && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning uppercase tracking-wider font-semibold">
                        {t('settings:providers.badge.deferred', 'Deferred')}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">{provider.description}</p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {ALL_FEATURES.map(f => {
                      const isAvailable = resolveFeatureAvailability(provider.id, f)
                      return (
                        <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider ${isAvailable && !isUnavailable ? 'bg-vf-control-hover text-[var(--color-text-primary)]' : 'bg-transparent text-[var(--color-text-muted)] opacity-50 line-through'}`}>
                          {f}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {isEnabled ? t('common:status.enabled', 'Enabled') : t('common:status.disabled', 'Disabled')}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => { void handleToggleEnable(provider.id, !isEnabled) }}
                    disabled={!isConfigured || isUnavailable}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 /* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */ ${
                      isEnabled ? 'bg-accent' : 'bg-vf-panel-bg-inset'
                    } ${(!isConfigured || isUnavailable) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="sr-only">{t('settings:providers.aria.enable', { defaultValue: 'Enable {{label}}', label: provider.label })}</span>
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
                <div className="text-sm text-danger bg-danger/10 p-2 rounded">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                {isConfigured ? (
                  <div className="flex gap-2 items-center">
                    <div className="text-sm text-[var(--color-success)] flex items-center gap-1.5 flex-1">
                      <div className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                      {requiresStructuredCredential(provider.id as ProviderId)
                        ? t('settings:providers.status.credentialConfigured', 'Credential Configured')
                        : t('settings:providers.status.keyConfigured', 'API Key Configured')}
                    </div>
                    <button
                      className="px-3 py-1.5 text-sm rounded border border-[var(--color-border)] hover:bg-vf-control-hover disabled:opacity-50"
                      onClick={() => handleClearKey(provider.id)}
                      disabled={saving}
                    >
                      {t('settings:providers.actions.removeKey', 'Remove Key')}
                    </button>
                  </div>
                ) : requiresStructuredCredential(provider.id as ProviderId) ? (
                  <div className="space-y-2">
                    {provider.id === 'azure_openai' && (
                      <>
                        <input
                          type="text"
                          placeholder={t('settings:providers.inputs.azureResourceName', 'Azure resource name')}
                          value={structuredInputs[provider.id]?.resourceName || ''}
                          onChange={(e) => handleStructuredChange(provider.id, 'resourceName', e.target.value)}
                          className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm"
                          disabled={saving || isUnavailable}
                        />
                        <input
                          type="text"
                          placeholder={t('settings:providers.inputs.azureDeploymentName', 'Azure deployment name')}
                          value={structuredInputs[provider.id]?.deploymentName || ''}
                          onChange={(e) => handleStructuredChange(provider.id, 'deploymentName', e.target.value)}
                          className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm"
                          disabled={saving || isUnavailable}
                        />
                        <input
                          type="text"
                          placeholder={t('settings:providers.inputs.azureApiVersion', 'Azure API version (e.g. 2024-08-01-preview)')}
                          value={structuredInputs[provider.id]?.apiVersion || ''}
                          onChange={(e) => handleStructuredChange(provider.id, 'apiVersion', e.target.value)}
                          className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm"
                          disabled={saving || isUnavailable}
                        />
                        <input
                          type="password"
                          placeholder={t('settings:providers.inputs.azureApiKey', 'Azure API key')}
                          value={structuredInputs[provider.id]?.apiKey || ''}
                          onChange={(e) => handleStructuredChange(provider.id, 'apiKey', e.target.value)}
                          className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm"
                          disabled={saving || isUnavailable}
                        />
                      </>
                    )}
                    {provider.id === 'aws_bedrock' && (
                      <>
                        <input
                          type="text"
                          placeholder={t('settings:providers.inputs.awsRegion', 'AWS region (e.g. us-east-1)')}
                          value={structuredInputs[provider.id]?.region || ''}
                          onChange={(e) => handleStructuredChange(provider.id, 'region', e.target.value)}
                          className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm"
                          disabled={saving || isUnavailable}
                        />
                        <input
                          type="password"
                          placeholder={t('settings:providers.inputs.awsApiKey', 'AWS Bedrock API key')}
                          value={structuredInputs[provider.id]?.apiKey || ''}
                          onChange={(e) => handleStructuredChange(provider.id, 'apiKey', e.target.value)}
                          className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm"
                          disabled={saving || isUnavailable}
                        />
                      </>
                    )}
                    {provider.id === 'google_vertex' && (
                      <input
                        type="password"
                        placeholder={t('settings:providers.inputs.vertexApiKey', 'Vertex Express API key')}
                        value={structuredInputs[provider.id]?.apiKey || ''}
                        onChange={(e) => handleStructuredChange(provider.id, 'apiKey', e.target.value)}
                        className="w-full px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm"
                        disabled={saving || isUnavailable}
                      />
                    )}
                    <PrimaryButton
                      onClick={() => handleSaveKey(provider.id)}
                      disabled={saving || isUnavailable}
                    >
                      {saving ? t('common:actions.saving', 'Saving...') : t('common:actions.save', 'Save')}
                    </PrimaryButton>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="password"
                      placeholder={t('settings:providers.inputs.keyPlaceholder', 'Enter API Key')}
                      value={keyInputs[provider.id] || ''}
                      onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm"
                      disabled={saving || isUnavailable}
                    />
                    <PrimaryButton
                      onClick={() => handleSaveKey(provider.id)}
                      disabled={saving || !(keyInputs[provider.id]?.trim()) || isUnavailable}
                    >
                      {saving ? t('common:actions.saving', 'Saving...') : t('common:actions.save', 'Save')}
                    </PrimaryButton>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
