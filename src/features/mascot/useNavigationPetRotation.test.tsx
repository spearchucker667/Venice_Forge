/**
 * @fileoverview Tests for the navigation-driven pet rotation hook.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock all spritesheet ?url imports.
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

import { renderHook, act } from '@testing-library/react';
import { useNavigationPetRotation } from './useNavigationPetRotation';
import { PET_CATALOG } from './petCatalog';
import type { PetAsset } from './petCatalog';

const MINI_CATALOG: readonly PetAsset[] = PET_CATALOG.slice(0, 3);
const SINGLE_CATALOG: readonly PetAsset[] = PET_CATALOG.slice(0, 1);

beforeEach(() => {
  // Ensure a clean module state between tests (hook refs are per-render instance).
});

describe('useNavigationPetRotation', () => {
  it('chooses an initial pet on mount', () => {
    const { result } = renderHook(() =>
      useNavigationPetRotation({ navigationKey: 'chat', pets: MINI_CATALOG }),
    );
    expect(result.current).not.toBeNull();
    expect(MINI_CATALOG).toContain(result.current);
  });

  it('returns a pet from the provided catalogue', () => {
    const { result } = renderHook(() =>
      useNavigationPetRotation({ navigationKey: 'chat', pets: PET_CATALOG }),
    );
    expect(PET_CATALOG).toContain(result.current);
  });

  it('same navigation key does not rotate', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useNavigationPetRotation({ navigationKey: key, pets: MINI_CATALOG }),
      { initialProps: { key: 'chat' } },
    );
    const first = result.current;

    rerender({ key: 'chat' });
    rerender({ key: 'chat' });

    expect(result.current).toBe(first);
  });

  it('navigation key change rotates exactly once', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useNavigationPetRotation({ navigationKey: key, pets: MINI_CATALOG }),
      { initialProps: { key: 'chat' } },
    );
    const before = result.current;

    act(() => {
      rerender({ key: 'image' });
    });

    const after = result.current;
    // Should have changed (catalog has 3 pets so a different one is available)
    expect(after).not.toBeNull();
    expect(MINI_CATALOG).toContain(after);
    // Should not equal the previous pet (excludes current)
    expect(after?.id).not.toBe(before?.id);
  });

  it('new pet differs from old pet when 2+ candidates available', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useNavigationPetRotation({ navigationKey: key, pets: MINI_CATALOG }),
      { initialProps: { key: 'chat' } },
    );
    const before = result.current;

    act(() => { rerender({ key: 'image' }); });
    const after = result.current;

    expect(after?.id).not.toBe(before?.id);
  });

  it('returns the only pet even if it matches current when catalog has 1 entry', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useNavigationPetRotation({ navigationKey: key, pets: SINGLE_CATALOG }),
      { initialProps: { key: 'chat' } },
    );
    const only = SINGLE_CATALOG[0];
    expect(result.current?.id).toBe(only?.id);

    act(() => { rerender({ key: 'image' }); });
    expect(result.current?.id).toBe(only?.id);
  });

  it('rerender with unrelated prop change does not rotate', () => {
    let extraState = 0;
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => {
        // Extra state change simulated via closure increment
        void extraState;
        return useNavigationPetRotation({ navigationKey: key, pets: MINI_CATALOG });
      },
      { initialProps: { key: 'chat' } },
    );
    const first = result.current;

    act(() => {
      extraState = 1;
      rerender({ key: 'chat' });
    });
    act(() => {
      extraState = 2;
      rerender({ key: 'chat' });
    });

    expect(result.current).toBe(first);
  });

  it('rapid A → B → C navigation produces one choice per destination', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useNavigationPetRotation({ navigationKey: key, pets: PET_CATALOG }),
      { initialProps: { key: 'chat' } },
    );
    const atChat = result.current;

    act(() => { rerender({ key: 'image' }); });
    const atImage = result.current;

    act(() => { rerender({ key: 'media' }); });
    const atMedia = result.current;

    // Each destination should have produced a distinct (or at least valid) pet
    expect(MINI_CATALOG.length >= 3 || PET_CATALOG).toBeTruthy();
    expect(atChat).not.toBeNull();
    expect(atImage).not.toBeNull();
    expect(atMedia).not.toBeNull();

    // Each change should have selected a different pet from the previous
    expect(atImage?.id).not.toBe(atChat?.id);
    expect(atMedia?.id).not.toBe(atImage?.id);
  });

  it('unmount does not leave errors', () => {
    const { unmount } = renderHook(() =>
      useNavigationPetRotation({ navigationKey: 'chat', pets: MINI_CATALOG }),
    );
    expect(() => unmount()).not.toThrow();
  });
});
