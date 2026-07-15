import { useToastStore, type Toast, type ToastAction, type ToastVariant } from '../stores/toast-store'
import type { AppToast, ToastSeverity, AppToastAction } from '../types/notifications'
import { redactErrorMessage } from '../shared/redaction'

export interface NotifyOptions {
  message?: string;
  durationMs?: number | null;
  dismissible?: boolean;
  dedupeKey?: string;
  progress?: number;
  jobId?: string;
  requestId?: string;
  actions?: AppToastAction[];
}

const VARIANT_BY_SEVERITY: Record<ToastSeverity, ToastVariant> = {
  success: 'success',
  error: 'error',
  warning: 'warn',
  info: 'info',
  loading: 'progress',
}

function translateActions(actions?: AppToastAction[]): ToastAction[] | undefined {
  return actions?.map((action) => ({
    id: action.id,
    label: action.label,
    kind: action.dismissAfterAction ? 'dismiss' : 'open-task',
    onClick: action.action,
    dismissAfterAction: action.dismissAfterAction,
  }))
}

function pushNotification(severity: ToastSeverity, title: string, options?: NotifyOptions): string {
  const persistent = options?.durationMs === null || severity === 'loading'
  return useToastStore.getState().push({
    variant: VARIANT_BY_SEVERITY[severity],
    title,
    description: options?.message,
    persistent,
    duration: options?.durationMs ?? (persistent ? 0 : 4500),
    dismissible: options?.dismissible,
    dedupeKey: options?.dedupeKey,
    progressRatio: options?.progress === undefined ? undefined : options.progress / 100,
    jobId: options?.jobId,
    requestId: options?.requestId,
    actions: translateActions(options?.actions),
  })
}

export const notify = {
  success: (title: string, options?: NotifyOptions) => pushNotification('success', title, options),
  error: (title: string, options?: NotifyOptions) => pushNotification('error', title, { durationMs: 6500, ...options }),
  warning: (title: string, options?: NotifyOptions) => pushNotification('warning', title, { durationMs: 5500, ...options }),
  info: (title: string, options?: NotifyOptions) => pushNotification('info', title, options),
  loading: (title: string, options?: NotifyOptions) => pushNotification('loading', title, { durationMs: null, ...options }),

  update: (id: string, updates: Partial<Omit<AppToast, 'id' | 'createdAt'>>) => {
    const next: Partial<Toast> & { duration?: number } = {}
    if (updates.title !== undefined) next.title = updates.title
    if (updates.message !== undefined) next.description = updates.message
    if (updates.severity !== undefined) next.variant = VARIANT_BY_SEVERITY[updates.severity]
    if (updates.dismissible !== undefined) next.dismissible = updates.dismissible
    if (updates.dedupeKey !== undefined) next.dedupeKey = updates.dedupeKey
    if (updates.progress !== undefined) next.progressRatio = updates.progress / 100
    if (updates.jobId !== undefined) next.jobId = updates.jobId
    if (updates.requestId !== undefined) next.requestId = updates.requestId
    if (updates.actions !== undefined) next.actions = translateActions(updates.actions)
    if (updates.durationMs !== undefined) {
      next.persistent = updates.durationMs === null
      next.duration = updates.durationMs ?? 0
    } else if (updates.severity === 'loading') {
      next.persistent = true
      next.duration = 0
    }
    useToastStore.getState().updateToast(id, next)
  },

  dismiss: (id: string) => {
    useToastStore.getState().dismiss(id);
  },

  dismissByJobId: (jobId: string) => {
    useToastStore.getState().dismissByJobId(jobId);
  },

  fromError: (err: unknown, title = 'Something went wrong', options?: NotifyOptions) => {
    return notify.error(title, { message: redactErrorMessage(err), ...options });
  }
};
