export interface ResearchBrowserState {
  visible: boolean;
  url: string | null;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  error: string | null;
  securityLabel: "secure" | "insecure" | "blocked" | "internal";
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
  openExternal(url: string): Promise<{ ok: boolean; error?: string }>;
  scrapeCurrent(): Promise<{ ok: boolean; source?: ResearchBrowserScrapeResult; error?: string }>;
  captureMetadata(): Promise<{ ok: boolean; metadata?: ResearchBrowserPageMetadata; error?: string }>;
  onStateChanged(callback: (state: ResearchBrowserState) => void): () => void;
}
