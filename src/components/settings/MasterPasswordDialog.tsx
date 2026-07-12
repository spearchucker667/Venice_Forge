import React, { useId, useRef, useState } from 'react'
import { desktopMasterPassword } from '../../services/desktopBridge'
import { useProfileStore } from '../../stores/profile-store'
import { AccessibleDialog } from '../ui/AccessibleDialog'

interface MasterPasswordDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  mode: 'setup' | 'verify'
}

const MIN_PASSWORD_LENGTH = 4 // length floor on user-typed unlock password

export function MasterPasswordDialog({ isOpen, onClose, onSuccess, mode }: MasterPasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const { setMasterPasswordSet } = useProfileStore()
  const dialogRef = useRef<HTMLDivElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const passwordId = useId()
  const confirmId = useId()

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'setup') {
      if (password !== confirm) {
        setError('Passwords do not match')
        return
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password too short (min ${MIN_PASSWORD_LENGTH} characters)`)
        return
      }
      try {
        // The salted PBKDF2 verifier is derived and stored ONLY in the main
        // process. The renderer never sees the verifier record.
        const res = await desktopMasterPassword.set(password)
        if (res.ok) {
          setMasterPasswordSet(true)
          setPassword('')
          setConfirm('')
          onSuccess()
        } else {
          setError(res.error || 'Failed to securely save password')
        }
      } catch {
        setError('Failed to securely save password')
      }
      return
    }

    // Verify mode
    try {
      const res = await desktopMasterPassword.verify(password)
      if (res.ok && res.verified) {
        setPassword('')
        setConfirm('')
        onSuccess()
      } else {
        const lockoutMsg = res.lockedOutSeconds && res.lockedOutSeconds > 0
          ? ` Locked out. Try again in ${res.lockedOutSeconds}s.`
          : ''
        setError(`Incorrect password.${lockoutMsg}`)
      }
    } catch {
      setError('Failed to verify password')
    }
  }

  return (
    <AccessibleDialog
      title={mode === 'setup' ? 'Set Master Password' : 'Enter Master Password'}
      description="This local control password protects Family Safe Mode changes. The app stores a salted verifier, not the password itself."
      onClose={onClose}
      initialFocusRef={passwordRef}
      panelRef={dialogRef}
      panelClassName="max-w-[400px]"
      zIndexClassName="z-[999]"
    >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <label htmlFor={passwordId} className="text-sm font-medium text-text-secondary">Master password</label>
          <input
            ref={passwordRef}
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded"
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${passwordId}-error` : undefined}
          />
          {mode === 'setup' && (
            <div className="flex flex-col gap-2">
              <label htmlFor={confirmId} className="text-sm font-medium text-text-secondary">Confirm master password</label>
              <input id={confirmId} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 bg-surface border border-border rounded" autoComplete="new-password" />
            </div>
          )}
          {error && <p id={`${passwordId}-error`} role="alert" className="text-danger text-sm">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-surface text-text-primary rounded">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-button-primary-bg text-button-primary-fg rounded">
              {mode === 'setup' ? 'Save' : 'Unlock'}
            </button>
          </div>
        </form>
    </AccessibleDialog>
  )
}
