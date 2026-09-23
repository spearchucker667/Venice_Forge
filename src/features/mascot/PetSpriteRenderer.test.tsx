/**
 * @fileoverview Tests for the PetSpriteRenderer component.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock spritesheet ?url imports.
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

// Mock usePrefersReducedMotion helper so we can control it per-test.
vi.mock('../../hooks/usePrefersReducedMotion', () => ({
  getPrefersReducedMotion: vi.fn(() => false),
  usePrefersReducedMotion: vi.fn(() => false),
  syncPrefersReducedMotion: vi.fn(() => false),
}));

import { render } from '@testing-library/react';
import { PetSpriteRenderer, PetSpriteRendererWithFallback } from './PetSpriteRenderer';
import { PET_CATALOG } from './petCatalog';
import * as motionModule from '../../hooks/usePrefersReducedMotion';

const frierenPet = PET_CATALOG.find((p) => p.id === 'frieren')!;
const klee = PET_CATALOG.find((p) => p.id === 'klee')!;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PetSpriteRenderer', () => {
  it('renders nothing when pet is null', () => {
    const { container } = render(<PetSpriteRenderer pet={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a div with aria-hidden when given a valid pet', () => {
    const { container } = render(<PetSpriteRenderer pet={frierenPet} />);
    const el = container.firstChild as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('sets the expected display dimensions via inline style', () => {
    const { container } = render(<PetSpriteRenderer pet={frierenPet} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('48px');
    expect(el.style.height).toBe('52px');
  });

  it('sets pointer-events: none', () => {
    const { container } = render(<PetSpriteRenderer pet={frierenPet} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.pointerEvents).toBe('none');
  });

  it('references the spritesheet URL in background-image', () => {
    const { container } = render(<PetSpriteRenderer pet={frierenPet} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundImage).toContain('frieren.webp');
  });

  it('renders correctly with a different pet', () => {
    const { container } = render(<PetSpriteRenderer pet={klee} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.backgroundImage).toContain('klee.webp');
  });

  it('does not throw when unmounted', () => {
    const { unmount } = render(<PetSpriteRenderer pet={frierenPet} />);
    expect(() => unmount()).not.toThrow();
  });

  it('shows frame 0 when prefers-reduced-motion is true (no interval)', () => {
    vi.spyOn(motionModule, 'getPrefersReducedMotion').mockReturnValue(true);

    const { container } = render(<PetSpriteRenderer pet={frierenPet} />);
    const el = container.firstChild as HTMLElement;

    // Advance time — no frame progression should occur
    vi.advanceTimersByTime(1000);

    // background-position for idle row=0, frame=0 at scale=0.25:
    // bgX = 0, bgY = 0
    expect(el.style.backgroundPosition).toBe('0px 0px');
  });
});

describe('PetSpriteRendererWithFallback', () => {
  it('renders the sprite when pet is valid', () => {
    const { container } = render(
      <PetSpriteRendererWithFallback pet={frierenPet} />,
    );
    // Should contain a div with aria-hidden (the sprite) plus a hidden img monitor
    const divs = container.querySelectorAll('div[aria-hidden="true"]');
    expect(divs.length).toBeGreaterThan(0);
  });

  it('renders nothing when pet is null', () => {
    const { container } = render(
      <PetSpriteRendererWithFallback pet={null} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
