/** @fileoverview Type definitions for the Electron preload bridge API. */

import type { UpdateInfo, ProgressInfo } from "electron-updater";
import type { Conversation } from "./conversation";
import type { ConversationRecordV1, SearchResult, PulledMemoryContext } from "./conversationVault";
import type {
  CharacterCardV1,
  LorebookV1,
  RpAssetV1,
  RpChatV1,
  ScenarioV1,
  UserPersonaV1,
} from "./rp";

/** Manages the Venice API key in secure OS-level storage. */
export interface VeniceForgeApiKey {
  isConfigured(): Promise<boolean>;
  set(key: string): Promise<{ ok: boolean }>;
  delete(): Promise<{ ok: boolean }>;
  test(): Promise<{ ok: boolean; status?: number; message: string }>;
}

/** Makes Jina API requests from the main process with the stored key attached. */
export interface VeniceForgeJina {
  request(input: {
    url: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ ok: boolean; status?: number; body?: unknown; contentType?: string; error?: string }>;
}

/** Describes a single request sent through the Electron IPC bridge. */
export interface VeniceForgeRequest {
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signalId?: string;
  localFamilySafeModeEnabled?: boolean;
}

/** Describes the response returned from the Electron IPC bridge. */
export interface VeniceForgeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  contentType: string;
}

/** Provides methods for calling the Venice API via the main process. */
export interface VeniceForgeVenice {
  request(input: VeniceForgeRequest): Promise<VeniceForgeResponse>;
  streamChat(input: VeniceForgeRequest, onDelta: (chunk: { content: string; reasoning: string }) => void): Promise<VeniceForgeResponse>;
  abort(signalId: string): Promise<{ ok: boolean }>;
}

/** Diagnostic metadata about the desktop application environment. */
export interface VeniceForgeDiagnostics {
  isDesktop: boolean;
  appVersion: string;
  electronVersion?: string;
  chromeVersion?: string;
  nodeVersion?: string;
  userDataPath: string;
  logsPath?: string;
  storageMode: "encrypted" | "unavailable" | "plaintext-fallback" | "web";
  secureStorageAvailable: boolean;
  securePrefsCorrupted?: boolean;
  securePrefsError?: string | null;
  apiKeyConfigured: boolean;
  transport: "direct-ipc" | "web-proxy";
  lastApiError?: string;
}

/** Exposes application-level helpers available through the preload bridge. */
export interface VeniceForgeApp {
  getVersion(): Promise<string>;
  getDataPath(): Promise<string>;
  isEncryptionAvailable(): Promise<boolean>;
  getDiagnostics(): Promise<VeniceForgeDiagnostics>;
  openLogsFolder(): Promise<{ ok: boolean; path: string }>;
  proxyScrape(url: string): Promise<{ ok: boolean; data?: { url: string; finalUrl: string; contentType: string; body: string }; error?: string }>;
}

/** Exposes file dialog helpers for importing and exporting JSON data. */
export interface VeniceForgeFiles {
  saveJsonFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }>;
  loadJsonFile(): Promise<{ ok: boolean; canceled: boolean; data?: string; error?: string }>;
  saveYamlFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }>;
  loadYamlFile(): Promise<{ ok: boolean; canceled: boolean; data?: string; error?: string }>;
  readLocalFile(filePath: string): Promise<{ ok: boolean; content?: string; error?: string }>;
  saveRoutedImage(base64Data: string, filename: string, subfolder: string): Promise<{ ok: boolean; filePath?: string; error?: string }>;
  exportMedia(input: { base64Data: string; filename: string; subfolder?: string; dryRun?: boolean }): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  importMedia(input: { filePath: string }): Promise<{
    ok: boolean; canceled?: boolean; dataUrl?: string; filePath?: string;
    filename?: string; bytes?: number; contentType?: string; error?: string;
  }>;
  revealMedia(input: { filePath: string }): Promise<{ ok: boolean; error?: string }>;
  readMediaMeta(input: { filePath: string }): Promise<{
    ok: boolean; filePath?: string; bytes?: number; mtime?: number; isFile?: boolean; error?: string;
  }>;
  generateMediaThumb(input: { sha256: string; source: string; maxDimension?: number }): Promise<{
    ok: boolean; filePath?: string; url?: string; error?: string;
  }>;
}

/** Exposes Auto-Update helpers available through the preload bridge. */
export interface VeniceForgeUpdates {
  checkForUpdates(): Promise<{ ok: boolean; version?: string; error?: string }>;
  downloadUpdate(): Promise<{ ok: boolean; error?: string }>;
  installUpdate(): Promise<{ ok: boolean }>;
  onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void;
  onUpdateNotAvailable(callback: () => void): () => void;
  onDownloadProgress(callback: (progress: ProgressInfo) => void): () => void;
  onUpdateDownloaded(callback: () => void): () => void;
  onUpdateError(callback: (error: string) => void): () => void;
}

/** Exposes chat history persistence via the main-process filesystem store. */
export interface VeniceForgeChat {
  list(): Promise<{ ok: boolean; conversations: Conversation[]; truncated: boolean; totalScanned: number; error?: string }>;
  /** T14: server-side paginated listing. */
  listPage(params: { offset: number; limit: number }): Promise<{
    ok: boolean;
    conversations: Conversation[];
    truncated: boolean;
    totalScanned: number;
    offset: number;
    count: number;
    error?: string;
  }>;
  get(id: string): Promise<{ ok: boolean; conversation: Conversation | null; error?: string }>;
  save(conversation: Conversation): Promise<{ ok: boolean; error?: string }>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: local character card persistence. */
export interface VeniceForgeCharacterCards {
  list(): Promise<{ ok: boolean; cards: CharacterCardV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }>;
  save(card: CharacterCardV1): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: user persona persistence. */
export interface VeniceForgePersonas {
  list(): Promise<{ ok: boolean; personas: UserPersonaV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }>;
  save(persona: UserPersonaV1): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: lorebook persistence. */
export interface VeniceForgeLorebooks {
  list(): Promise<{ ok: boolean; lorebooks: LorebookV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }>;
  save(lorebook: LorebookV1): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: multi-character chat persistence. */
export interface VeniceForgeRpChats {
  list(): Promise<{ ok: boolean; chats: RpChatV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }>;
  save(chat: RpChatV1): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: generated asset metadata persistence. */
export interface VeniceForgeRpAssets {
  list(chatId?: string): Promise<{ ok: boolean; assets: RpAssetV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }>;
  save(asset: RpAssetV1): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: standalone scenario persistence (Phase 2F). */
export interface VeniceForgeScenarios {
  list(): Promise<{ ok: boolean; scenarios: ScenarioV1[]; truncated: boolean; totalScanned: number; error?: string }>;
  get(id: string): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }>;
  save(scenario: ScenarioV1): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
}

/** Sanitized config payload returned to the renderer. Mirrors the
 *  SanitizedConfigPayload shape from electron/services/configService.ts. */
export interface VeniceForgeConfigPayload {
  config: {
    version: 1;
    app: {
      config_name: string;
      profile: string;
      auto_open_devtools: boolean;
      check_for_updates: boolean;
    };
    secrets: {
      has_venice_api_key: boolean;
      has_jina_api_key: boolean;
      keep_plaintext_keys: boolean;
    };
    theme: { active: string; themes_file: string };
    models: Record<string, string>;
    chat: Record<string, unknown>;
    memory: Record<string, boolean>;
    research: Record<string, unknown>;
    characters: Record<string, unknown>;
    developer: Record<string, boolean>;
  };
  status: {
    configPath: string;
    themesPath: string;
    source: "userdata" | "repo-local" | "env-override" | "defaults";
    configName: string;
    profile: string;
    loaded: boolean;
    parseError: string | null;
    warnings: Array<{ field: string; message: string; severity: "warn" | "error" }>;
    hasVeniceApiKey: boolean;
    hasJinaApiKey: boolean;
    keysImported: { venice: boolean; jina: boolean };
    keysRedacted: { venice: boolean; jina: boolean };
    secureStore: { venice: boolean; jina: boolean };
    activeTheme: string;
    availableThemes: string[];
    redactedFields: string[];
  };
}

/** Exposes the local master YAML config (sanitized; no raw secrets). */
export interface VeniceForgeConfig {
  get(): Promise<{ ok: boolean; payload?: VeniceForgeConfigPayload; error?: string }>;
  reload(): Promise<{ ok: boolean; status?: VeniceForgeConfigPayload["status"]; error?: string }>;
  getStatus(): Promise<{ ok: boolean; status?: VeniceForgeConfigPayload["status"]; paths?: { configPath: string; themesPath: string; source: string }; error?: string }>;
  openFolder(): Promise<{ ok: boolean; path: string; error?: string }>;
  writeSanitized(patch: unknown): Promise<{ ok: boolean; error?: string; redactedFields?: string[] }>;
  exportTemplate(targetPath: string): Promise<{ ok: boolean; error?: string }>;
  loadMergedThemes(): Promise<{ ok: boolean; themes?: Record<string, unknown>; warnings?: unknown[]; error?: string }>;
  resetSecureStoreKeys(): Promise<{ ok: boolean; removed?: { venice: boolean; jina: boolean }; error?: string }>;
}

export interface VeniceForgeConversations {
  list(filter?: {
    archived?: boolean;
    pinned?: boolean;
    tags?: string[];
    model?: string;
    dateFrom?: number;
    dateTo?: number;
  }): Promise<{ ok: boolean; records: ConversationRecordV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; record: ConversationRecordV1 | null; error?: string }>;
  save(record: ConversationRecordV1): Promise<{ ok: boolean; id: string; error?: string }>;
  delete(id: string): Promise<{ ok: boolean; error?: string }>;
  archive(id: string): Promise<{ ok: boolean; error?: string }>;
  search(query: string, options?: { limit?: number; includeArchived?: boolean }): Promise<{ ok: boolean; results: SearchResult[]; error?: string }>;
  pullContext(input: { message: string; maxItems?: number; maxTokens?: number; includeArchived?: boolean }): Promise<{ ok: boolean; context: PulledMemoryContext; error?: string }>;
  rebuildIndex(): Promise<{ ok: boolean; itemsIndexed: number; error?: string }>;
  migrateLegacyHistory(): Promise<{ ok: boolean; migrated: number; failed: number; skipped: number; error?: string }>;
  detectLegacyHistory(): Promise<boolean>;
  openConversationsFolder(): Promise<{ ok: boolean }>;
}

/** Root interface for the Venice Forge preload bridge exposed on the window object. */
export interface VeniceForge {
  readonly isDesktop: true;
  venice: VeniceForgeVenice;
  apiKey: VeniceForgeApiKey;
  jinaApiKey: VeniceForgeApiKey;
  jina: VeniceForgeJina;
  app: VeniceForgeApp;
  files: VeniceForgeFiles;
  chat: VeniceForgeChat;
  conversations: VeniceForgeConversations;
  updates: VeniceForgeUpdates;
  config: VeniceForgeConfig;
  characterCards: VeniceForgeCharacterCards;
  personas: VeniceForgePersonas;
  lorebooks: VeniceForgeLorebooks;
  rpChats: VeniceForgeRpChats;
  rpAssets: VeniceForgeRpAssets;
  scenarios: VeniceForgeScenarios;
}

declare global {
  /** Augments the global Window interface with the optional Venice Forge API. */
  interface Window {
    veniceForge?: VeniceForge;
  }
}
