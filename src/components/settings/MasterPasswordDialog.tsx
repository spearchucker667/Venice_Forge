import React, { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopMasterPassword } from '../../services/desktopBridge'
import { useProfileStore } from '../../stores/profile-store'
import { AccessibleDialog } from '../ui/AccessibleDialog'

interface MasterPasswordDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (password: string) => void
  mode: 'setup' | 'verify'
}

const MIN_PASSWORD_LENGTH = 4 // length floor on user-typed unlock password

export function MasterPasswordDialog({ isOpen, onClose, onSuccess, mode }: MasterPasswordDialogProps) {
  const { t } = useTranslation(['settings', 'common'])
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
        setError(t('settings:masterPassword.errors.mismatch', 'Passwords do not match'))
        return
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(t('settings:masterPassword.errors.tooShort', { defaultValue: 'Password too short (min {{min}} characters)', min: MIN_PASSWORD_LENGTH }))
        return
      }
      try {
        // The salted PBKDF2 verifier is derived and stored ONLY in the main
        // process. The renderer never sees the verifier record.
        const res = await desktopMasterPassword.set(password)
        if (res.ok) {
          setMasterPasswordSet(true)
          onSuccess(password)
          setPassword('')
          setConfirm('')
        } else {
          setError(res.error || t('settings:masterPassword.errors.saveFailed', 'Failed to securely save password'))
        }
      } catch {
        setError(t('settings:masterPassword.errors.saveFailed', 'Failed to securely save password'))
      }
      return
    }

    // Verify mode
    try {
      const res = await desktopMasterPassword.verify(password)
      if (res.ok && res.verified) {
        onSuccess(password)
        setPassword('')
        setConfirm('')
      } else {
        const lockoutMsg = res.lockedOutSeconds && res.lockedOutSeconds > 0
          ? t('settings:masterPassword.errors.lockedOut', { defaultValue: ' Locked out. Try again in {{seconds}}s.', seconds: res.lockedOutSeconds })
          : ''
        setError(t('settings:masterPassword.errors.incorrect', 'Incorrect password.') + lockoutMsg)
      }
    } catch {
      setError(t('settings:masterPassword.errors.verifyFailed', 'Failed to verify password'))
    }
  }

  return (
    <AccessibleDialog
      title={mode === 'setup' ? t('settings:masterPassword.titleSet', 'Set Master Password') : t('settings:masterPassword.titleEnter', 'Enter Master Password')}
      description={t('settings:masterPassword.description', "This local control password protects Family Safe Mode changes. The app stores a salted verifier, not the password itself.")}
      onClose={onClose}
      initialFocusRef={passwordRef}
      panelRef={dialogRef}
      panelClassName="max-w-[400px]"
      zIndexClassName="z-[999]"
    >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
          <label htmlFor={passwordId} className="text-sm font-medium text-text-secondary">{t('settings:masterPassword.labels.password', 'Master password')}</label>
          <input
            ref={passwordRef}
            id={passwordId}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-vf-panel-bg border border-vf-panel-border rounded"
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${passwordId}-error` : undefined}
          />
          {mode === 'setup' && (
            <div className="flex flex-col gap-2">
              <label htmlFor={confirmId} className="text-sm font-medium text-text-secondary">{t('settings:masterPassword.labels.confirm', 'Confirm master password')}</label>
              <input id={confirmId} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 bg-vf-panel-bg border border-vf-panel-border rounded" autoComplete="new-password" />
            </div>
          )}
          {error && <p id={`${passwordId}-error`} role="alert" className="text-danger text-sm">{error}</p>}
          <div className="flex justify-end gap-3 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-vf-panel-bg text-text-primary rounded">{t('common:actions.cancel', 'Cancel')}</button>
            <button type="submit" className="px-4 py-2 bg-button-primary-bg text-button-primary-fg rounded">
              {mode === 'setup' ? t('common:actions.save', 'Save') : t('common:actions.unlock', 'Unlock')}
            </button>
          </div>
        </form>
    </AccessibleDialog>
  )
}
