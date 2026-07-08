import React, { useState } from 'react'
import { desktopCredentials } from '../../services/desktopBridge'
import { useProfileStore } from '../../stores/profile-store'

interface MasterPasswordDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  mode: 'setup' | 'verify'
}

export function MasterPasswordDialog({ isOpen, onClose, onSuccess, mode }: MasterPasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lockedOutUntil, setLockedOutUntil] = useState<number | null>(null)
  const { setMasterPasswordSet } = useProfileStore()

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (lockedOutUntil && Date.now() < lockedOutUntil) {
      setError(`Locked out. Try again in ${Math.ceil((lockedOutUntil - Date.now()) / 1000)}s`)
      return
    }

    if (mode === 'setup') {
      if (password !== confirm) {
        setError('Passwords do not match')
        return
      }
      if (password.length < 4) {
        setError('Password too short')
        return
      }
      
      const res = await desktopCredentials.set('master_password', password)
      if (res.ok) {
        setMasterPasswordSet(true)
        onSuccess()
      } else {
        setError('Failed to securely save password')
      }
    } else {
      // Verify
      const res = await desktopCredentials.get('master_password')
      if (res.ok && res.value === password) {
        setAttempts(0)
        onSuccess()
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        if (newAttempts >= 5) {
          setLockedOutUntil(Date.now() + 60000)
          setError('Too many failed attempts. Locked out for 1 minute.')
        } else {
          setError('Incorrect password')
        }
      }
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
