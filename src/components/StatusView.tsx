/** @fileoverview Status tab — single panel surfacing the most-leverage
 *  diagnostics data that would otherwise live across several feature modules.
 *
 *  This is a pragmatic "80/20" version: it gives users visibility into
 *  transport, storage, audit, and last-request state in one place
 *  while the dedicated feature tabs retain their own focused interfaces.
 *
 *  VF-20260923-P1-027 — the safety runtime block renders the four safety
 *  concepts as SEPARATE rows (local safeguards, provider safe_mode,
 *  structural validation, semantic classifier backend) so they are never
 *  conflated. The payload carries only booleans, counters, and
 *  fixed-vocabulary strings. */

import { useCallback, useEffect, useState } from 'react';
import { Chip } from './Chip';
import { desktopApp, isElectron } from '../services/desktopBridge';
import { getAuditSnapshot } from '../shared/safety';
import type { ClassifierState, SafetyRuntimeStatus } from '../shared/safety/safetyRuntimeStatus';
import { useSettingsStore } from '../stores/settings-store';
import { useInspectorStore } from '../stores/inspector-store';
import { Meteocon } from './ui/Meteocon';
import { Trans, useTranslation } from 'react-i18next';

const NS = 'common:surface.componentsStatusview';

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
  };
}

export function StatusView() {
  const [diag, setDiag] = useState<AppDiagnostics>(getEmptyDiagnostics);
  const [safety, setSafety] = useState<SafetyRuntimeStatus | null>(null);
  const { t } = useTranslation();
  const activeTab = useSettingsStore((s) => s.activeTab);
  const localFamilySafeModeEnabled = useSettingsStore((s) => s.localFamilySafeModeEnabled);
  const veniceApiSafeMode = useSettingsStore((s) => s.veniceApiSafeMode);
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

  const refreshSafety = useCallback(() => {
    void desktopApp.getSafetyRuntimeStatus().then((status) => {
      if (status) setSafety(status);
    });
  }, []);

  // Refetch on tab entry/change and whenever the renderer-side safety toggles
  // change, so the main-process-authoritative state is reflected immediately
  // without leaving the tab.
  useEffect(() => {
    refreshSafety();
  }, [refreshSafety, activeTab, localFamilySafeModeEnabled, veniceApiSafeMode]);

  // Cheap extra refresh whenever the window regains focus.
  useEffect(() => {
    const onFocus = () => refreshSafety();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshSafety]);

  // Re-read the safety audit snapshot on every render — it is in-memory only.
  const audit = getAuditSnapshot();

  const classifierStateLabel = (state: ClassifierState): string => {
    switch (state) {
      case 'available':
        return t(`${NS}.text.classifierStateAvailable`);
      case 'not-configured':
        return t(`${NS}.text.classifierStateNotConfigured`);
      case 'unsupported':
        return t(`${NS}.text.classifierStateUnsupported`);
      case 'unhealthy':
        return t(`${NS}.text.classifierStateUnhealthy`);
    }
  };

  const sourceLabel =
    safety?.localSafeguards.source === 'user'
      ? t(`${NS}.text.sourceUser`)
      : safety?.localSafeguards.source === 'server'
        ? t(`${NS}.text.sourceServer`)
        : t(`${NS}.text.sourcePolicy`);

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 gap-4">
      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-text-primary"><Trans i18nKey={`${NS}.heading.status`} /></h2>
        <p className="text-[12.5px] text-text-muted leading-relaxed">
          <Trans i18nKey={`${NS}.description.aggregatedRuntimeInfoForTheCurrentBuild`} />{' '}
          <a className="underline" href="#" onClick={(e) => {
            e.preventDefault();
            void desktopApp.openLogsFolder();
          }}>
            <Trans i18nKey={`${NS}.text.logsFolder`} /></a>{' '}
          <Trans i18nKey={`${NS}.description.toInspectDetailedConsoleOutput`} /></p>
      </section>

      <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
          <Meteocon name="barometer" size={14} /> <Trans i18nKey={`${NS}.heading.runtime`} /></h3>
        <Row k="App version" v={diag.appVersion} />
        <Row k="Transport" v={diag.transport} />
        <Row k="Mode" v={diag.isDesktop ? 'Electron desktop' : 'Web (browser)'} />
        {diag.electronVersion && <Row k="Electron" v={diag.electronVersion} />}
        {diag.chromeVersion && <Row k="Chromium" v={diag.chromeVersion} />}
        <Row k="Node" v={diag.nodeVersion || 'n/a'} />
      </section>

      <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
          <Meteocon name="humidity" size={14} /> <Trans i18nKey={`${NS}.heading.storage`} /></h3>
        <Row k="Secure store" v={diag.storageMode} />
        <Row k="Encryption available" v={diag.secureStorageAvailable ? 'yes' : 'no'} />
        <Row k="Venice key configured" v={diag.apiKeyConfigured ? 'yes' : 'no'} />
        <Row k="User data path" v={diag.userDataPath} mono />
        <Row k="Logs path" v={diag.logsPath} mono />
      </section>

      {safety && (
        <>
          <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
              <Meteocon name="umbrella" size={14} /> <Trans i18nKey={`${NS}.heading.safetyRuntime`} /></h3>
            <Row
              k={t(`${NS}.text.localContentSafeguards`)}
              v={`${safety.localSafeguards.enabled
                ? t(`${NS}.text.stateEnabled`)
                : t(`${NS}.text.stateDisabled`)} · ${t(`${NS}.text.source`)}: ${sourceLabel}`}
            />
            <Row
              k={t(`${NS}.text.providerSafety`)}
              v={safety.providerSafety.safeMode ? t(`${NS}.text.stateOn`) : t(`${NS}.text.stateOff`)}
            />
          </section>

          <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
              <Meteocon name="umbrella" size={14} /> <Trans i18nKey={`${NS}.heading.structuralValidation`} /></h3>
            <Row k="Status" v={t(`${NS}.text.validationActive`)} />
            <Row k={t(`${NS}.text.requestsValidated`)} v={String(safety.structuralValidation.requestsValidated)} />
            <Row k={t(`${NS}.text.rejectedRequests`)} v={String(safety.structuralValidation.rejectedRequests)} />
          </section>

          <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
              <Meteocon name="umbrella" size={14} /> <Trans i18nKey={`${NS}.heading.mediaClassifierBackend`} /></h3>
            <Row
              k={t(`${NS}.text.backendRegistered`)}
              v={safety.semanticClassifiers.backendRegistered ? t(`${NS}.text.yes`) : t(`${NS}.text.no`)}
            />
            {safety.semanticClassifiers.backendName && (
              <Row k={t(`${NS}.text.backendName`)} v={safety.semanticClassifiers.backendName} />
            )}
            <Row k={t(`${NS}.text.image`)} v={classifierStateLabel(safety.semanticClassifiers.image)} />
            <Row k={t(`${NS}.text.audio`)} v={classifierStateLabel(safety.semanticClassifiers.audio)} />
            <Row k={t(`${NS}.text.video`)} v={classifierStateLabel(safety.semanticClassifiers.video)} />
          </section>

          <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
              <Meteocon name="umbrella" size={14} /> <Trans i18nKey={`${NS}.heading.classifierCounters`} /></h3>
            <Row k={t(`${NS}.text.counterTextEvaluations`)} v={String(safety.counters.textEvaluations)} />
            <Row k={t(`${NS}.text.counterImageEvaluations`)} v={String(safety.counters.imageEvaluations)} />
            <Row k={t(`${NS}.text.counterAudioEvaluations`)} v={String(safety.counters.audioEvaluations)} />
            <Row k={t(`${NS}.text.counterVideoEvaluations`)} v={String(safety.counters.videoEvaluations)} />
            <Row k={t(`${NS}.text.counterBlocked`)} v={String(safety.counters.blocked)} />
            <Row k={t(`${NS}.text.counterAllowed`)} v={String(safety.counters.allowed)} />
            <Row k={t(`${NS}.text.counterSkippedDisabled`)} v={String(safety.counters.skippedDisabled)} />
            <Row k={t(`${NS}.text.counterErrors`)} v={String(safety.counters.errors)} />
          </section>
        </>
      )}

      <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
          <Meteocon name="umbrella" size={14} /> <Trans i18nKey={`${NS}.heading.safetyGuardAudit`} /></h3>
        <Row k="Allowed" v={String(audit.allowed)} />
        <Row k="Warned" v={String(audit.warned)} />
        <Row k="Blocked" v={String(audit.blocked)} />
        <Row k="Last reason" v={audit.lastReasonCode ?? 'none'} />
        <Row k="Last decision at" v={audit.lastDecisionAt ?? 'n/a'} mono />
        {Object.keys(audit.bySeverity).length > 0 && (
          <div className="text-[12px] text-text-muted pt-1">
            <Trans i18nKey={`${NS}.text.bySeverity`} /> {Object.entries(audit.bySeverity)
              .map(([k, v]) => `${k}=${v}`)
              .join(' · ')}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-inset p-3 space-y-1.5">
        <h3 className="flex items-center gap-1.5 text-[12px] uppercase tracking-wide text-text-muted font-semibold">
          <Meteocon name="time-morning" size={14} /> <Trans i18nKey={`${NS}.heading.lastRequest`} /></h3>
        {lastRequest ? (
          <>
            <Row k="Endpoint" v={lastRequest.endpoint} mono />
            <Row k="Status" v={String(lastRequest.status || 'Pending')} />
            <Row k="Method" v={lastRequest.method} />
            {lastRequest.error && (
              <div className="text-[12px] text-danger pt-1 break-words">
                <Trans i18nKey={`${NS}.text.lastError`} /> {lastRequest.error}
              </div>
            )}
          </>
        ) : (
          <>
            <Chip><Trans i18nKey={`${NS}.text.noRequestsYetLastErrorBelowIf`} /></Chip>
            {diag.lastApiError && (
              <div className="text-[12px] text-danger pt-1 break-words">
                <Trans i18nKey={`${NS}.text.lastError`} /> {diag.lastApiError}
              </div>
            )}
          </>
        )}
      </section>

      <p className="text-[12px] text-text-muted">
        <Trans i18nKey={`${NS}.description.statusProvidesTransportStorageAuditAndRequest`} /></p>
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
