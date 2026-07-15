// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../stores/toast-store'
import { ToastProvider } from './ToastProvider'

vi.mock('../../services/uiSoundController', () => ({
  uiSoundController: { play: vi.fn() },
}))

describe('ToastProvider', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })

  it('renders semantic alerts and dismisses them', () => {
    useToastStore.getState().push({
      variant: 'error',
      title: 'Generation failed',
      description: 'Try again.',
      persistent: true,
    })

    render(<ToastProvider />)

    expect(screen.getByRole('alert')).toHaveTextContent('Generation failed')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('exposes determinate progress to assistive technology', () => {
    useToastStore.getState().push({
      variant: 'progress',
      title: 'Generating video',
      progressRatio: 0.42,
      persistent: true,
    })

    render(<ToastProvider />)

    expect(screen.getByRole('progressbar', { name: 'Generating video progress' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    )
  })
})
