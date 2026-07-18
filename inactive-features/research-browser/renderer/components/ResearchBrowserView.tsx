import React, { useEffect, useState, useRef } from "react";
import { researchBrowserBridge } from "../../services/researchBrowserBridge";
import { useConfigStore } from "../../stores/config-store";
import type {
  ResearchBrowserBoundsTelemetry,
  ResearchBrowserRectTelemetry,
  ResearchBrowserState,
  ResearchBrowserThemeSnapshot,
} from "../../types/researchBrowser";
import { GenerationLoadingIndicator } from "../generation/GenerationLoadingIndicator";

interface ResearchBrowserViewProps {
  onCaptureWithJina?: (url: string) => void;
  /**
   * Optional URL or search query to navigate to immediately after the browser
   * view has been created and bounds are set for the first time. This is used
   * by SearchScrapeView when a search-result "Open in Browser" click triggers
   * navigation before the Browser subtab has mounted (and therefore before the
   * WebContentsView exists in the main process).
   */
  initialUrl?: string | null;
  /**
   * Called once after the initialUrl has been consumed (navigate called). Use
   * this to clear the pending URL state in the parent so it is not replayed on
   * subsequent mounts.
   */
  onInitialUrlConsumed?: () => void;
}

const MIN_BROWSER_VIEWPORT_SIZE = 100;
const MIN_BROWSER_TOOLBAR_HEIGHT = 32;
const GEOMETRY_EPSILON = 1;
const INTERNAL_HOME_DISPLAY = "Venice Research Home";
const importMetaEnv = (import.meta as { env?: Record<string, string | boolean | undefined> }).env;
const DEBUG_BOUNDS =
  importMetaEnv?.DEV === true && importMetaEnv.VITE_RESEARCH_BROWSER_DEBUG_BOUNDS === "1";

function rectToTelemetry(rect: DOMRect): ResearchBrowserRectTelemetry {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
  };
}

function buildGeometryTelemetry(
  shellRect: DOMRect,
  toolbarRect: DOMRect,
  viewportRect: DOMRect,
): ResearchBrowserBoundsTelemetry {
  const visualViewport = window.visualViewport
    ? {
        offsetTop: Math.round(window.visualViewport.offsetTop),
        offsetLeft: Math.round(window.visualViewport.offsetLeft),
      }
    : undefined;

  return {
    shell: rectToTelemetry(shellRect),
    toolbar: rectToTelemetry(toolbarRect),
    viewport: rectToTelemetry(viewportRect),
    devicePixelRatio: window.devicePixelRatio || 1,
    ...(visualViewport ? { visualViewport } : {}),
  };
}

/** Reads the active app theme off `document.documentElement` and projects it
 *  into the snapshot schema the main process builder expects. Snapshots are
 *  pushed via `researchBrowserBridge.setTheme` so the in-app home page matches
 *  the surrounding UI, regardless of OS prefers-color-scheme.
 *
 *  Falls back to the dark slate palette if a token is not yet bound by
 *  `applyTheme` (e.g. before the first theme render). */
function readThemeSnapshot(): ResearchBrowserThemeSnapshot {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const get = (token: string, fallback: string) => {
    const raw = styles.getPropertyValue(token).trim();
    return raw || fallback;
  };
  // Active theme mode is set on `document.documentElement.dataset.themeMode`
  // by `applyTheme()`. We deliberately do NOT infer mode from the CSS
  // `color-scheme` property — `src/styles/theme.css` sets it to
  // `light dark`, which would always match `"light"` and decay to the wrong
  // fallback palette.
  const datasetMode = root.dataset.themeMode;
  const mode: "light" | "dark" = datasetMode === "light" ? "light" : "dark";
  return {
    mode,
    background: get("--bg", mode === "light" ? "#f7f8fb" : "#101318"),
    surface: get("--surface", mode === "light" ? "#ffffff" : "#141821"),
    surfaceElevated: get("--surface-elevated", mode === "light" ? "#ffffff" : "#171c24"),
    surfaceMuted: get("--surface-muted", mode === "light" ? "#eef0f4" : "#222a36"),
    border: get("--border", mode === "light" ? "#d7dce5" : "#2d3542"),
    borderStrong: get("--border-strong", mode === "light" ? "#b3bac8" : "#3a4452"),
    foreground: get("--text-primary", mode === "light" ? "#172033" : "#eef2f7"),
    foregroundMuted: get("--text-muted", mode === "light" ? "#5d697d" : "#a9b3c2"),
    foregroundSubtle: get("--foreground-subtle", mode === "light" ? "#7a8699" : "#7a8699"),
    accent: get("--accent", mode === "light" ? "#b42318" : "#f97066"),
    accentHover: get("--accent-hover", mode === "light" ? "#8a1c12" : "#ff8a80"),
    accentForeground: get("--accent-fg", mode === "light" ? "#ffffff" : "#0a0a0c"),
    focusRing: get("--info", mode === "light" ? "#1f6feb" : "#6ee7d3"),
    glow: get("--glow", "rgba(110,231,211,0.18)"),
  };
}

function validateBrowserGeometry(geometry: ResearchBrowserBoundsTelemetry): string | null {
  if (geometry.toolbar.height < MIN_BROWSER_TOOLBAR_HEIGHT) {
    return "Research Browser toolbar is not measurable; native browser view hidden.";
  }
  if (
    geometry.viewport.width < MIN_BROWSER_VIEWPORT_SIZE ||
    geometry.viewport.height < MIN_BROWSER_VIEWPORT_SIZE
  ) {
    return "Research Browser viewport is too small; native browser view hidden.";
  }
  if (geometry.viewport.top + GEOMETRY_EPSILON < geometry.toolbar.bottom) {
    return "Research Browser viewport overlaps the toolbar; native browser view hidden.";
  }
  if (geometry.viewport.left + GEOMETRY_EPSILON < geometry.shell.left) {
    return "Research Browser viewport starts outside the browser shell; native browser view hidden.";
  }
  if (geometry.viewport.right > geometry.shell.right + GEOMETRY_EPSILON) {
    return "Research Browser viewport exceeds the browser shell width; native browser view hidden.";
  }
  if (geometry.viewport.bottom > geometry.shell.bottom + GEOMETRY_EPSILON) {
    return "Research Browser viewport exceeds the browser shell height; native browser view hidden.";
  }

  return null;
}

export function ResearchBrowserView({ onCaptureWithJina, initialUrl, onInitialUrlConsumed }: ResearchBrowserViewProps) {
  const [browserState, setBrowserState] = useState<ResearchBrowserState | null>(null);
  const [address, setAddress] = useState("");
  const [lastErrorUrl, setLastErrorUrl] = useState<string | null>(null);
  const [boundsError, setBoundsError] = useState<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Track whether the initialUrl has been consumed so it is only navigated once.
  const initialUrlConsumedRef = useRef(false);
  const browserAvailable = browserState !== null && browserState.error !== "Unavailable in web mode";

  /** Push the active app theme into the WebContentsView so the in-app home
   *  page matches the surrounding UI. Polls once per second and once on
   *  `applyTheme:complete` custom events emitted by the theme system; the
   *  view is unharmed if no events ever fire (the fallback snapshot mirrors
   *  the dark Forge Dracula palette). */
  useEffect(() => {
    if (!browserAvailable) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const push = () => {
      if (cancelled) return;
      void researchBrowserBridge.setTheme(readThemeSnapshot());
    };
    push();
    const onThemeChange = () => push();
    window.addEventListener("applyTheme:complete", onThemeChange);
    timer = setInterval(push, 1000);
    return () => {
      cancelled = true;
      window.removeEventListener("applyTheme:complete", onThemeChange);
      if (timer) clearInterval(timer);
    };
  }, [browserAvailable]);

  /** Renderer-side alias for the live config gate. Subscribed through the
   *  Zustand selector so the button re-renders reactively when the gate flips,
   *  matching the pattern in `SearchScrapeView.tsx`. */
  const allowExternalOpen = useConfigStore(
    (s) => s.config?.research?.live_browser_allow_external_open ?? false,
  );

  const updateAddressFromState = (state: ResearchBrowserState) => {
    const nextAddress = state.displayUrl ?? state.url ?? "";
    if (nextAddress) {
      setAddress(nextAddress);
    }
  };

  useEffect(() => {
    let unmounted = false;

    async function init() {
      const res = await researchBrowserBridge.create();
      if (!res.ok) {
        if (!unmounted) setBrowserState({ 
          visible: false, url: null, title: "", canGoBack: false, canGoForward: false, 
          loading: false, error: res.error || "Unavailable", securityLabel: "blocked" 
        });
        return;
      }
      
      const stateRes = await researchBrowserBridge.getState();
      if (!unmounted && stateRes.ok && stateRes.state) {
        setBrowserState(stateRes.state);
        updateAddressFromState(stateRes.state);
      }

      // If an initialUrl was provided and has not been consumed yet, navigate
      // to it now that the WebContentsView is guaranteed to exist in the main
      // process. Do this before the first setBounds so the page starts loading
      // immediately and the user sees navigation on first paint.
      if (!unmounted && initialUrl && !initialUrlConsumedRef.current) {
        initialUrlConsumedRef.current = true;
        onInitialUrlConsumed?.();
        const navResult = await researchBrowserBridge.navigate({ urlOrQuery: initialUrl });
        if (!unmounted) {
          setAddress(initialUrl);
          if (!navResult.ok && navResult.error) {
            setBrowserState((prev) => prev
              ? { ...prev, error: navResult.error ?? "Navigation failed" }
              : {
                  visible: false, url: null, title: "", canGoBack: false, canGoForward: false,
                  loading: false, error: navResult.error ?? "Navigation failed", securityLabel: "blocked",
                }
            );
          }
        }
      }
    }

    init();

    const unsubscribe = researchBrowserBridge.onStateChanged((state) => {
      if (!unmounted) {
        setBrowserState(state);
        if (state.url && !state.loading) {
          updateAddressFromState(state);
        }
        if (state.error) {
          setLastErrorUrl(state.url);
        }
      }
    });

    return () => {
      unmounted = true;
      unsubscribe();
      // Do not destroy the WebContentsView on ordinary unmount. Hiding lets
      // re-mount keep the existing session, history, and theme snapshot so
      // the user does not have to re-navigate. The session is reused.
      void researchBrowserBridge.setVisible(false);
    };
  // The browser view is created once per mount. The initial URL callback is
  // deliberately consumed by the ref inside this lifecycle, not a restart
  // trigger for the external WebContentsView subscription.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!browserAvailable || !shellRef.current || !toolbarRef.current || !viewportRef.current) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const updateBounds = async () => {
      if (!shellRef.current || !toolbarRef.current || !viewportRef.current) return;
      const shellRect = shellRef.current.getBoundingClientRect();
      const toolbarRect = toolbarRef.current.getBoundingClientRect();
      const viewportRect = viewportRef.current.getBoundingClientRect();
      const geometry = buildGeometryTelemetry(shellRect, toolbarRect, viewportRect);
      const geometryError = validateBrowserGeometry(geometry);

      if (DEBUG_BOUNDS) {
        // eslint-disable-next-line no-console -- opt-in dev-only geometry telemetry; never logs URLs or page text.
        console.debug("[research-browser] renderer bounds", geometry);
      }

      if (geometryError) {
        setBoundsError(geometryError);
        await researchBrowserBridge.setVisible(false);
        return;
      }
      setBoundsError(null);

      const width = Math.round(viewportRect.width);
      const height = Math.round(viewportRect.height);
      // getBoundingClientRect() returns coordinates relative to the renderer
      // viewport (top-left of the web content area). WebContentsView.setBounds()
      // also takes coordinates in the BrowserWindow content-area coordinate space.
      // With a standard (non-hidden) titlebar, these coordinate spaces are the
      // same — no offset correction is needed.
      await researchBrowserBridge.setBounds({
        x: Math.round(viewportRect.x),
        y: Math.round(viewportRect.y),
        width,
        height,
        visible: true,
        geometry,
      });
    };

    // Wrap every layout-affecting notification in a single rAF so that
    // bursts of resize/theme/visualViewport events coalesce into one
    // measurement after the browser has had a chance to settle layout.
    let rafId: number | null = null;
    const scheduleUpdateBounds = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        void updateBounds();
      });
    };
    scheduleUpdateBounds();
    const handleWindowResize = () => {
      scheduleUpdateBounds();
    };
    const handleThemeLayoutChange = () => {
      scheduleUpdateBounds();
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(() => {
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => scheduleUpdateBounds(), 50);
      });
      resizeObserverRef.current.observe(shellRef.current);
      resizeObserverRef.current.observe(toolbarRef.current);
      resizeObserverRef.current.observe(viewportRef.current);
    }
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("applyTheme:complete", handleThemeLayoutChange);

    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const handleVisualViewportChange = () => {
      // Mobile / pinned-window viewport shifts also resize the shell — keep
      // the WebContentsView in sync so it never drifts off the toolbar.
      scheduleUpdateBounds();
    };
    const handleTransition = () => {
      scheduleUpdateBounds();
    };

    if (vv) {
      vv.addEventListener("resize", handleVisualViewportChange);
      vv.addEventListener("scroll", handleVisualViewportChange);
    }

    window.addEventListener("transitionstart", handleTransition);
    window.addEventListener("transitionend", handleTransition);
    window.addEventListener("animationend", handleTransition);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("applyTheme:complete", handleThemeLayoutChange);
      window.removeEventListener("transitionstart", handleTransition);
      window.removeEventListener("transitionend", handleTransition);
      window.removeEventListener("animationend", handleTransition);
      if (vv) {
        vv.removeEventListener("resize", handleVisualViewportChange);
        vv.removeEventListener("scroll", handleVisualViewportChange);
      }
      resizeObserverRef.current?.disconnect();
      void researchBrowserBridge.setVisible(false);
    };
  }, [browserAvailable]);

  const handleNavigate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    if (address.trim() === INTERNAL_HOME_DISPLAY) return;
    setLastErrorUrl(null);
    const result = await researchBrowserBridge.navigate({ urlOrQuery: address });
    if (!result.ok && result.error) {
      setBrowserState((prev) => prev
        ? { ...prev, error: result.error ?? "Navigation failed" }
        : {
            visible: false, url: null, title: "", canGoBack: false, canGoForward: false,
            loading: false, error: result.error ?? "Navigation failed", securityLabel: "blocked",
          }
      );
    }
  };

  const handleOpenExternal = async () => {
    if (!browserState?.url) return;
    const allowExternalOpen = useConfigStore.getState().config?.research?.live_browser_allow_external_open === true;
    if (!allowExternalOpen) return;
    await researchBrowserBridge.requestOpenInSystemBrowser(browserState.url);
  };

  if (browserState?.error === "Unavailable in web mode") {
    return (
      <div className="mesh-panel research-browser-unavailable">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>Live Mini Browser is unavailable in web mode.</p>
          <p className="text-xs mt-2 opacity-75">Use the Venice Forge desktop app to access live research.</p>
        </div>
      </div>
    );
  }

  const actualUrl = browserState?.url ?? null;
  const displayUrl = browserState?.displayUrl ?? actualUrl;
  const isJinaSupported = actualUrl && (actualUrl.startsWith("http://") || actualUrl.startsWith("https://"));
  const errorUrl = browserState?.error ? lastErrorUrl || displayUrl : null;

  return (
    <div
      ref={shellRef}
      data-testid="research-browser-shell"
      className="mesh-panel research-browser-shell flex flex-col h-full w-full"
      data-debug-bounds={DEBUG_BOUNDS ? "true" : "false"}
    >
      <div className="flex flex-col">
        {browserState?.loading && (
          <div className="research-browser-loading-bar">
            <div className="research-browser-loading-bar-fill" />
          </div>
        )}
        {browserState?.error && (
          <div className="research-browser-error-strip">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="truncate">{browserState.error}</span>
            {errorUrl && (
              <span className="research-browser-error-strip-url truncate hidden sm:inline">({errorUrl})</span>
            )}
          </div>
        )}
      </div>

      {/* Browser Toolbar */}
      <div
        ref={toolbarRef}
        data-testid="research-browser-toolbar"
        className="research-browser-toolbar"
        data-debug-bounds={DEBUG_BOUNDS ? "true" : "false"}
      >
        <div className="flex gap-1">
          <button
            className="research-browser-icon-button"
            disabled={!browserState?.canGoBack}
            onClick={() => researchBrowserBridge.back()}
            title="Back"
            aria-label="Back"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            className="research-browser-icon-button"
            disabled={!browserState?.canGoForward}
            onClick={() => researchBrowserBridge.forward()}
            title="Forward"
            aria-label="Forward"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <button
            className="research-browser-icon-button"
            onClick={() => browserState?.loading ? researchBrowserBridge.stop() : researchBrowserBridge.reload()}
            title={browserState?.loading ? "Stop" : "Reload"}
            aria-label={browserState?.loading ? "Stop" : "Reload"}
          >
            {browserState?.loading ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            )}
          </button>
        </div>

        <form onSubmit={handleNavigate} className="flex-1 flex items-center relative">
          <div className="absolute left-3 flex items-center pointer-events-none">
            {browserState?.securityLabel === "secure" && (
              <svg className="w-3 h-3 text-[var(--success)]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
            )}
            {browserState?.securityLabel === "insecure" && (
              <svg className="w-3 h-3 text-[var(--danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            )}
          </div>
          <input
            type="text"
            className="research-browser-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Search or enter website"
            aria-label="Search or enter website"
          />
          {browserState?.loading ? (
            <div className="absolute right-3 flex items-center pointer-events-none">
              <GenerationLoadingIndicator size="sm" state="processing" />
            </div>
          ) : (
            <button 
              type="submit" 
              className="absolute right-2 px-2 py-1.5 min-h-[32px] text-xs bg-[var(--surface-elevated)] border border-[var(--border)] rounded hover:bg-[var(--surface-muted)] transition-colors"
              disabled={!address.trim()}
              aria-label="Go"
            >
              Go
            </button>
          )}
        </form>

        {actualUrl && actualUrl.startsWith("http") && allowExternalOpen && (
          <button
            className="research-browser-icon-button"
            onClick={handleOpenExternal}
            title="Open in system browser"
            aria-label="Open in system browser"
            data-testid="research-browser-open-external"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </button>
        )}

        {isJinaSupported && onCaptureWithJina && (
          <button
            className="research-browser-capture-button"
            onClick={() => actualUrl && onCaptureWithJina(actualUrl)}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            Capture
          </button>
        )}
      </div>

      {/* Browser View Container — the native WebContentsView is composited here */}
      <div
        ref={viewportRef}
        data-testid="research-browser-viewport"
        className="research-browser-viewport"
        data-debug-bounds={DEBUG_BOUNDS ? "true" : "false"}
      >
        {boundsError && (
          <div
            role="alert"
            className="research-browser-viewport-error"
          >
            {boundsError}
          </div>
        )}
      </div>
    </div>
  );
}
