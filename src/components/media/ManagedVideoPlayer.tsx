/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useRef, useEffect, useState, memo } from 'react'
import { cn } from '../../lib/utils'
import { warn } from '../../shared/logger'
import { useResolvedMediaUrl } from '../../hooks/useResolvedMediaUrl'

interface ManagedVideoPlayerProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string
  className?: string
  onDiagnostics?: (info: any) => void
  onErrorDiagnostics?: (error: any) => void
}

export const ManagedVideoPlayer = memo(function ManagedVideoPlayer({
  src,
  className,
  onDiagnostics,
  onErrorDiagnostics,
  ...props
}: ManagedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  // Resolve durable custom-protocol URLs (venice-media://) into capability
  // URLs — the main-process protocol handler rejects tokenless requests
  // with 403. The returned `retry()` issues a fresh token if the video
  // outlives its current capability token (5-minute TTL by default).
  const { url: resolvedSrc, retry: retryResolution } = useResolvedMediaUrl(src)

  // Force source lifecycle correctly when source changes
  const [videoKey, setVideoKey] = useState(src)

  useEffect(() => {
    setVideoKey(resolvedSrc ?? src)
    setError(null)
  }, [resolvedSrc, src])

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const target = e.target as HTMLVideoElement
    // Capability tokens are short-lived (5 min by default). If the video
    // outlives its token, try issuing a fresh one before reporting a hard
    // error. The retry is one-shot — persistent failures fall through to
    // the regular error reporting below.
    if (retryResolution()) {
      setError(null)
      return
    }
    const errorMsg = target.error?.message || `Error code: ${target.error?.code}`
    setError(errorMsg)
    if (onErrorDiagnostics) onErrorDiagnostics(target.error)
    else warn?.('Video playback error:', errorMsg)
  }

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const target = e.target as HTMLVideoElement
    const diagnostics = {
      videoWidth: target.videoWidth,
      videoHeight: target.videoHeight,
      duration: target.duration,
      readyState: target.readyState,
      networkState: target.networkState,
      src: target.src,
    }
    if (onDiagnostics) onDiagnostics(diagnostics)
  }

  return (
    <div className={cn("relative w-full h-full flex items-center justify-center overflow-hidden bg-black", className)}> {/* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 pointer-events-none"> {/* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */}
          <span className="text-red-500 text-sm font-semibold">{error}</span>
        </div>
      )}
      <video
        key={videoKey}
        ref={videoRef}
        src={resolvedSrc ?? ""}
        controls
        onError={handleError}
        onLoadedMetadata={handleLoadedMetadata}
        className={cn("w-full h-full object-contain pointer-events-auto", error ? "opacity-50" : "opacity-100")}
        {...props}
      />
    </div>
  )
})
