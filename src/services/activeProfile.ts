/** @fileoverview Single source of truth for the active profile identifier.
 *
 * Profiles are how Venice Forge separates user contexts (e.g. "default" and "work").
 * Settings, secure credentials, and rendered data all key off the active
 * profile id so two profiles never collide. Reading from multiple sources
 * (renderer + main + localStorage) is fragile, so this module centralises
 * the canonical read/write path and broadcasts changes to subscribers.
 *
 * Anyone in the renderer that previously inlined a `localStorage.getItem(
 * 'venice-active-profile-id') ?? 'default'` should migrate to
 * `getActiveProfileId()` here. The profile store calls
 * `broadcastActiveProfileChange()` after writing localStorage so stores
 * can clear volatile in-memory state on switch (image-workspace drafts,
 * inspector logs, active conversation).
 */

/** localStorage key the active profile id is persisted under. */
export const ACTIVE_PROFILE_STORAGE_KEY = "venice-active-profile-id";

/** Default profile id when no profile has been set yet. */
export const DEFAULT_PROFILE_ID = "default";

/**
 * Reads the active profile id from localStorage. Returns `'default'`
 * on the server (no localStorage) or when the value is missing/empty.
 */
export function getActiveProfileId(): string {
  if (typeof window === "undefined" || !window.localStorage /* localStorage-allowed: active profile routing; written only by profile-store */) {
    return DEFAULT_PROFILE_ID;
  }
  try {
    const value = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) /* localStorage-allowed: active profile routing */;
    return value && value.length > 0 ? value : DEFAULT_PROFILE_ID;
  } catch {
    /* localStorage may throw inside an iframe with disabled storage */
    return DEFAULT_PROFILE_ID;
  }
}

/** Subscriber callback fired whenever the active profile id changes. */
export type ActiveProfileListener = (nextId: string, prevId: string) => void;

const listeners = new Set<ActiveProfileListener>();

/**
 * Writes the active profile id to localStorage. Throws never propagate;
 * failures just leave the previous value untouched.
 *
 * Also broadcasts the change synchronously so subscribers can clear
 * volatile caches that depend on the previous id. The broadcast happens
 * BEFORE the localStorage write commits — no, after — wait, after the
 * write, so any subscriber that needs to read the new id via
 * `getActiveProfileId()` gets the fresh value.
 *
 * `prevId` is captured at the start so the broadcast carries the correct
 * "from → to" pair even though `getActiveProfileId()` already returns the
 * new value at broadcast time.
 */
export function setActiveProfileId(id: string): void {
  if (typeof window === "undefined" || !window.localStorage /* localStorage-allowed: active profile routing */) return;
  if (!id || typeof id !== "string") return;
  const prevId = getActiveProfileId();
  if (prevId === id) return; // idempotent: no write, no broadcast
  try {
    window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id) /* localStorage-allowed: active profile routing */;
  } catch {
    /* swallow quota / privacy-mode errors; subscribers will not fire */
    return;
  }
  fireBroadcast(id, prevId);
}

/**
 * Subscribes to active profile changes. Returns an unsubscribe function.
 * Listeners are called synchronously from `setActiveProfileId`; they must
 * not throw (we still wrap defensively to avoid one bad subscriber
 * disrupting another).
 */
export function subscribeActiveProfile(fn: ActiveProfileListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Notifies all subscribers that the active profile changed. Public so
 * code that already wrote localStorage out-of-band (e.g. tests) can fire
 * the broadcast manually. Almost never called directly — prefer
 * `setActiveProfileId` which writes + broadcasts atomically.
 */
export function broadcastActiveProfileChange(nextId: string): void {
  const prevId = getActiveProfileId();
  if (prevId === nextId) return;
  fireBroadcast(nextId, prevId);
}

function fireBroadcast(nextId: string, prevId: string): void {
  for (const fn of listeners) {
    try {
      fn(nextId, prevId);
    } catch {
      /* never let one listener disrupt another */
    }
  }
}

/**
 * Convenience: returns true when the active profile is `'default'`.
 * Used as a guard for "no profile changes have happened yet" checks.
 */
export function isDefaultProfileActive(): boolean {
  return getActiveProfileId() === DEFAULT_PROFILE_ID;
}
