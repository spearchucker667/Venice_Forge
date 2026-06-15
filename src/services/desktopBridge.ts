/** @fileoverview Electron vs. web mode abstraction — never call window.veniceForge directly from modules. */

// Code Owner: fayeblade (@spearchucker667)
import "../types/desktop";
import type { VeniceForgeDiagnostics, VeniceForgeRequest, VeniceForgeResponse } from "../types/desktop";
import type { Conversation } from "../types/conversation";
import type {
  CharacterCardV1,
  LorebookV1,
  RpAssetV1,
  RpChatV1,
  ScenarioV1,
  UserPersonaV1,
} from "../types/rp";
import { veniceFetch } from "./veniceClient";
import {
  buildInspectorTelemetryPatch,
  maskInspectorHeaders,
  sanitizeInspectorPayload,
  sanitizeInspectorResponse,
} from "./inspectorTelemetry";
import { useInspectorStore } from "../stores/inspector-store";
import { useSettingsStore } from "../stores/settings-store";

/**
 * Detects whether the app is currently running inside the Electron desktop shell.
 * @returns True if running in Electron desktop mode.
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && window.veniceForge?.isDesktop === true;
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
function attachAbort(signalId: string, signal?: AbortSignal): (() => void) | undefined {
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
  async request(input: VeniceForgeRequest, signal?: AbortSignal): Promise<VeniceForgeResponse> {
    if (!isElectron()) throw new Error("Venice desktop transport is only available in desktop mode.");
    const signalId = input.signalId || createSignalId();
    const cleanup = attachAbort(signalId, signal);
    try {
      return await window.veniceForge!.venice.request({
        ...input,
        signalId,
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
    onDelta: (chunk: { content: string; reasoning: string }) => void,
    signal?: AbortSignal
  ): Promise<VeniceForgeResponse> {
    if (!isElectron()) throw new Error("Venice desktop transport is only available in desktop mode.");
    const signalId = input.signalId || createSignalId();
    const cleanup = attachAbort(signalId, signal);
    try {
      return await window.veniceForge!.venice.streamChat({
        ...input,
        signalId,
      }, onDelta);
    } finally {
      cleanup?.();
    }
  },
};

/** Manages the Venice API key across desktop and web storage backends. */
export const desktopApiKey = {
  /**
   * Checks whether an API key has been configured.
   * @returns A promise resolving to true if a key is present.
   */
  async isConfigured(): Promise<boolean> {
    if (isElectron()) return window.veniceForge!.apiKey.isConfigured();
    return false;
  },

  /**
   * Stores the Venice API key securely.
   * @param key The API key string to persist.
   * @returns A promise resolving to an ok flag.
   */
  async set(key: string): Promise<{ ok: boolean }> {
    if (isElectron()) return window.veniceForge!.apiKey.set(key);
    throw new Error("API key storage is desktop-only. Web mode uses the server .env key.");
  },

  /**
   * Removes the stored Venice API key.
   * @returns A promise resolving to an ok flag.
   */
  async delete(): Promise<{ ok: boolean }> {
    if (isElectron()) return window.veniceForge!.apiKey.delete();
    return { ok: true };
  },

  /**
   * Tests the configured API key by listing models.
   * @returns A promise resolving to the test result, status, and message.
   */
  async test(): Promise<{ ok: boolean; status?: number; message: string }> {
    if (isElectron()) return window.veniceForge!.apiKey.test();
    try {
      const { response } = await veniceFetch("/models", { retry: false });
      return { ok: response.ok, status: response.status, message: response.statusText };
    } catch (err) {
      return { ok: false, status: err && typeof err === "object" && "status" in err ? (err as { status: number }).status : undefined, message: err instanceof Error ? err.message : "Request failed" };
    }
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
      });
    }
    return window.veniceForge!.app.getDiagnostics();
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
  proxyScrape(url: string): Promise<{ ok: boolean; data?: { url: string; finalUrl: string; contentType: string; body: string }; error?: string }> {
    if (!isElectron()) return Promise.resolve({ ok: false, error: "Only available in desktop mode" });
    return window.veniceForge!.app.proxyScrape(url);
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
  async exportJson(data: unknown, defaultPath = "venice-forge-export.json"): Promise<boolean> {
    const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);
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
    const result = await window.veniceForge!.files.saveJsonFile(json, defaultPath);
    return result.ok;
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
        input.accept = ".json,application/json";
        input.style.display = "none";

        function cleanup() {
          setTimeout(() => input.remove(), 0);
        }

        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file) { cleanup(); resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => { cleanup(); resolve(String(reader.result)); };
          reader.onerror = () => { cleanup(); resolve(null); };
          reader.readAsText(file);
        });

        // `cancel` fires in Chrome 113+/Firefox 91+ when the user dismisses
        // the picker without selecting a file.
        input.addEventListener("cancel", () => { cleanup(); resolve(null); });

        document.body.appendChild(input);
        input.click();
      });
    }
    const result = await window.veniceForge!.files.loadJsonFile();
    if (result.canceled) return null;
    if (!result.ok) throw new Error(result.error || "Failed to import JSON file.");
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
    const result = await window.veniceForge!.files.saveYamlFile(data, defaultPath);
    return result.ok;
  },

  async importYamlString(): Promise<string | null> {
    if (!isElectron()) {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".yaml,.yml";
        input.style.display = "none";

        function cleanup() {
          setTimeout(() => input.remove(), 0);
        }

        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (!file) { cleanup(); resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => { cleanup(); resolve(String(reader.result)); };
          reader.onerror = () => { cleanup(); resolve(null); };
          reader.readAsText(file);
        });

        input.addEventListener("cancel", () => { cleanup(); resolve(null); });

        document.body.appendChild(input);
        input.click();
      });
    }
    const result = await window.veniceForge!.files.loadYamlFile();
    if (result.canceled) return null;
    if (!result.ok) throw new Error(result.error || "Failed to import YAML file.");
    if (!result.data) throw new Error("Selected YAML file is empty.");
    return result.data;
  },
};

/** Reads a local file via the main process (desktop only). */
export const desktopFileReader = {
  async readLocalFile(): Promise<{ ok: boolean; canceled?: boolean; content?: string; filename?: string; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Not running in Electron" };
    return window.veniceForge!.files.readLocalFile();
  },
};

/** Media Studio bridge. In Electron, delegates to the typed IPC channels
 *  defined on the preload bridge; in web mode, falls back to a browser
 *  download anchor (export) or to a "desktop-only" error (reveal / meta /
 *  thumb — those are explicit desktop affordances). */
export const desktopMedia = {
  /**
   * Exports a base64-encoded image to disk. In Electron, this writes under
   * `<Pictures>/Venice Forge/Media Studio/<subfolder>/<filename.png>`
   * via the main process. In web mode, this falls back to a browser
   * download with the given default filename.
   */
  async exportMedia(input: { base64Data: string; filename: string; subfolder?: string }): Promise<{ ok: boolean; filePath?: string; error?: string }> {
    if (!isElectron()) {
      try {
        const blob = await (async () => {
          const raw = input.base64Data.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
          const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
          return new Blob([bytes], { type: "image/png" });
        })();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = input.filename || "venice-forge-export.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    return window.veniceForge!.files.exportMedia(input);
  },

  /** Reads an app-managed media path and returns it as a data URL.
   *  Desktop-only. Arbitrary user-library paths are rejected by the main
   *  process; user-selected imports require a main-process dialog flow. */
  async importMedia(input: { filePath: string }): Promise<{
    ok: boolean; canceled?: boolean; dataUrl?: string; filePath?: string;
    filename?: string; bytes?: number; contentType?: string; error?: string;
  }> {
    if (!isElectron()) return { ok: false, error: "Import from disk is only available in desktop mode." };
    return window.veniceForge!.files.importMedia(input);
  },

  /** Reveals a file in the OS file manager. Desktop-only. The path is
   *  validated against the reveal-safe base directories in the main
   *  process before the OS shell is invoked. */
  async revealMedia(input: { filePath: string }): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Reveal in folder is only available in desktop mode." };
    return window.veniceForge!.files.revealMedia(input);
  },

  /** Returns filesystem metadata for a reveal-safe path. Desktop-only. */
  async readMediaMeta(input: { filePath: string }): Promise<{
    ok: boolean; filePath?: string; bytes?: number; mtime?: number; isFile?: boolean; error?: string;
  }> {
    if (!isElectron()) return { ok: false, error: "Filesystem metadata reads are only available in desktop mode." };
    return window.veniceForge!.files.readMediaMeta(input);
  },

  /** Generates (or returns cached) sha256-keyed thumbnail. Desktop-only. */
  async generateMediaThumb(input: { sha256: string; source: string; maxDimension?: number }): Promise<{
    ok: boolean; filePath?: string; url?: string; error?: string;
  }> {
    if (!isElectron()) return { ok: false, error: "Server-side thumbnails are only available in desktop mode." };
    return window.veniceForge!.files.generateMediaThumb(input);
  },

  /** Saves a base64-encoded image to a sanitized subfolder under
   *  <Pictures>/Venice Forge/. Desktop-only; web mode falls back to
   *  a browser download. */
  async saveRoutedImage(base64Data: string, filename: string, subfolder: string): Promise<{
    ok: boolean; filePath?: string; error?: string;
  }> {
    if (!isElectron()) {
      const a = document.createElement("a");
      a.href = base64Data;
      a.download = filename;
      a.click();
      return { ok: true };
    }
    return window.veniceForge!.files.saveRoutedImage(base64Data, filename, subfolder);
  },
};

/** Character avatar image cache bridge.
 *  Desktop: asks the main process to fetch and cache the image, returning a
 *  local file:// URL. Web: falls back to the direct allowlisted URL. */
export const desktopCharacterImage = {
  async getCachedUrl(url: string): Promise<{ ok: boolean; url?: string; error?: string }> {
    if (!isElectron()) {
      // Web mode has no local file cache; the URL has already been validated
      // by resolveCharacterImageUrl, so we can hand it straight to the browser.
      return { ok: true, url };
    }
    return window.veniceForge!.files.getCharacterImage(url);
  },

  async clearCache(): Promise<{ ok: boolean; deletedCount?: number; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Character image cache is only available in desktop mode." };
    return window.veniceForge!.files.clearCharacterImageCache();
  },

  async getInventory(): Promise<{ ok: boolean; count?: number; totalBytes?: number; error?: string }> {
    if (!isElectron()) return { ok: true, count: 0, totalBytes: 0 };
    return window.veniceForge!.files.getCharacterImageCacheInventory();
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
  }): Promise<{ ok: boolean; records: import("../types/conversationVault").ConversationRecordV1[]; error?: string }> {
    if (!isElectron()) return { ok: false, records: [], error: "Conversation vault is only available in desktop mode." };
    return window.veniceForge!.conversations.list(filter);
  },
  async get(id: string): Promise<{ ok: boolean; record: import("../types/conversationVault").ConversationRecordV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, record: null, error: "Conversation vault is only available in desktop mode." };
    return window.veniceForge!.conversations.get(id);
  },
  async save(record: import("../types/conversationVault").ConversationRecordV1): Promise<{ ok: boolean; id: string; error?: string }> {
    if (!isElectron()) return { ok: false, id: record.id, error: "Conversation vault is only available in desktop mode." };
    return window.veniceForge!.conversations.save(record);
  },
  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Conversation vault is only available in desktop mode." };
    return window.veniceForge!.conversations.delete(id);
  },
  async pullContext(input: { message: string; maxItems?: number; maxTokens?: number; includeArchived?: boolean }): Promise<{
    ok: boolean; context: import("../types/conversationVault").PulledMemoryContext; error?: string;
  }> {
    if (!isElectron()) return { ok: false, context: { injectedText: "", facts: [], summaries: [], tokenEstimate: 0 }, error: "Conversation vault is only available in desktop mode." };
    return window.veniceForge!.conversations.pullContext(input);
  },
  async detectLegacyHistory(): Promise<boolean> {
    if (!isElectron()) return false;
    return window.veniceForge!.conversations.detectLegacyHistory();
  },
  async rebuildIndex(): Promise<{ ok: boolean; itemsIndexed: number; error?: string }> {
    if (!isElectron()) return { ok: false, itemsIndexed: 0, error: "Conversation vault is only available in desktop mode." };
    return window.veniceForge!.conversations.rebuildIndex();
  },
  async openConversationsFolder(): Promise<{ ok: boolean }> {
    if (!isElectron()) return { ok: false };
    return window.veniceForge!.conversations.openConversationsFolder();
  },
  async migrateLegacyHistory(): Promise<{ ok: boolean; migrated: number; failed: number; skipped: number; error?: string }> {
    if (!isElectron()) return { ok: false, migrated: 0, failed: 0, skipped: 0, error: "Conversation vault is only available in desktop mode." };
    return window.veniceForge!.conversations.migrateLegacyHistory();
  },
};

/** Handles chat history persistence via the main-process filesystem store. */
export const desktopChat = {
  async list(): Promise<{ ok: boolean; conversations: Conversation[]; truncated: boolean; totalScanned: number; error?: string }> {
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
  async get(id: string): Promise<{ ok: boolean; conversation: Conversation | null; error?: string }> {
    if (!isElectron()) return { ok: false, conversation: null, error: "Chat filesystem storage is only available in desktop mode." };
    return window.veniceForge!.chat.get(id);
  },
  async save(conversation: Conversation): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Chat filesystem storage is only available in desktop mode." };
    return window.veniceForge!.chat.save(conversation);
  },
  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Chat filesystem storage is only available in desktop mode." };
    return window.veniceForge!.chat.delete(id);
  },
};

/**
 * Character RP Studio: local character card bridge.
 * In Electron, calls `window.veniceForge.characterCards.*` (IPC → filesystem).
 * In web mode, returns the documented "not available" error; callers are
 * expected to fall back to the IndexedDB path inside the renderer service.
 */
export const desktopCharacterCards = {
  async list(): Promise<{ ok: boolean; cards: CharacterCardV1[]; error?: string }> {
    if (!isElectron()) {
      return { ok: false, cards: [], error: "Character card filesystem storage is only available in desktop mode." };
    }
    return window.veniceForge!.characterCards.list();
  },
  async get(id: string): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, card: null, error: "Character card filesystem storage is only available in desktop mode." };
    return window.veniceForge!.characterCards.get(id);
  },
  async save(card: CharacterCardV1): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, card: null, error: "Character card filesystem storage is only available in desktop mode." };
    return window.veniceForge!.characterCards.save(card);
  },
  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Character card filesystem storage is only available in desktop mode." };
    return window.veniceForge!.characterCards.delete(id);
  },
};

/** Character RP Studio: user persona bridge. */
export const desktopPersonas = {
  async list(): Promise<{ ok: boolean; personas: UserPersonaV1[]; error?: string }> {
    if (!isElectron()) return { ok: false, personas: [], error: "Persona filesystem storage is only available in desktop mode." };
    return window.veniceForge!.personas.list();
  },
  async get(id: string): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, persona: null, error: "Persona filesystem storage is only available in desktop mode." };
    return window.veniceForge!.personas.get(id);
  },
  async save(persona: UserPersonaV1): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, persona: null, error: "Persona filesystem storage is only available in desktop mode." };
    return window.veniceForge!.personas.save(persona);
  },
  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Persona filesystem storage is only available in desktop mode." };
    return window.veniceForge!.personas.delete(id);
  },
};

/** Character RP Studio: lorebook bridge. */
export const desktopLorebooks = {
  async list(): Promise<{ ok: boolean; lorebooks: LorebookV1[]; error?: string }> {
    if (!isElectron()) return { ok: false, lorebooks: [], error: "Lorebook filesystem storage is only available in desktop mode." };
    return window.veniceForge!.lorebooks.list();
  },
  async get(id: string): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, lorebook: null, error: "Lorebook filesystem storage is only available in desktop mode." };
    return window.veniceForge!.lorebooks.get(id);
  },
  async save(lorebook: LorebookV1): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, lorebook: null, error: "Lorebook filesystem storage is only available in desktop mode." };
    return window.veniceForge!.lorebooks.save(lorebook);
  },
  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Lorebook filesystem storage is only available in desktop mode." };
    return window.veniceForge!.lorebooks.delete(id);
  },
};

/** Character RP Studio: multi-character chat bridge. */
export const desktopRpChats = {
  async list(): Promise<{ ok: boolean; chats: RpChatV1[]; error?: string }> {
    if (!isElectron()) return { ok: false, chats: [], error: "RP chat filesystem storage is only available in desktop mode." };
    return window.veniceForge!.rpChats.list();
  },
  async get(id: string): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, chat: null, error: "RP chat filesystem storage is only available in desktop mode." };
    return window.veniceForge!.rpChats.get(id);
  },
  async save(chat: RpChatV1): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, chat: null, error: "RP chat filesystem storage is only available in desktop mode." };
    return window.veniceForge!.rpChats.save(chat);
  },
  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "RP chat filesystem storage is only available in desktop mode." };
    return window.veniceForge!.rpChats.delete(id);
  },
};

/** Character RP Studio: routed asset bridge. */
export const desktopRpAssets = {
  async list(chatId?: string): Promise<{ ok: boolean; assets: RpAssetV1[]; error?: string }> {
    if (!isElectron()) return { ok: false, assets: [], error: "RP asset filesystem storage is only available in desktop mode." };
    return window.veniceForge!.rpAssets.list(chatId);
  },
  async get(id: string): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, asset: null, error: "RP asset filesystem storage is only available in desktop mode." };
    return window.veniceForge!.rpAssets.get(id);
  },
  async save(asset: RpAssetV1): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, asset: null, error: "RP asset filesystem storage is only available in desktop mode." };
    return window.veniceForge!.rpAssets.save(asset);
  },
  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "RP asset filesystem storage is only available in desktop mode." };
    return window.veniceForge!.rpAssets.delete(id);
  },
};

/** Phase 2F RP Studio Polish — standalone scenario bridge. */
export const desktopScenarios = {
  async list(): Promise<{ ok: boolean; scenarios: ScenarioV1[]; error?: string }> {
    if (!isElectron()) return { ok: false, scenarios: [], error: "Scenario filesystem storage is only available in desktop mode." };
    return window.veniceForge!.scenarios.list();
  },
  async get(id: string): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, scenario: null, error: "Scenario filesystem storage is only available in desktop mode." };
    return window.veniceForge!.scenarios.get(id);
  },
  async save(scenario: ScenarioV1): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }> {
    if (!isElectron()) return { ok: false, scenario: null, error: "Scenario filesystem storage is only available in desktop mode." };
    return window.veniceForge!.scenarios.save(scenario);
  },
  async delete(id: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Scenario filesystem storage is only available in desktop mode." };
    return window.veniceForge!.scenarios.delete(id);
  },
};

/** Ephemeral web-session Jina key. It is intentionally never persisted. */
let webSessionJinaApiKey = "";

/** Manages the Jina API key across desktop secure storage and web-session memory. */
export const desktopJinaApiKey = {
  async isConfigured(): Promise<boolean> {
    if (isElectron()) return window.veniceForge!.jinaApiKey.isConfigured();
    return webSessionJinaApiKey.length > 0;
  },
  async set(key: string): Promise<{ ok: boolean }> {
    if (isElectron()) return window.veniceForge!.jinaApiKey.set(key);
    webSessionJinaApiKey = key;
    return { ok: true };
  },
  async delete(): Promise<{ ok: boolean }> {
    if (isElectron()) return window.veniceForge!.jinaApiKey.delete();
    webSessionJinaApiKey = "";
    return { ok: true };
  },
  async test(): Promise<{ ok: boolean; status?: number; message: string }> {
    if (isElectron()) return window.veniceForge!.jinaApiKey.test();
    try {
      const headers: Record<string, string> = {};
      if (webSessionJinaApiKey) {
        headers["Authorization"] = `Bearer ${webSessionJinaApiKey}`;
      }
      const resp = await fetch("/api/proxy-jina", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
        },
        body: JSON.stringify({
          url: "https://r.jina.ai/https://example.com",
          headers,
        })
      });
      if (resp.ok) {
        return { ok: true, status: resp.status, message: "Jina connection successful" };
      }
      return { ok: false, status: resp.status, message: `Jina returned ${resp.status}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, status: 0, message: msg || "Network error testing Jina API key" };
    }
  },
};

/** Handles application updates, falling back to no-op in web mode. */
export const desktopUpdates = {
  checkForUpdates(): Promise<{ ok: boolean; version?: string; error?: string }> {
    if (!isElectron()) return Promise.resolve({ ok: false, error: "Auto-updates are only available in desktop mode." });
    return window.veniceForge!.updates.checkForUpdates();
  },
  downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return Promise.resolve({ ok: false, error: "Auto-updates are only available in desktop mode." });
    return window.veniceForge!.updates.downloadUpdate();
  },
  installUpdate(): Promise<{ ok: boolean }> {
    if (!isElectron()) return Promise.resolve({ ok: false });
    return window.veniceForge!.updates.installUpdate();
  },
  onUpdateAvailable(callback: (info: import("electron-updater").UpdateInfo) => void): () => void {
    if (!isElectron()) return () => {};
    return window.veniceForge!.updates.onUpdateAvailable(callback);
  },
  onUpdateNotAvailable(callback: () => void): () => void {
    if (!isElectron()) return () => {};
    return window.veniceForge!.updates.onUpdateNotAvailable(callback);
  },
  onDownloadProgress(callback: (progress: import("electron-updater").ProgressInfo) => void): () => void {
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
  }): Promise<{ ok: boolean; status?: number; body?: unknown; contentType?: string; error?: string }> {
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

    const finishLog = <T extends { ok: boolean; status?: number; body?: unknown; error?: string }>(
      result: T,
    ): T => {
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: result.status ?? (result.ok ? 200 : 500),
          durationMs: Date.now() - startedAt,
          guardOutcome: "deferred",
          error: result.error,
          responseBody: result.body === undefined ? undefined : sanitizeInspectorResponse(result.body),
        }),
      );
      return result;
    };

    if (isElectron()) {
      const result = await window.veniceForge!.jina.request(input);
      return finishLog(result);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      typeof input.timeoutMs === "number" && input.timeoutMs > 0
        ? Math.min(input.timeoutMs, 180000)
        : 30000
    );

    try {
      const headers = { ...input.headers };
      if (webSessionJinaApiKey && !headers["Authorization"] && !headers["authorization"]) {
        headers["Authorization"] = `Bearer ${webSessionJinaApiKey}`;
      }

      const response = await fetch("/api/proxy-jina", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
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
      return finishLog({ ok: false, status: 0, error: msg || "Jina proxy request failed" });
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
    if (!isElectron()) return { ok: false, error: "Local config is only available in desktop mode." };
    return window.veniceForge!.config.get();
  },
  /** Reloads the config from disk. */
  async reload(): Promise<{ ok: boolean; status?: unknown; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Local config is only available in desktop mode." };
    return window.veniceForge!.config.reload();
  },
  /** Returns just the config status (cheap to call). */
  async getStatus(): Promise<{ ok: boolean; status?: unknown; paths?: unknown; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Local config is only available in desktop mode." };
    return window.veniceForge!.config.getStatus();
  },
  /** Opens the active config folder in the OS file manager. */
  async openFolder(): Promise<{ ok: boolean; path: string; error?: string }> {
    if (!isElectron()) return { ok: false, path: "", error: "Local config is only available in desktop mode." };
    return window.veniceForge!.config.openFolder();
  },
  /** Writes a sanitized patch (non-secret values only). The renderer cannot
   *  set plaintext API keys via this method — those go through the existing
   *  `apiKey:set` / `jinaApiKey:set` IPC channels. */
  async writeSanitized(patch: unknown): Promise<{ ok: boolean; error?: string; redactedFields?: string[] }> {
    if (!isElectron()) return { ok: false, error: "Local config is only available in desktop mode." };
    return window.veniceForge!.config.writeSanitized(patch);
  },
  /** Exports a sanitized config template to the given path. */
  async exportTemplate(targetPath: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Local config is only available in desktop mode." };
    return window.veniceForge!.config.exportTemplate(targetPath);
  },
  /** Loads the merged themes file (built-in + local). */
  async loadMergedThemes(): Promise<{ ok: boolean; themes?: Record<string, unknown>; warnings?: unknown[]; error?: string }> {
    if (!isElectron()) return { ok: false, themes: {}, warnings: [] };
    return window.veniceForge!.config.loadMergedThemes();
  },
  /** Removes any secure-store API keys. */
  async resetSecureStoreKeys(): Promise<{ ok: boolean; removed?: { venice: boolean; jina: boolean }; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Local config is only available in desktop mode." };
    return window.veniceForge!.config.resetSecureStoreKeys();
  },
};
