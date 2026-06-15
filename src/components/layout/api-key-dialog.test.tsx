import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ApiKeyDialog } from './api-key-dialog'
import { useAuthStore } from '../../stores/auth-store'

describe('ApiKeyDialog', () => {
  beforeEach(() => {
    useAuthStore.setState({
      apiKey: null,
      isConfigured: true,
      clearApiKey: vi.fn().mockResolvedValue(undefined),
    })
  })

  // T-037 regression guard: Disconnect must await clearApiKey() and handle failures safely.
  it('awaits clearApiKey() and clears the input on disconnect', async () => {
    render(<ApiKeyDialog open={true} onClose={vi.fn()} />)
    const input = screen.getByLabelText('Venice API key') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'sk-test-value' } })

    const disconnectBtn = screen.getByRole('button', { name: 'Disconnect' })
    fireEvent.click(disconnectBtn)

    await waitFor(() => expect(useAuthStore.getState().clearApiKey).toHaveBeenCalledTimes(1))
    expect(input.value).toBe('')
  })

  it('shows a safe error message when clearApiKey() fails without leaking raw exception text', async () => {
    useAuthStore.setState({
      clearApiKey: vi.fn().mockRejectedValueOnce(new Error('secret/path leak')),
    })

    render(<ApiKeyDialog open={true} onClose={vi.fn()} />)
    const disconnectBtn = screen.getByRole('button', { name: 'Disconnect' })
    fireEvent.click(disconnectBtn)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Failed to disconnect. Please try again.')
    expect(alert.textContent).not.toContain('secret')
    expect(alert.textContent).not.toContain('/path')
    expect(alert.textContent).not.toContain('leak')
  })
})
