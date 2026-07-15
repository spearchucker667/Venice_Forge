import React, { useRef, useEffect } from 'react';
import { useToastStore, type Toast } from '../../stores/toast-store';
import { uiSoundController } from '../../services/uiSoundController';
import { GenerationLoadingIndicator } from '../generation/GenerationLoadingIndicator';

export function ProgressToast({ toast }: { toast: Toast }) {
  const progressRef = useRef<HTMLDivElement>(null);
  const dismiss = useToastStore((state) => state.dismiss)
  const pauseToast = useToastStore((state) => state.pauseToast)
  const resumeToast = useToastStore((state) => state.resumeToast)

  useEffect(() => {
    if (progressRef.current && toast.progressRatio !== undefined) {
      progressRef.current.style.width = `${Math.max(0, Math.min(1, toast.progressRatio)) * 100}%`;
    }
  }, [toast.progressRatio]);

  return (
    <div
      role="status"
      onMouseEnter={() => pauseToast(toast.id)}
      onMouseLeave={() => resumeToast(toast.id)}
      onFocusCapture={() => pauseToast(toast.id)}
      onBlurCapture={() => resumeToast(toast.id)}
      className="pointer-events-auto rounded-xl px-4 py-3 shadow-xl backdrop-blur-md animate-scale-in soft-separator relative overflow-hidden bg-mesh-surface"
    >
      <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-border/20 pointer-events-none" />

      <div className="flex items-start gap-3 relative z-10">
        <GenerationLoadingIndicator size="sm" state="processing" />

        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-accent">
            {toast.title}
          </div>
          {toast.description && (
            <div className="text-[13px] text-text-secondary mt-1 leading-relaxed break-words">
              {toast.description}
            </div>
          )}

          {toast.progressRatio !== undefined && (
            <div
              className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated ring-1 ring-inset ring-border/20"
              role="progressbar"
              aria-label={`${toast.title} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.max(0, Math.min(1, toast.progressRatio)) * 100)}
            >
              <div
                ref={progressRef}
                className="h-full bg-accent transition-all duration-300 ease-out"
              />
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
