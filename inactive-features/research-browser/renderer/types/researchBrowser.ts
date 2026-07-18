export interface ResearchBrowserState {
  visible: boolean;
  url: string | null;
  displayUrl?: string | null;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  error: string | null;
  securityLabel: "secure" | "insecure" | "blocked" | "internal";
  /** Cumulative count of subresource / iframe blocks since the last
   * top-level navigation. Telemetry only — does NOT drive `error` or
   * `securityLabel`. */
  blockedSubresourceCount?: number;
  /** Most recent subresource URL that was blocked, or null if no
   * subresource has been blocked in this navigation. Hidden from the
   * toolbar; surfaced in the diagnostics drawer. */
  lastBlockedSubresourceUrl?: string | null;
}

export interface ResearchBrowserNavigateInput {
  urlOrQuery: string;
  searchProvider?: "google" | "brave";
}

export interface ResearchBrowserBoundsInput {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  geometry?: ResearchBrowserBoundsTelemetry;
}

export interface ResearchBrowserRectTelemetry {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface ResearchBrowserBoundsTelemetry {
  shell: ResearchBrowserRectTelemetry;
  toolbar: ResearchBrowserRectTelemetry;
  viewport: ResearchBrowserRectTelemetry;
  devicePixelRatio: number;
  visualViewport?: {
    offsetTop: number;
    offsetLeft: number;
  };
}

export interface ResearchBrowserScrapeResult {
  provider: "browser" | "venice" | "jina" | "generic-http";
  url: string;
  finalUrl?: string;
  title?: string;
  text?: string;
  markdown?: string;
  excerpt?: string;
  retrievedAt: string;
  metadata?: {
    canonicalUrl?: string;
    description?: string;
    wordCount?: number;
    extractionMethod: string;
  };
}

export interface ResearchBrowserPageMetadata {
  url: string;
  title: string;
  canonicalUrl?: string;
  description?: string;
}

export interface ResearchBrowserThemeSnapshot {
  mode: "dark" | "light";
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  foreground: string;
  foregroundMuted: string;
  foregroundSubtle: string;
  accent: string;
  accentHover: string;
  accentForeground: string;
  focusRing: string;
  glow: string;
}

export interface ResearchBrowserPreloadApi {
  create(): Promise<{ ok: boolean; error?: string }>;
  destroy(): Promise<{ ok: boolean; error?: string }>;
  setVisible(visible: boolean): Promise<{ ok: boolean; error?: string }>;
  setBounds(input: ResearchBrowserBoundsInput): Promise<{ ok: boolean; error?: string }>;
  navigate(input: ResearchBrowserNavigateInput): Promise<{ ok: boolean; state?: ResearchBrowserState; error?: string }>;
  back(): Promise<{ ok: boolean; state?: ResearchBrowserState; error?: string }>;
  forward(): Promise<{ ok: boolean; state?: ResearchBrowserState; error?: string }>;
  reload(): Promise<{ ok: boolean; state?: ResearchBrowserState; error?: string }>;
  stop(): Promise<{ ok: boolean; state?: ResearchBrowserState; error?: string }>;
  getState(): Promise<{ ok: boolean; state?: ResearchBrowserState; error?: string }>;
  /** Renderer-initiated request for the main process to escalte to the system
   *  browser for a URL. Always gated by `research.live_browser_allow_external_open`. */
  requestOpenInSystemBrowser(url: string): Promise<{ ok: boolean; reason?: string; error?: string }>;
  /** Pushes the renderer's current theme snapshot to the main-process browser
   *  so the in-app home/splash matches the active app theme. */
  setTheme(snapshot: ResearchBrowserThemeSnapshot): Promise<{ ok: boolean; error?: string }>;
  scrapeCurrent(): Promise<{ ok: boolean; source?: ResearchBrowserScrapeResult; error?: string }>;
  captureMetadata(): Promise<{ ok: boolean; metadata?: ResearchBrowserPageMetadata; error?: string }>;
  onStateChanged(callback: (state: ResearchBrowserState) => void): () => void;
}
