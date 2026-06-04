import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Manages object URLs derived from Blobs so they're revoked on unmount or replacement.
 * Returns a tuple [url, setBlob, reset]. setBlob(null) clears.
 */
export function useBlobUrl(): [string | null, (blob: Blob | null) => void, () => void] {
  const [url, setUrl] = useState<string | null>(null)
  const ref = useRef<string | null>(null)

  const setBlob = useCallback((blob: Blob | null) => {
    if (ref.current) {
      URL.revokeObjectURL(ref.current)
      ref.current = null
    }
    if (blob) {
      const next = URL.createObjectURL(blob)
      ref.current = next
      setUrl(next)
    } else {
      setUrl(null)
    }
  }, [])

  const reset = useCallback(() => setBlob(null), [setBlob])

  useEffect(() => {
    return () => {
      if (ref.current) {
        URL.revokeObjectURL(ref.current)
        ref.current = null
      }
    }
  }, [])

  return [url, setBlob, reset]
}
