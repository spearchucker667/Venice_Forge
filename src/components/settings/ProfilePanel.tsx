import React, { useEffect, useState } from 'react'
import { useProfileStore } from '../../stores/profile-store'
import { askDecision } from '../ui/modal-requests'
import { desktopProfilePassword, isElectron } from '../../services/desktopBridge'

const MIN_PROFILE_PASSWORD_LENGTH = 4
const MAX_UNLOCK_ATTEMPTS = 5
const UNLOCK_LOCKOUT_MS = 60_000

type PasswordDialogState =
  | { mode: 'set'; profileId: string; profileName: string }
  | { mode: 'unlock'; profileId: string; profileName: string }
  | null

export function ProfilePanel() {
  const { profiles, activeProfileId, addProfile, switchProfile, updateProfile, deleteProfile } = useProfileStore()
  const [newProfileName, setNewProfileName] = useState('')
  const [passwordDialog, setPasswordDialog] = useState<PasswordDialogState>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [unlockAttempts, setUnlockAttempts] = useState<Record<string, { attempts: number; lockedUntil: number | null }>>({})

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (newProfileName.trim()) {
      addProfile(newProfileName.trim())
      setNewProfileName('')
    }
  }

  useEffect(() => {
    if (!isElectron()) return
    let cancelled = false
    void Promise.all(
      profiles.map(async (profile) => {
        const isSet = await desktopProfilePassword.isSet(profile.id).catch(() => false)
        return { profile, isSet }
      }),
    ).then((results) => {
      if (cancelled) return
      for (const { profile, isSet } of results) {
        if ((profile.hasPassword === true) !== isSet) {
          updateProfile(profile.id, { hasPassword: isSet })
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [profiles, updateProfile])

  const closePasswordDialog = () => {
    setPasswordDialog(null)
    setPassword('')
    setConfirmPassword('')
    setPasswordError('')
  }

  const openSetPassword = (profileId: string, profileName: string) => {
    setPasswordDialog({ mode: 'set', profileId, profileName })
    setPassword('')
    setConfirmPassword('')
    setPasswordError('')
  }

  const openUnlock = (profileId: string, profileName: string) => {
    setPasswordDialog({ mode: 'unlock', profileId, profileName })
    setPassword('')
    setConfirmPassword('')
    setPasswordError('')
  }

  const handleSwitch = (profileId: string, profileName: string, hasPassword?: boolean) => {
    if (hasPassword) {
      openUnlock(profileId, profileName)
      return
    }
    switchProfile(profileId)
  }

  const handleClearPassword = async (profileId: string, profileName: string) => {
    const confirmed = await askDecision({
      title: 'Remove profile password?',
      detail: `"${profileName}" will no longer require unlock before switching.`,
      actionLabel: 'Remove',
      danger: true,
    })
    if (!confirmed) return
    const result = await desktopProfilePassword.clear(profileId)
    if (result.ok) {
      updateProfile(profileId, { hasPassword: false })
    } else {
      setPasswordError(result.error || 'Failed to remove profile password')
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordDialog) return
    setPasswordError('')

    if (passwordDialog.mode === 'set') {
      if (password.length < MIN_PROFILE_PASSWORD_LENGTH) {
        setPasswordError(`Password too short (min ${MIN_PROFILE_PASSWORD_LENGTH} characters)`)
        return
      }
      if (password !== confirmPassword) {
        setPasswordError('Passwords do not match')
        setPassword('')
        setConfirmPassword('')
        return
      }
      const result = await desktopProfilePassword.set(passwordDialog.profileId, password)
      setPassword('')
      setConfirmPassword('')
      if (!result.ok) {
        setPasswordError(result.error || 'Failed to save profile password')
        return
      }
      updateProfile(passwordDialog.profileId, { hasPassword: true })
      closePasswordDialog()
      return
    }

    const current = unlockAttempts[passwordDialog.profileId]
    const lockedUntil = current?.lockedUntil ?? null
    if (lockedUntil && Date.now() < lockedUntil) {
      setPassword('')
      setPasswordError(`Locked out. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)}s`)
      return
    }

    const result = await desktopProfilePassword.verify(passwordDialog.profileId, password)
    setPassword('')
    setConfirmPassword('')
    if (result.ok && result.verified) {
      setUnlockAttempts((state) => ({
        ...state,
        [passwordDialog.profileId]: { attempts: 0, lockedUntil: null },
      }))
      const targetId = passwordDialog.profileId
      closePasswordDialog()
      switchProfile(targetId)
      return
    }

    const nextAttempts = (current?.attempts ?? 0) + 1
    const nextLockedUntil = nextAttempts >= MAX_UNLOCK_ATTEMPTS ? Date.now() + UNLOCK_LOCKOUT_MS : null
    setUnlockAttempts((state) => ({
      ...state,
      [passwordDialog.profileId]: {
        attempts: nextAttempts,
        lockedUntil: nextLockedUntil,
      },
    }))
    setPasswordError(nextLockedUntil ? 'Too many failed attempts. Locked out for 1 minute.' : 'Incorrect password')
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-lg space-y-4">
        <h3 className="text-[14.5px] font-medium text-text-primary">Manage Profiles</h3>
        <p className="text-[12.5px] text-text-secondary leading-relaxed">
          Each profile maintains isolated settings, API keys, and configurations. Switching profiles will clear active application state and reload.
        </p>
        
        <ul className="space-y-2 mt-4">
          {profiles.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3 border border-border rounded bg-surface">
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-text-primary">
                  {p.name} {p.id === activeProfileId && <span className="ml-2 text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded">ACTIVE</span>}
                  {p.hasPassword && <span className="ml-2 text-[10px] bg-warning/15 text-warning px-1.5 py-0.5 rounded">LOCKED</span>}
                </span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {isElectron() && (
                  p.hasPassword ? (
                    <button
                      type="button"
                      onClick={() => void handleClearPassword(p.id, p.name)}
                      className="text-[12px] text-text-secondary hover:underline px-2 py-1"
                      aria-label={`Remove password for ${p.name}`}
                    >
                      Remove Password
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openSetPassword(p.id, p.name)}
                      className="text-[12px] text-text-secondary hover:underline px-2 py-1"
                      aria-label={`Set password for ${p.name}`}
                    >
                      Set Password
                    </button>
                  )
                )}
                {p.id !== activeProfileId && (
                  <button
                    type="button"
                    onClick={() => handleSwitch(p.id, p.name, p.hasPassword)}
                    className="text-[12px] text-accent hover:underline px-2 py-1"
                    aria-label={`Switch to ${p.name}`}
                  >
                    Switch To
                  </button>
                )}
                {p.id !== 'default' && (
                  <button type="button" onClick={async () => {
                    const confirmed = await askDecision({
                      title: 'Delete profile?',
                      detail: `"${p.name}" — all isolated settings will be removed. Files on disk remain.`,
                      actionLabel: 'Delete',
                      danger: true,
                    })
                    if (confirmed) {
                      if (p.hasPassword) {
                        await desktopProfilePassword.clear(p.id).catch(() => ({ ok: false }))
                      }
                      deleteProfile(p.id)
                    }
                  }} className="text-[12px] text-danger hover:underline px-2 py-1">
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <form onSubmit={handleAdd} className="flex gap-2 mt-4 pt-4 soft-separator-y">
          <input
            type="text"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="New Profile Name"
            className="flex-1 px-3 py-1.5 bg-surface border border-border rounded text-[13px]"
          />
          <button type="submit" className="px-4 py-1.5 bg-button-primary-bg text-button-primary-fg rounded text-[13px] font-medium">
            Create Profile
          </button>
        </form>
      </div>

      {passwordDialog && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-overlay/60 backdrop-blur-sm">
          <div className="w-[min(420px,calc(100vw-32px))] rounded border border-border bg-surface-elevated p-5 shadow-xl">
            <h3 className="text-[15px] font-semibold text-text-primary">
              {passwordDialog.mode === 'set' ? `Set Password for ${passwordDialog.profileName}` : `Unlock ${passwordDialog.profileName}`}
            </h3>
            <form onSubmit={handlePasswordSubmit} className="mt-4 flex flex-col gap-3">
              <label className="text-[12.5px] text-text-secondary">
                {passwordDialog.mode === 'set' ? 'Profile password' : 'Unlock password'}
                <input
                  type="password"
                  aria-label={passwordDialog.mode === 'set' ? 'Profile password' : 'Unlock password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-[13px] text-text-primary"
                  autoFocus
                />
              </label>
              {passwordDialog.mode === 'set' && (
                <label className="text-[12.5px] text-text-secondary">
                  Confirm profile password
                  <input
                    type="password"
                    aria-label="Confirm profile password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-[13px] text-text-primary"
                  />
                </label>
              )}
              {passwordError && <p className="text-[12.5px] text-danger">{passwordError}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={closePasswordDialog} className="rounded bg-surface px-4 py-2 text-[13px] text-text-primary">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-button-primary-bg px-4 py-2 text-[13px] font-medium text-button-primary-fg">
                  {passwordDialog.mode === 'set' ? 'Save Password' : 'Unlock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
