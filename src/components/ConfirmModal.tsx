import React, { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { uiSoundController } from "../services/uiSoundController";

interface ConfirmModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Primary question shown in the modal heading. */
  message: string;
  /** Optional longer explanation rendered below the heading. */
  detail?: string;
  /** Label for the confirm action button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel action button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Tone for the confirm button: "danger" renders a red button. Defaults to "danger". */
  confirmTone?: "primary" | "danger";
  /** Optional third action rendered between Cancel and Confirm. */
  tertiaryAction?: { label: string; onClick: () => void };
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  message,
  detail,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmTone = "danger",
  tertiaryAction,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Default focus on the safe/cancel action.
    const focusTimeout = setTimeout(() => cancelRef.current?.focus(), 50);

    return () => {
      clearTimeout(focusTimeout);
      document.body.style.overflow = originalOverflow;
      if (returnFocusRef.current instanceof HTMLElement) {
        returnFocusRef.current.focus();
      }
    };
  }, [open]);

  useFocusTrap(modalRef, open, onCancel);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-overlay/80 p-6 animate-[fadeIn_0.3s_ease]"
      onClick={onCancel}
      role="presentation"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={detail ? "confirm-modal-detail" : undefined}
      >
        <h2 id="confirm-modal-title" className="text-lg font-display font-semibold text-text-primary mb-2">
          {message}
        </h2>
        {detail && (
          <p id="confirm-modal-detail" className="text-sm text-text-secondary mb-6 leading-relaxed">
            {detail}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          <button ref={cancelRef} className="btn" onClick={() => { uiSoundController.play('secondaryClick'); onCancel() }}>
            {cancelLabel}
          </button>
          {tertiaryAction && (
            <button className="btn" onClick={() => { uiSoundController.play('secondaryClick'); tertiaryAction.onClick() }}>
              {tertiaryAction.label}
            </button>
          )}
          <button className={`btn ${confirmTone}`} onClick={() => { uiSoundController.play('primaryClick'); onConfirm() }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
