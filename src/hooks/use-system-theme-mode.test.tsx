// THEME-P2-005 regression guard
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSystemThemeMode } from "./use-system-theme-mode";

/** Controllable MediaQueryList mock supporting both listener APIs. */
class MockMediaQueryList {
  matches: boolean;
  readonly media: string;
  private modernListeners = new Set<(event: { matches: boolean }) => void>();
  private legacyListeners = new Set<(event: { matches: boolean }) => void>();

  constructor(media: string, matches: boolean) {
    this.media = media;
    this.matches = matches;
  }

  addEventListener(_type: string, listener: (event: { matches: boolean }) => void) {
    this.modernListeners.add(listener);
  }

  removeEventListener(_type: string, listener: (event: { matches: boolean }) => void) {
    this.modernListeners.delete(listener);
  }

  addListener(listener: (event: { matches: boolean }) => void) {
    this.legacyListeners.add(listener);
  }

  removeListener(listener: (event: { matches: boolean }) => void) {
    this.legacyListeners.delete(listener);
  }

  /** Flip the mocked OS preference and notify subscribers like a browser would. */
  dispatch(matches: boolean) {
    this.matches = matches;
    const event = { matches };
    for (const listener of [...this.modernListeners]) listener(event);
    for (const listener of [...this.legacyListeners]) listener(event);
  }

  get listenerCount(): number {
    return this.modernListeners.size + this.legacyListeners.size;
  }
}

function stubMatchMedia(initial: boolean): MockMediaQueryList {
  const darkQuery = new MockMediaQueryList("(prefers-color-scheme: dark)", initial);
  const lightQuery = new MockMediaQueryList("(prefers-color-scheme: light)", !initial);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) =>
      query === "(prefers-color-scheme: dark)" ? darkQuery : lightQuery,
    ),
  });
  return darkQuery;
}

describe("useSystemThemeMode", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
    vi.restoreAllMocks();
  });

  it("returns 'dark' when the dark media query matches", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useSystemThemeMode());
    expect(result.current).toBe("dark");
  });

  it("returns 'light' when the dark media query does not match", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useSystemThemeMode());
    expect(result.current).toBe("light");
  });

  it("flips the resolved mode when the media query changes and cleans up on unmount", () => {
    const darkQuery = stubMatchMedia(true);
    const { result, unmount } = renderHook(() => useSystemThemeMode());
    expect(result.current).toBe("dark");
    expect(darkQuery.listenerCount).toBe(1);

    act(() => {
      darkQuery.dispatch(false);
    });
    expect(result.current).toBe("light");

    act(() => {
      darkQuery.dispatch(true);
    });
    expect(result.current).toBe("dark");

    unmount();
    expect(darkQuery.listenerCount).toBe(0);
  });

  it("falls back to the legacy addListener API when addEventListener is missing", () => {
    const darkQuery = stubMatchMedia(true);
    // Remove the modern API to simulate an older webview.
    (darkQuery as unknown as Record<string, unknown>).addEventListener = undefined;
    (darkQuery as unknown as Record<string, unknown>).removeEventListener = undefined;

    const { result, unmount } = renderHook(() => useSystemThemeMode());
    expect(result.current).toBe("dark");
    expect(darkQuery.listenerCount).toBe(1);

    act(() => {
      darkQuery.dispatch(false);
    });
    expect(result.current).toBe("light");

    unmount();
    expect(darkQuery.listenerCount).toBe(0);
  });

  it("defaults to 'dark' when matchMedia is unavailable (SSR/test safety)", () => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: undefined });
    const { result } = renderHook(() => useSystemThemeMode());
    expect(result.current).toBe("dark");
  });
});
