import { create } from 'zustand'
import { redactErrorMessage } from '../shared/redaction'

export type ToastVariant = 'info' | 'success' | 'error' | 'warn' | 'progress'

export type ToastActionKind =
  | "open-task"
  | "cancel-task"
  | "retry-task"
  | "dismiss";

export interface ToastAction {
  id: string;
  label: string;
  kind: ToastActionKind;
  taskId?: string;
  targetTab?: string;
  onClick?: () => void; // Keeping legacy onClick for now
}

export interface Toast {
  id: string
  dedupeKey?: string
  variant: ToastVariant
  title: string
  description?: string
  progressRatio?: number
  persistent: boolean
  actions?: ToastAction[]
  createdAt: number
  updatedAt: number
  announceVersion?: number
  action?: { label: string; onClick: () => void } // Legacy single action
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'createdAt' | 'updatedAt' | 'persistent'> & { persistent?: boolean, duration?: number }) => string
  upsertToast: (dedupeKey: string, t: Partial<Omit<Toast, 'id' | 'createdAt' | 'updatedAt'>> & { title: string, variant: ToastVariant, duration?: number }) => string
  updateToast: (id: string, updates: Partial<Toast>) => void
  dismiss: (id: string) => void
  dismissByKey: (dedupeKey: string) => void
  clearTerminalToasts: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ persistent = false, duration, ...t }) => {
    const id = crypto.randomUUID()
    const now = Date.now()
    set((s) => ({
      toasts: [...s.toasts, { ...t, id, persistent, createdAt: now, updatedAt: now }]
    }))
    
    const d = duration ?? (persistent ? 0 : 4500)
    if (d > 0 && !persistent) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
      }, d)
    }
    return id
  },
  upsertToast: (dedupeKey, t) => {
    let returnId = ''
    set((s) => {
      const now = Date.now()
      const existing = s.toasts.find(x => x.dedupeKey === dedupeKey)
      const { duration, ...toastProps } = t
      if (existing) {
        returnId = existing.id
        return {
          toasts: s.toasts.map(x => x.dedupeKey === dedupeKey ? { ...x, ...toastProps, dedupeKey, updatedAt: now } : x)
        }
      } else {
        const id = crypto.randomUUID()
        returnId = id
        return {
          toasts: [...s.toasts, { ...toastProps, dedupeKey, id, persistent: t.persistent ?? true, createdAt: now, updatedAt: now }]
        }
      }
    })
    
    const d = t.duration ?? (t.persistent ? 0 : 4500)
    if (d > 0 && !t.persistent) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== returnId) }))
      }, d)
    }
    
    return returnId
  },
  updateToast: (id, updates) => {
    set((s) => ({
      toasts: s.toasts.map(t => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t)
    }))
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  dismissByKey: (dedupeKey) => set((s) => ({ toasts: s.toasts.filter((t) => t.dedupeKey !== dedupeKey) })),
  clearTerminalToasts: () => set((s) => ({
    toasts: s.toasts.filter(t => t.persistent || (t.variant !== 'error' && t.variant !== 'success'))
  }))
}))

export const toast = {
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ variant: 'info', title, description }),
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ variant: 'success', title, description }),
  warn: (title: string, description?: string) =>
    useToastStore.getState().push({ variant: 'warn', title, description, duration: 5500 }),
  error: (title: string, description?: string, action?: Toast['action']) =>
    useToastStore.getState().push({ variant: 'error', title, description, action, duration: 6500 }),
  fromError: (err: unknown, title = 'Something went wrong') => {
    return toast.error(title, redactErrorMessage(err))
  },
  upsertToast: (dedupeKey: string, t: Parameters<ToastState['upsertToast']>[1]) => useToastStore.getState().upsertToast(dedupeKey, t),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  getToasts: () => useToastStore.getState().toasts,
}
