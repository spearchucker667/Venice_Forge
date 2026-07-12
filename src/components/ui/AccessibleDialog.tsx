import { useEffect, useId, type ReactNode, type RefObject } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface AccessibleDialogProps {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  onClose?: () => void
  initialFocusRef?: RefObject<HTMLElement | null>
  headerAction?: ReactNode
  panelRef: RefObject<HTMLDivElement | null>
  panelClassName?: string
  closeOnBackdrop?: boolean
  zIndexClassName?: string
}

export function AccessibleDialog({
  title,
  description,
  children,
  onClose,
  initialFocusRef,
  headerAction,
  panelRef,
  panelClassName = 'max-w-lg',
  closeOnBackdrop = false,
  zIndexClassName = 'z-[80]',
}: AccessibleDialogProps) {
  const generatedId = useId()
  const titleId = `${generatedId}-title`
  const descriptionId = description ? `${generatedId}-description` : undefined
  useFocusTrap(panelRef, true, onClose, initialFocusRef)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} grid place-items-center bg-overlay/70 p-4 backdrop-blur-sm`}
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && onClose && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={`flex max-h-[min(90vh,900px)] w-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl focus:outline-none ${panelClassName}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/50 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-display font-semibold text-text-primary">
              {title}
            </h2>
            {description && (
              <div id={descriptionId} className="mt-1 text-sm leading-relaxed text-text-secondary">
                {description}
              </div>
            )}
          </div>
          {headerAction}
        </header>
        {children}
      </div>
    </div>
  )
}
