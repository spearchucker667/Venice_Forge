/**
 * @fileoverview Pure selection function for random non-repeating pet rotation.
 *
 * Deterministic under an injected random source so it can be tested without
 * React. Never mutates the catalogue.
 */

export type RandomSource = () => number;

/**
 * Pick the next pet from `pets`, excluding `currentPetId` when more than one
 * candidate is available.
 *
 * Contract:
 *  - `[]`              → `null`
 *  - one valid pet     → return that pet (currentPetId irrelevant)
 *  - two or more pets  → exclude currentPetId; select uniformly from the rest
 *  - currentPetId not present → select uniformly from all pets
 *  - never mutates the catalogue
 *  - never sorts with a random comparator
 */
export function pickNextPet<T extends { id: string }>(
  pets: readonly T[],
  currentPetId: string | null,
  random: RandomSource = Math.random,
): T | null {
  if (pets.length === 0) return null;
  if (pets.length === 1) return pets[0] ?? null;

  const candidates = pets.filter((pet) => pet.id !== currentPetId);
  const pool = candidates.length > 0 ? candidates : pets;

  // Clamp to [0, 0.9999...] to guard against an injected random returning
  // exactly 1 (which would produce an out-of-bounds index).
  const sample = Math.min(Math.max(random(), 0), 0.9999999999999999);
  const index = Math.floor(sample * pool.length);
  return pool[index] ?? pool[0] ?? null;
}
