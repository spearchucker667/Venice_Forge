/**
 * @fileoverview Navigation-driven pet rotation hook.
 *
 * Selects one pet on initial mount. Rotates to a different pet exactly once
 * whenever the canonical navigation key (normalised active tab id) changes.
 * Unrelated state changes, rerenders, background updates, modal activity, and
 * React Strict Mode double-invocation do NOT cause extra rotations.
 *
 * Architecture: one canonical owner for pet selection — this hook.
 * The hook is called once in the `Sidebar` component which already holds
 * `activeTab`. Pet selection state lives only in React, not in any Zustand
 * store, IndexedDB, or localStorage.
 */

import { useEffect, useRef, useState } from 'react';
import { pickNextPet } from './pickNextPet';
import type { PetAsset } from './petCatalog';

export interface UseNavigationPetRotationOptions {
  /** Stable string key representing the current primary navigation destination. */
  navigationKey: string;
  /** Catalogue of available pets. Should be a stable reference (module-level constant). */
  pets: readonly PetAsset[];
}

/**
 * Returns the currently active pet, rotating to a different one whenever
 * `navigationKey` changes.
 */
export function useNavigationPetRotation({
  navigationKey,
  pets,
}: UseNavigationPetRotationOptions): PetAsset | null {
  /**
   * Track the previously observed navigation key so we can detect a real
   * destination change even if the effect fires more than once (e.g. React
   * Strict Mode double-invocation in development).
   *
   * Initialised to a sentinel `null` so the first real key always triggers
   * the initial pet selection via the effect path rather than duplicating
   * logic in the state initialiser.
   */
  const prevKeyRef = useRef<string | null>(null);

  const [activePet, setActivePet] = useState<PetAsset | null>(() =>
    pickNextPet(pets, null),
  );

  useEffect(() => {
    // Guard: skip if the key hasn't changed since we last processed it.
    // This covers:
    //   1. Unrelated rerenders that re-run effects (shouldn't happen with
    //      correct deps, but defensive).
    //   2. React Strict Mode double-invocation: second call sees the ref
    //      already set to the current key and exits early.
    if (prevKeyRef.current === navigationKey) return;
    prevKeyRef.current = navigationKey;

    // Use a functional update so we always read the latest current pet
    // without closing over stale state.
    setActivePet((current) => pickNextPet(pets, current?.id ?? null));
  }, [navigationKey, pets]);

  return activePet;
}
