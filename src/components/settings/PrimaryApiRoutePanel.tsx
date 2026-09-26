// Code Owner: fayeblade (@spearchucker667)
/**
 * @fileoverview Primary API Route control.
 *
 * Renders a Venice-key-adjacent subsection that lets the user pick the
 * canonical primary host for their Venice-compatible API traffic.
 * Extracted as a standalone component so the API Keys panel can colocate
 * it with the Venice credential (handoff §3.1) and any other section
 * (Providers, Status) can reference it as a read-only status row when
 * desired.
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../../stores/settings-store'
import {
  FRATERNA_DOCS_URL,
  PRIMARY_API_ROUTE_DESCRIPTIONS,
  PRIMARY_API_ROUTE_IDS,
  PRIMARY_API_ROUTE_LABELS,
  isPrimaryApiRouteId,
  type PrimaryApiRouteId,
} from '../../shared/primaryApiRoute'
import { desktopProviderSettings, isElectron } from '../../services/desktopBridge'

interface PrimaryApiRoutePanelProps {
  /** Show the disabled web-mode notice below the selector. Defaults to true. */
  showWebNotice?: boolean
}

export function PrimaryApiRoutePanel({
  showWebNotice = true,
}: PrimaryApiRoutePanelProps): React.ReactElement {
  const { t } = useTranslation(['settings', 'common'])
  const primaryApiRoute = useSettingsStore((s) => s.primaryApiRoute)
  const setPrimaryApiRoute = useSettingsStore((s) => s.setPrimaryApiRoute)
  const supportsPrimaryRouteSelection = isElectron()
  const selectedRoute = isPrimaryApiRouteId(primaryApiRoute)
    ? primaryApiRoute
    : 'venice'

  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleRouteChange = async (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const next = event.target.value
    if (!isPrimaryApiRouteId(next) || isSaving) return

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const saved = await desktopProviderSettings.update({
        primaryApiRoute: next,
      })
      if (saved.ok) {
        setPrimaryApiRoute(next)
        setErrorMessage(null)
      } else {
        setErrorMessage(
          t(
            'settings:providers.primaryRoute.saveFailed',
            'Failed to update primary API route. Please try again.',
          ),
        )
        // Authoritative rehydrate on save failure
        try {
          const current = await desktopProviderSettings.get()
          if (
            current?.primaryApiRoute &&
            isPrimaryApiRouteId(current.primaryApiRoute)
          ) {
            setPrimaryApiRoute(current.primaryApiRoute)
          }
        } catch {
          // Best effort rehydrate
        }
      }
    } catch {
      setErrorMessage(
        t(
          'settings:providers.primaryRoute.saveFailed',
          'Failed to update primary API route. Please try again.',
        ),
      )
      // Authoritative rehydrate on thrown error
      try {
        const current = await desktopProviderSettings.get()
        if (
          current?.primaryApiRoute &&
          isPrimaryApiRouteId(current.primaryApiRoute)
        ) {
          setPrimaryApiRoute(current.primaryApiRoute)
        }
      } catch {
        // Best effort rehydrate
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-4 rounded-md border border-[var(--color-border)] bg-vf-panel-bg-inset space-y-4">
      <div className="space-y-2">
        <h3 className="font-medium">
          {t('settings:providers.primaryRoute.title', 'Primary API Route')}
        </h3>
        <p className="text-xs text-[var(--color-text-secondary)]">
          {t(
            'settings:providers.primaryRoute.description',
            'Choose which canonical host your primary API requests go to. The Venice route is the default and supports the full endpoint surface. The Fraterna route mirrors a curated subset; unsupported endpoints automatically fall back to the Venice host. Fraterna is a third-party service separate from Venice Forge and Venice.ai — its proxy records selected request metadata for successful requests.',
          )}
        </p>
        <div className="pt-1">
          <a
            href={FRATERNA_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline inline-flex items-center gap-1"
          >
            {t(
              'settings:providers.primaryRoute.fraternaDocsLink',
              'Fraterna documentation',
            )}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <label
          htmlFor="primary-api-route-select"
          className="text-sm font-medium"
        >
          {t('settings:providers.primaryRoute.label', 'Primary API Route')}
        </label>
        <select
          id="primary-api-route-select"
          value={selectedRoute}
          onChange={handleRouteChange}
          disabled={!supportsPrimaryRouteSelection || isSaving}
          aria-label={t(
            'settings:providers.primaryRoute.aria.select',
            'Select primary API route',
          )}
          className="px-3 py-1.5 rounded border border-[var(--color-border)] bg-input-bg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {PRIMARY_API_ROUTE_IDS.map((routeId) => (
            <option key={routeId} value={routeId}>
              {t(
                `settings:providers.primaryRoute.${routeId}.label`,
                PRIMARY_API_ROUTE_LABELS[routeId],
              )}
            </option>
          ))}
        </select>
        {errorMessage && (
          <div
            role="alert"
            className="text-xs text-[var(--color-danger)] font-medium"
          >
            {errorMessage}
          </div>
        )}
        {supportsPrimaryRouteSelection && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {t(
              `settings:providers.primaryRoute.${selectedRoute}.description`,
              PRIMARY_API_ROUTE_DESCRIPTIONS[selectedRoute as PrimaryApiRouteId],
            )}
          </p>
        )}
        {showWebNotice && !supportsPrimaryRouteSelection && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {t(
              'settings:providers.primaryRoute.webDisabled',
              'The Primary API Route is configured per-profile in the desktop app. In web mode, the route is set by the VENICE_FORGE_PRIMARY_API_ROUTE server environment variable (default: Venice).',
            )}
          </p>
        )}
      </div>
    </div>
  )
}
