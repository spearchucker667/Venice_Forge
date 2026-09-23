import { describe, it, expect } from 'vitest';
import { pickNextPet } from './pickNextPet';

type Pet = { id: string };

const P1: Pet = { id: 'alpha' };
const P2: Pet = { id: 'beta' };
const P3: Pet = { id: 'gamma' };

describe('pickNextPet', () => {
  it('returns null for an empty catalogue', () => {
    expect(pickNextPet([], null)).toBeNull();
    expect(pickNextPet([], 'alpha')).toBeNull();
  });

  it('returns the only pet regardless of currentPetId', () => {
    expect(pickNextPet([P1], null)).toBe(P1);
    expect(pickNextPet([P1], 'alpha')).toBe(P1);
    expect(pickNextPet([P1], 'other')).toBe(P1);
  });

  it('excludes currentPetId from candidates when 2+ pets exist', () => {
    // force random = 0 so first of candidates is returned
    const result = pickNextPet([P1, P2], 'alpha', () => 0);
    expect(result).toBe(P2); // alpha excluded, only beta remains
  });

  it('sample=0 selects the first candidate', () => {
    const result = pickNextPet([P1, P2, P3], 'alpha', () => 0);
    // candidates: [beta, gamma]; index 0 → beta
    expect(result).toBe(P2);
  });

  it('sample near 1 selects the last candidate', () => {
    const result = pickNextPet([P1, P2, P3], 'alpha', () => 0.9999);
    // candidates: [beta, gamma]; index = floor(0.9999 * 2) = 1 → gamma
    expect(result).toBe(P3);
  });

  it('does not mutate the catalogue', () => {
    const original = [P1, P2, P3];
    const frozen = Object.freeze([...original]);
    const result = pickNextPet(frozen, 'alpha', () => 0);
    expect(result).not.toBeNull();
    expect(frozen).toHaveLength(3);
  });

  it('selects from all pets when currentPetId is not in the catalogue', () => {
    const result = pickNextPet([P1, P2, P3], 'not-in-list', () => 0);
    // no exclusion possible → selects from all 3, index 0 → P1
    expect(result).toBe(P1);
  });

  it('returns a valid pet for any random value in [0, 1)', () => {
    const catalog = [P1, P2, P3];
    for (const r of [0, 0.1, 0.49, 0.5, 0.99, 0.9999]) {
      const pet = pickNextPet(catalog, null, () => r);
      expect(pet).not.toBeNull();
      expect(catalog).toContain(pet);
    }
  });

  it('clamps extreme random values gracefully', () => {
    expect(pickNextPet([P1, P2], null, () => -0.5)).not.toBeNull();
    expect(pickNextPet([P1, P2], null, () => 2)).not.toBeNull();
  });
});
