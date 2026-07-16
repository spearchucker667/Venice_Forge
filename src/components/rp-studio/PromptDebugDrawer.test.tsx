import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PromptDebugDrawer } from './PromptDebugDrawer'
import type { PromptAssemblyResult } from '../../types/rp'

const assembly: PromptAssemblyResult = {
  systemMessages: [], recentMessages: [], postHistoryMessages: [], userMessage: { role: 'user', content: 'Hello' }, trace: [], budgetExceeded: false, totalSystemChars: 0,
}

describe('PromptDebugDrawer accessibility', () => {
  it('moves focus inside, closes on Escape, and restores focus', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const onClose = vi.fn()
    const { unmount } = render(<PromptDebugDrawer assembly={assembly} onClose={onClose} />)

    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })
})
