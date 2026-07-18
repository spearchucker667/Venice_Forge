/** @fileoverview Exposes a hardened contextBridge API to the renderer for Venice
 *  API requests, secure key storage, and app diagnostics. */

import { contextBridge, ipcRenderer } from "electron";
import type { Conversation } from "../src/types/conversation";
import type { ConversationRecordV1, SearchResult, PulledMemoryContext } from "../src/types/conversationVault";
import type { CharacterCardV1, UserPersonaV1, LorebookV1, RpChatV1, RpAssetV1, ScenarioV1 } from "../src/types/rp";
import type { MutationOrigin } from "../src/types/sync";
import type { BackgroundTask, BackgroundTaskCreateInput, BackgroundTaskIpcEnvelope } from "../src/types/background-task";

/** Represents a Venice API request sent from the renderer to the main process. */
type VeniceRequest = {
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signalId?: string;
  localFamilySafeModeEnabled?: boolean;
  profileId?: string;

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
    streamChat(input: VeniceRequest, onDelta: (chunk: { content: string; reasoning: string; providerRequestId?: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }) => void) {
      const signalId = input.signalId || globalThis.crypto.randomUUID();
      const listener = (_event: Electron.IpcRendererEvent, payload: { signalId: string; delta: string; reasoning?: string; providerRequestId?: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }) => {
        if (payload.signalId === signalId && typeof payload.delta === "string") {
          onDelta({ content: payload.delta, reasoning: payload.reasoning || "", providerRequestId: payload.providerRequestId, usage: payload.usage });
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

  
  credentials: {
    set(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("credential:set", { key, value });
    },
    get(key: string): Promise<{ ok: boolean; value: string | null; error?: string }> {
      return ipcRenderer.invoke("credential:get", key);
    },
    delete(key: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("credential:delete", key);
    },
  },

  masterPassword: {
    isSet(): Promise<boolean> {
      return ipcRenderer.invoke("masterPassword:isSet");
    },
    set(password: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("masterPassword:set", password);
    },
    verify(password: string): Promise<{ ok: boolean; verified: boolean; lockedOutSeconds?: number; error?: string }> {
      return ipcRenderer.invoke("masterPassword:verify", password);
    },
    clear(): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("masterPassword:clear");
    },
  },

  profilePassword: {
    activate(profileId: string, password?: string): Promise<{ ok: boolean; verified: boolean; profileId?: string; lockedOutSeconds?: number; error?: string }> {
      return ipcRenderer.invoke("profileSession:activate", { profileId, password });
    },
    isSet(profileId: string): Promise<boolean> {
      return ipcRenderer.invoke("profilePassword:isSet", profileId);
    },
    set(profileId: string, password: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("profilePassword:set", { profileId, password });
    },
    verify(profileId: string, password: string): Promise<{ ok: boolean; verified: boolean; lockedOutSeconds?: number; error?: string }> {
      return ipcRenderer.invoke("profilePassword:verify", { profileId, password });
    },
    clear(profileId: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("profilePassword:clear", profileId);
    },
  },

  profilePurge: {
    purge(profileId: string) {
      return ipcRenderer.invoke("profile:purge", profileId);
    },
  },

  apiKey: {
    isConfigured: (profileId?: string) => {
      return ipcRenderer.invoke("apiKey:isConfigured", profileId);
    },
    set: (key: string, profileId?: string) => {
      return ipcRenderer.invoke("apiKey:set", { key, profileId });
    },
    delete: (profileId?: string) => {
      return ipcRenderer.invoke("apiKey:delete", profileId);
    },
    test: (profileId?: string) => {
      return ipcRenderer.invoke("apiKey:test", profileId);
    },
  },

  providerApiKey: {
    isConfigured: (providerId: string, profileId?: string) => {
      return ipcRenderer.invoke("providerApiKey:isConfigured", { providerId, profileId });
    },
    set: (providerId: string, key: string, profileId?: string) => {
      return ipcRenderer.invoke("providerApiKey:set", { providerId, key, profileId });
    },
    delete: (providerId: string, profileId?: string) => {
      return ipcRenderer.invoke("providerApiKey:delete", { providerId, profileId });
    },
  },

  providerSettings: {
    get() {
      return ipcRenderer.invoke("providerSettings:get");
    },
    update(input: { enabledProviders?: Record<string, boolean>; autoFallbackEnabled?: boolean; fallbackOrdering?: string[] }) {
      return ipcRenderer.invoke("providerSettings:update", input);
    },
  },

  jinaApiKey: {
    isConfigured(profileId?: string): Promise<boolean> {
      return ipcRenderer.invoke("jinaApiKey:isConfigured", profileId);
    },
    set(key: string, profileId?: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("jinaApiKey:set", { key, profileId });
    },
    delete(profileId?: string): Promise<{ ok: boolean }> {
      return ipcRenderer.invoke("jinaApiKey:delete", profileId);
    },
    test(profileId?: string): Promise<{ ok: boolean; status?: number; message: string }> {
      return ipcRenderer.invoke("jinaApiKey:test", profileId);
    },
  },

  jina: {
    request(input: {
      url: string;
      headers?: Record<string, string>;
      timeoutMs?: number;
      profileId?: string;
    }): Promise<{ ok: boolean; status?: number; body?: unknown; contentType?: string; error?: string }> {
      return ipcRenderer.invoke("jina:request", input);
    },
  },

  tts: {
    synthesize(opts: { text: string; model?: string; voice?: string; speed?: number }, cacheEnabled: boolean): ReturnType<import("../src/types/desktop").VeniceForgeTts["synthesize"]> {
      return ipcRenderer.invoke("tts:synthesize", opts, cacheEnabled);
    },
    clearCache(): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("tts:clearCache");
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
    saveGeneratedMedia(input: { mediaId: string; suggestedName?: string }): Promise<{ ok: boolean; canceled: boolean; filename?: string; bytes?: number; error?: string }> {
      return ipcRenderer.invoke("app:media:save-generated", input);
    },
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
    save(conversation: Conversation, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("chat:save", { conversation, origin });
    },
    /** Deletes a conversation by id. */
    delete(id: string, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("chat:delete", { id, origin });
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
    save(record: ConversationRecordV1, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; id: string; error?: string }> {
      return ipcRenderer.invoke("conversations:save", { record, origin });
    },
    delete(id: string, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("conversations:delete", { id, origin });
    },
    archive(id: string, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("conversations:archive", { id, origin });
    },
    search(query: string, options?: { limit?: number; includeArchived?: boolean }): Promise<{ ok: boolean; results: SearchResult[]; error?: string }> {
      return ipcRenderer.invoke("conversations:search", query, options);
    },
    pullContext(input: { message: string; maxItems?: number; maxTokens?: number; includeArchived?: boolean; excludeConversationIds?: string[]; characterId?: string }): Promise<{ ok: boolean; context: PulledMemoryContext; error?: string }> {
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
    initialize(): Promise<{ ok: boolean; status?: unknown; error?: string }> {
      return ipcRenderer.invoke("config:initialize");
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
    exportTemplate(): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
      return ipcRenderer.invoke("config:exportTemplate");
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
    save(card: CharacterCardV1, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }> {
      return ipcRenderer.invoke("characterCards:save", { card, origin });
    },
    delete(id: string, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("characterCards:delete", { id, origin });
    },
    chooseImportFile() {
      return ipcRenderer.invoke("characterCards:chooseImportFile");
    },
    applyImport(payload: import("../src/types/character-card-files").CharacterCardImportApplyOptions) {
      return ipcRenderer.invoke("characterCards:applyImport", payload);
    },
    undoImport(payload: { handle: string }) {
      return ipcRenderer.invoke("characterCards:undoImport", payload);
    },
    exportJson(payload: { cardId: string; profile?: "standard" | "privacy-reduced" }) {
      return ipcRenderer.invoke("characterCards:exportJson", payload);
    },
    exportPng(payload: { cardId: string; profile?: "standard" | "privacy-reduced" }) {
      return ipcRenderer.invoke("characterCards:exportPng", payload);
    },
  },

  personas: {
    list(): Promise<{ ok: boolean; personas: UserPersonaV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("personas:list");
    },
    get(id: string): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }> {
      return ipcRenderer.invoke("personas:get", id);
    },
    save(persona: UserPersonaV1, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }> {
      return ipcRenderer.invoke("personas:save", { persona, origin });
    },
    delete(id: string, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("personas:delete", { id, origin });
    },
  },

  lorebooks: {
    list(): Promise<{ ok: boolean; lorebooks: LorebookV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("lorebooks:list");
    },
    get(id: string): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }> {
      return ipcRenderer.invoke("lorebooks:get", id);
    },
    save(lorebook: LorebookV1, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }> {
      return ipcRenderer.invoke("lorebooks:save", { lorebook, origin });
    },
    delete(id: string, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("lorebooks:delete", { id, origin });
    },
  },

  rpChats: {
    list(): Promise<{ ok: boolean; chats: RpChatV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("rpChats:list");
    },
    get(id: string): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }> {
      return ipcRenderer.invoke("rpChats:get", id);
    },
    save(chat: RpChatV1, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }> {
      return ipcRenderer.invoke("rpChats:save", { chat, origin });
    },
    delete(id: string, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("rpChats:delete", { id, origin });
    },
  },

  rpAssets: {
    list(chatId?: string): Promise<{ ok: boolean; assets: RpAssetV1[]; truncated: boolean; totalScanned: number; error?: string }> {
      return ipcRenderer.invoke("rpAssets:list", chatId);
    },
    get(id: string): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }> {
      return ipcRenderer.invoke("rpAssets:get", id);
    },
    save(asset: RpAssetV1, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }> {
      return ipcRenderer.invoke("rpAssets:save", { asset, origin });
    },
    delete(id: string, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("rpAssets:delete", { id, origin });
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
    save(scenario: ScenarioV1, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }> {
      return ipcRenderer.invoke("scenarios:save", { scenario, origin });
    },
    delete(id: string, origin: MutationOrigin = "local-user"): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("scenarios:delete", { id, origin });
    },
  },

  sync: {
    chooseSyncFolder(): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:chooseSyncFolder");
    },
    getSyncFolder(): Promise<{ ok: boolean; path?: string | null } & import("../src/types/desktop").SyncRuntimeStatus> {
      return ipcRenderer.invoke("sync:getSyncFolder");
    },
    setSyncFolder(input: { path: string }): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:setSyncFolder", input);
    },
    startSync(input: { password: string; profileId: string; includeMedia?: boolean }): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:startSync", input);
    },
    applyRemoteMutation(input: { storeName: string; id: string; recordJson?: string; delete?: boolean; remoteApplyToken: string }): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:applyRemoteMutation", input);
    },
    stopSync(): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:stopSync");
    },
    pauseSync(): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:pauseSync");
    },
    getStatus(): Promise<{ ok: boolean } & import("../src/types/desktop").SyncRuntimeStatus> {
      return ipcRenderer.invoke("sync:getStatus");
    },
    setRendererSessionAttached(input: { attached: boolean }): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:rendererSessionAttached", input);
    },
    setEmissionSuppressed(input: { suppressed: boolean }): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:setEmissionSuppressed", input);
    },
    writePacket(input: { storeName: string; id: string; recordJson: string }): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:writePacket", input);
    },
    acknowledgeOperation(input: { operationId: string; ok: boolean }): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("sync:acknowledgeOperation", input);
    },
    beginBackupExport(): Promise<{ ok: boolean; profileId?: string; deviceId?: string; token?: string; error?: string }> {
      return ipcRenderer.invoke("sync:beginBackupExport");
    },
    encryptBackup(input: { payload: string, password: string, token: string }): Promise<{ ok: boolean; data?: { salt: string, iv: string, ciphertext: string }; error?: string }> {
      return ipcRenderer.invoke("sync:encryptBackup", input);
    },
    decryptBackup(input: { ciphertext: string, salt: string, iv: string, password: string }): Promise<{ ok: boolean; data?: string; error?: string }> {
      return ipcRenderer.invoke("sync:decryptBackup", input);
    },
    createReplaceImportRecovery(input: { manifest: import("../src/types/desktop").EncryptedBackupManifestTransport; password: string }): Promise<{ ok: boolean; recovery?: import("../src/types/desktop").ReplaceImportRecoveryTransport; error?: string }> {
      return ipcRenderer.invoke("sync:createReplaceImportRecovery", input);
    },
    getLatestReplaceImportRecovery(): Promise<{ ok: boolean; recovery?: import("../src/types/desktop").ReplaceImportRecoveryTransport | null; error?: string }> {
      return ipcRenderer.invoke("sync:getLatestReplaceImportRecovery");
    },
    loadReplaceImportRecovery(input: { id: string; password: string }): Promise<{ ok: boolean; manifest?: import("../src/types/desktop").EncryptedBackupManifestTransport; error?: string }> {
      return ipcRenderer.invoke("sync:loadReplaceImportRecovery", input);
    },
    onRemoteChange(callback: (event: { storeName: string; id: string; operationId: string; recordJson: string; remoteApplyToken: string }) => void) {
      const listener = (_event: Electron.IpcRendererEvent, eventData: { storeName: string; id: string; operationId: string; recordJson: string; remoteApplyToken: string }) => callback(eventData);
      ipcRenderer.on("sync:onRemoteChange", listener);
      return () => {
        ipcRenderer.removeListener("sync:onRemoteChange", listener);
      };
    },
  },

  backgroundTask: {
    subscribe(): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("backgroundTask:subscribe");
    },
    unsubscribe(): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("backgroundTask:unsubscribe");
    },
    create(input: BackgroundTaskCreateInput): Promise<{ ok: boolean; task?: BackgroundTask; error?: string }> {
      return ipcRenderer.invoke("backgroundTask:create", input);
    },
    update(taskId: string, updates: Partial<BackgroundTask>): Promise<{ ok: boolean; task?: BackgroundTask | null; error?: string }> {
      return ipcRenderer.invoke("backgroundTask:update", { taskId, updates });
    },
    list(): Promise<{ ok: boolean; tasks?: BackgroundTask[]; error?: string }> {
      return ipcRenderer.invoke("backgroundTask:list");
    },
    cancel(taskId: string): Promise<{ ok: boolean; task?: BackgroundTask | null; error?: string }> {
      return ipcRenderer.invoke("backgroundTask:cancel", taskId);
    },
    retry(taskId: string): Promise<{ ok: boolean; task?: BackgroundTask | null; error?: string }> {
      return ipcRenderer.invoke("backgroundTask:retry", taskId);
    },
    clear(taskId: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("backgroundTask:clear", taskId);
    },
    onUpdate(callback: (envelope: BackgroundTaskIpcEnvelope) => void) {
      const listener = (_event: Electron.IpcRendererEvent, envelope: BackgroundTaskIpcEnvelope) => callback(envelope);
      ipcRenderer.on("backgroundTask:update", listener);
      return () => {
        ipcRenderer.removeListener("backgroundTask:update", listener);
      };
    },
  },
};

contextBridge.exposeInMainWorld("veniceForge", veniceForge);
