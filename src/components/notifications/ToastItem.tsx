import { cn } from '../../lib/utils';
import { useToastStore, type Toast } from '../../stores/toast-store';
import { uiSoundController } from '../../services/uiSoundController';

const SEVERITY_STYLES: Record<string, string> = {
  info: 'bg-mesh-surface',
  success: 'bg-mesh-surface border-success/30',
  warn: 'bg-mesh-surface border-warning/30',
  error: 'bg-mesh-surface border-error/30',
};

const SEVERITY_TITLE: Record<string, string> = {
  info: 'text-text-primary',
  success: 'text-success',
  warn: 'text-warning',
  error: 'text-error',
};

export function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((state) => state.dismiss)
  const pauseToast = useToastStore((state) => state.pauseToast)
  const resumeToast = useToastStore((state) => state.resumeToast)

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => pauseToast(toast.id)}
      onMouseLeave={() => resumeToast(toast.id)}
      onFocusCapture={() => pauseToast(toast.id)}
      onBlurCapture={() => resumeToast(toast.id)}
      className={cn(
        'pointer-events-auto rounded-xl px-4 py-3 shadow-xl backdrop-blur-md animate-scale-in',
        'soft-separator relative overflow-hidden',
        SEVERITY_STYLES[toast.variant] || SEVERITY_STYLES.info
      )}
    >
      <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-border/20 pointer-events-none" />

      <div className="flex items-start gap-3 relative z-10">
        <div className="flex-1 min-w-0">
          <div className={cn('text-[14px] font-medium', SEVERITY_TITLE[toast.variant] || SEVERITY_TITLE.info)}>
            {toast.title}
          </div>
          {toast.description && (
            <div className="text-[13px] text-text-secondary mt-1 leading-relaxed break-words">
              {toast.description}
            </div>
          )}

          {(toast.actions && toast.actions.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {toast.actions.map(action => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    uiSoundController.play('secondaryClick');
                    Promise.resolve(action.onClick?.()).finally(() => {
                      if (action.dismissAfterAction || action.kind === 'dismiss') {
                        dismiss(toast.id);
                      }
                    });
                  }}
                  className="rounded-lg bg-surface-elevated/50 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-elevated hover:text-text-brand transition-all ring-1 ring-border/20"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
          {toast.action && !toast.actions && (
            <button
              type="button"
              onClick={() => {
                uiSoundController.play('secondaryClick')
                Promise.resolve(toast.action?.onClick()).finally(() => dismiss(toast.id))
              }}
              className="mt-3 rounded-lg bg-surface-elevated/50 px-3 py-1.5 text-xs font-medium text-text-primary ring-1 ring-border/20 transition-all hover:bg-surface-elevated hover:text-text-brand"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        {toast.dismissible !== false && (
          <button
            type="button"
            onClick={() => { uiSoundController.play('secondaryClick'); dismiss(toast.id); }}
            aria-label="Dismiss notification"
            className="text-text-muted hover:text-text-primary transition-colors p-1 -m-1 shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
