/** @fileoverview Exposes a hardened contextBridge API to the renderer for Venice
 *  API requests, secure key storage, and app diagnostics. */

import { contextBridge, ipcRenderer } from "electron";
import type { Conversation } from "../src/types/conversation";
import type { ConversationRecordV1, SearchResult, PulledMemoryContext } from "../src/types/conversationVault";
import type { CharacterCardV1, UserPersonaV1, LorebookV1, RpChatV1, RpAssetV1, ScenarioV1 } from "../src/types/rp";

/** Represents a Venice API request sent from the renderer to the main process. */
type VeniceRequest = {
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signalId?: string;
  localFamilySafeModeEnabled?: boolean;
};

/** API surface exposed to the renderer via contextBridge. */
const veniceForge = {
  /** Marks the current environment as a desktop Electron build. */
  isDesktop: true as const,

  venice: {
    /** Sends a single Venice API request through IPC and awaits the response.
     *  @param input The Venice request payload.
     *  @returns A promise resolving with the main process response.
     */
    request(input: VeniceRequest) {
      return ipcRenderer.invoke("venice:request", input);
    },
    /** Initiates a streaming chat completion and delivers deltas via IPC events.
     *  @param input The Venice request payload.
     *  @param onDelta Callback invoked for each streamed text delta.
     *  @returns A promise that settles when the stream ends or errors.
     */
    streamChat(input: VeniceRequest, onDelta: (chunk: { content: string; reasoning: string }) => void) {
      const signalId = input.signalId || globalThis.crypto.randomUUID();
      const listener = (_event: Electron.IpcRendererEvent, payload: { signalId: string; delta: string; reasoning?: string }) => {
        if (payload.signalId === signalId && typeof payload.delta === "string") {
          onDelta({ content: payload.delta, reasoning: payload.reasoning || "" });
        }
      };
      ipcRenderer.on("venice:streamDelta", listener);
      const pending = ipcRenderer.invoke("venice:streamChat", { ...input, signalId });
      // If the renderer is killed before the stream ends, notify main to abort
      // so the activeRequests Map does not leak. We listen to BOTH
      // beforeunload and pagehide because the two events are not
      // interchangeable across browsers: beforeunload is unreliable
      // on iOS Safari and may not fire on bfcache restores; pagehide is
      // the spec-recommended event for "the page is being hidden" and
      // fires in more cases (including bfcache). Belt + suspenders.
      const abortOnLeave = () => {
        ipcRenderer.invoke("venice:abort", signalId).catch(() => {});
      };
      const global = globalThis as typeof globalThis & { addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void };
      global.addEventListener("beforeunload", abortOnLeave);
      global.addEventListener("pagehide", abortOnLeave);
      return pending.finally(() => {
        global.removeEventListener("beforeunload", abortOnLeave);
        global.removeEventListener("pagehide", abortOnLeave);
        ipcRenderer.removeListener("venice:streamDelta", listener);
      });
    },
    /** Signals the main process to abort an active Venice request.
     *  @param signalId The identifier of the request to abort.
     *  @returns A promise resolving when the abort signal is sent.
     */
    abort(signalId: string) {
      return ipcRenderer.invoke("venice:abort", signalId);
    },
  },

  apiKey: {
    /** Checks whether a Venice API key has been stored securely.
     *  @returns A promise resolving to true when a key is configured.
     */
    isConfigured(): Promise<boolean> {
      return ipcRenderer.invoke("apiKey:isConfigured");
    },
    /** Stores the Venice API key using OS-level encryption.
     *  @param key The API key to encrypt and store.
     *  @returns A promise resolving with the operation result.
     */
    set(key: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("apiKey:set", key);
    },
    /** Removes the stored Venice API key.
     *  @returns A promise resolving with the operation result.
     */
    delete(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("apiKey:delete");
    },
    /** Verifies connectivity to the Venice API with the stored key.
     *  @returns A promise resolving with the test result and status.
     */
    test(): Promise<{ ok: boolean; status?: number; message: string }> {
      return ipcRenderer.invoke("apiKey:test");
    },
  },

  jinaApiKey: {
    isConfigured(): Promise<boolean> {
      return ipcRenderer.invoke("jinaApiKey:isConfigured");
    },
    set(key: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("jinaApiKey:set", key);
    },
    delete(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("jinaApiKey:delete");
    },
    test(): Promise<{ ok: boolean; status?: number; message: string }> {
      return ipcRenderer.invoke("jinaApiKey:test");
    },
  },

  jina: {
    request(input: {
      url: string;
      headers?: Record<string, string>;
      timeoutMs?: number;
    }): Promise<{ ok: boolean; status?: number; body?: unknown; contentType?: string; error?: string }> {
      return ipcRenderer.invoke("jina:request", input);
    },
  },

  app: {
    /** Returns the current application version.
     *  @returns A promise resolving with the version string.
     */
    getVersion(): Promise<string> {
      return ipcRenderer.invoke("app:getVersion");
    },
    /** Returns the path to the application's user data directory.
     *  @returns A promise resolving with the absolute path.
     */

    /** Checks whether OS-level encryption is available for secure storage.
     *  @returns A promise resolving to true when encryption is available.
     */
    isEncryptionAvailable(): Promise<boolean> {
      return ipcRenderer.invoke("app:isEncryptionAvailable");
    },
    /** Retrieves application diagnostics and runtime information. */
    getDiagnostics() {
      return ipcRenderer.invoke("app:getDiagnostics");
    },
    /** Opens the log folder in the system file manager.
     *  @returns A promise resolving with the operation result.
     */
    openLogsFolder(): Promise<{ ok: boolean; path: string }> {
      return ipcRenderer.invoke("app:openLogsFolder");
    },
    proxyScrape(url: string) {
      return ipcRenderer.invoke("app:proxyScrape", url);
    },
  },

  files: {
    /** Shows a save dialog and writes JSON data to the selected file.
     *  @param data The JSON string to write.
     *  @param defaultPath Optional default filename for the dialog.
     *  @returns A promise resolving with the save result.
     */
    saveJsonFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }> {
      return ipcRenderer.invoke("app:saveJsonFile", data, defaultPath);
    },
    loadJsonFile(): Promise<{ ok: boolean; canceled: boolean; data?: string; error?: string }> {
      return ipcRenderer.invoke("app:loadJsonFile");
    },
    saveYamlFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }> {
      return ipcRenderer.invoke("app:saveYamlFile", data, defaultPath);
    },
    loadYamlFile(): Promise<{ ok: boolean; canceled: boolean; data?: string; error?: string }> {
      return ipcRenderer.invoke("app:loadYamlFile");
    },
    /** Opens a dialog to select and read a text file (for attachment import).
     *  @returns A promise resolving with the file contents and filename.
     */
    readLocalFile(): Promise<{ ok: boolean; canceled?: boolean; content?: string; filename?: string; error?: string }> {
      return ipcRenderer.invoke("app:readLocalFile");
    },
    saveRoutedImage(base64Data: string, filename: string, subfolder: string): Promise<{ ok: boolean; filePath?: string; error?: string }> {
      return ipcRenderer.invoke("app:saveRoutedImage", base64Data, filename, subfolder);
    },
    /** Media Studio: export a base64 image to Pictures/Venice Forge/Media Studio. */
    exportMedia(input: { base64Data: string; filename: string; subfolder?: string; dryRun?: boolean }): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }> {
      return ipcRenderer.invoke("app:media:export", input);
    },
    /** Media Studio: read a file from an allowlisted directory and return it as a data URL. */
    importMedia(input: { filePath: string }): Promise<{
      ok: boolean; canceled?: boolean; dataUrl?: string; filePath?: string;
      filename?: string; bytes?: number; contentType?: string; error?: string;
    }> {
      return ipcRenderer.invoke("app:media:import", input);
    },
    /** Media Studio: reveal a file in the OS file manager (path is allowlist-validated). */
    revealMedia(input: { filePath: string }): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("app:media:reveal", input);
    },
    /** Media Studio: read filesystem metadata for a reveal-safe path. */
    readMediaMeta(input: { filePath: string }): Promise<{
      ok: boolean; filePath?: string; bytes?: number; mtime?: number; isFile?: boolean; error?: string;
    }> {
      return ipcRenderer.invoke("app:media:meta", input);
    },
    /** Media Studio: generate (or return cached) sha256-keyed thumbnail. */
    generateMediaThumb(input: { sha256: string; source: string; maxDimension?: number }): Promise<{
      ok: boolean; filePath?: string; url?: string; error?: string;
    }> {
      return ipcRenderer.invoke("app:media:thumb", input);
    },
    /** Character avatar cache: fetch/cache a Venice character photo and return a venice-character-cache:// URL for renderer img-src loading. */
    getCharacterImage(url: string): Promise<{
      ok: boolean; url?: string; contentType?: string; bytes?: number; error?: string;
    }> {
      return ipcRenderer.invoke("app:characterImage:get", url);
    },
    clearCharacterImageCache(): Promise<{ ok: boolean; deletedCount?: number; error?: string }> {
      return ipcRenderer.invoke("app:characterImage:clearCache");
    },
    getCharacterImageCacheInventory(): Promise<{
      ok: boolean; count?: number; totalBytes?: number; error?: string;
    }> {
      return ipcRenderer.invoke("app:characterImage:inventory");
    },
  },

  chat: {
    /** Lists all persisted conversations. */
    list(): Promise<{ ok: boolean; conversations: Conversation[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("chat:list");
    },
    /** Lists a single paginated page of conversations (T14). */
    listPage(params: { offset: number; limit: number }): Promise<{
      ok: boolean;
      conversations: Conversation[];
      truncated: boolean;
      totalScanned: number;
      offset: number;
      count: number;
      error?: string;
    }> {
      return ipcRenderer.invoke("chat:listPage", params);
    },
    /** Retrieves a single conversation by id. */
    get(id: string): Promise<{ ok: boolean; conversation: Conversation | null; error?: string }> {
      return ipcRenderer.invoke("chat:get", id);
    },
    /** Saves a conversation atomically to disk. */
    save(conversation: Conversation): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("chat:save", { conversation });
    },
    /** Deletes a conversation by id. */
    delete(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("chat:delete", id);
    },
  },

  conversations: {
    list(filter?: {
      archived?: boolean;
      pinned?: boolean;
      tags?: string[];
      model?: string;
      dateFrom?: number;
      dateTo?: number;
    }): Promise<{ ok: boolean; records: ConversationRecordV1[]; error?: string }> {
      return ipcRenderer.invoke("conversations:list", filter);
    },
    get(id: string): Promise<{ ok: boolean; record: ConversationRecordV1 | null; error?: string }> {
      return ipcRenderer.invoke("conversations:get", id);
    },
    save(record: ConversationRecordV1): Promise<{ ok: boolean; id: string; error?: string }> {
      return ipcRenderer.invoke("conversations:save", record);
    },
    delete(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("conversations:delete", id);
    },
    archive(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("conversations:archive", id);
    },
    search(query: string, options?: { limit?: number; includeArchived?: boolean }): Promise<{ ok: boolean; results: SearchResult[]; error?: string }> {
      return ipcRenderer.invoke("conversations:search", query, options);
    },
    pullContext(input: { message: string; maxItems?: number; maxTokens?: number; includeArchived?: boolean }): Promise<{ ok: boolean; context: PulledMemoryContext; error?: string }> {
      return ipcRenderer.invoke("conversations:pullContext", input);
    },
    rebuildIndex(): Promise<{ ok: boolean; itemsIndexed: number; error?: string }> {
      return ipcRenderer.invoke("conversations:rebuildIndex");
    },
    migrateLegacyHistory(): Promise<{ ok: boolean; migrated: number; failed: number; skipped: number; error?: string }> {
      return ipcRenderer.invoke("conversations:migrateLegacyHistory");
    },
    detectLegacyHistory(): Promise<boolean> {
      return ipcRenderer.invoke("conversations:detectLegacyHistory");
    },
    openConversationsFolder(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("app:openConversationsFolder");
    },
  },

  updates: {
    checkForUpdates(): Promise<{ ok: boolean; version?: string; error?: string }> {
      return ipcRenderer.invoke("app:checkForUpdates");
    },
    downloadUpdate(): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("app:downloadUpdate");
    },
    installUpdate(): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("app:installUpdate");
    },
    onUpdateAvailable(callback: (info: import("electron-updater").UpdateInfo) => void) {
      const listener = (_event: Electron.IpcRendererEvent, info: import("electron-updater").UpdateInfo) => callback(info);
      ipcRenderer.on("updates:available", listener);
      return () => {
        ipcRenderer.removeListener("updates:available", listener);
      };
    },
    onUpdateNotAvailable(callback: () => void) {
      const listener = () => callback();
      ipcRenderer.on("updates:not-available", listener);
      return () => {
        ipcRenderer.removeListener("updates:not-available", listener);
      };
    },
    onDownloadProgress(callback: (progress: import("electron-updater").ProgressInfo) => void) {
      const listener = (_event: Electron.IpcRendererEvent, progress: import("electron-updater").ProgressInfo) => callback(progress);
      ipcRenderer.on("updates:progress", listener);
      return () => {
        ipcRenderer.removeListener("updates:progress", listener);
      };
    },
    onUpdateDownloaded(callback: () => void) {
      const listener = () => callback();
      ipcRenderer.on("updates:downloaded", listener);
      return () => {
        ipcRenderer.removeListener("updates:downloaded", listener);
      };
    },
    onUpdateError(callback: (error: string) => void) {
      const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on("updates:error", listener);
      return () => {
        ipcRenderer.removeListener("updates:error", listener);
      };
    },
  },

  config: {
    get(): Promise<{ ok: boolean; payload?: unknown; error?: string }> {
      return ipcRenderer.invoke("config:get");
    },
    reload(): Promise<{ ok: boolean; status?: unknown; error?: string }> {
      return ipcRenderer.invoke("config:reload");
    },
    getStatus(): Promise<{ ok: boolean; status?: unknown; paths?: unknown; error?: string }> {
      return ipcRenderer.invoke("config:getStatus");
    },
    openFolder(): Promise<{ ok: boolean; path: string; error?: string }> {
      return ipcRenderer.invoke("config:openFolder");
    },
    writeSanitized(patch: unknown): Promise<{ ok: boolean; error?: string; redactedFields?: string[] }> {
      return ipcRenderer.invoke("config:writeSanitized", patch);
    },
    exportTemplate(targetPath: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("config:exportTemplate", targetPath);
    },
    loadMergedThemes(): Promise<{ ok: boolean; themes?: Record<string, unknown>; warnings?: unknown[]; error?: string }> {
      return ipcRenderer.invoke("config:loadMergedThemes");
    },
    resetSecureStoreKeys(): Promise<{ ok: boolean; removed?: { venice: boolean; jina: boolean }; error?: string }> {
      return ipcRenderer.invoke("config:resetSecureStoreKeys");
    },
  },

  characterCards: {
    list(): Promise<{ ok: boolean; cards: CharacterCardV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("characterCards:list");
    },
    get(id: string): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }> {
      return ipcRenderer.invoke("characterCards:get", id);
    },
    save(card: CharacterCardV1): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }> {
      return ipcRenderer.invoke("characterCards:save", card);
    },
    delete(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("characterCards:delete", id);
    },
  },

  personas: {
    list(): Promise<{ ok: boolean; personas: UserPersonaV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("personas:list");
    },
    get(id: string): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }> {
      return ipcRenderer.invoke("personas:get", id);
    },
    save(persona: UserPersonaV1): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }> {
      return ipcRenderer.invoke("personas:save", persona);
    },
    delete(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("personas:delete", id);
    },
  },

  lorebooks: {
    list(): Promise<{ ok: boolean; lorebooks: LorebookV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("lorebooks:list");
    },
    get(id: string): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }> {
      return ipcRenderer.invoke("lorebooks:get", id);
    },
    save(lorebook: LorebookV1): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }> {
      return ipcRenderer.invoke("lorebooks:save", lorebook);
    },
    delete(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("lorebooks:delete", id);
    },
  },

  rpChats: {
    list(): Promise<{ ok: boolean; chats: RpChatV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("rpChats:list");
    },
    get(id: string): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }> {
      return ipcRenderer.invoke("rpChats:get", id);
    },
    save(chat: RpChatV1): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }> {
      return ipcRenderer.invoke("rpChats:save", chat);
    },
    delete(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("rpChats:delete", id);
    },
  },

  rpAssets: {
    list(chatId?: string): Promise<{ ok: boolean; assets: RpAssetV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("rpAssets:list", chatId);
    },
    get(id: string): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }> {
      return ipcRenderer.invoke("rpAssets:get", id);
    },
    save(asset: RpAssetV1): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }> {
      return ipcRenderer.invoke("rpAssets:save", asset);
    },
    delete(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("rpAssets:delete", id);
    },
  },

  // Phase 2F RP Studio Polish — standalone scenarios.
  scenarios: {
    list(): Promise<{ ok: boolean; scenarios: ScenarioV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("scenarios:list");
    },
    get(id: string): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }> {
      return ipcRenderer.invoke("scenarios:get", id);
    },
    save(scenario: ScenarioV1): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }> {
      return ipcRenderer.invoke("scenarios:save", scenario);
    },
    delete(id: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("scenarios:delete", id);
    },
  },
};

contextBridge.exposeInMainWorld("veniceForge", veniceForge);
