import React, { useState } from 'react'
import { desktopMasterPassword } from '../../services/desktopBridge'
import { useProfileStore } from '../../stores/profile-store'

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
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-overlay/60 backdrop-blur-sm">
      <div className="bg-surface-elevated border border-border p-6 rounded shadow-xl w-[400px]">
        <h2 className="text-lg font-bold mb-4">{mode === 'setup' ? 'Set Master Password' : 'Enter Master Password'}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Master Password"
            className="w-full px-3 py-2 bg-surface border border-border rounded"
            autoFocus
          />
          {mode === 'setup' && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm Password"
              className="w-full px-3 py-2 bg-surface border border-border rounded"
            />
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-surface text-text-primary rounded">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-button-primary-bg text-button-primary-fg rounded">
              {mode === 'setup' ? 'Save' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
