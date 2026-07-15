// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FirstRunModal } from './FirstRunModal'

describe('FirstRunModal', () => {
  it('keeps the legal copy scrollable while the consent actions remain visible', () => {
    render(<FirstRunModal open onAcknowledge={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.getByRole('dialog')).toHaveClass('max-h-[calc(100dvh-2rem)]', 'overflow-hidden')
    expect(screen.getByText(/18\+ Age Requirement/i).closest('#first-run-detail')).toHaveClass(
      'min-h-0',
      'overflow-y-auto',
    )
    expect(screen.getByRole('button')).toHaveAccessibleName(/agree|acknowledge|continue|18/i)
    expect(screen.getByRole('button').parentElement).toHaveClass('shrink-0')
  })
})
