import React, { useState } from 'react'
import { desktopCredentials } from '../../services/desktopBridge'
import { useProfileStore } from '../../stores/profile-store'

interface MasterPasswordDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  mode: 'setup' | 'verify'
}

// Bumped when the PBKDF2 verifier format changes in a way that would make
// previously-stored hashes unreadable. v1 = salt + iter + hash (SHA-256, 32-byte).
const MASTER_PASSWORD_VERSION = 1
const PBKDF2_ITERATIONS = 200000
const PBKDF2_KEY_LEN_BYTES = 32
const PBKDF2_SALT_LEN_BYTES = 16
const MIN_UNLOCK_LENGTH = 4 // length floor on user-typed unlock password

interface MasterPasswordRecord {
  v: number
  salt: string
  iter: number
  hash: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i])
  }
  return btoa(s)
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) {
    b[i] = s.charCodeAt(i)
  }
  return b
}

/**
 * Timing-safe byte comparison: takes the same time regardless of where the
 * first mismatching byte is so offline brute-force on a leaked record cannot
 * accelerate by partial-match timing.
 */
function timingSafeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    // XOR against self to keep the comparison constant-time even when lengths differ.
    let dummy = 0
    const min = Math.min(a.length, b.length)
    for (let i = 0; i < min; i++) {
      dummy |= a[i] ^ b[i]
    }
    void dummy // explicit discard; the loop just spent the trailing cycles on purpose
    return false
  }
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i]
  }
  return mismatch === 0
}

async function pbkdf2(password: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: iter,
      hash: 'SHA-256',
    },
    baseKey,
    PBKDF2_KEY_LEN_BYTES * 8,
  )
  return new Uint8Array(bits)
}

async function buildMasterPasswordRecord(password: string): Promise<MasterPasswordRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LEN_BYTES))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return {
    v: MASTER_PASSWORD_VERSION,
    salt: bytesToBase64(salt),
    iter: PBKDF2_ITERATIONS,
    hash: bytesToBase64(hash),
  }
}

async function verifyMasterPassword(record: MasterPasswordRecord, password: string): Promise<boolean> {
  if (record.v !== MASTER_PASSWORD_VERSION) return false
  if (record.iter <= 0 || record.hash.length === 0 || record.salt.length === 0) return false
  let salt: Uint8Array
  let expected: Uint8Array
  try {
    salt = base64ToBytes(record.salt)
    expected = base64ToBytes(record.hash)
  } catch {
    return false
  }
  const actual = await pbkdf2(password, salt, record.iter)
  return timingSafeBytesEqual(expected, actual)
}

function parseStoredRecord(raw: string): MasterPasswordRecord | null {
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed && typeof parsed === 'object'
      && typeof parsed.v === 'number'
      && typeof parsed.salt === 'string'
      && typeof parsed.iter === 'number'
      && typeof parsed.hash === 'string'
    ) {
      return parsed as MasterPasswordRecord
    }
    return null
  } catch {
    // Backward compatibility: legacy callers may have written the raw password
    // string. Treat it as a hash-equal compare failure rather than auto-upgrading
    // plaintext into a verifier, so the legacy entry is forced through setup.
    return null
  }
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
      if (password.length < MIN_UNLOCK_LENGTH) {
        setError(`Password too short (min ${MIN_UNLOCK_LENGTH} characters)`)
        return
      }
      try {
        // Derive a salted PBKDF2 verifier; persist only `salt + iter + hash` so a
        // stolen credential record cannot trivially reveal the password itself.
        // The original plaintext is never written to disk on any platform.
        const record = await buildMasterPasswordRecord(password)
        const res = await desktopCredentials.set('master_password', JSON.stringify(record))
        if (res.ok) {
          setMasterPasswordSet(true)
          setPassword('')
          setConfirm('')
          onSuccess()
        } else {
          setError('Failed to securely save password')
        }
      } catch {
        setError('Failed to derive password verifier')
      }
    } else {
      // Verify
      const res = await desktopCredentials.get('master_password')
      const stored = res.ok && typeof res.value === 'string' ? parseStoredRecord(res.value) : null
      let verified = false
      if (stored) {
        try {
          verified = await verifyMasterPassword(stored, password)
        } catch {
          verified = false
        }
      }
      // Always charge an attempt: even a missing/corrupt record must not leak
      // the fact that the credential is absent from the failure-vs-error message
      // compared to a wrong password.
      const newAttempts = attempts + 1
      setAttempts(newAttempts)
      if (verified) {
        setAttempts(0)
        setPassword('')
        setConfirm('')
        onSuccess()
      } else if (newAttempts >= 5) {
        setLockedOutUntil(Date.now() + 60000)
        setError('Too many failed attempts. Locked out for 1 minute.')
      } else {
        setError('Incorrect password')
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
