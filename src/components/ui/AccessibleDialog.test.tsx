import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AccessibleDialog } from './AccessibleDialog'

describe('AccessibleDialog', () => {
  it('provides semantics, traps Escape, locks scrolling, and restores focus', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const onClose = vi.fn()
    const panelRef = createRef<HTMLDivElement>()
    const initialFocusRef = createRef<HTMLButtonElement>()

    const { unmount } = render(
      <AccessibleDialog
        title="Example dialog"
        description="Example description"
        onClose={onClose}
        panelRef={panelRef}
        initialFocusRef={initialFocusRef}
      >
        <button ref={initialFocusRef} type="button">Primary action</button>
      </AccessibleDialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Example dialog' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Example description')
    expect(screen.getByRole('button', { name: 'Primary action' })).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
    trigger.remove()
  })
})
