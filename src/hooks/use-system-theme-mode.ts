import { useSyncExternalStore } from "react";
import type { ThemeMode } from "../theme";

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mql = window.matchMedia(DARK_SCHEME_QUERY);
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onStoreChange);
    return () => {
      mql.removeEventListener("change", onStoreChange);
    };
  }
  // Legacy MediaQueryList listener API for older embedded webviews.
  mql.addListener(onStoreChange);
  return () => {
    mql.removeListener(onStoreChange);
  };
}

function getSnapshot(): string {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "dark";
  }
  return window.matchMedia(DARK_SCHEME_QUERY).matches ? "dark" : "light";
}

function getServerSnapshot(): string {
  return "dark";
}

/**
 * Live OS color-scheme preference ('dark' | 'light').
 *
 * Subscribes to `prefers-color-scheme` change events so a system-level
 * light/dark flip re-renders subscribers without an app restart. SSR-safe and
 * safe in test environments without `matchMedia` (defaults to 'dark', matching
 * the pre-existing `getSystemThemeMode` fallback).
 */
export function useSystemThemeMode(): ThemeMode {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  ) as ThemeMode;
}
