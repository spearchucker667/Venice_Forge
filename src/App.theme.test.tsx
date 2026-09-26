// @vitest-environment jsdom
// THEME-P2-003 / THEME-P2-004 / THEME-P2-005 App-level theme lifecycle guards.
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("./services/desktopBridge", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    isElectron: () => false,
    desktopProfilePassword: {
      activate: vi.fn(async () => ({ ok: true, verified: true })),
    },
    desktopMasterPassword: { isSet: vi.fn(async () => false) },
    desktopSync: { setSyncFolder: vi.fn(async () => ({ ok: true })) },
    initDesktopBridge: vi.fn(async () => {}),
  };
});

import { App } from "./App";
import { useProfileStore } from "./stores/profile-store";
import { useAuthStore } from "./stores/auth-store";
import { useSettingsStore } from "./stores/settings-store";
import { useConfigStore } from "./stores/config-store";
import { FIRST_RUN_ACK_KEY } from "./shared/legal";
import { BUILTIN_VENICE, resolveTheme, type Theme } from "./theme";

/** Controllable matchMedia mock for the dark-scheme media query. */
class MockMediaQueryList {
  matches: boolean;
  private listeners = new Set<(event: { matches: boolean }) => void>();

  constructor(matches: boolean) {
    this.matches = matches;
  }

  addEventListener(_type: string, listener: (event: { matches: boolean }) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: string, listener: (event: { matches: boolean }) => void) {
    this.listeners.delete(listener);
  }

  dispatch(matches: boolean) {
    this.matches = matches;
    const event = { matches };
    for (const listener of [...this.listeners]) listener(event);
  }
}

const darkQuery = new MockMediaQueryList(true);

function stubMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) =>
      query === "(prefers-color-scheme: dark)"
        ? darkQuery
        : { matches: false, addEventListener: () => {}, removeEventListener: () => {} },
    ),
  });
}

function makeUserTheme(id: string): Theme {
  return {
    ...resolveTheme(BUILTIN_VENICE, "dark"),
    id,
    name: "App Test Theme",
  };
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function readBootstrapCache(): Record<string, any> | null {
  const raw = window.localStorage.getItem("vf.theme.bootstrap");
  return raw ? JSON.parse(raw) : null;
}

describe("App theme lifecycle", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme-mode");
    document.documentElement.style.cssText = "";
    darkQuery.matches = true;
    stubMatchMedia();
    localStorage.setItem(FIRST_RUN_ACK_KEY, "1");
    useProfileStore.setState({
      profiles: [
        { id: "default", name: "Default Profile", onboardingCompleted: true },
      ],
      activeProfileId: "default",
      masterPasswordSet: false,
      globalOnboardingCompleted: true,
    });
    useAuthStore.setState({ apiKey: "test-key", isConfigured: true });
    useSettingsStore.setState({
      selectedThemeId: "builtin-venice",
      appearanceMode: "dark",
      customTheme: null,
      customThemes: [],
    });
    useConfigStore.setState({ yamlThemes: {} });
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
    vi.restoreAllMocks();
  });

  it("hydrates the selected theme from customThemes (THEME-P2-003)", async () => {
    const userTheme = makeUserTheme("user-theme-app");
    useSettingsStore.setState({
      selectedThemeId: "user-theme-app",
      customTheme: null,
      customThemes: [userTheme],
      appearanceMode: "dark",
    });

    renderApp();

    await waitFor(() => {
      expect(readBootstrapCache()?.resolved?.themeId).toBe("user-theme-app");
    });
    expect(document.documentElement.dataset.themeMode).toBe("dark");
  });

  it("writes the resolved variable map to the bootstrap cache (THEME-P2-004)", async () => {
    renderApp();

    await waitFor(() => {
      expect(readBootstrapCache()?.resolved?.vars).toBeTruthy();
    });
    const cache = readBootstrapCache()!;
    expect(cache.selectedThemeId).toBe("builtin-venice");
    expect(cache.appearanceMode).toBe("dark");
    expect(cache.customTheme).toBeNull();
    expect(cache.resolved.mode).toBe("dark");
    expect(cache.resolved.themeId).toBe("venice");
    expect(cache.resolved.colorScheme).toBe("dark");
    expect(Object.keys(cache.resolved.vars)).toHaveLength(70);
    // The cached map is exactly what applyTheme applied to the DOM.
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(
      cache.resolved.vars["--bg"],
    );
  });

  it("re-applies the theme live when the OS scheme flips in system mode (THEME-P2-005)", async () => {
    useSettingsStore.setState({ appearanceMode: "system" });

    renderApp();

    await waitFor(() => {
      expect(document.documentElement.dataset.themeMode).toBe("dark");
    });
    // The authored 'system' value is preserved in the persisted cache.
    expect(readBootstrapCache()?.appearanceMode).toBe("system");
    expect(readBootstrapCache()?.resolved?.mode).toBe("dark");

    act(() => {
      darkQuery.dispatch(false);
    });

    await waitFor(() => {
      expect(document.documentElement.dataset.themeMode).toBe("light");
    });
    await waitFor(() => {
      expect(readBootstrapCache()?.resolved?.mode).toBe("light");
    });
    expect(readBootstrapCache()?.appearanceMode).toBe("system");
  });

  it("keeps explicit appearance modes stable when the OS scheme flips", async () => {
    useSettingsStore.setState({ appearanceMode: "dark" });

    renderApp();

    await waitFor(() => {
      expect(document.documentElement.dataset.themeMode).toBe("dark");
    });
    act(() => {
      darkQuery.dispatch(false);
    });

    // Allow any stray reactive work to settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.documentElement.dataset.themeMode).toBe("dark");
  });
});
