import { translateRuntime } from "../i18n/runtimeTranslator";
import { resolvePlayableMediaUrl } from "./playableMediaUrl";

/** @fileoverview Electron vs. web mode abstraction — never call window.veniceForge directly from modules. */

// Code Owner: fayeblade (@spearchucker667)
import "../types/desktop";
import type {
  EncryptedBackupManifestTransport,
  ProviderSettingsSnapshot,
  SyncRuntimeStatus,
  VeniceForgeDiagnostics,
  VeniceForgeRequest,
  VeniceForgeResponse,
} from "../types/desktop";
import type { SafetyRuntimeStatus } from "../shared/safety/safetyRuntimeStatus";
import { assembleSafetyRuntimeStatus } from "../shared/safety/safetyRuntimeStatus";
import { getSemanticClassifierStatus } from "../shared/safety/mediaScreener";
import type { ApiConnectivityStatus } from "../types/api-connectivity";
import type { Conversation } from "../types/conversation";
import type {
  CharacterCardV1,
  LorebookV1,
  RpAssetV1,
  RpChatV1,
  ScenarioV1,
  UserPersonaV1,
} from "../types/rp";
import type { MutationOrigin } from "../types/sync";
import type {
  BackgroundTask,
  BackgroundTaskCreateInput,
  BackgroundTaskIpcEnvelope,
} from "../types/background-task";
import { veniceFetch } from "./veniceClient";
import type { ProviderCredential } from "../types/provider";
import type { VeniceStreamDelta } from "../shared/veniceStreamDelta";
import {
  buildInspectorTelemetryPatch,
  maskInspectorHeaders,
  sanitizeInspectorPayload,
  sanitizeInspectorResponse,
} from "./inspectorTelemetry";
import { useInspectorStore } from "../stores/inspector-store";
import { useSettingsStore } from "../stores/settings-store";
import { isPrimaryApiRouteId } from "../shared/primaryApiRoute";
import { getActiveProfileId } from "./activeProfile";
import { VENICE_MAX_BODY_BYTES } from "../shared/limits";

/**
 * Detects whether the app is currently running inside the Electron desktop shell.
 * @returns True when running in Electron desktop mode.
 */

export function isElectron(): boolean {
  return (
    typeof window !== "undefined" && window.veniceForge?.isDesktop === true
  );
}

/**
 * Initializes the desktop bridge by pinging the main process diagnostics endpoint.
 * @returns A promise that resolves once the handshake is complete.
 */
export async function initDesktopBridge(): Promise<void> {
  if (!isElectron()) return;
  await window.veniceForge!.app.getDiagnostics();
}

/**
 * Generates a unique signal identifier for cancellable desktop requests.
 * @returns A random UUID string.
 */
function createSignalId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/**
 * Attaches an AbortSignal to a desktop request so the main process can cancel it.
 * @param signalId The unique signal identifier for the request.
 * @param signal The optional AbortSignal to observe.
 * @returns A cleanup function that removes the abort listener, or undefined if no signal was provided.
 */
function attachAbort(
  signalId: string,
  signal?: AbortSignal,
): (() => void) | undefined {
  if (!signal) return undefined;
  const abort = () => {
    window.veniceForge?.venice.abort(signalId).catch(() => {});
  };
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
}

/** Wraps desktop Venice API requests with signal-based cancellation. */
export const desktopVenice = {
  /**
   * Sends a single Venice API request through the desktop IPC bridge.
   * @param input The request payload including endpoint, method, body, and headers.
   * @param signal An optional abort signal for cancellation.
   * @returns A promise resolving to the Venice API response.
   */
  async request(
    input: VeniceForgeRequest,
    signal?: AbortSignal,
  ): Promise<VeniceForgeResponse> {
    if (!isElectron())
      throw new Error(
        "Venice desktop transport is only available in desktop mode.",
      );
    const signalId = input.signalId || createSignalId();
    const cleanup = attachAbort(signalId, signal);
    try {
      return await window.veniceForge!.venice.request({
        ...input,
        signalId,
        profileId: getActiveProfileId(),
        agentSessionId: input.agentSessionId,
        
      });
    } finally {
      cleanup?.();
    }
  },

  /**
   * Streams a chat completion through the desktop IPC bridge.
   * @param input The request payload.
   * @param onDelta Callback invoked for each streamed delta chunk.
   * @param signal An optional abort signal for cancellation.
   * @returns A promise resolving once the stream completes.
   */
  async streamChat(
    input: VeniceForgeRequest,
    onDelta: (chunk: VeniceStreamDelta) => void,
    signal?: AbortSignal,
  ): Promise<VeniceForgeResponse> {
    if (!isElectron())
      throw new Error(
        "Venice desktop transport is only available in desktop mode.",
      );
    const signalId = input.signalId || createSignalId();
    const cleanup = attachAbort(signalId, signal);
    try {
      return await window.veniceForge!.venice.streamChat(
        {
          ...input,
          signalId,
          profileId: getActiveProfileId(),
          agentSessionId: input.agentSessionId,
          
        },
        onDelta,
      );
    } finally {
      cleanup?.();
    }
  },
};

/** Ephemeral web-session Venice key container with TTL and auto-cleanup (AUDIT-002). */
const _webSessionVeniceApiKey = {
  value: "",
  setAt: 0,
  /** 24-hour TTL for the ephemeral session key. */
  TTL_MS: 24 * 60 * 60 * 1000,
  get isConfigured(): boolean {
    return this.value.length > 0 && Date.now() - this.setAt < this.TTL_MS;
  },
  get key(): string {
    return this.isConfigured ? this.value : "";
  },
  set(key: string) {
    this.value = key;
    this.setAt = Date.now();
  },
  clear() {
    this.value = "";
    this.setAt = 0;
  },
};

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () =>
    _webSessionVeniceApiKey.clear(),
  );
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Manages the Venice API key across desktop and web storage backends. */
export const desktopApiKey = {
  /**
   * Checks whether an API key has been configured.
   * @returns A promise resolving to true if a key is present.
   */
  async isConfigured(): Promise<boolean> {
    if (isElectron())
      return window.veniceForge!.apiKey.isConfigured(getActiveProfileId());
    try {
      const response = await fetchWithTimeout("/api/session-key");
      if (!response.ok) return _webSessionVeniceApiKey.isConfigured;
      const payload = (await response.json().catch(() => null)) as {
        configured?: unknown;
      } | null;
      return payload?.configured === true;
    } catch {
      return _webSessionVeniceApiKey.isConfigured;
    }
  },

  async getStatus(): Promise<import("../types/api-connectivity").ApiKeyConfigurationStatus> {
    if (isElectron())
      return window.veniceForge!.apiKey.getStatus(getActiveProfileId());
    try {
      const isConf = await this.isConfigured();
      if (!isConf) return { configured: false, state: "not-configured", storageMode: "unavailable" };
      return { configured: true, state: "configured", storageMode: "plaintext-fallback" };
    } catch {
      return { configured: false, state: "not-configured", storageMode: "unavailable" };
    }
  },

  /**
   * Stores the Venice API key securely.
   * @param key The API key string to persist.
   * @returns A promise resolving to an ok flag.
   */
  async set(key: string): Promise<import("../types/api-connectivity").ApiKeyMutationResult> {
    if (isElectron())
      return window.veniceForge!.apiKey.set(key, getActiveProfileId());
    const response = await fetchWithTimeout("/api/session-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (!response.ok) return { ok: false, code: "UNKNOWN_ERROR", safeMessage: "Web session persistence failed." };
    _webSessionVeniceApiKey.set(key);
    return { ok: true, storageMode: "plaintext-fallback" };
  },

  /**
   * Deletes the stored API key.
   */
  async delete(profileId?: string): Promise<import("../types/api-connectivity").ApiKeyMutationResult> {
    if (isElectron())
      return window.veniceForge!.apiKey.delete(profileId ?? getActiveProfileId());
    const response = await fetchWithTimeout("/api/session-key", {
      method: "DELETE",
    });
    if (!response.ok) return { ok: false, code: "UNKNOWN_ERROR", safeMessage: "Web session deletion failed." };
    _webSessionVeniceApiKey.clear();
    return { ok: true, storageMode: "plaintext-fallback" };
  },

  /**
   * Tests the configured API key by listing models.
   * @returns A promise resolving to the test result, status, and message.
   */
  async test(): Promise<{
    ok: boolean;
    status?: number;
    message: string;
    connectivity?: ApiConnectivityStatus;
  }> {
    if (isElectron())
      return window.veniceForge!.apiKey.test(getActiveProfileId());
    try {
      const { response } = await veniceFetch("/models", { retry: false });
      const checkedAt = new Date().toISOString();
      const connectivity: ApiConnectivityStatus = response.ok
        ? {
            ok: true,
            kind: "verified",
            checkedAt,
            statusCode: response.status,
            endpoint: "models",
          }
        : {
            ok: false,
            kind:
              response.status === 401 || response.status === 403
                ? "invalid-api-key"
                : "catalog-failure",
            checkedAt,
            statusCode: response.status,
            safeMessage:
              response.status === 401 || response.status === 403
                ? "API key was found, but Venice rejected it. Re-enter the key in Config."
                : "Model catalog failed to load from Venice. Chat may still work if a model is already selected.",
            retryable: [408, 429, 500, 502, 503, 504].includes(response.status),
          };
      return {
        ok: response.ok,
        status: response.status,
        message: response.statusText,
        connectivity,
      };
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status: number }).status
          : undefined;
      return {
        ok: false,
        status,
        message:
          err instanceof Error
            ? err.message
            : translateRuntime(
                "runtimeGenerated.services.desktopbridge.metadata.requestFailed",
                "Request failed",
              ),
        connectivity: {
          ok: false,
          kind:
            status === 404 || status === 502
              ? "proxy-failure"
              : "network-failure",
          checkedAt: new Date().toISOString(),
          statusCode: status,
          safeMessage:
            status === 404 || status === 502
              ? "Local web proxy failed before Venice could respond. Check the dev server."
              : "Network request failed before Venice responded. Check connection, proxy, VPN, or firewall.",
          retryable: true,
        },
      };
    }
  },
};

const webModeNotSupportedMessage = () =>
  translateRuntime(
    "runtimeGenerated.services.desktopbridge.error.notSupportedInWebMode",
    "Not supported in web mode",
  );

/** Bridge interface for fallback provider API keys. */
export const desktopProviderApiKey = {
  async isConfigured(providerId: string): Promise<boolean> {
    if (isElectron())
      return window.veniceForge!.providerApiKey.isConfigured(
        providerId,
        getActiveProfileId(),
      );
    return false; // For now, no web session mock for fallback providers
  },

  async set(
    providerId: string,
    key: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (isElectron())
      return window.veniceForge!.providerApiKey.set(
        providerId,
        key,
        getActiveProfileId(),
      );
    return { ok: false, error: webModeNotSupportedMessage() };
  },

  async delete(providerId: string): Promise<{ ok: boolean; error?: string }> {
    if (isElectron())
      return window.veniceForge!.providerApiKey.delete(
        providerId,
        getActiveProfileId(),
      );
    return { ok: false, error: webModeNotSupportedMessage() };
  },

  async test(
    providerId: string,
  ): Promise<{ ok: boolean; status?: number; message: string; connectivity?: ApiConnectivityStatus }> {
    if (isElectron())
      return window.veniceForge!.providerApiKey.test(
        providerId,
        getActiveProfileId(),
      );
    return { ok: false, message: webModeNotSupportedMessage() };
  },
};

/** Bridge interface for structured fallback provider credentials (Azure, Bedrock, Vertex). */
export const desktopProviderCredential = {
  async isConfigured(providerId: string): Promise<boolean> {
    if (isElectron())
      return window.veniceForge!.providerCredential.isConfigured(
        providerId,
        getActiveProfileId(),
      );
    return false;
  },

  async set(
    providerId: string,
    credential: ProviderCredential,
  ): Promise<{ ok: boolean; error?: string }> {
    if (isElectron())
      return window.veniceForge!.providerCredential.set(
        providerId,
        credential,
        getActiveProfileId(),
      );
    return { ok: false, error: webModeNotSupportedMessage() };
  },

  async delete(providerId: string): Promise<{ ok: boolean; error?: string }> {
    if (isElectron())
      return window.veniceForge!.providerCredential.delete(
        providerId,
        getActiveProfileId(),
      );
    return { ok: false, error: webModeNotSupportedMessage() };
  },

  async test(
    providerId: string,
  ): Promise<{ ok: boolean; status?: number; message: string; connectivity?: ApiConnectivityStatus }> {
    if (isElectron())
      return window.veniceForge!.providerCredential.test(
        providerId,
        getActiveProfileId(),
      );
    return { ok: false, message: webModeNotSupportedMessage() };
  },
};

/** Main-authoritative fallback-provider consent and routing settings. */
export const desktopProviderSettings = {
  async get(): Promise<ProviderSettingsSnapshot> {
    if (isElectron()) {
      const settings = await window.veniceForge!.providerSettings.get();
      useSettingsStore.setState({
        enabledProviders: settings.enabledProviders,
        autoFallbackEnabled: settings.autoFallbackEnabled,
        fallbackOrdering: settings.fallbackOrdering,
        primaryApiRoute: settings.primaryApiRoute,
      });
      return settings;
    }
    const response = await fetch("/api/runtime-config", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to read server primary API route");
    const runtimeConfig: unknown = await response.json();
    const route = runtimeConfig && typeof runtimeConfig === "object"
      ? (runtimeConfig as Record<string, unknown>).primaryApiRoute : undefined;
    if (!isPrimaryApiRouteId(route)) throw new Error("Invalid server primary API route");
    useSettingsStore.getState().setPrimaryApiRoute(route);
    const state = useSettingsStore.getState();
    return {
      enabledProviders: state.enabledProviders,
      autoFallbackEnabled: state.autoFallbackEnabled,
      fallbackOrdering:
        state.fallbackOrdering as ProviderSettingsSnapshot["fallbackOrdering"],
      nativeFallbackModels: {},
      primaryApiRoute: state.primaryApiRoute,
    };
  },

  async update(input: {
    enabledProviders?: Record<string, boolean>;
    autoFallbackEnabled?: boolean;
    fallbackOrdering?: string[];
    primaryApiRoute?: ProviderSettingsSnapshot["primaryApiRoute"];
  }): Promise<{
    ok: boolean;
    settings?: ProviderSettingsSnapshot;
    error?: string;
  }> {
    if (isElectron()) {
      const result = await window.veniceForge!.providerSettings.update(input);
      if (result.ok && result.settings) {
        // Mirror the authoritative settings back into the renderer.
        useSettingsStore.setState({
          enabledProviders: result.settings.enabledProviders,
          autoFallbackEnabled: result.settings.autoFallbackEnabled,
          fallbackOrdering: result.settings.fallbackOrdering,
          primaryApiRoute: result.settings.primaryApiRoute,
        });
      } else if (!result.ok) {
        // handoff §6.3: failed IPC persistence must roll UI state back.
        // Re-hydrate the renderer from the authoritative store so the
        // next render does not show a stale "primaryApiRoute" value the
        // user just selected but the main process rejected.
        await this.get();
      }
      return result;
    }
    if (input.primaryApiRoute !== undefined) {
      return { ok: false, error: "Web primary API route is server-controlled" };
    }
    return { ok: true, settings: await this.get() };
  },
};

/** Profile-authoritative desktop TTS bridge. Raw renderer profile selectors are never accepted. */
export const desktopTts = {
  synthesize(
    options: { text: string; model?: string; voice?: string; speed?: number },
    cacheEnabled: boolean,
  ) {
    if (!isElectron())
      return Promise.resolve({
        ok: false as const,
        error: "Text-to-speech is available in the desktop app.",
      });
    return window.veniceForge!.tts.synthesize(options, cacheEnabled);
  },
  clearCache() {
    if (!isElectron())
      return Promise.resolve({
        ok: false as const,
        error: "The TTS cache is available in the desktop app.",
      });
    return window.veniceForge!.tts.clearCache();
  },
};

/** Exposes app-level metadata and desktop-specific utilities. */
export const desktopApp = {
  /**
   * Retrieves the current application version.
   * @returns A promise resolving to the version string, or "web" in browser mode.
   */
  getVersion(): Promise<string> {
    if (!isElectron()) return Promise.resolve("web");
    return window.veniceForge!.app.getVersion();
  },

  /**
   * Checks whether OS-level encryption is available for key storage.
   * @returns A promise resolving to true if encryption is available.
   */
  isEncryptionAvailable(): Promise<boolean> {
    if (!isElectron()) return Promise.resolve(false);
    return window.veniceForge!.app.isEncryptionAvailable();
  },

  /**
   * Fetches diagnostic information about the app environment.
   * @returns A promise resolving to a diagnostics snapshot.
   */
  getDiagnostics(): Promise<VeniceForgeDiagnostics> {
    if (!isElectron()) {
      return Promise.resolve({
        isDesktop: false,
        appVersion: "web",
        userDataPath: "IndexedDB (browser)",
        storageMode: "web",
        secureStorageAvailable: false,
        apiKeyConfigured: false,
        transport: "web-proxy",
        // VF-AUD-20260916-P2-006 — web-mode fallback reports truthful
        // structural-only state (no semantic ML backend is registered in
        // the renderer-shared screener either).
        mediaClassifierCapabilities: {
          semanticImageClassifier: "unavailable",
          semanticAudioClassifier: "unavailable",
          semanticVideoClassifier: "unavailable",
          hasRegisteredBackend: false,
        },
      });
    }
    return window.veniceForge!.app.getDiagnostics();
  },

  /**
   * Fetches the live safety runtime status (local safeguards, provider
   * safe_mode, structural validation counters, semantic classifier backend).
   * Web mode derives the status from the local renderer state so the Status
   * tab never crashes when the desktop-only fields are absent.
   */
  getSafetyRuntimeStatus(): Promise<SafetyRuntimeStatus | null> {
    if (!isElectron()) {
      const settings = useSettingsStore.getState();
      return Promise.resolve(
        assembleSafetyRuntimeStatus({
          localSafeguards: {
            enabled: settings.localFamilySafeModeEnabled === true,
            // Web deployments enforce safeguards at the proxy/server boundary.
            source: "server",
          },
          providerSafety: { safeMode: settings.veniceApiSafeMode === true },
          semanticClassifiers: getSemanticClassifierStatus(),
        }),
      );
    }
    return window.veniceForge!.app.getSafetyRuntimeStatus();
  },

  /**
   * Opens the log folder in the OS file explorer.
   * @returns A promise resolving to the open result and path.
   */
  openLogsFolder(): Promise<{ ok: boolean; path: string }> {
    if (!isElectron()) return Promise.resolve({ ok: false, path: "" });
    return window.veniceForge!.app.openLogsFolder();
  },

  /**
   * Proxies a generic scrape request through the main process to enforce SSRF safety.
   * @param url The URL to scrape.
   */
  proxyScrape(url: string): Promise<{
    ok: boolean;
    data?: { url: string; finalUrl: string; contentType: string; body: string };
    error?: string;
  }> {
    if (!isElectron())
      return Promise.resolve({
        ok: false,
        error: "Only available in desktop mode",
      });
    return window.veniceForge!.app.proxyScrape(url);
  },
};

/** Proxies background task commands to the persistent main-process manager. */
export const desktopBackgroundTask = {
  subscribe(): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return Promise.resolve({ ok: false, error: "Not in Electron" });
    return window.veniceForge!.backgroundTask.subscribe();
  },
  unsubscribe(): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return Promise.resolve({ ok: false, error: "Not in Electron" });
    return window.veniceForge!.backgroundTask.unsubscribe();
  },
  create(
    input: BackgroundTaskCreateInput,
  ): Promise<{ ok: boolean; task?: BackgroundTask; error?: string }> {
    if (!isElectron())
      return Promise.resolve({ ok: false, error: "Not in Electron" });
    return window.veniceForge!.backgroundTask.create(input);
  },
  update(
    taskId: string,
    updates: Partial<BackgroundTask>,
  ): Promise<{ ok: boolean; task?: BackgroundTask | null; error?: string }> {
    if (!isElectron())
      return Promise.resolve({ ok: false, error: "Not in Electron" });
    return window.veniceForge!.backgroundTask.update(taskId, updates);
  },
  list(): Promise<{ ok: boolean; tasks?: BackgroundTask[]; error?: string }> {
    if (!isElectron())
      return Promise.resolve({ ok: false, error: "Not in Electron" });
    return window.veniceForge!.backgroundTask.list();
  },
  cancel(
    taskId: string,
  ): Promise<{ ok: boolean; task?: BackgroundTask | null; error?: string }> {
    if (!isElectron())
      return Promise.resolve({ ok: false, error: "Not in Electron" });
    return window.veniceForge!.backgroundTask.cancel(taskId);
  },
  retry(
    taskId: string,
  ): Promise<{ ok: boolean; task?: BackgroundTask | null; error?: string }> {
    if (!isElectron())
      return Promise.resolve({ ok: false, error: "Not in Electron" });
    return window.veniceForge!.backgroundTask.retry(taskId);
  },
  clear(taskId: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return Promise.resolve({ ok: false, error: "Not in Electron" });
    return window.veniceForge!.backgroundTask.clear(taskId);
  },
  submitPaidQueue(input: {
    operation: 'video' | 'audio';
    wirePayload: Record<string, unknown>;
    logicalRequestHash?: string;
  }): Promise<{ ok: boolean; task?: BackgroundTask; error?: string; challenge?: unknown }> {
    if (!isElectron()) {
      return Promise.resolve({ ok: false, error: "Paid queue submission via desktop bridge is only in Electron" });
    }
    return window.veniceForge!.backgroundTask.submitPaidQueue(input);
  },
  onUpdate(
    callback: (envelope: BackgroundTaskIpcEnvelope) => void,
  ): () => void {
    if (!isElectron()) return () => {};
    return window.veniceForge!.backgroundTask.onUpdate(callback);
  },
};

/** Narrow Image Inspector bridge. Media bytes remain main-owned until explicitly
 * requested for a bounded Venice vision call. */
export const desktopImageInspector = {
  chooseImage() {
    if (!isElectron()) {
      return Promise.resolve({
        ok: false as const,
        error: "Image Inspector is only available in the desktop app.",
      });
    }
    return window.veniceForge!.imageInspector.chooseImage();
  },
  ingestClipboardImage() {
    if (!isElectron()) {
      return Promise.resolve({
        ok: false as const,
        error: "Image Inspector is only available in the desktop app.",
      });
    }
    return window.veniceForge!.imageInspector.ingestClipboardImage();
  },
  resolveMediaInput(input: {
    mediaId: string;
    type?: "app-media" | "attachment";
  }) {
    if (!isElectron()) {
      return Promise.resolve({
        ok: false as const,
        error: "Image Inspector is only available in the desktop app.",
      });
    }
    return window.veniceForge!.imageInspector.resolveMediaInput(input);
  },
  readMediaDataUrl(input: { mediaId: string }) {
    if (!isElectron()) {
      return Promise.resolve({
        ok: false as const,
        error: "Image Inspector is only available in the desktop app.",
      });
    }
    return window.veniceForge!.imageInspector.readMediaDataUrl(input);
  },
};

/** Inspector Telemetry bridge — surfaces events from the main-process
 *  Inspector telemetry bus (see `electron/services/inspectorTelemetry.ts`)
 *  to renderer-side code. In web mode the subscription is a no-op so callers
 *  don't have to guard the transport split. */
export const desktopInspector = {
  onTelemetry(callback: (event: import("../shared/inspectorTelemetryContracts").InspectorTelemetryEvent) => void): () => void {
    if (!isElectron()) {
      return () => {};
    }
    return window.veniceForge!.inspector.onTelemetry(callback);
  },
};

/** Handles JSON file export and import, falling back to browser downloads in web mode. */
export const desktopFiles = {
  /**
   * Exports data as a JSON file via native dialog or browser download.
   * @param data The data to serialize and save.
   * @param defaultPath The suggested filename.
   * @returns A promise resolving to true if the save succeeded.
   */
  async exportJson(
    data: unknown,
    defaultPath = "venice-forge-export.json",
  ): Promise<boolean> {
    const json =
      typeof data === "string" ? data : JSON.stringify(data, null, 2);
    if (!isElectron()) {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultPath;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return true;
    }
    const result = await window.veniceForge!.files.saveJsonFile(
      json,
      defaultPath,
    );
    return result.ok;
  },

  /**
   * Exports data as a `.vfbackup` (or any other named extension) encrypted
   * backup. The caller passes the *encrypted* JSON string (already produced
   * by `createEncryptedBackup`) and the suggested filename. The desktop
   * bridge strips any redundant `.json` suffix on the filename so the save
   * dialog does not double-extend the file on macOS. The returned
   * `filePath` is the absolute path the user chose, so the renderer can
   * show a "Backup saved to …" confirmation.
   */
  async exportBackupFile(
    encryptedJson: string,
    defaultPath = `venice-forge-${new Date().toISOString().slice(0, 10)}.vfbackup`,
  ): Promise<{ ok: boolean; canceled: boolean; filePath?: string; error?: string }> {
    if (!isElectron()) {
      const blob = new Blob([encryptedJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultPath;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return { ok: true, canceled: false };
    }
    return await window.veniceForge!.files.saveJsonFile(encryptedJson, defaultPath);
  },

  /**
   * Imports a JSON string via native file dialog (desktop) or browser file picker (web).
   * @returns A promise resolving to the file contents, or null if cancelled.
   */
  async importJsonString(): Promise<string | null> {
    if (!isElectron()) {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json,.vfbackup";
        input.style.display = "none";

        function cleanup() {
          setTimeout(() => input.remove(), 0);
        }

        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file) {
            cleanup();
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            cleanup();
            resolve(String(reader.result));
          };
          reader.onerror = () => {
            cleanup();
            resolve(null);
          };
          reader.readAsText(file);
        });

        // `cancel` fires in Chrome 113+/Firefox 91+ when the user dismisses
        // the picker without selecting a file.
        input.addEventListener("cancel", () => {
          cleanup();
          resolve(null);
        });

        document.body.appendChild(input);
        input.click();
      });
    }
    const result = await window.veniceForge!.files.loadJsonFile();
    if (result.canceled) return null;
    if (!result.ok)
      throw new Error(result.error || "Failed to import JSON file.");
    if (!result.data) throw new Error("Selected JSON file is empty.");
    return result.data;
  },

  async exportYaml(data: string, defaultPath = "theme.yaml"): Promise<boolean> {
    if (!isElectron()) {
      const blob = new Blob([data], { type: "text/yaml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = defaultPath;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return true;
    }
    const result = await window.veniceForge!.files.saveYamlFile(
      data,
      defaultPath,
    );
    return result.ok;
  },

  async importYamlString(): Promise<string | null> {
    if (!isElectron()) {
      return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".yaml,.yml";
        input.style.display = "none";

        function cleanup() {
          setTimeout(() => input.remove(), 0);
        }

        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file) {
            cleanup();
            resolve(null);
            return;
          }
          if (file.size > VENICE_MAX_BODY_BYTES) {
            cleanup();
            reject(new Error("Import file is too large."));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            cleanup();
            resolve(String(reader.result));
          };
          reader.onerror = () => {
            cleanup();
            resolve(null);
          };
          reader.readAsText(file);
        });

        input.addEventListener("cancel", () => {
          cleanup();
          resolve(null);
        });

        document.body.appendChild(input);
        input.click();
      });
    }
    const result = await window.veniceForge!.files.loadYamlFile();
    if (result.canceled) return null;
    if (!result.ok)
      throw new Error(result.error || "Failed to import YAML file.");
    if (!result.data) throw new Error("Selected YAML file is empty.");
    return result.data;
  },
};

/** Reads a local file via the main process (desktop only). */

/** Proxies sync folder commands. */
export const desktopSync = {
  async chooseSyncFolder() {
    if (isElectron()) return window.veniceForge!.sync.chooseSyncFolder();
    return { ok: false, error: "Not in Electron" };
  },
  async getSyncFolder(): Promise<
    | ({ ok: true; path?: string | null } & SyncRuntimeStatus)
    | { ok: false; error: string }
  > {
    if (isElectron()) return window.veniceForge!.sync.getSyncFolder();
    return { ok: false, error: "Not in Electron" };
  },
  async setSyncFolder(params: { path: string }) {
    if (isElectron()) return window.veniceForge!.sync.setSyncFolder(params);
    return { ok: false, error: "Not in Electron" };
  },
  async startSync(params: {
    password: string;
    profileId: string;
    includeMedia?: boolean;
  }) {
    if (isElectron()) return window.veniceForge!.sync.startSync(params);
    return { ok: false, error: "Not in Electron" };
  },
  async applyRemoteMutation(params: {
    storeName: string;
    id: string;
    recordJson?: string;
    delete?: boolean;
    remoteApplyToken: string;
  }) {
    if (isElectron())
      return window.veniceForge!.sync.applyRemoteMutation(params);
    return { ok: false, error: "Not in Electron" };
  },
  async stopSync() {
    if (isElectron()) return window.veniceForge!.sync.stopSync();
    return { ok: false, error: "Not in Electron" };
  },
  async pauseSync() {
    if (isElectron()) return window.veniceForge!.sync.pauseSync();
    return { ok: false, error: "Not in Electron" };
  },
  async getStatus(): Promise<{ ok: boolean } & SyncRuntimeStatus> {
    if (isElectron()) return window.veniceForge!.sync.getStatus();
    return {
      ok: true,
      configured: false,
      mainWatcher: "stopped" as const,
      rendererSessionAttached: false,
      authenticated: false,
    };
  },
  async setRendererSessionAttached(params: {
    attached: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    if (isElectron())
      return window.veniceForge!.sync.setRendererSessionAttached(params);
    return { ok: true };
  },
  async setEmissionSuppressed(params: {
    suppressed: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    if (isElectron())
      return window.veniceForge!.sync.setEmissionSuppressed(params);
    return { ok: true };
  },
  async writePacket(params: {
    storeName: string;
    id: string;
    recordJson: string;
  }): Promise<{ ok: boolean; error?: string }> {
    if (isElectron()) return window.veniceForge!.sync.writePacket(params);
    return { ok: false, error: "Not supported in Web" };
  },
  async acknowledgeOperation(params: {
    operationId: string;
    ok: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    if (isElectron())
      return window.veniceForge!.sync.acknowledgeOperation(params);
    return { ok: false, error: "Not supported in Web" };
  },
  onRemoteChange(
    callback: (event: {
      storeName: string;
      id: string;
      operationId: string;
      recordJson: string;
      remoteApplyToken: string;
    }) => void,
  ) {
    if (isElectron()) return window.veniceForge!.sync.onRemoteChange(callback);
    return () => {};
  },
  async beginBackupExport(): Promise<{
    ok: boolean;
    profileId?: string;
    deviceId?: string;
    token?: string;
    error?: string;
  }> {
    if (isElectron()) return window.veniceForge!.sync.beginBackupExport();
    return { ok: false, error: "Not supported in Web" };
  },
  async encryptBackup(
    payload: string,
    password: string,
    token: string,
  ): Promise<{
    ok: boolean;
    data?: { salt: string; iv: string; ciphertext: string };
    error?: string;
  }> {
    if (isElectron())
      return window.veniceForge!.sync.encryptBackup({
        payload,
        password,
        token,
      });
    return { ok: false, error: "Not supported in Web" };
  },
  async decryptBackup(
    ciphertext: string,
    salt: string,
    iv: string,
    password: string,
  ): Promise<{ ok: boolean; data?: string; error?: string }> {
    if (isElectron())
      return window.veniceForge!.sync.decryptBackup({
        ciphertext,
        salt,
        iv,
        password,
      });
    return { ok: false, error: "Not supported in Web" };
  },
  async createReplaceImportRecovery(params: {
    manifest: EncryptedBackupManifestTransport;
    password: string;
  }) {
    if (isElectron())
      return window.veniceForge!.sync.createReplaceImportRecovery(params);
    return { ok: false, error: "Not supported in Web" };
  },
  async getLatestReplaceImportRecovery() {
    if (isElectron())
      return window.veniceForge!.sync.getLatestReplaceImportRecovery();
    return { ok: false, error: "Not supported in Web" };
  },
  async loadReplaceImportRecovery(params: { id: string; password: string }) {
    if (isElectron())
      return window.veniceForge!.sync.loadReplaceImportRecovery(params);
    return { ok: false, error: "Not supported in Web" };
  },
};

/** Media Studio bridge. In Electron, delegates to the typed IPC channels
 *  defined on the preload bridge; in web mode, falls back to a browser
 *  download anchor (export) or to a "desktop-only" error (reveal / meta /
 *  thumb — those are explicit desktop affordances).
 */
export const desktopMedia = {
  async resolveUrl(input: {
    scheme: "venice-media" | "venice-tts" | "venice-character-cache";
    objectId: string;
    resourceUrl?: string;
  }): Promise<string> {
    if (!isElectron()) {
      return input.resourceUrl ?? `${input.scheme}://${input.objectId}`;
    }
    const result = await window.veniceForge!.files.issueCapabilityUrl(input);
    if (result.ok && result.url) return result.url;
    return input.resourceUrl ?? `${input.scheme}://${input.objectId}`;
  },

  /** Persists generated image bytes in the main-owned content-addressed blob
   * store. Renderer code receives only the stable media identifier and URL. */
  async persistGeneratedImage(dataUrl: string): Promise<{
    ok: boolean;
    media?: {
      id: string;
      url: string;
      mimeType: string;
      byteCount: number;
      sha256: string;
    };
    error?: string;
    errorKind?: string;
    retryable?: boolean;
    recoveryId?: string;
  }> {
    if (!isElectron()) {
      return { ok: false, error: "Durable generated-image storage is only available in desktop mode." };
    }
    return window.veniceForge!.files.persistGeneratedImage({ dataUrl });
  },

  async retryGeneratedImage(recoveryId: string) {
    if (!isElectron()) return { ok: false, error: "Generated-image recovery is only available in desktop mode." };
    return window.veniceForge!.files.retryGeneratedImage({ recoveryId });
  },

  async saveGeneratedImageRecovery(recoveryId: string, suggestedName?: string) {
    if (!isElectron()) return { ok: false, canceled: false, error: "Generated-image recovery is only available in desktop mode." };
    return window.veniceForge!.files.saveGeneratedImageRecovery({ recoveryId, suggestedName });
  },

  /** Canonical renderer-facing Save As entry point. The renderer resolves a
   * supported source to bytes, while Electron owns validation, the native
   * dialog, and the atomic filesystem write. */
  async saveMediaAs(input: {
    source?: string;
    mediaId?: string;
    mimeType?: string;
    suggestedName?: string;
  }): Promise<{ status: "saved" | "cancelled" | "failed"; filename?: string; bytes?: number; error?: string }> {
    try {
      if (isElectron() && input.mediaId) {
        const result = await window.veniceForge!.files.saveGeneratedMedia({
          mediaId: input.mediaId,
          suggestedName: input.suggestedName,
        });
        if (result.canceled) return { status: "cancelled" };
        if (!result.ok) return { status: "failed", error: result.error ?? "Media could not be saved." };
        return { status: "saved", filename: result.filename, bytes: result.bytes };
      }
      if (!input.source) return { status: "failed", error: "No media source is available." };

      // Custom-protocol URLs (venice-media://, venice-character-cache://,
      // venice-tts://) carry short-lived capability tokens (default TTL 5 min,
      // see DEFAULT_CAPABILITY_TOKEN_TTL_MS) tied to the renderer session. The
      // gallery's <img> cache continues to render a persisted URL well after the
      // underlying token expires, but a fresh fetch on Save As would 403 the
      // user. Refresh the capability token right before reading the bytes so
      // the underlying IPC `app:media:issueCapabilityUrl` validates and re-issues.
      // Falls back to the original `input.source` when running outside Electron
      // or when the helper decides the URL is unrecognised (empty string).
      let fetchSource = input.source;
      if (isElectron()) {
        try {
          const refreshed = await resolvePlayableMediaUrl(input.source);
          if (refreshed) fetchSource = refreshed;
        } catch {
          // Preserve original source; the downstream fetch will surface the
          // underlying transport error (e.g. 403) with full diagnostic context.
        }
      }

      const response = await fetch(fetchSource);
      if (response.ok === false) return { status: "failed", error: `Media source returned ${response.status}.` };
      let blob = await response.blob();
      if (blob.size === 0) return { status: "failed", error: "Media source was empty." };
      const normalizedMime = (input.mimeType || blob.type).split(";", 1)[0].trim().toLowerCase();
      if (normalizedMime && blob.type !== normalizedMime) blob = new Blob([blob], { type: normalizedMime });

      if (isElectron()) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Media bytes could not be read."));
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
        const result = await window.veniceForge!.files.saveMediaDataUrl({
          dataUrl,
          suggestedName: input.suggestedName,
        });
        if (result.canceled) return { status: "cancelled" };
        if (!result.ok) return { status: "failed", error: result.error ?? "Media could not be saved." };
        return { status: "saved", filename: result.filename, bytes: result.bytes };
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = input.suggestedName || "venice-forge-media";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return { status: "saved", filename: anchor.download, bytes: blob.size };
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  },

  /** Opens a native directory chooser and exports all items. Desktop-only. */
  async exportMediaFiles(input: {
    items: Array<{ itemId: string; mediaId?: string; dataUrl?: string; mimeType?: string; suggestedName: string }>;
  }): Promise<{
    ok: boolean; canceled: boolean;
    succeeded: Array<{ itemId: string; filename: string; bytes: number }>;
    failed: Array<{ itemId: string; error: string }>;
  }> {
    if (!isElectron()) {
      return { ok: false, canceled: false, succeeded: [], failed: [] };
    }
    return window.veniceForge!.files.exportMediaFiles(input);
  },

  /** Reads an app-managed media path and returns it as a data URL.
   *  Desktop-only. Arbitrary user-library paths are rejected by the main
   *  process; user-selected imports require a main-process dialog flow. */
  async importMedia(input: { filePath: string }): Promise<{
    ok: boolean;
    canceled?: boolean;
    dataUrl?: string;
    filePath?: string;
    filename?: string;
    bytes?: number;
    contentType?: string;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Import from disk is only available in desktop mode.",
      };
    return window.veniceForge!.files.importMedia(input);
  },

  /** Reveals a file in the OS file manager. Desktop-only. The path is
   *  validated against the reveal-safe base directories in the main
   *  process before the OS shell is invoked. */
  async revealMedia(input: {
    filePath: string;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Reveal in folder is only available in desktop mode.",
      };
    return window.veniceForge!.files.revealMedia(input);
  },

  /** Returns filesystem metadata for a reveal-safe path. Desktop-only. */
  async readMediaMeta(input: { filePath: string }): Promise<{
    ok: boolean;
    filePath?: string;
    bytes?: number;
    mtime?: number;
    isFile?: boolean;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Filesystem metadata reads are only available in desktop mode.",
      };
    return window.veniceForge!.files.readMediaMeta(input);
  },

  /** Generates (or returns cached) sha256-keyed thumbnail. Desktop-only. */
  async generateMediaThumb(input: {
    sha256: string;
    source: string;
    maxDimension?: number;
  }): Promise<{
    ok: boolean;
    filePath?: string;
    url?: string;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Server-side thumbnails are only available in desktop mode.",
      };
    return window.veniceForge!.files.generateMediaThumb(input);
  },

};

/** Character avatar image cache bridge.
 *  Desktop: asks the main process to fetch and cache the image, returning a
 *  local file:// URL. Web: falls back to the direct allowlisted URL. */
export const desktopCharacterImage = {
  async getCachedUrl(
    url: string,
  ): Promise<{ ok: boolean; url?: string; error?: string }> {
    if (!isElectron()) {
      // Web mode has no local file cache; the URL has already been validated
      // by resolveCharacterImageUrl, so we can hand it straight to the browser.
      return { ok: true, url };
    }
    return window.veniceForge!.files.getCharacterImage(url);
  },

  async clearCache(): Promise<{
    ok: boolean;
    deletedCount?: number;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Character image cache is only available in desktop mode.",
      };
    return window.veniceForge!.files.clearCharacterImageCache();
  },

  async getInventory(): Promise<{
    ok: boolean;
    count?: number;
    totalBytes?: number;
    error?: string;
  }> {
    if (!isElectron()) return { ok: true, count: 0, totalBytes: 0 };
    return window.veniceForge!.files.getCharacterImageCacheInventory();
  },
};

export const desktopChatFolders = {
  async list(): Promise<{
    ok: boolean;
    folders: import("../shared/chatFolderContracts").ChatFolder[];
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        folders: [],
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.list();
  },
  async create(
    input: import("../shared/chatFolderContracts").CreateChatFolderInput,
  ): Promise<{
    ok: boolean;
    folder?: import("../shared/chatFolderContracts").ChatFolder;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.create(input);
  },
  async rename(
    input: import("../shared/chatFolderContracts").RenameChatFolderInput,
  ): Promise<{
    ok: boolean;
    folder?: import("../shared/chatFolderContracts").ChatFolder;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.rename(input);
  },
  async reorder(
    input: import("../shared/chatFolderContracts").ReorderChatFoldersInput,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.reorder(input);
  },
  async moveConversation(
    input: import("../shared/chatFolderContracts").MoveConversationToFolderInput,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.moveConversation(input);
  },
  async moveConversations(
    input: import("../shared/chatFolderContracts").MoveConversationsToFolderInput,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.moveConversations(input);
  },
  async delete(
    input: import("../shared/chatFolderContracts").DeleteChatFolderInput,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.delete(input);
  },
  async getBackupPreview(
    input: import("../shared/chatFolderContracts").FolderBackupPreviewInput,
  ): Promise<{
    ok: boolean;
    preview?: import("../shared/chatFolderContracts").FolderBackupPreview;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.getBackupPreview(input);
  },
  async exportBackup(
    input: import("../shared/chatFolderContracts").ExportFolderBackupInput,
  ): Promise<import("../shared/chatFolderContracts").ExportFolderBackupResult> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.exportBackup(input);
  },
  async pickImportFile(): Promise<
    import("../shared/chatFolderContracts").PickFolderImportFileResult
  > {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.pickImportFile();
  },
  async previewImport(
    input: import("../shared/chatFolderContracts").PreviewFolderImportInput,
  ): Promise<{
    ok: boolean;
    preview?: import("../shared/chatFolderContracts").FolderImportPreview;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.previewImport(input);
  },
  async importBackup(
    input: import("../shared/chatFolderContracts").ImportFolderBackupInput,
  ): Promise<import("../shared/chatFolderContracts").FolderImportResult> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.importBackup(input);
  },
  async lock(
    input: import("../shared/chatFolderContracts").LockFolderInput,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.lock(input);
  },
  async unlock(
    input: import("../shared/chatFolderContracts").UnlockFolderInput,
  ): Promise<{ ok: boolean; error?: string; retryAfter?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.unlock(input);
  },
  async getLockState(input: { folderId: string }): Promise<{
    ok: boolean;
    lockState?: import("../shared/chatFolderContracts").FolderLockState;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat folders are only available in desktop mode.",
      };
    return window.veniceForge!.chatFolders.getLockState(input);
  },
};

/** Conversation vault: next-generation conversation persistence with
 *  memory, search, and index management. Desktop-only; web mode returns
 *  stub errors so callers can fall back to IndexedDB. */
export const desktopConversations = {
  async list(filter?: {
    archived?: boolean;
    pinned?: boolean;
    tags?: string[];
    model?: string;
    dateFrom?: number;
    dateTo?: number;
  }): Promise<{
    ok: boolean;
    records: import("../types/conversationVault").ConversationRecordV1[];
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        records: [],
        error: "Conversation vault is only available in desktop mode.",
      };
    return window.veniceForge!.conversations.list(filter);
  },
  async get(id: string): Promise<{
    ok: boolean;
    record: import("../types/conversationVault").ConversationRecordV1 | null;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        record: null,
        error: "Conversation vault is only available in desktop mode.",
      };
    return window.veniceForge!.conversations.get(id);
  },
  async save(
    record: import("../types/conversationVault").ConversationRecordV1,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; id: string; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        id: record.id,
        error: "Conversation vault is only available in desktop mode.",
      };
    return window.veniceForge!.conversations.save(record, origin);
  },
  async delete(
    id: string,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Conversation vault is only available in desktop mode.",
      };
    return window.veniceForge!.conversations.delete(id, origin);
  },
  async archive(
    id: string,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Conversation vault is only available in desktop mode.",
      };
    return window.veniceForge!.conversations.archive(id, origin);
  },
  async search(
    query: string,
    options?: { limit?: number; includeArchived?: boolean },
  ): Promise<{
    ok: boolean;
    results: import("../types/conversationVault").SearchResult[];
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        results: [],
        error: "Conversation vault is only available in desktop mode.",
      };
    return window.veniceForge!.conversations.search(query, options);
  },
  async pullContext(input: {
    message: string;
    maxItems?: number;
    maxTokens?: number;
    includeArchived?: boolean;
    excludeConversationIds?: string[];
    characterId?: string;
  }): Promise<{
    ok: boolean;
    context: import("../types/conversationVault").PulledMemoryContext;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        context: {
          injectedText: "",
          facts: [],
          summaries: [],
          tokenEstimate: 0,
        },
        error: "Conversation vault is only available in desktop mode.",
      };
    return window.veniceForge!.conversations.pullContext(input);
  },
  async detectLegacyHistory(): Promise<boolean> {
    if (!isElectron()) return false;
    return window.veniceForge!.conversations.detectLegacyHistory();
  },
  async rebuildIndex(): Promise<{
    ok: boolean;
    itemsIndexed: number;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        itemsIndexed: 0,
        error: "Conversation vault is only available in desktop mode.",
      };
    return window.veniceForge!.conversations.rebuildIndex();
  },
  async openConversationsFolder(): Promise<{ ok: boolean }> {
    if (!isElectron()) return { ok: false };
    return window.veniceForge!.conversations.openConversationsFolder();
  },
  async migrateLegacyHistory(): Promise<{
    ok: boolean;
    migrated: number;
    failed: number;
    skipped: number;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        migrated: 0,
        failed: 0,
        skipped: 0,
        error: "Conversation vault is only available in desktop mode.",
      };
    return window.veniceForge!.conversations.migrateLegacyHistory();
  },
};

/** Handles chat history persistence via the main-process filesystem store. */
export const desktopChat = {
  async list(): Promise<{
    ok: boolean;
    conversations: Conversation[];
    truncated: boolean;
    totalScanned: number;
    error?: string;
  }> {
    if (!isElectron()) {
      return {
        ok: false,
        conversations: [],
        truncated: false,
        totalScanned: 0,
        error: "Chat filesystem storage is only available in desktop mode.",
      };
    }
    return window.veniceForge!.chat.list();
  },
  /** T14 server-side pagination: fetch a single page of conversations. */
  async listPage(params: { offset: number; limit: number }): Promise<{
    ok: boolean;
    conversations: Conversation[];
    truncated: boolean;
    totalScanned: number;
    offset: number;
    count: number;
    error?: string;
  }> {
    if (!isElectron()) {
      return {
        ok: false,
        conversations: [],
        truncated: false,
        totalScanned: 0,
        offset: params.offset,
        count: 0,
        error: "Chat filesystem storage is only available in desktop mode.",
      };
    }
    return window.veniceForge!.chat.listPage(params);
  },
  async get(id: string): Promise<{
    ok: boolean;
    conversation: Conversation | null;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        conversation: null,
        error: "Chat filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.chat.get(id);
  },
  async save(
    conversation: Conversation,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.chat.save(conversation, origin);
  },
  async delete(
    id: string,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Chat filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.chat.delete(id, origin);
  },
};

/**
 * Character RP Studio: local character card bridge.
 * In Electron, calls `window.veniceForge.characterCards.*` (IPC → filesystem).
 * In web mode, returns the documented "not available" error; callers are
 * expected to fall back to the IndexedDB path inside the renderer service.
 */
export const desktopCharacterCards = {
  async list(): Promise<{
    ok: boolean;
    cards: CharacterCardV1[];
    error?: string;
  }> {
    if (!isElectron()) {
      return {
        ok: false,
        cards: [],
        error:
          "Character card filesystem storage is only available in desktop mode.",
      };
    }
    return window.veniceForge!.characterCards.list();
  },
  async get(
    id: string,
  ): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        card: null,
        error:
          "Character card filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.characterCards.get(id);
  },
  async save(
    card: CharacterCardV1,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        card: null,
        error:
          "Character card filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.characterCards.save(card, origin);
  },
  async delete(
    id: string,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error:
          "Character card filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.characterCards.delete(id, origin);
  },
  async chooseImportFile() {
    if (!isElectron())
      return {
        ok: false,
        error: "Desktop file import is only available in desktop mode.",
      };
    return window.veniceForge!.characterCards.chooseImportFile();
  },
  async consumeImportCandidate(handle: string) {
    if (!isElectron())
      return {
        ok: false,
        error: "Desktop file import is only available in desktop mode.",
      };
    return window.veniceForge!.characterCards.consumeImportCandidate(handle);
  },
  async applyImport(
    payload: import("../types/character-card-files").CharacterCardImportApplyOptions,
  ) {
    if (!isElectron())
      return {
        ok: false,
        error: "Desktop file import is only available in desktop mode.",
      };
    return window.veniceForge!.characterCards.applyImport(payload);
  },
  async undoImport(payload: { handle: string }) {
    if (!isElectron())
      return {
        ok: false,
        error: "Desktop import undo is only available in desktop mode.",
      };
    return window.veniceForge!.characterCards.undoImport(payload);
  },
  async exportJson(payload: {
    cardId: string;
    profile?: "standard" | "privacy-reduced";
  }) {
    if (!isElectron())
      return {
        ok: false,
        error: "Desktop file export is only available in desktop mode.",
      };
    return window.veniceForge!.characterCards.exportJson(payload);
  },
  async exportPng(payload: {
    cardId: string;
    profile?: "standard" | "privacy-reduced";
  }) {
    if (!isElectron())
      return {
        ok: false,
        error: "Desktop file export is only available in desktop mode.",
      };
    return window.veniceForge!.characterCards.exportPng(payload);
  },
};

/** Character RP Studio: user persona bridge. */
export const desktopPersonas = {
  async list(): Promise<{
    ok: boolean;
    personas: UserPersonaV1[];
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        personas: [],
        error: "Persona filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.personas.list();
  },
  async get(
    id: string,
  ): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        persona: null,
        error: "Persona filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.personas.get(id);
  },
  async save(
    persona: UserPersonaV1,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        persona: null,
        error: "Persona filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.personas.save(persona, origin);
  },
  async delete(
    id: string,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Persona filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.personas.delete(id, origin);
  },
};

/** Character RP Studio: lorebook bridge. */
export const desktopLorebooks = {
  async list(): Promise<{
    ok: boolean;
    lorebooks: LorebookV1[];
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        lorebooks: [],
        error: "Lorebook filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.lorebooks.list();
  },
  async get(
    id: string,
  ): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        lorebook: null,
        error: "Lorebook filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.lorebooks.get(id);
  },
  async save(
    lorebook: LorebookV1,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        lorebook: null,
        error: "Lorebook filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.lorebooks.save(lorebook, origin);
  },
  async delete(
    id: string,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Lorebook filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.lorebooks.delete(id, origin);
  },
};

/** Character RP Studio: multi-character chat bridge. */
export const desktopRpChats = {
  async list(): Promise<{ ok: boolean; chats: RpChatV1[]; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        chats: [],
        error: "RP chat filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.rpChats.list();
  },
  async get(
    id: string,
  ): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        chat: null,
        error: "RP chat filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.rpChats.get(id);
  },
  async save(
    chat: RpChatV1,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        chat: null,
        error: "RP chat filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.rpChats.save(chat, origin);
  },
  async delete(
    id: string,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "RP chat filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.rpChats.delete(id, origin);
  },
};

/** Character RP Studio: routed asset bridge. */
export const desktopRpAssets = {
  async list(
    chatId?: string,
  ): Promise<{ ok: boolean; assets: RpAssetV1[]; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        assets: [],
        error: "RP asset filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.rpAssets.list(chatId);
  },
  async get(
    id: string,
  ): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        asset: null,
        error: "RP asset filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.rpAssets.get(id);
  },
  async save(
    asset: RpAssetV1,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        asset: null,
        error: "RP asset filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.rpAssets.save(asset, origin);
  },
  async delete(
    id: string,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "RP asset filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.rpAssets.delete(id, origin);
  },
};

/** Phase 2F RP Studio Polish — standalone scenario bridge. */
export const desktopScenarios = {
  async list(): Promise<{
    ok: boolean;
    scenarios: ScenarioV1[];
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        scenarios: [],
        error: "Scenario filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.scenarios.list();
  },
  async get(
    id: string,
  ): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        scenario: null,
        error: "Scenario filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.scenarios.get(id);
  },
  async save(
    scenario: ScenarioV1,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        scenario: null,
        error: "Scenario filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.scenarios.save(scenario, origin);
  },
  async delete(
    id: string,
    origin: MutationOrigin = "local-user",
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Scenario filesystem storage is only available in desktop mode.",
      };
    return window.veniceForge!.scenarios.delete(id, origin);
  },
};

/** Manages the Jina API key across desktop secure storage and server-side web session state. */
export const desktopJinaApiKey = {
  async isConfigured(): Promise<boolean> {
    if (isElectron())
      return window.veniceForge!.jinaApiKey.isConfigured(getActiveProfileId());
    try {
      const response = await fetchWithTimeout("/api/session-jina-key");
      if (!response.ok) return false;
      const payload = (await response.json().catch(() => null)) as {
        configured?: unknown;
      } | null;
      return payload?.configured === true;
    } catch {
      return false;
    }
  },
  async set(key: string): Promise<{ ok: boolean }> {
    if (isElectron())
      return window.veniceForge!.jinaApiKey.set(key, getActiveProfileId());
    const response = await fetchWithTimeout("/api/session-jina-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    return { ok: response.ok };
  },
  async delete(profileId?: string): Promise<{ ok: boolean }> {
    if (isElectron())
      return window.veniceForge!.jinaApiKey.delete(
        profileId ?? getActiveProfileId(),
      );
    const response = await fetchWithTimeout("/api/session-jina-key", {
      method: "DELETE",
    });
    return { ok: response.ok };
  },
  async test(): Promise<{ ok: boolean; status?: number; message: string }> {
    if (isElectron())
      return window.veniceForge!.jinaApiKey.test(getActiveProfileId());
    try {
      const resp = await fetchWithTimeout("/api/proxy-jina", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Venice-Forge-Family-Safe-Mode": String(
            useSettingsStore.getState().localFamilySafeModeEnabled,
          ),
        },
        body: JSON.stringify({
          url: "https://r.jina.ai/https://example.com",
          headers: {},
        }),
      });
      if (resp.ok) {
        return {
          ok: true,
          status: resp.status,
          message: translateRuntime(
            "runtimeGenerated.services.desktopbridge.metadata.jinaConnectionSuccessful",
            "Jina connection successful",
          ),
        };
      }
      return {
        ok: false,
        status: resp.status,
        message: translateRuntime(
          "runtimeGenerated.services.desktopbridge.metadata.jinaReturnedValue1",
          "Jina returned {{value1}}",
          { value1: resp.status },
        ),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        status: 0,
        message:
          msg ||
          translateRuntime(
            "runtimeGenerated.services.desktopbridge.metadata.networkErrorTestingJinaApiKey",
            "Network error testing Jina API key",
          ),
      };
    }
  },
};

/** Handles application updates, falling back to no-op in web mode. */
export const desktopUpdates = {
  checkForUpdates(): Promise<{
    ok: boolean;
    version?: string;
    error?: string;
  }> {
    if (!isElectron())
      return Promise.resolve({
        ok: false,
        error: "Auto-updates are only available in desktop mode.",
      });
    return window.veniceForge!.updates.checkForUpdates();
  },
  downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron())
      return Promise.resolve({
        ok: false,
        error: "Auto-updates are only available in desktop mode.",
      });
    return window.veniceForge!.updates.downloadUpdate();
  },
  installUpdate(): Promise<{ ok: boolean }> {
    if (!isElectron()) return Promise.resolve({ ok: false });
    return window.veniceForge!.updates.installUpdate();
  },
  onUpdateAvailable(
    callback: (info: import("electron-updater").UpdateInfo) => void,
  ): () => void {
    if (!isElectron()) return () => {};
    return window.veniceForge!.updates.onUpdateAvailable(callback);
  },
  onUpdateNotAvailable(callback: () => void): () => void {
    if (!isElectron()) return () => {};
    return window.veniceForge!.updates.onUpdateNotAvailable(callback);
  },
  onDownloadProgress(
    callback: (progress: import("electron-updater").ProgressInfo) => void,
  ): () => void {
    if (!isElectron()) return () => {};
    return window.veniceForge!.updates.onDownloadProgress(callback);
  },
  onUpdateDownloaded(callback: () => void): () => void {
    if (!isElectron()) return () => {};
    return window.veniceForge!.updates.onUpdateDownloaded(callback);
  },
  onUpdateError(callback: (error: string) => void): () => void {
    if (!isElectron()) return () => {};
    return window.veniceForge!.updates.onUpdateError(callback);
  },
};

/** Makes Jina API requests via the Electron main process (desktop) or direct browser fetch (web). */
export const desktopJina = {
  async request(input: {
    url: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    profileId?: string;
  }): Promise<{
    ok: boolean;
    status?: number;
    body?: unknown;
    contentType?: string;
    error?: string;
  }> {
    // The desktop bridge always stamps the request with the active profile id
    // so the main process reads the per-profile Jina credential rather than
    // silently falling back to the default profile's key. Web mode is
    // session-scoped (no per-profile keyring) so it does not need a profile id.
    const startedAt = Date.now();
    const requestHeaders = maskInspectorHeaders(input.headers);
    const logId = useInspectorStore.getState().addLog({
      endpoint: input.url,
      method: "GET",
      transport: "jina",
      requestHeaders,
      requestBody: sanitizeInspectorPayload({
        url: input.url,
        timeoutMs: input.timeoutMs,
      }),
      guardOutcome: "deferred",
      callOutcome: "pending",
    });

    const finishLog = <
      T extends {
        ok: boolean;
        status?: number;
        body?: unknown;
        error?: string;
      },
    >(
      result: T,
    ): T => {
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: result.status ?? (result.ok ? 200 : 500),
          durationMs: Date.now() - startedAt,
          guardOutcome: "deferred",
          error: result.error,
          responseBody:
            result.body === undefined
              ? undefined
              : sanitizeInspectorResponse(result.body),
        }),
      );
      return result;
    };

    if (isElectron()) {
      const result = await window.veniceForge!.jina.request({
        ...input,
        profileId: getActiveProfileId(),
      });
      return finishLog(result);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      typeof input.timeoutMs === "number" && input.timeoutMs > 0
        ? Math.min(input.timeoutMs, 180000)
        : 30000,
    );

    try {
      const headers = { ...input.headers };

      const response = await fetchWithTimeout("/api/proxy-jina", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Venice-Forge-Family-Safe-Mode": String(
            useSettingsStore.getState().localFamilySafeModeEnabled,
          ),
        },
        body: JSON.stringify({ ...input, headers }),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : await response.text();

      return finishLog({
        ok: response.ok,
        status: response.status,
        body,
        contentType,
        error: response.ok ? undefined : `Jina returned ${response.status}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return finishLog({
        ok: false,
        status: 0,
        error: msg || "Jina proxy request failed",
      });
    } finally {
      clearTimeout(timeout);
    }
  },
};

/** Provides access to the local master YAML config (sanitized). Web mode
 *  always returns a no-op stub since configs are desktop-only. */
export const desktopConfig = {
  /** Returns the sanitized config + status. */
  async get(): Promise<{ ok: boolean; payload?: unknown; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Local config is only available in desktop mode.",
      };
    return window.veniceForge!.config.get();
  },
  /** Initializes the local master YAML config with defaults if absent. */
  async initialize(): Promise<{
    ok: boolean;
    status?: unknown;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Local config is only available in desktop mode.",
      };
    return window.veniceForge!.config.initialize();
  },
  /** Reloads the config from disk. */
  async reload(): Promise<{ ok: boolean; status?: unknown; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Local config is only available in desktop mode.",
      };
    return window.veniceForge!.config.reload();
  },
  /** Returns just the config status (cheap to call). */
  async getStatus(): Promise<{
    ok: boolean;
    status?: unknown;
    paths?: unknown;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Local config is only available in desktop mode.",
      };
    return window.veniceForge!.config.getStatus();
  },
  /** Opens the active config folder in the OS file manager. */
  async openFolder(): Promise<{ ok: boolean; path: string; error?: string }> {
    if (!isElectron())
      return {
        ok: false,
        path: "",
        error: "Local config is only available in desktop mode.",
      };
    return window.veniceForge!.config.openFolder();
  },
  /** Writes a sanitized patch (non-secret values only). The renderer cannot
   *  set plaintext API keys via this method — those go through the existing
   *  `apiKey:set` / `jinaApiKey:set` IPC channels. */
  async writeSanitized(
    patch: unknown,
  ): Promise<{ ok: boolean; error?: string; redactedFields?: string[] }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Local config is only available in desktop mode.",
      };
    return window.veniceForge!.config.writeSanitized(patch);
  },
  /** Exports a sanitized config template through a trusted desktop save dialog. */
  async exportTemplate(): Promise<{
    ok: boolean;
    canceled?: boolean;
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Local config is only available in desktop mode.",
      };
    return window.veniceForge!.config.exportTemplate();
  },
  /** Loads the merged themes file (built-in + local). */
  async loadMergedThemes(): Promise<{
    ok: boolean;
    themes?: Record<string, unknown>;
    warnings?: unknown[];
    error?: string;
  }> {
    if (!isElectron()) return { ok: false, themes: {}, warnings: [] };
    return window.veniceForge!.config.loadMergedThemes();
  },
  /** Saves a custom theme directly via IPC. */
  async saveTheme(theme: unknown): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.config.saveTheme(theme);
  },
  /** Deletes a custom theme directly via IPC. */
  async deleteTheme(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.config.deleteTheme(id);
  },
  /** Subscribes to theme update broadcasts from the main process. */
  onThemeUpdated(callback: () => void): () => void {
    if (!isElectron()) return () => {};
    return window.veniceForge!.config.onThemeUpdated(callback);
  },
  /** Removes any secure-store API keys. */
  async resetSecureStoreKeys(): Promise<{
    ok: boolean;
    removed?: { venice: boolean; jina: boolean };
    error?: string;
  }> {
    if (!isElectron())
      return {
        ok: false,
        error: "Local config is only available in desktop mode.",
      };
    return window.veniceForge!.config.resetSecureStoreKeys();
  },
};

export const desktopMasterPassword = {
  async isSet(): Promise<boolean> {
    if (!isElectron()) return false;
    return window.veniceForge!.masterPassword.isSet();
  },
  async set(password: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.masterPassword.set(password);
  },
  async verify(password: string): Promise<{
    ok: boolean;
    verified: boolean;
    lockedOutSeconds?: number;
    error?: string;
  }> {
    if (!isElectron())
      return { ok: false, verified: false, error: "Not available in web" };
    return window.veniceForge!.masterPassword.verify(password);
  },
  async change(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.masterPassword.change({ currentPassword, newPassword });
  },
  async clear(currentPassword: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.masterPassword.clear({ currentPassword });
  },
};

export const desktopSafety = {
  async setFamilySafeMode(enabled: boolean, masterPassword?: string): Promise<{ ok: boolean; config?: unknown; error?: string; lockedOutSeconds?: number }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.safety.setFamilySafeMode({ enabled, masterPassword });
  }
};

export const desktopProfilePassword = {
  async activate(
    profileId: string,
    password?: string,
  ): Promise<{
    ok: boolean;
    verified: boolean;
    profileId?: string;
    lockedOutSeconds?: number;
    error?: string;
  }> {
    if (!isElectron())
      return { ok: false, verified: false, error: "Not available in web" };
    return window.veniceForge!.profilePassword.activate(profileId, password);
  },
  async isSet(profileId: string): Promise<boolean> {
    if (!isElectron()) return false;
    return window.veniceForge!.profilePassword.isSet(profileId);
  },
  async set(
    profileId: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.profilePassword.set(profileId, password);
  },
  async verify(
    profileId: string,
    password: string,
  ): Promise<{
    ok: boolean;
    verified: boolean;
    lockedOutSeconds?: number;
    error?: string;
  }> {
    if (!isElectron())
      return { ok: false, verified: false, error: "Not available in web" };
    return window.veniceForge!.profilePassword.verify(profileId, password);
  },
  async clear(profileId: string, currentPassword?: string): Promise<{ ok: boolean; error?: string; lockedOutSeconds?: number }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.profilePassword.clear(profileId, currentPassword);
  },
};

export const desktopProfilePurge = {
  async purge(profileId: string) {
    if (!isElectron())
      return {
        ok: false,
        error: "Profile vault purge is only available in desktop mode.",
      };
    return window.veniceForge!.profilePurge.purge(profileId);
  },
};

const documentAgentUnavailable = {
  ok: false as const,
  error: "Document Agent tools are only available in desktop mode.",
};

export const desktopDocumentAgent = {
  permissions: {
    set(input: Parameters<import("../types/desktop").VeniceForgeDocumentAgent["permissions"]["set"]>[0]) {
      return isElectron()
        ? window.veniceForge!.documentAgent.permissions.set(input)
        : Promise.resolve(documentAgentUnavailable);
    }
  },
  documents: {
    create(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["documents"]["create"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.documents.create(input)
        : Promise.resolve(documentAgentUnavailable);
    },
    list(projectId: string) {
      return isElectron()
        ? window.veniceForge!.documentAgent.documents.list(projectId)
        : Promise.resolve(documentAgentUnavailable);
    },
    read(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["documents"]["read"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.documents.read(input)
        : Promise.resolve(documentAgentUnavailable);
    },
    listRevisions(documentId: string) {
      return isElectron()
        ? window.veniceForge!.documentAgent.documents.listRevisions(documentId)
        : Promise.resolve(documentAgentUnavailable);
    },
    delete(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["documents"]["delete"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.documents.delete(input)
        : Promise.resolve(documentAgentUnavailable);
    },
    proposeEdits(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["documents"]["proposeEdits"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.documents.proposeEdits(input)
        : Promise.resolve(documentAgentUnavailable);
    },
    proposeRestore(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["documents"]["proposeRestore"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.documents.proposeRestore(input)
        : Promise.resolve(documentAgentUnavailable);
    },
    export(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["documents"]["export"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.documents.export(input)
        : Promise.resolve(documentAgentUnavailable);
    },
  },
  attachments: {
    register(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["attachments"]["register"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.attachments.register(input)
        : Promise.resolve(documentAgentUnavailable);
    },
    promote(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["attachments"]["promote"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.attachments.promote(input)
        : Promise.resolve(documentAgentUnavailable);
    },
  },
  approvals: {
    list() {
      return isElectron()
        ? window.veniceForge!.documentAgent.approvals.list()
        : Promise.resolve(documentAgentUnavailable);
    },
    decide(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["approvals"]["decide"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.approvals.decide(input)
        : Promise.resolve(documentAgentUnavailable);
    },
  },
  workspace: {
    choose(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["workspace"]["choose"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.workspace.choose(input)
        : Promise.resolve(documentAgentUnavailable);
    },
    revoke(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["workspace"]["revoke"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.workspace.revoke(input)
        : Promise.resolve({ ok: false });
    },
    list(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["workspace"]["list"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.workspace.list(input)
        : Promise.resolve(documentAgentUnavailable);
    },
    read(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["workspace"]["read"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.workspace.read(input)
        : Promise.resolve(documentAgentUnavailable);
    },
    search(
      input: Parameters<
        import("../types/desktop").VeniceForgeDocumentAgent["workspace"]["search"]
      >[0],
    ) {
      return isElectron()
        ? window.veniceForge!.documentAgent.workspace.search(input)
        : Promise.resolve(documentAgentUnavailable);
    },
  },
};

/** Proxies Character Creator desktop operations. */
export const desktopCharacterCreator = {
  async exportCard(payload: {
    card: unknown;
    format: "json" | "png";
    avatarDataUrl?: string;
  }): Promise<{
    ok: boolean;
    canceled?: boolean;
    filename?: string;
    error?: string;
  }> {
    if (!isElectron())
      return { ok: false, error: "Desktop export only available in Electron" };
    return window.veniceForge!.characterCreator.exportCard(payload);
  },
  async validateCard(payload: { card: unknown }): Promise<{
    ok: boolean;
    valid?: boolean;
    errors?: string[];
    warnings?: string[];
    error?: string;
  }> {
    if (!isElectron())
      return { ok: false, error: "Desktop validation only available in Electron" };
    return window.veniceForge!.characterCreator.validateCard(payload);
  },
};

/** Replicate async media-generation bridge. */
export const desktopReplicate = {
  async generateImage(input: {
    model: string;
    input: Record<string, unknown>;
  }): Promise<{
    ok: boolean;
    task?: BackgroundTask;
    error?: string;
  }> {
    if (!isElectron()) {
      return { ok: false, error: "Replicate generation is only available in the desktop app." };
    }
    return window.veniceForge!.replicate.generateImage(input);
  },
};

/** Hugging Face Inference Providers live model-discovery bridge. */
export const desktopHuggingFace = {
  async getModelCatalog(): Promise<import("../types/provider").ProviderModelCatalogResult> {
    if (!isElectron()) {
      return {
        providerId: "huggingface",
        models: [],
        fetchedAt: Date.now(),
        stale: true,
        source: "bundled",
        error: "Hugging Face model discovery is only available in the desktop app.",
      };
    }
    return window.veniceForge!.huggingFace.getModelCatalog();
  },
};
