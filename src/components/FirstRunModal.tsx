import React, { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { FIRST_RUN_COPY } from "../shared/legal";

interface FirstRunModalProps {
  open: boolean;
  onAcknowledge: () => void;
  onDismiss: () => void;
}

export function FirstRunModal({ open, onAcknowledge, onDismiss }: FirstRunModalProps) {
  const ackRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimeout = setTimeout(() => ackRef.current?.focus(), 50);

    return () => {
      clearTimeout(focusTimeout);
      document.body.style.overflow = originalOverflow;
      if (returnFocusRef.current instanceof HTMLElement) {
        returnFocusRef.current.focus();
      }
    };
  }, [open]);

  useFocusTrap(modalRef, open, onDismiss);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-overlay/60 p-4 backdrop-blur-2xl animate-[fadeIn_0.3s_ease] sm:p-6"
      onClick={onDismiss}
      role="presentation"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/50 bg-surface/90 shadow-[0_24px_64px_var(--overlay),0_0_0_1px_var(--glow)] backdrop-blur-xl animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] focus:outline-none sm:max-h-[calc(100dvh-3rem)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        aria-describedby="first-run-detail"
      >
        <h2 id="first-run-title" className="shrink-0 px-6 pt-6 text-lg font-display font-semibold text-text-primary">
          {FIRST_RUN_COPY.title}
        </h2>
        <div id="first-run-detail" className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm text-text-secondary leading-relaxed space-y-3 whitespace-pre-line">
          {FIRST_RUN_COPY.body}
        </div>
        <div className="flex shrink-0 flex-col items-stretch justify-end gap-3 border-t border-border/50 px-6 py-4 sm:flex-row sm:items-center">
          <a
            href="https://venice.ai/brand"
            target="_blank"
            rel="noopener noreferrer"
            className="btn text-center"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {FIRST_RUN_COPY.docsLabel}
          </a>
          <button ref={ackRef} className="btn primary" onClick={onAcknowledge}>
            {FIRST_RUN_COPY.agreeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
