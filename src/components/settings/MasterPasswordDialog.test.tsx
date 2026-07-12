import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfileStore } from '../../stores/profile-store'
import { desktopMasterPassword } from '../../services/desktopBridge'
import { MasterPasswordDialog } from './MasterPasswordDialog'

vi.mock('../../services/desktopBridge', () => ({
  desktopMasterPassword: {
    set: vi.fn(),
    verify: vi.fn(),
  },
}))

describe('MasterPasswordDialog accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useProfileStore.setState({ masterPasswordSet: false })
  })

  it('labels password fields, explains local verifier custody, and announces validation errors', async () => {
    render(<MasterPasswordDialog isOpen mode="setup" onClose={vi.fn()} onSuccess={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Set Master Password' })).toHaveAccessibleDescription(/stores a salted verifier/)
    const password = screen.getByLabelText('Master password')
    expect(password).toHaveFocus()
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    await userEvent.type(password, 'abc')
    await userEvent.type(screen.getByLabelText('Confirm master password'), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Password too short')
    expect(desktopMasterPassword.set).not.toHaveBeenCalled()
  })
})
