// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { syncPrefersReducedMotion } from "../../src/hooks/usePrefersReducedMotion";

describe("reduced motion preference", () => {
  const originalMatchMedia = window.matchMedia;
  let matchesReduce = false;

  beforeEach(() => {
    matchesReduce = false;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" && matchesReduce,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("reflects no-preference in dataset and CSS variable by default", () => {
    syncPrefersReducedMotion();
    expect(document.documentElement.dataset.reducedMotion).toBe("no-preference");
    expect(
      document.documentElement.style.getPropertyValue("--prefers-reduced-motion").trim(),
    ).toBe("no-preference");
  });

  it("reflects reduce in dataset and CSS variable when the media query matches", () => {
    matchesReduce = true;
    syncPrefersReducedMotion();
    expect(document.documentElement.dataset.reducedMotion).toBe("reduce");
    expect(
      document.documentElement.style.getPropertyValue("--prefers-reduced-motion").trim(),
    ).toBe("reduce");
  });
});
