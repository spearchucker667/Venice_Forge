import { create } from 'zustand'
import type { SafetyGuardDecision } from '../shared/safety'
import type { InspectorSafetyDecision } from '../services/veniceClient'

export interface InspectorRequestLog {
  id: string
  timestamp: number
  endpoint: string
  method: string
  requestHeaders: Record<string, string>
  requestBody: unknown
  status?: number
  responseHeaders?: Record<string, string>
  responseBody?: unknown
  durationMs?: number
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
}))
