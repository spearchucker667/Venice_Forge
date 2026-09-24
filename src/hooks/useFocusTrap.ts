import { useEffect, useRef, RefObject } from "react";

const escapeClosers: Array<() => void> = [];

function onDocumentEscape(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  const close = escapeClosers[escapeClosers.length - 1];
  if (!close) return;
  event.preventDefault();
  event.stopPropagation();
  close();
}

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean = true,
  onClose?: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active || !ref.current) return;

    const el = ref.current;
    const previouslyFocused = document.activeElement;

    // Find all focusable elements
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable]'
    ].join(',');

    const getFocusable = () => Array.from(el.querySelectorAll<HTMLElement>(focusableSelectors));

    // Focus the first element when active
    const focusable = getFocusable();
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      // Ensure the container itself can be focused if no children are focusable.
      if (el.tabIndex < 0) {
        el.tabIndex = -1;
      }
      el.focus();
    }

    const closeFromEscape = () => {
      onCloseRef.current?.();
    };
    escapeClosers.push(closeFromEscape);
    if (escapeClosers.length === 1) {
      document.addEventListener("keydown", onDocumentEscape);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const elements = getFocusable();
      if (elements.length === 0) {
        e.preventDefault();
        return;
      }

      const firstElement = elements[0];
      const lastElement = elements[elements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      const index = escapeClosers.lastIndexOf(closeFromEscape);
      if (index >= 0) escapeClosers.splice(index, 1);
      if (escapeClosers.length === 0) {
        document.removeEventListener("keydown", onDocumentEscape);
      }
      // Only restore focus if we currently own the focus. If another dialog mounted
      // and stole focus, we should not yank it back to the old previouslyFocused element.
      if (
        previouslyFocused instanceof HTMLElement && 
        previouslyFocused.isConnected && 
        (document.activeElement === el || el.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        previouslyFocused.focus();
      }
    };
  }, [active, ref, initialFocusRef]);
}
