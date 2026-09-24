/**
 * @fileoverview CSS sprite-sheet renderer for Codex V1 pet atlases.
 *
 * Renders one frame from a 1536×1872 atlas (8 columns × 9 rows, 192×208 px
 * per frame) using CSS background-position clipping. No canvas, no inline
 * base64. The atlas URL is resolved by Vite at build time.
 *
 * Display size: 48×52 px (1/4 scale of the 192×208 source frame).
 *
 * Animation:
 *  - Runs at 8 FPS via setInterval.
 *  - Paused / held at frame 0 when prefers-reduced-motion is set.
 *  - Cleans up on unmount.
 *
 * Accessibility:
 *  - Purely decorative: aria-hidden="true", pointer-events: none.
 *  - Not keyboard-focusable.
 *
 * Error handling:
 *  - Image load failure is caught by onError; logs the pet id and a
 *    normalised error class. Does not crash the shell.
 */

import { useEffect, useRef, useState } from 'react';
import { getPrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import type { PetAsset } from './petCatalog';

// ─── Animation state configuration ───────────────────────────────────────────

export type AnimationState =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review';

interface StateConfig {
  row: number;
  frames: number;
}

const STATE_CONFIG: Record<AnimationState, StateConfig> = {
  idle: { row: 0, frames: 6 },
  'running-right': { row: 1, frames: 8 },
  'running-left': { row: 2, frames: 8 },
  waving: { row: 3, frames: 4 },
  jumping: { row: 4, frames: 5 },
  failed: { row: 5, frames: 8 },
  waiting: { row: 6, frames: 6 },
  running: { row: 7, frames: 6 },
  review: { row: 8, frames: 6 },
};

// ─── Display geometry ─────────────────────────────────────────────────────────

/** Display dimensions — 1/4 of the source frame size. */
const DISPLAY_WIDTH = 48; // 192 / 4
const DISPLAY_HEIGHT = 52; // 208 / 4
const SCALE = DISPLAY_WIDTH / 192;

/** Full atlas dimensions at display scale. */
const BG_SIZE = `${Math.round(1536 * SCALE)}px ${Math.round(1872 * SCALE)}px`;

const FRAME_MS = 125; // 8 FPS

// ─── Component ────────────────────────────────────────────────────────────────

export interface PetSpriteRendererProps {
  /** The pet to render. Pass null/undefined to render nothing. */
  pet: PetAsset | null | undefined;
  /** Which animation row to play. Defaults to 'idle'. */
  animationState?: AnimationState;
}

/**
 * Renders one frame of a Codex V1 pet spritesheet.
 *
 * Use `<PetSpriteRenderer key={pet.id} pet={pet} />` at the call site so
 * that changing the pet resets animation state without remounting the entire
 * application shell.
 */
export function PetSpriteRenderer({
  pet,
  animationState = 'idle',
}: PetSpriteRendererProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Determine the row and frame count for the requested animation state.
  const config = STATE_CONFIG[animationState] ?? STATE_CONFIG.idle;

  useEffect(() => {
    // Reset frame and error state when the pet or animation state changes.
    setFrameIndex(0);
    setHasError(false);

    if (getPrefersReducedMotion()) {
      // Show a stable first frame; no animation.
      return;
    }

    if (config.frames <= 1) {
      // Single-frame state; no timer needed.
      return;
    }

    intervalRef.current = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % config.frames);
    }, FRAME_MS);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pet?.id, animationState, config.frames]);

  if (!pet || hasError) {
    return null;
  }

  // Calculate background-position for the current frame in display-scale coordinates.
  const bgX = Math.round(-(frameIndex * 192) * SCALE);
  const bgY = Math.round(-(config.row * 208) * SCALE);

  return (
    <div
      aria-hidden="true"
      role="presentation"
      style={{
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
        backgroundImage: `url(${pet.spritesheetUrl})`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        backgroundSize: BG_SIZE,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        pointerEvents: 'none',
        flexShrink: 0,
      }}
      onError={() => {
        // Defensive: the div's background errors may not surface here.
        // The img-based onError pattern does not apply to background-image.
        // This handler is a no-op but kept for future canvas/img fallback.
      }}
    />
  );
}

/**
 * Invisible image preloader that fires onError so we can detect broken atlases
 * without displaying anything. Used inside PetSpriteRenderer as a companion.
 */
function AtlasErrorMonitor({
  url,
  petId,
  onError,
}: {
  url: string;
  petId: string;
  onError: () => void;
}) {
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className="hidden pointer-events-none"
      onError={() => {
        console.warn(
          `[mascot] Atlas load failed for pet "${petId}" (NetworkError or resource unavailable)`,
        );
        onError();
      }}
    />
  );
}

/**
 * PetSpriteRenderer with integrated atlas error detection.
 * Falls back to null when the spritesheet cannot be loaded.
 */
export function PetSpriteRendererWithFallback({
  pet,
  animationState = 'idle',
}: PetSpriteRendererProps) {
  const [atlasOk, setAtlasOk] = useState(true);
  const prevPetIdRef = useRef<string | null>(null);

  // Reset error state when the pet changes.
  if (pet?.id !== prevPetIdRef.current) {
    prevPetIdRef.current = pet?.id ?? null;
    // Cannot call setAtlasOk here (render phase), defer via ref check.
  }

  useEffect(() => {
    setAtlasOk(true);
  }, [pet?.id]);

  if (!pet) return null;

  return (
    <>
      <AtlasErrorMonitor
        url={pet.spritesheetUrl}
        petId={pet.id}
        onError={() => setAtlasOk(false)}
      />
      {atlasOk && (
        <PetSpriteRenderer pet={pet} animationState={animationState} />
      )}
    </>
  );
}
