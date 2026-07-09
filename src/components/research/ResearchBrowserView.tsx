import React, { useEffect, useState, useRef } from "react";
import { researchBrowserBridge } from "../../services/researchBrowserBridge";
import type {
  ResearchBrowserBoundsTelemetry,
  ResearchBrowserRectTelemetry,
  ResearchBrowserState,
} from "../../types/researchBrowser";

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
      void researchBrowserBridge.setVisible(false);
      researchBrowserBridge.destroy();
    };
  }, []);

  useEffect(() => {
    if (!browserAvailable || !shellRef.current || !toolbarRef.current || !viewportRef.current) return;

    let debounceTimer: ReturnType<typeof setTimeout>;

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

    updateBounds();
    const handleWindowResize = () => {
      void updateBounds();
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserverRef.current = new ResizeObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(updateBounds, 50);
      });
      resizeObserverRef.current.observe(shellRef.current);
      resizeObserverRef.current.observe(toolbarRef.current);
      resizeObserverRef.current.observe(viewportRef.current);
    }
    window.addEventListener("resize", handleWindowResize);

    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener("resize", handleWindowResize);
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
    await researchBrowserBridge.openExternal(browserState.url);
  };

  if (browserState?.error === "Unavailable in web mode") {
    return (
      <div className="mesh-panel flex items-center justify-center h-full w-full bg-[var(--surface-sunken)] p-4 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)]">
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
      className={`mesh-panel flex flex-col h-full w-full bg-[var(--surface-sunken)] rounded-lg border border-[var(--border-subtle)] overflow-hidden ${DEBUG_BOUNDS ? "outline outline-1 outline-[var(--tone-info,var(--brand-primary))]" : ""}`}
    >
      <div className="flex flex-col">
        {browserState?.loading && (
          <div className="h-0.5 bg-[var(--surface-base)]">
            <div className="h-full bg-[var(--brand-primary)] animate-[loadingBar_2s_ease-in-out_infinite] w-[30%]" />
          </div>
        )}
        {browserState?.error && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--tone-error-bg,var(--surface-raised))] border-b border-[var(--border-subtle)] text-[var(--tone-error)] text-xs">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="truncate">{browserState.error}</span>
            {errorUrl && (
              <span className="text-[var(--text-muted)] truncate hidden sm:inline">({errorUrl})</span>
            )}
          </div>
        )}
      </div>

      {/* Browser Toolbar */}
      <div
        ref={toolbarRef}
        data-testid="research-browser-toolbar"
        className={`flex items-center gap-2 p-2 bg-[var(--surface-raised)] border-b border-[var(--border-subtle)] ${DEBUG_BOUNDS ? "outline outline-1 outline-[var(--tone-warning,var(--brand-primary))] outline-offset-[-1px]" : ""}`}
      >
        <div className="flex gap-1">
          <button 
            className="p-1.5 rounded hover:bg-[var(--surface-hover)] disabled:opacity-30 transition-colors"
            disabled={!browserState?.canGoBack}
            onClick={() => researchBrowserBridge.back()}
            title="Back"
            aria-label="Back"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button 
            className="p-1.5 rounded hover:bg-[var(--surface-hover)] disabled:opacity-30 transition-colors"
            disabled={!browserState?.canGoForward}
            onClick={() => researchBrowserBridge.forward()}
            title="Forward"
            aria-label="Forward"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
          <button 
            className="p-1.5 rounded hover:bg-[var(--surface-hover)] transition-colors"
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
              <svg className="w-3 h-3 text-[var(--tone-success)]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
            )}
            {browserState?.securityLabel === "insecure" && (
              <svg className="w-3 h-3 text-[var(--tone-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            )}
          </div>
          <input
            type="text"
            className="w-full bg-[var(--surface-base)] border border-[var(--border-subtle)] rounded-full px-8 py-1 text-sm focus:outline-none focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Search or enter website"
            aria-label="Search or enter website"
          />
          {browserState?.loading && (
            <div className="absolute right-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 animate-spin text-[var(--text-muted)]" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
          )}
        </form>

        {actualUrl && actualUrl.startsWith("http") && (
          <button
            className="p-1.5 rounded hover:bg-[var(--surface-hover)] transition-colors"
            onClick={handleOpenExternal}
            title="Open in system browser"
            aria-label="Open in system browser"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </button>
        )}

        {isJinaSupported && onCaptureWithJina && (
          <button 
            className="flex items-center gap-1 px-3 py-1 bg-[var(--brand-primary)] text-[var(--brand-primary-fg,var(--surface))] text-xs font-medium rounded hover:bg-opacity-90 transition-colors"
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
        className={`research-browser-viewport flex-1 min-h-0 w-full relative ${DEBUG_BOUNDS ? "outline outline-1 outline-[var(--tone-success,var(--brand-primary))] outline-offset-[-2px]" : ""}`}
      >
        {boundsError && (
          <div
            role="alert"
            className="absolute inset-0 flex items-center justify-center bg-[var(--surface-sunken)] p-4 text-center text-sm text-[var(--tone-error)]"
          >
            {boundsError}
          </div>
        )}
      </div>
    </div>
  );
}
