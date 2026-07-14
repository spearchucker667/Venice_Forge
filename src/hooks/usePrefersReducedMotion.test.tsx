// VERIFY-113 regression guard
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrefersReducedMotion, usePrefersReducedMotion } from "./usePrefersReducedMotion";

describe("usePrefersReducedMotion", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
    vi.restoreAllMocks();
  });

  it("falls back to false when matchMedia is unavailable", () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });

    expect(getPrefersReducedMotion()).toBe(false);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
    expect(document.documentElement.dataset.reducedMotion).toBe("no-preference");
  });
});
