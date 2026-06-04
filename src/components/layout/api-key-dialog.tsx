import { useEffect, useState } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { VeniceLogo } from '../ui/logo'
import { toast } from '../../stores/toast-store'

export function ApiKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { apiKey, isConfigured, setApiKey, clearApiKey } = useAuthStore()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const handleConnect = async () => {
    if (!value.trim()) return
    setBusy(true)
    setError(null)
    try {
      await setApiKey(value.trim())
      toast.success('Key saved securely')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save key')
    } finally {
      setBusy(false)
    }
  }

  const titleId = 'apikey-dialog-title'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button aria-label="Close dialog" className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative var(--color-surface) border border-white/[0.1] rounded-xl p-6 w-full max-w-sm mx-4 animate-scale-in shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <VeniceLogo size={26} />
          <div>
            <h2 id={titleId} className="text-[17px] font-semibold text-white/90">
              Connect to Venice
            </h2>
            <p className="text-[13px] text-white/50">
              Stored securely in OS Keychain/Credential Manager.
            </p>
          </div>
        </div>

        <label htmlFor="apikey-input" className="sr-only">Venice API key</label>
        <input
          id="apikey-input"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-..."
          className="w-full var(--color-surface) border border-white/[0.1] rounded-lg px-3.5 py-2.5 text-[16px] text-white outline-none focus:border-white/[0.25] transition-colors font-mono placeholder:text-white/25"
          autoFocus
          autoComplete="off"
          onKeyDown={(e) => { if (e.key === 'Enter') handleConnect() }}
        />
        <p className="text-[13px] text-white/40 mt-2">
          Get a key at{' '}
          <a
            href="https://venice.ai/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/65 hover:text-white underline underline-offset-2"
          >
            venice.ai/settings/api
          </a>
          .
        </p>

        {error && <p role="alert" className="text-[13px] text-red-300 mt-3">{error}</p>}

        <div className="flex flex-wrap gap-2 mt-6 justify-end">
          {(apiKey || isConfigured) && (
            <button
              onClick={() => { clearApiKey(); setValue(''); toast.info('API key cleared') }}
              className="px-3 py-1.5 text-[14px] text-white/55 hover:text-red-300 transition-colors"
            >
              Disconnect
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 text-[14px] text-white/55 hover:text-white/85 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={busy || !value.trim()}
            aria-busy={busy || undefined}
            className="px-4 py-1.5 text-[14px] font-medium bg-white text-black rounded-md hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40 focus-visible:outline-offset-2"
          >
            {busy ? '…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
