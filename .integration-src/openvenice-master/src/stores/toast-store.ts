import { create } from 'zustand'

export type ToastVariant = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  variant: ToastVariant
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number
  dismiss: (id: number) => void
}

let counter = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ duration = 4500, ...t }) => {
    const id = ++counter
    set((s) => ({ toasts: [...s.toasts, { ...t, id, duration }] }))
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
      }, duration)
    }
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ variant: 'info', title, description }),
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ variant: 'success', title, description }),
  error: (title: string, description?: string, action?: Toast['action']) =>
    useToastStore.getState().push({ variant: 'error', title, description, action, duration: 6500 }),
  fromError: (err: unknown, title = 'Something went wrong') => {
    const description = err instanceof Error ? err.message : typeof err === 'string' ? err : undefined
    return useToastStore.getState().push({ variant: 'error', title, description, duration: 6500 })
  },
}
