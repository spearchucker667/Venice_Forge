/** @fileoverview Status tab — single panel surfacing the most-leverage
 *  diagnostics data that would otherwise live across several feature modules.
 *
 *  This is a pragmatic "80/20" version: it gives users visibility into
 *  transport, storage, audit, and last-request state in one place
 *  while the dedicated feature tabs retain their own focused interfaces.
 */

import { useEffect, useState } from 'react';
import { Chip } from './Chip';
import { desktopApp, isElectron } from '../services/desktopBridge';
import { getAuditSnapshot } from '../shared/safety';
import { useSettingsStore } from '../stores/settings-store';
import { useInspectorStore } from '../stores/inspector-store';
import { Meteocon } from './ui/Meteocon';
import { Trans, useTranslation } from 'react-i18next';

interface MediaClassifierCapabilities {
  semanticImageClassifier: 'unavailable' | 'local' | 'provider';
  semanticAudioClassifier: 'unavailable' | 'local' | 'provider';
  semanticVideoClassifier: 'unavailable' | 'local' | 'provider';
  hasRegisteredBackend: boolean;
}

interface AppDiagnostics {
  appVersion: string;
  isDesktop: boolean;
  transport: 'direct-ipc' | 'web-proxy';
  userDataPath: string;
  logsPath: string;
  storageMode: 'encrypted' | 'unavailable' | 'plaintext-fallback' | 'web';
  secureStorageAvailable: boolean;
  apiKeyConfigured: boolean;
  nodeVersion: string;
  electronVersion?: string;
  chromeVersion?: string;
  lastApiError: string;
  // VF-AUD-20260916-P2-006 — truthful Family Safe Mode media-classifier
  // capability state. Defaults to "all unavailable" on web mode where the
  // shared capability descriptor is not loaded through this bridge.
  mediaClassifierCapabilities: MediaClassifierCapabilities;
}

function getEmptyDiagnostics(): AppDiagnostics {
  return {
    appVersion: 'unknown',
    isDesktop: false,
    transport: 'web-proxy',
    userDataPath: 'IndexedDB (browser)',
    logsPath: '',
    storageMode: 'web',
    secureStorageAvailable: false,
    apiKeyConfigured: false,
    nodeVersion: '',
    lastApiError: '',
    mediaClassifierCapabilities: {
      semanticImageClassifier: 'unavailable',
      semanticAudioClassifier: 'unavailable',
      semanticVideoClassifier: 'unavailable',
      hasRegisteredBackend: false,
    },
  };
}

export function StatusView() {
  const [diag, setDiag] = useState<AppDiagnostics>(getEmptyDiagnostics);
  const { t } = useTranslation();
  const activeTab = useSettingsStore((s) => s.activeTab);
  const lastRequest = useInspectorStore((s) => s.logs[0]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (isElectron()) {
        const result = await desktopApp.getDiagnostics();
        if (!cancelled) {
          setDiag({
            appVersion: result.appVersion ?? 'unknown',
            isDesktop: true,
            transport: 'direct-ipc',
            userDataPath: result.userDataPath ?? '',
            logsPath: result.logsPath ?? '',
            storageMode: result.storageMode,
            secureStorageAvailable: result.secureStorageAvailable,
            apiKeyConfigured: result.apiKeyConfigured,
            nodeVersion: result.nodeVersion ?? '',
            electronVersion: result.electronVersion,
            chromeVersion: result.chromeVersion,
            lastApiError: result.lastApiError ?? '',
            mediaClassifierCapabilities: result.mediaClassifierCapabilities,
          });
        }
      } else {
        // Web mode: fill what we can from the runtime; the rest are N/A.
        setDiag((d) => ({
          ...d,
          isDesktop: false,
          transport: 'web-proxy',
          appVersion: (document.querySelector('meta[name="app-version"]') as HTMLMetaElement)?.content ?? 'web',
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Re-read the safety audit snapshot on every render — it is in-memory only.
  const audit = getAuditSnapshot();

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 gap-4">
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-text-primary"><Trans i18nKey="common:surface.componentsStatusview.heading.status" /></h2>
        <p className="text-[12.5px] text-text-muted leading-relaxed">
          <Trans i18nKey="common:surface.componentsStatusview.description.aggregatedRuntimeInfoForTheCurrentBuild" />{' '}
          <a className="underline" href="#" onClick={(e) => {
            e.preventDefault();
            void desktopApp.openLogsFolder();
          }}>
            <Trans i18nKey="common:surface.componentsStatusview.text.logsFolder" /></a>{' '}
          <Trans i18nKey="common:surface.componentsStatusview.description.toInspectDetailedConsoleOutput" /></p>
      </section>

      <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
          <Meteocon name="barometer" size={14} /> <Trans i18nKey="common:surface.componentsStatusview.heading.runtime" /></h3>
        <Row k="App version" v={diag.appVersion} />
        <Row k="Transport" v={diag.transport} />
        <Row k="Mode" v={diag.isDesktop ? 'Electron desktop' : 'Web (browser)'} />
        {diag.electronVersion && <Row k="Electron" v={diag.electronVersion} />}
        {diag.chromeVersion && <Row k="Chromium" v={diag.chromeVersion} />}
        <Row k="Node" v={diag.nodeVersion || 'n/a'} />
      </section>

      <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
          <Meteocon name="humidity" size={14} /> <Trans i18nKey="common:surface.componentsStatusview.heading.storage" /></h3>
        <Row k="Secure store" v={diag.storageMode} />
        <Row k="Encryption available" v={diag.secureStorageAvailable ? 'yes' : 'no'} />
        <Row k="Venice key configured" v={diag.apiKeyConfigured ? 'yes' : 'no'} />
        <Row k="User data path" v={diag.userDataPath} mono />
        <Row k="Logs path" v={diag.logsPath} mono />
      </section>

      <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
          <Meteocon name="umbrella" size={14} /> <Trans i18nKey="common:surface.componentsStatusview.heading.safetyGuardAudit" /></h3>
        <Row k="Allowed" v={String(audit.allowed)} />
        <Row k="Warned" v={String(audit.warned)} />
        <Row k="Blocked" v={String(audit.blocked)} />
        <Row k="Last reason" v={audit.lastReasonCode ?? 'none'} />
        <Row k="Last decision at" v={audit.lastDecisionAt ?? 'n/a'} mono />
        {Object.keys(audit.bySeverity).length > 0 && (
          <div className="text-[12px] text-text-muted pt-1">
            <Trans i18nKey="common:surface.componentsStatusview.text.bySeverity" /> {Object.entries(audit.bySeverity)
              .map(([k, v]) => `${k}=${v}`)
              .join(' · ')}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
          <Meteocon name="umbrella" size={14} /> <Trans i18nKey="common:surface.componentsStatusview.heading.mediaClassifierCapabilities" /></h3>
        {/* The Status pane must reflect the honest capability state. Per VF-AUD-
         * 20260916-P2-006, the production build ships with no registered
         * semantic ML backend for image / audio / video. Displaying "unavailable"
         * three times reads as "broken" rather than "by design", so we collapse
         * the per-modality rows into a single protective-mode badge and an
         * expandable disclosure of which checks ARE active today. */}
        <Row
          k={t('common:surface.componentsStatusview.text.protectiveMode', 'Protective mode')}
          v={diag.mediaClassifierCapabilities.hasRegisteredBackend
            ? t('common:surface.componentsStatusview.text.semanticPlusStructural', 'Semantic + structural')
            : t('common:surface.componentsStatusview.text.structuralOnly', 'Structural validation only')}
        />
        <details className="text-[12px] text-text-muted pt-1">
          <summary className="cursor-pointer hover:text-text-primary">
            <Trans i18nKey="common:surface.componentsStatusview.text.whatIsProtected" />
          </summary>
          <ul className="list-disc pl-5 pt-1 space-y-0.5">
            <li><Trans i18nKey="common:surface.componentsStatusview.text.protectionItemProtocolSafety" /></li>
            <li><Trans i18nKey="common:surface.componentsStatusview.text.protectionItemPayloadShape" /></li>
            <li><Trans i18nKey="common:surface.componentsStatusview.text.protectionItemAttachmentProvenance" /></li>
            <li className="text-text-disabled-fg">
              <Trans i18nKey="common:surface.componentsStatusview.text.protectionItemImageBytes" />
            </li>
            <li className="text-text-disabled-fg">
              <Trans i18nKey="common:surface.componentsStatusview.text.protectionItemAudioBytes" />
            </li>
            <li className="text-text-disabled-fg">
              <Trans i18nKey="common:surface.componentsStatusview.text.protectionItemVideoBytes" />
            </li>
          </ul>
        </details>
      </section>

      <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
          <Meteocon name="time-morning" size={14} /> <Trans i18nKey="common:surface.componentsStatusview.heading.lastRequest" /></h3>
        {lastRequest ? (
          <>
            <Row k="Endpoint" v={lastRequest.endpoint} mono />
            <Row k="Status" v={String(lastRequest.status || 'Pending')} />
            <Row k="Method" v={lastRequest.method} />
            {lastRequest.error && (
              <div className="text-[12px] text-danger pt-1 break-words">
                <Trans i18nKey="common:surface.componentsStatusview.text.lastError" /> {lastRequest.error}
              </div>
            )}
          </>
        ) : (
          <>
            <Chip><Trans i18nKey="common:surface.componentsStatusview.text.noRequestsYetLastErrorBelowIf" /></Chip>
            {diag.lastApiError && (
              <div className="text-[12px] text-danger pt-1 break-words">
                <Trans i18nKey="common:surface.componentsStatusview.text.lastError" /> {diag.lastApiError}
              </div>
            )}
          </>
        )}
      </section>

      <p className="text-[12px] text-text-muted">
        <Trans i18nKey="common:surface.componentsStatusview.description.statusProvidesTransportStorageAuditAndRequest" /></p>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 text-[12.5px]">
      <span className="text-text-muted min-w-[160px] shrink-0">{k}</span>
      <span className={mono ? 'font-mono text-[12px] text-text-secondary break-all' : 'text-text-secondary'}>
        {v}
      </span>
    </div>
  );
}
