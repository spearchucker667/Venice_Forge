import { useMemo, useState, useRef, useEffect } from 'react'
import { useInspectorStore } from '../../stores/inspector-store'
import { useSettingsStore } from '../../stores/settings-store'
import { cn } from '../../lib/utils'
import {
  exportRedactedInspectorLogs,
  matchesInspectorFilter,
  type InspectorLogFilter,
} from '../../services/inspectorTelemetry'

const FILTER_CHIPS: Array<{ id: InspectorLogFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'error', label: 'Errored' },
  { id: 'aborted', label: 'Aborted' },
  { id: 'venice', label: 'Venice' },
  { id: 'jina', label: 'Jina' },
  { id: 'local', label: 'Local-only' },
]

export function InspectorPane() {
  const showInspector = useSettingsStore((s) => s.showInspector)
  const setShowInspector = useSettingsStore((s) => s.setShowInspector)
  const inspectorWidth = useSettingsStore((s) => s.inspectorWidth)
  const setInspectorWidth = useSettingsStore((s) => s.setInspectorWidth)
  const logs = useInspectorStore((s) => s.logs)
  const clearLogs = useInspectorStore((s) => s.clearLogs)
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<InspectorLogFilter>('all')

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [dragWidth, setDragWidth] = useState<number | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startWidth: inspectorWidth }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const delta = dragRef.current.startX - e.clientX
    const newWidth = Math.max(300, Math.min(800, dragRef.current.startWidth + delta))
    setDragWidth(newWidth)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (dragWidth !== null) setInspectorWidth(dragWidth)
    dragRef.current = null
    setDragWidth(null)
  }

  const filteredLogs = useMemo(
    () => logs.filter((log) => matchesInspectorFilter(log, activeFilter)),
    [logs, activeFilter],
  )

  if (!showInspector) return null

  const selectedLog =
    filteredLogs.find((l) => l.id === selectedLogId) || filteredLogs[0]

  const handleExport = () => {
    const exportPayload = exportRedactedInspectorLogs(logs)
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(exportPayload, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute('href', dataStr)
    downloadAnchor.setAttribute(
      'download',
      `venice_forge_traffic_logs_${Date.now()}.json`,
    )
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  return (
    <aside
      className="relative soft-separator-x mesh-surface flex flex-col h-full shrink-0 min-w-0 shell-region"
      aria-label="Developer traffic inspector"
      style={{ width: dragWidth ?? inspectorWidth }}
    >
      <div 
        className="absolute left-0 top-0 bottom-0 w-1.5 -ml-[0.75px] cursor-col-resize hover:bg-accent/50 z-50 transition-colors"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="flex items-center justify-between px-3 h-14 soft-separator-y">
        <div className="flex items-center gap-2">
          <svg
            className="text-accent"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span className="text-[14px] font-semibold text-text-primary">
            Traffic Inspector
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearLogs}
            title="Clear all logs"
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-elevated rounded transition-colors cursor-pointer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
          <button
            onClick={handleExport}
            title="Export redacted logs as JSON"
            className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-elevated rounded transition-colors cursor-pointer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </button>
          <button
            onClick={() => setShowInspector(false)}
            title="Close Inspector"
            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated rounded transition-colors cursor-pointer"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-2 py-2 soft-separator-y flex flex-wrap gap-1">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setActiveFilter(chip.id)}
            className={cn(
              'px-2 py-0.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer',
              activeFilter === chip.id
                ? 'bg-accent/20 text-accent'
                : 'bg-surface-elevated/50 text-text-muted hover:text-text-primary',
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-[180px] soft-separator-x overflow-y-auto flex flex-col shrink-0">
          {filteredLogs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 text-[12px] text-text-muted text-center">
              <span>No requests captured yet</span>
              <span className="text-[12px] mt-1 opacity-60">
                Send chat or generate images to inspect traffic.
              </span>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isSelected = selectedLog?.id === log.id
              const isBlocked = log.status === 451 || log.callOutcome === 'blocked'
              const isError =
                log.callOutcome === 'error' ||
                (log.status && (log.status < 200 || log.status >= 300) && log.status !== 451)
              return (
                <button
                  key={log.id}
                  onClick={() => setSelectedLogId(log.id)}
                  className={cn(
                    'text-left p-2.5 border-b border-border/40 transition-colors w-full cursor-pointer flex flex-col gap-0.5',
                    isSelected
                      ? 'bg-accent/10 text-accent font-medium'
                      : 'hover:bg-surface-elevated/40 text-text-secondary',
                  )}
                >
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-mono truncate uppercase select-none">
                      {log.method}
                    </span>
                    <span
                      className={cn(
                        'font-mono px-1 rounded-[3px] text-[12px] select-none font-bold',
                        isBlocked
                          ? 'bg-warning/20 text-warning'
                          : isError
                            ? 'bg-danger/20 text-danger'
                            : 'bg-accent/20 text-accent',
                      )}
                    >
                      {log.status || '...'}
                    </span>
                  </div>
                  <span
                    className="text-[12px] font-mono truncate font-semibold select-all"
                    title={log.endpoint}
                  >
                    {log.endpoint}
                  </span>
                  <div className="flex items-center justify-between text-[12px] text-text-muted font-mono select-none">
                    <span className="uppercase">{log.transport}</span>
                    {log.durationMs !== undefined ? <span>{log.durationMs}ms</span> : null}
                  </div>
                  {log.guardOutcome ? (
                    <span className="text-[12px] text-text-muted font-mono select-none">
                      guard: {log.guardOutcome}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-w-0">
          {selectedLog ? (
            <div className="space-y-4 text-[12px] min-w-0">
              <div className="p-2 bg-surface-elevated/40 border border-border rounded-md font-mono select-all text-[12px] space-y-0.5">
                <div>
                  <span className="text-text-muted font-bold">Time:</span>{' '}
                  {new Date(selectedLog.timestamp).toLocaleTimeString()}
                </div>
                <div>
                  <span className="text-text-muted font-bold">URL:</span>{' '}
                  {selectedLog.endpoint}
                </div>
                <div>
                  <span className="text-text-muted font-bold">Method:</span>{' '}
                  {selectedLog.method}
                </div>
                <div>
                  <span className="text-text-muted font-bold">Transport:</span>{' '}
                  {selectedLog.transport}
                </div>
                <div>
                  <span className="text-text-muted font-bold">Status:</span>{' '}
                  {selectedLog.status || 'Pending...'}
                </div>
                {selectedLog.callOutcome ? (
                  <div>
                    <span className="text-text-muted font-bold">Outcome:</span>{' '}
                    {selectedLog.callOutcome}
                  </div>
                ) : null}
                {selectedLog.guardOutcome ? (
                  <div>
                    <span className="text-text-muted font-bold">Guard:</span>{' '}
                    {selectedLog.guardOutcome}
                  </div>
                ) : null}
                {selectedLog.previewDurationMs !== undefined ? (
                  <div>
                    <span className="text-text-muted font-bold">Preview:</span>{' '}
                    {selectedLog.previewDurationMs}ms
                  </div>
                ) : null}
                {selectedLog.durationMs !== undefined ? (
                  <div>
                    <span className="text-text-muted font-bold">Latency:</span>{' '}
                    {selectedLog.durationMs}ms
                  </div>
                ) : null}
                {selectedLog.errorClass && selectedLog.errorClass !== 'none' ? (
                  <div>
                    <span className="text-text-muted font-bold">Error class:</span>{' '}
                    {selectedLog.errorClass}
                  </div>
                ) : null}
              </div>

              {selectedLog.safetyDecision && (
                <div className="border border-warning/40 bg-warning/5 rounded-md p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-warning font-semibold select-none">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                    </svg>
                    <span>Local Safety Evaluation</span>
                  </div>
                  <div className="font-mono text-[12px] space-y-0.5 select-text">
                    {(() => {
                      const d = selectedLog.safetyDecision as Record<string, unknown> | null
                      if (!d) return null
                      if (d.mode === 'family') {
                        const allowed = d.action === 'allow'
                        return (
                          <>
                            <div>
                              <span className="text-text-muted">Mode:</span>{' '}
                              <span className="text-accent font-bold">
                                Family Safe Mode (renderer-evaluated)
                              </span>
                            </div>
                            <div>
                              <span className="text-text-muted">Result:</span>{' '}
                              <span
                                className={
                                  allowed ? 'text-accent font-bold' : 'text-danger font-bold'
                                }
                              >
                                {allowed ? 'ALLOW' : 'BLOCKED'}
                              </span>
                            </div>
                            {d.reasonCode ? (
                              <div>
                                <span className="text-text-muted">Reason Code:</span>{' '}
                                {String(d.reasonCode)}
                              </div>
                            ) : null}
                          </>
                        )
                      }
                      if (d.mode === 'adult') {
                        return (
                          <>
                            <div>
                              <span className="text-text-muted">Mode:</span>{' '}
                              <span className="text-warning font-bold">
                                Adult Mode (local filter skipped)
                              </span>
                            </div>
                            <div>
                              <span className="text-text-muted">Reason Code:</span>{' '}
                              {String(d.reasonCode ?? 'LOCAL_FAMILY_SAFE_MODE_DISABLED')}
                            </div>
                          </>
                        )
                      }
                      if (d.mode === 'electron-main-authoritative') {
                        return (
                          <>
                            <div>
                              <span className="text-text-muted">Mode:</span>{' '}
                              <span className="text-text-secondary font-bold">
                                Electron main-process authoritative
                              </span>
                            </div>
                            <div className="text-text-muted">
                              The local family-safe guard is enforced by the main process.
                              Open the audit log to inspect the canonical decision.
                            </div>
                          </>
                        )
                      }
                      const legacy = selectedLog.safetyDecision as unknown as {
                        allow?: boolean
                        action?: string
                        reasonCode?: string
                        signals?: Array<{
                          category: string
                          source: string
                          severity: string
                          confidence: number
                        }>
                      }
                      const allow = legacy.allow !== false
                      return (
                        <>
                          <div>
                            <span className="text-text-muted">Result:</span>{' '}
                            <span
                              className={
                                allow ? 'text-accent font-bold' : 'text-danger font-bold'
                              }
                            >
                              {allow ? 'ALLOW' : 'BLOCKED'}
                            </span>
                          </div>
                          {legacy.action ? (
                            <div>
                              <span className="text-text-muted">Action:</span> {legacy.action}
                            </div>
                          ) : null}
                          {legacy.reasonCode ? (
                            <div>
                              <span className="text-text-muted">Reason Code:</span>{' '}
                              {legacy.reasonCode}
                            </div>
                          ) : null}
                          {legacy.signals && legacy.signals.length > 0 ? (
                            <div>
                              <span className="text-text-muted">Signals:</span>
                              <div className="pl-2 flex flex-col gap-0.5 mt-0.5 text-text-secondary">
                                {legacy.signals.map((s, idx) => (
                                  <div key={idx}>
                                    • [{s.category}] source: &quot;{s.source}&quot; (severity:{' '}
                                    {s.severity}, confidence: {s.confidence})
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <span className="font-semibold text-text-secondary select-none">
                  Request Headers
                </span>
                <pre className="p-2 bg-surface-elevated/40 border border-border rounded-md font-mono text-[12px] overflow-x-auto select-all max-h-36">
                  {JSON.stringify(selectedLog.requestHeaders, null, 2)}
                </pre>
              </div>

              <div className="space-y-1">
                <span className="font-semibold text-text-secondary select-none">
                  Request Body
                </span>
                <pre className="p-2 bg-surface-elevated/40 border border-border rounded-md font-mono text-[12px] overflow-x-auto select-all max-h-48">
                  {selectedLog.requestBody
                    ? JSON.stringify(selectedLog.requestBody, null, 2)
                    : '[Empty]'}
                </pre>
              </div>

              {selectedLog.error ? (
                <div className="space-y-1">
                  <span className="font-semibold text-danger select-none">Error</span>
                  <pre className="p-2 bg-danger/5 border border-danger/20 rounded-md font-mono text-[12px] overflow-x-auto text-danger select-all max-h-48 whitespace-pre-wrap">
                    {selectedLog.error}
                  </pre>
                </div>
              ) : (
                <div className="space-y-1">
                  <span className="font-semibold text-text-secondary select-none">
                    Response Body
                  </span>
                  <pre className="p-2 bg-surface-elevated/40 border border-border rounded-md font-mono text-[12px] overflow-x-auto select-all max-h-60">
                    {selectedLog.responseBody
                      ? JSON.stringify(selectedLog.responseBody, null, 2)
                      : '[Pending or Empty]'}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted select-none">
              Select a request to view details
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}