import { useToastStore, type Toast } from '../../stores/toast-store'
import { cn } from '../../lib/utils'
import { GenerationLoadingIndicator } from '../generation/GenerationLoadingIndicator'

const VARIANT_STYLES: Record<Toast['variant'], string> = {
  info: 'border-border bg-surface-elevated',
  success: 'border-green-500/30 bg-green-500/[0.06]',
  warn: 'border-amber-500/30 bg-amber-500/[0.06]',
  error: 'border-red-500/30 bg-red-500/[0.06]',
  progress: 'border-accent/30 bg-accent/[0.06]',
}

const VARIANT_TITLE: Record<Toast['variant'], string> = {
  info: 'text-text-primary',
  success: 'text-green-200/85',
  warn: 'text-amber-200/85',
  error: 'text-red-200/85',
  progress: 'text-accent',
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.variant === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto rounded-lg border px-3.5 py-2.5 shadow-xl shadow-overlay backdrop-blur-md animate-scale-in',
            VARIANT_STYLES[t.variant],
          )}
        >
          <div className="flex items-start gap-3">
            {t.variant === 'progress' && (
              <GenerationLoadingIndicator size="sm" state="processing" />
            )}
            <div className="flex-1 min-w-0">
              <div className={cn('text-[13.5px] font-medium', VARIANT_TITLE[t.variant])}>{t.title}</div>
              {t.description && (
                <div className="text-[12.5px] text-text-secondary mt-0.5 leading-relaxed break-words">{t.description}</div>
              )}
              {t.progressRatio !== undefined && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border">
                  <div 
                    className="h-full bg-accent transition-all duration-300 ease-out" 
                    style={{ width: `${Math.max(0, Math.min(100, t.progressRatio * 100))}%` }}
                  />
                </div>
              )}
              {(t.actions && t.actions.length > 0) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.actions.map(action => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => {
                        if (action.onClick) action.onClick();
                        if (action.kind === 'dismiss') dismiss(t.id);
                      }}
                      className="rounded bg-surface-base px-2 py-1 text-xs font-medium text-text-primary hover:bg-surface-elevated hover:text-text-primary transition-colors border border-border"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
              {t.action && !t.actions && (
                <button
                  type="button"
                  onClick={() => { t.action?.onClick(); dismiss(t.id) }}
                  className="mt-1.5 text-[12.5px] font-medium text-text-secondary hover:text-text-primary underline underline-offset-2"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="text-text-muted hover:text-text-secondary transition-colors p-0.5 -m-0.5 shrink-0 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-text-muted/30"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
