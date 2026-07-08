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
        <h2 className="text-[15px] font-semibold text-text-primary">Status</h2>
        <p className="text-[12.5px] text-text-muted leading-relaxed">
          Aggregated runtime info for the current build. Open{' '}
          <a className="underline" href="#" onClick={(e) => {
            e.preventDefault();
            void desktopApp.openLogsFolder();
          }}>
            logs folder
          </a>{' '}
          to inspect detailed console output.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-surface-muted p-3 space-y-1.5">
        <h3 className="text-[12px] uppercase tracking-wide text-text-muted">Runtime</h3>
        <Row k="App version" v={diag.appVersion} />
        <Row k="Transport" v={diag.transport} />
        <Row k="Mode" v={diag.isDesktop ? 'Electron desktop' : 'Web (browser)'} />
        {diag.electronVersion && <Row k="Electron" v={diag.electronVersion} />}
        {diag.chromeVersion && <Row k="Chromium" v={diag.chromeVersion} />}
        <Row k="Node" v={diag.nodeVersion || 'n/a'} />
      </section>

      <section className="rounded-lg border border-border bg-surface-muted p-3 space-y-1.5">
        <h3 className="text-[12px] uppercase tracking-wide text-text-muted">Storage</h3>
        <Row k="Secure store" v={diag.storageMode} />
        <Row k="Encryption available" v={diag.secureStorageAvailable ? 'yes' : 'no'} />
        <Row k="Venice key configured" v={diag.apiKeyConfigured ? 'yes' : 'no'} />
        <Row k="User data path" v={diag.userDataPath} mono />
        <Row k="Logs path" v={diag.logsPath} mono />
      </section>

      <section className="rounded-lg border border-border bg-surface-muted p-3 space-y-1.5">
        <h3 className="text-[12px] uppercase tracking-wide text-text-muted">Safety guard audit</h3>
        <Row k="Allowed" v={String(audit.allowed)} />
        <Row k="Warned" v={String(audit.warned)} />
        <Row k="Blocked" v={String(audit.blocked)} />
        <Row k="Last reason" v={audit.lastReasonCode ?? 'none'} />
        <Row k="Last decision at" v={audit.lastDecisionAt ?? 'n/a'} mono />
        {Object.keys(audit.bySeverity).length > 0 && (
          <div className="text-[11.5px] text-text-muted pt-1">
            By severity: {Object.entries(audit.bySeverity)
              .map(([k, v]) => `${k}=${v}`)
              .join(' · ')}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface-muted p-3 space-y-1.5">
        <h3 className="text-[12px] uppercase tracking-wide text-text-muted">Last request</h3>
        {lastRequest ? (
          <>
            <Row k="Endpoint" v={lastRequest.endpoint} mono />
            <Row k="Status" v={String(lastRequest.status || 'Pending')} />
            <Row k="Method" v={lastRequest.method} />
            {lastRequest.error && (
              <div className="text-[11.5px] text-danger pt-1 break-words">
                Last error: {lastRequest.error}
              </div>
            )}
          </>
        ) : (
          <>
            <Chip>no requests yet (last error below if any)</Chip>
            {diag.lastApiError && (
              <div className="text-[11.5px] text-danger pt-1 break-words">
                Last error: {diag.lastApiError}
              </div>
            )}
          </>
        )}
      </section>

      <p className="text-[11px] text-text-muted">
        Status provides transport, storage, audit, and request diagnostics. Use the dedicated Library, Research, Settings, and workflow tabs for feature-specific controls.
      </p>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 text-[12.5px]">
      <span className="text-text-muted min-w-[160px] shrink-0">{k}</span>
      <span className={mono ? 'font-mono text-[11.5px] text-text-secondary break-all' : 'text-text-secondary'}>
        {v}
      </span>
    </div>
  );
}
