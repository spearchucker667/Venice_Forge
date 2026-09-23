/**
 * @fileoverview Catalogue integrity tests.
 *
 * Asset imports with `?url` suffix cannot resolve in the jsdom test environment.
 * We mock all seven spritesheet modules so the test validates catalogue shape
 * and metadata without requiring a Vite/browser build.
 */

import { vi, describe, it, expect } from 'vitest';

// Mock all spritesheet ?url imports before importing the catalogue.
vi.mock('../../../assets/0028-frieren/spritesheet.webp?url', () => ({
  default: '/test/frieren.webp',
}));
vi.mock('../../../assets/0455-diana/spritesheet.webp?url', () => ({
  default: '/test/diana.webp',
}));
vi.mock('../../../assets/0471-palantir-patrick/spritesheet.webp?url', () => ({
  default: '/test/palantir-patrick.webp',
}));
vi.mock('../../../assets/0688-plana/spritesheet.webp?url', () => ({
  default: '/test/plana.webp',
}));
vi.mock('../../../assets/0694-icebell/spritesheet.webp?url', () => ({
  default: '/test/icebell.webp',
}));
vi.mock('../../../assets/0780-powerpet/spritesheet.webp?url', () => ({
  default: '/test/powerpet.webp',
}));
vi.mock('../../../assets/0781-klee/spritesheet.webp?url', () => ({
  default: '/test/klee.webp',
}));

import { PET_CATALOG, SPRITE_GEOMETRY } from './petCatalog';

const EXPECTED_IDS = [
  'frieren',
  'diana',
  'palantir-patrick',
  'plana',
  'icebell',
  'powerpet',
  'klee',
] as const;

describe('PET_CATALOG', () => {
  it('contains exactly seven entries', () => {
    expect(PET_CATALOG).toHaveLength(7);
  });

  it('contains all expected pet ids', () => {
    const ids = PET_CATALOG.map((p) => p.id);
    for (const expected of EXPECTED_IDS) {
      expect(ids).toContain(expected);
    }
  });

  it('has unique ids', () => {
    const ids = PET_CATALOG.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every entry has a non-empty displayName', () => {
    for (const pet of PET_CATALOG) {
      expect(pet.displayName.trim().length).toBeGreaterThan(0);
    }
  });

  it('every entry has a non-empty spritesheetUrl', () => {
    for (const pet of PET_CATALOG) {
      expect(typeof pet.spritesheetUrl).toBe('string');
      expect(pet.spritesheetUrl.length).toBeGreaterThan(0);
    }
  });

  it('uses the shared SPRITE_GEOMETRY for every entry', () => {
    for (const pet of PET_CATALOG) {
      expect(pet.sprite).toBe(SPRITE_GEOMETRY);
    }
  });
});

describe('SPRITE_GEOMETRY', () => {
  it('has the expected V1 frame dimensions', () => {
    expect(SPRITE_GEOMETRY.frameWidth).toBe(192);
    expect(SPRITE_GEOMETRY.frameHeight).toBe(208);
  });

  it('has the expected V1 grid layout', () => {
    expect(SPRITE_GEOMETRY.columns).toBe(8);
    expect(SPRITE_GEOMETRY.rows).toBe(9);
  });

  it('atlas is 1536 × 1872 px', () => {
    expect(SPRITE_GEOMETRY.columns * SPRITE_GEOMETRY.frameWidth).toBe(1536);
    expect(SPRITE_GEOMETRY.rows * SPRITE_GEOMETRY.frameHeight).toBe(1872);
  });
});
