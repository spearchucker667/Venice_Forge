import { create } from 'zustand'
import { redactErrorMessage } from '../shared/redaction'

export type ToastVariant = 'info' | 'success' | 'error' | 'warn' | 'progress'

export type ToastActionKind =
  | 'open-task'
  | 'cancel-task'
  | 'retry-task'
  | 'dismiss'

export interface ToastAction {
  id: string
  label: string
  kind: ToastActionKind
  taskId?: string
  targetTab?: string
  onClick?: () => void | Promise<void>
  dismissAfterAction?: boolean
}

export interface Toast {
  id: string
  dedupeKey?: string
  variant: ToastVariant
  title: string
  description?: string
  progressRatio?: number
  persistent: boolean
  durationMs?: number | null
  dismissible?: boolean
  jobId?: string
  requestId?: string
  actions?: ToastAction[]
  createdAt: number
  updatedAt: number
  announceVersion?: number
  action?: { label: string; onClick: () => void | Promise<void> }
}

type PushToast = Omit<Toast, 'id' | 'createdAt' | 'updatedAt' | 'persistent' | 'durationMs'> & {
  persistent?: boolean
  duration?: number
}

type UpsertToast = Partial<Omit<Toast, 'id' | 'createdAt' | 'updatedAt' | 'dedupeKey' | 'durationMs'>> & {
  title: string
  variant: ToastVariant
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  push: (toast: PushToast) => string
  upsertToast: (dedupeKey: string, toast: UpsertToast) => string
  updateToast: (id: string, updates: Partial<Toast> & { duration?: number }) => void
  dismiss: (id: string) => void
  dismissByKey: (dedupeKey: string) => void
  dismissByJobId: (jobId: string) => void
  pauseToast: (id: string) => void
  resumeToast: (id: string) => void
  clearTerminalToasts: () => void
}

interface ToastTimer {
  timeout: ReturnType<typeof setTimeout> | null
  remainingMs: number
  startedAt: number
}

export const MAX_TRANSIENT_TOASTS = 5

const toastTimers = new Map<string, ToastTimer>()

function clearToastTimer(id: string): void {
  const timer = toastTimers.get(id)
  if (timer?.timeout) clearTimeout(timer.timeout)
  toastTimers.delete(id)
}

function scheduleToastDismiss(id: string, durationMs: number): void {
  clearToastTimer(id)
  if (durationMs <= 0) return
  const startedAt = Date.now()
  const timeout = setTimeout(() => {
    toastTimers.delete(id)
    useToastStore.getState().dismiss(id)
  }, durationMs)
  toastTimers.set(id, { timeout, remainingMs: durationMs, startedAt })
}

function appendWithinTransientLimit(toasts: Toast[], next: Toast): Toast[] {
  if (next.persistent) return [...toasts, next]
  const transient = toasts.filter((toast) => !toast.persistent)
  const removeCount = Math.max(0, transient.length - MAX_TRANSIENT_TOASTS + 1)
  if (removeCount === 0) return [...toasts, next]
  const removedIds = new Set(transient.slice(0, removeCount).map((toast) => toast.id))
  removedIds.forEach(clearToastTimer)
  return [...toasts.filter((toast) => !removedIds.has(toast.id)), next]
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ persistent = false, duration, ...toast }) => {
    if (toast.dedupeKey) {
      const { dedupeKey, ...dedupedToast } = toast
      return get().upsertToast(dedupeKey, { ...dedupedToast, persistent, duration })
    }
    const id: string = crypto.randomUUID()
    const now = Date.now()
    const durationMs = duration ?? (persistent ? 0 : 4500)
    const next: Toast = {
      ...toast,
      id,
      persistent,
      durationMs: durationMs > 0 ? durationMs : null,
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({ toasts: appendWithinTransientLimit(state.toasts, next) }))
    if (!persistent && durationMs > 0) scheduleToastDismiss(id, durationMs)
    return id
  },
  upsertToast: (dedupeKey, toast) => {
    const existing = get().toasts.find((candidate) => candidate.dedupeKey === dedupeKey)
    const id: string = existing?.id ?? crypto.randomUUID()
    const persistent = toast.persistent ?? existing?.persistent ?? true
    const durationMs = toast.duration ?? (persistent ? 0 : 4500)
    const now = Date.now()
    const { duration: _duration, ...toastFields } = toast

    if (existing) {
      set((state) => ({
        toasts: state.toasts.map((candidate) => candidate.id === id
          ? {
              ...candidate,
              ...toastFields,
              dedupeKey,
              persistent,
              durationMs: durationMs > 0 ? durationMs : null,
              updatedAt: now,
            }
          : candidate),
      }))
    } else {
      const next: Toast = {
        ...toastFields,
        id,
        dedupeKey,
        persistent,
        durationMs: durationMs > 0 ? durationMs : null,
        createdAt: now,
        updatedAt: now,
      }
      set((state) => ({ toasts: appendWithinTransientLimit(state.toasts, next) }))
    }

    if (!persistent && durationMs > 0) scheduleToastDismiss(id, durationMs)
    else clearToastTimer(id)
    return id
  },
  updateToast: (id, updates) => {
    const existing = get().toasts.find((toast) => toast.id === id)
    if (!existing) return
    const { duration, ...toastUpdates } = updates
    const persistent = toastUpdates.persistent ?? existing.persistent
    const durationMs = duration ?? toastUpdates.durationMs ?? existing.durationMs ?? (persistent ? 0 : 4500)
    set((state) => ({
      toasts: state.toasts.map((toast) => toast.id === id
        ? {
            ...toast,
            ...toastUpdates,
            persistent,
            durationMs: durationMs > 0 ? durationMs : null,
            updatedAt: Date.now(),
          }
        : toast),
    }))
    if (!persistent && durationMs > 0) scheduleToastDismiss(id, durationMs)
    else clearToastTimer(id)
  },
  dismiss: (id) => {
    clearToastTimer(id)
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },
  dismissByKey: (dedupeKey) => {
    const matchingIds = get().toasts
      .filter((toast) => toast.dedupeKey === dedupeKey)
      .map((toast) => toast.id)
    matchingIds.forEach(clearToastTimer)
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.dedupeKey !== dedupeKey) }))
  },
  dismissByJobId: (jobId) => {
    const matchingIds = get().toasts
      .filter((toast) => toast.jobId === jobId)
      .map((toast) => toast.id)
    matchingIds.forEach(clearToastTimer)
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.jobId !== jobId) }))
  },
  pauseToast: (id) => {
    const timer = toastTimers.get(id)
    if (!timer?.timeout) return
    clearTimeout(timer.timeout)
    timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt))
    timer.timeout = null
  },
  resumeToast: (id) => {
    const timer = toastTimers.get(id)
    if (!timer || timer.timeout || timer.remainingMs <= 0) return
    scheduleToastDismiss(id, timer.remainingMs)
  },
  clearTerminalToasts: () => {
    const removable = get().toasts
      .filter((toast) => !toast.persistent && (toast.variant === 'error' || toast.variant === 'success'))
      .map((toast) => toast.id)
    removable.forEach(clearToastTimer)
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.persistent || (toast.variant !== 'error' && toast.variant !== 'success')),
    }))
  },
}))

export const toast = {
  info: (title: string, description?: string): string =>
    useToastStore.getState().push({ variant: 'info', title, description }),
  success: (title: string, description?: string): string =>
    useToastStore.getState().push({ variant: 'success', title, description }),
  warn: (title: string, description?: string): string =>
    useToastStore.getState().push({ variant: 'warn', title, description, duration: 5500 }),
  error: (title: string, description?: string, action?: Toast['action']): string =>
    useToastStore.getState().push({ variant: 'error', title, description, action, duration: 6500 }),
  fromError: (error: unknown, title = 'Something went wrong'): string =>
    toast.error(title, redactErrorMessage(error)),
  upsertToast: (dedupeKey: string, next: UpsertToast): string =>
    useToastStore.getState().upsertToast(dedupeKey, next),
  dismiss: (id: string): void => useToastStore.getState().dismiss(id),
  dismissByKey: (dedupeKey: string): void => useToastStore.getState().dismissByKey(dedupeKey),
  getToasts: (): Toast[] => useToastStore.getState().toasts,
}
