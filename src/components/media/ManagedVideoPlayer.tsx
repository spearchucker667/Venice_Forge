/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useRef, useEffect, useState, memo } from 'react'
import { cn } from '../../lib/utils'
import { warn } from '../../shared/logger'

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
  
  // Force source lifecycle correctly when source changes
  const [videoKey, setVideoKey] = useState(src)

  useEffect(() => {
    setVideoKey(src)
    setError(null)
  }, [src])

  const handleError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const target = e.target as HTMLVideoElement
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
        src={src}
        controls
        onError={handleError}
        onLoadedMetadata={handleLoadedMetadata}
        className={cn("w-full h-full object-contain pointer-events-auto", error ? "opacity-50" : "opacity-100")}
        {...props}
      />
    </div>
  )
})
