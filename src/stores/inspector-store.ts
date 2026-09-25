import { create } from 'zustand'
import type { SafetyGuardDecision } from '../shared/safety'
import type { InspectorSafetyDecision } from '../services/inspectorTelemetry'
import type {
  InspectorCallOutcome,
  InspectorErrorClass,
  InspectorGuardOutcome,
  InspectorTransport,
} from '../services/inspectorTelemetry'
import type { InspectorTelemetryEvent } from '../shared/inspectorTelemetryContracts'

export interface InspectorRequestLog {
  id: string
  timestamp: number
  endpoint: string
  method: string
  transport: InspectorTransport
  requestHeaders: Record<string, string>
  requestBody: unknown
  status?: number
  responseHeaders?: Record<string, string>
  responseBody?: unknown
  durationMs?: number
  previewDurationMs?: number
  guardOutcome?: InspectorGuardOutcome
  callOutcome?: InspectorCallOutcome
  errorClass?: InspectorErrorClass
  selectedPrimaryRoute?: "venice" | "fraterna"
  effectiveUpstream?: "venice" | "fraterna" | string
  routingReason?:
    | "selected-venice"
    | "fraterna-supported-endpoint"
    | "fraterna-unsupported-endpoint"
    | "explicit-provider"
    | "automatic-fallback-provider"
  // Local Family Safe Mode decision metadata. Either the renderer-side
  // explicit 3-state preview (`InspectorSafetyDecision`) or, for backward
  // compatibility with code paths that still record a `SafetyGuardDecision`
  // (e.g. legacy direct usage), the raw decision object. The inspector UI
  // must treat the explicit 3-state preview as canonical.
  safetyDecision?: InspectorSafetyDecision | SafetyGuardDecision | null
  error?: string
}

interface InspectorState {
  logs: InspectorRequestLog[]
  addLog: (log: Omit<InspectorRequestLog, 'id' | 'timestamp'>) => string
  updateLog: (id: string, updates: Partial<Omit<InspectorRequestLog, 'id' | 'timestamp'>>) => void
  clearLogs: () => void
  /**
   * Merge a main-process telemetry event into the inspector list. Looks up
   * an existing row by `event.eventId` (stored under `externalId`) and updates
   * it; otherwise inserts a new redacted row. Idempotent under repeated
   * `phase: "updated"` emissions.
   */
  upsertByEventId: (event: InspectorTelemetryEvent) => void
  /** Remove all rows originating from cross-process buses. */
  clearExternalLogs: () => void
}

export const useInspectorStore = create<InspectorState>((set) => ({
  logs: [],
  addLog: (log) => {
    const id = Math.random().toString(36).substring(2, 9)
    const timestamp = Date.now()
    const newLog = { ...log, id, timestamp }
    set((state) => ({ logs: [newLog, ...state.logs].slice(0, 100) })) // Keep last 100 logs
    return id
  },
  updateLog: (id, updates) => {
    set((state) => ({
      logs: state.logs.map((log) => (log.id === id ? { ...log, ...updates } : log)),
    }))
  },
  clearLogs: () => set({ logs: [] }),
  upsertByEventId: (event) => {
    set((state) => {
      // Cross-process events get bucketed into the existing `transport`
      // enum. The shared contract's `transport` field is authoritative —
      // derived from the calling subsystem (Venice client, Jina research
      // bridge, local Family Safe guard, background music/video tasks).
      // Renderer-originated events that arrive via the bus are forwarded
      // as `local` so they co-exist with the canonical `veniceFetch`
      // telemetry stream.
      const transport: InspectorRequestLog['transport'] =
        event.transport === 'jina'
          ? 'jina'
          : event.transport === 'local'
            ? 'local'
            : 'venice'
      const guardOutcome: InspectorGuardOutcome | undefined =
        event.guardOutcome === 'allow' || event.guardOutcome === 'block'
          ? event.guardOutcome
          : undefined
      const callOutcome: InspectorCallOutcome =
        event.phase === 'completed'
          ? 'success'
          : event.phase === 'failed'
            ? 'error'
            : event.phase === 'aborted'
              ? 'aborted'
              : event.phase === 'timeout'
                ? 'timeout'
                : 'pending'
      const merged: Partial<InspectorRequestLog> = {
        transport,
        endpoint: event.endpoint,
        method: event.method,
        timestamp: event.timestamp,
        guardOutcome,
        callOutcome,
        status: event.status,
        durationMs: event.summaries?.durationMs,
        error: event.error,
        selectedPrimaryRoute: event.selectedPrimaryRoute,
        effectiveUpstream: event.effectiveUpstream,
        routingReason: event.routingReason,
      }
      const existingIndex = state.logs.findIndex((log) => (log as InspectorRequestLog & { externalId?: string }).externalId === event.eventId)
      if (existingIndex >= 0) {
        const existing = state.logs[existingIndex]
        const updated: InspectorRequestLog = { ...existing, ...merged }
        const next = state.logs.slice()
        next[existingIndex] = updated
        return { logs: next }
      }
      const newLog: InspectorRequestLog & { externalId: string } = {
        id: event.eventId,
        timestamp: event.timestamp,
        endpoint: event.endpoint,
        method: event.method,
        transport,
        requestHeaders: {},
        requestBody: event.summaries ? { summaries: event.summaries } : {},
        callOutcome,
        guardOutcome,
        status: event.status,
        durationMs: event.summaries?.durationMs,
        error: event.error,
        externalId: event.eventId,
        selectedPrimaryRoute: event.selectedPrimaryRoute,
        effectiveUpstream: event.effectiveUpstream,
        routingReason: event.routingReason,
      }
      return { logs: [newLog, ...state.logs].slice(0, 100) }
    })
  },
  clearExternalLogs: () => set((state) => ({ logs: state.logs.filter((log) => !(log as InspectorRequestLog & { externalId?: string }).externalId) })),
}))