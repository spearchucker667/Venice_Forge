import { create } from 'zustand'

const SESSION_KEY = 'venice-auth'
const ENCRYPTED_KEY = 'venice-auth-enc'
const PBKDF2_ITERATIONS = 250_000

interface EncryptedBlob {
  salt: string
  iv: string
  ct: string
}

interface AuthState {
  apiKey: string | null
  hasEncrypted: boolean
  setApiKey: (key: string, remember?: { passphrase: string }) => Promise<void>
  unlock: (passphrase: string) => Promise<boolean>
  clearApiKey: () => void
}

const b64encode = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))

const b64decode = (str: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(str)
  const buf = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encrypt(plaintext: string, passphrase: string): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)))
  const key = await deriveKey(passphrase, salt)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return { salt: b64encode(salt.buffer), iv: b64encode(iv.buffer), ct: b64encode(ct) }
}

async function decrypt(blob: EncryptedBlob, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase, b64decode(blob.salt))
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(blob.iv) },
    key,
    b64decode(blob.ct),
  )
  return new TextDecoder().decode(pt)
}

const initialKey = (() => {
  try {
    const session = sessionStorage.getItem(SESSION_KEY)
    if (session) return session
    const legacy = localStorage.getItem(SESSION_KEY)
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy) as { state?: { apiKey?: string | null } }
        const key = parsed?.state?.apiKey ?? null
        localStorage.removeItem(SESSION_KEY)
        if (key) sessionStorage.setItem(SESSION_KEY, key)
        return key
      } catch {
        localStorage.removeItem(SESSION_KEY)
      }
    }
    return null
  } catch {
    return null
  }
})()

const initialHasEncrypted = (() => {
  try {
    return localStorage.getItem(ENCRYPTED_KEY) !== null
  } catch {
    return false
  }
})()

export const useAuthStore = create<AuthState>()((set) => ({
  apiKey: initialKey,
  hasEncrypted: initialHasEncrypted,

  setApiKey: async (key, remember) => {
    sessionStorage.setItem(SESSION_KEY, key)
    if (remember) {
      const blob = await encrypt(key, remember.passphrase)
      localStorage.setItem(ENCRYPTED_KEY, JSON.stringify(blob))
      set({ apiKey: key, hasEncrypted: true })
    } else {
      set({ apiKey: key })
    }
  },

  unlock: async (passphrase) => {
    const raw = localStorage.getItem(ENCRYPTED_KEY)
    if (!raw) return false
    try {
      const key = await decrypt(JSON.parse(raw) as EncryptedBlob, passphrase)
      sessionStorage.setItem(SESSION_KEY, key)
      set({ apiKey: key })
      return true
    } catch {
      return false
    }
  },

  clearApiKey: () => {
    sessionStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(ENCRYPTED_KEY)
    set({ apiKey: null, hasEncrypted: false })
  },
}))
