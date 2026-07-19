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
import type { ApiConnectivityStatus } from "./api-connectivity";
import type { MutationOrigin } from "./sync";
import type { BackgroundTask, BackgroundTaskCreateInput, BackgroundTaskIpcEnvelope } from "./background-task";
import type { ProviderId } from "./provider";
import type { BackupManifestMetadata } from "../services/backupManifest";

/** Manages the Venice API key in secure OS-level storage. */
export interface VeniceForgeApiKey {
  isConfigured: (profileId?: string) => Promise<boolean>;
  set: (key: string, profileId?: string) => Promise<{ ok: boolean; error?: string }>;
  delete: (profileId?: string) => Promise<{ ok: boolean; error?: string }>;
  test: (profileId?: string) => Promise<{ ok: boolean; status?: number; message: string; connectivity: ApiConnectivityStatus }>;
}

export interface VeniceForgeProviderApiKey {
  isConfigured: (providerId: string, profileId?: string) => Promise<boolean>;
  set: (providerId: string, key: string, profileId?: string) => Promise<{ ok: boolean; error?: string }>;
  delete: (providerId: string, profileId?: string) => Promise<{ ok: boolean; error?: string }>;
}

export interface ProviderSettingsSnapshot {
  enabledProviders: Partial<Record<ProviderId, boolean>>;
  autoFallbackEnabled: boolean;
  fallbackOrdering: ProviderId[];
  nativeFallbackModels: Partial<Record<ProviderId, string>>;
}

export interface VeniceForgeProviderSettings {
  get(): Promise<ProviderSettingsSnapshot>;
  update(input: {
    enabledProviders?: Record<string, boolean>;
    autoFallbackEnabled?: boolean;
    fallbackOrdering?: string[];
  }): Promise<{ ok: boolean; settings?: ProviderSettingsSnapshot; error?: string }>;
}

/** Makes Jina API requests from the main process with the profile-scoped key attached. */
export interface VeniceForgeJina {
  request(input: {
    url: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
    /** Retained for preload backwards compatibility. The main process ignores
     *  this field and derives Jina credential authority from WebContents. */
    profileId?: string;
  }): Promise<{ ok: boolean; status?: number; body?: unknown; contentType?: string; error?: string }>;
}

export interface VeniceForgeTts {
  synthesize(opts: { text: string; model?: string; voice?: string; speed?: number }, cacheEnabled: boolean): Promise<{ ok: boolean; id?: string; profileId?: string; audioBase64?: string; mimeType?: "audio/mpeg"; cacheMode?: "disk" | "memory"; error?: string }>;
  clearCache(): Promise<{ ok: boolean; error?: string }>;
}

/** Describes a single request sent through the Electron IPC bridge. */
export interface VeniceForgeRequest {
  endpoint: string;
  method: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  signalId?: string;
  localFamilySafeModeEnabled?: boolean;
  profileId?: string;
  fallbackConfig?: {
    enabled?: boolean;
    ordering?: string[];
  };
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

/** Runtime status of the encrypted sync engine in the main process. */
export interface SyncRuntimeStatus {
  configured: boolean;
  mainWatcher: "stopped" | "paused" | "running" | "error";
  rendererSessionAttached: boolean;
  authenticated: boolean;
  degradedReason?: string;
  profileId?: string;
  /**
   * True when the running sync session has opted in to sync media blobs
   * (images, files, rp_assets). Default-false mirrors the
   * `EncryptedBackupOptions.includeMedia` opt-in.
   */
  includeMedia?: boolean;
}

/** Exposes application-level helpers available through the preload bridge. */
export interface VeniceForgeApp {
  getVersion(): Promise<string>;
  isEncryptionAvailable(): Promise<boolean>;
  getDiagnostics(): Promise<VeniceForgeDiagnostics>;
  openLogsFolder(): Promise<{ ok: boolean; path: string }>;
  proxyScrape(url: string): Promise<{ ok: boolean; data?: { url: string; finalUrl: string; contentType: string; body: string }; error?: string }>;
}

/** Exposes file dialog helpers for importing and exporting JSON data. */
export interface VeniceForgeFiles {
  saveGeneratedMedia(input: { mediaId: string; suggestedName?: string }): Promise<{
    ok: boolean; canceled: boolean; filename?: string; bytes?: number; error?: string;
  }>;
  saveJsonFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }>;
  loadJsonFile(): Promise<{ ok: boolean; canceled: boolean; data?: string; error?: string }>;
  saveYamlFile(data: string, defaultPath?: string): Promise<{ ok: boolean; canceled: boolean }>;
  loadYamlFile(): Promise<{ ok: boolean; canceled: boolean; data?: string; error?: string }>;
  /** Opens a dialog to select and read a text file (for attachment import).
   *  @returns A promise resolving with the file contents and filename.
   */
  readLocalFile(): Promise<{ ok: boolean; canceled?: boolean; content?: string; filename?: string; error?: string }>;
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
  getCharacterImage(url: string): Promise<{
    ok: boolean; url?: string; contentType?: string; bytes?: number; error?: string;
  }>;
  clearCharacterImageCache(): Promise<{ ok: boolean; deletedCount?: number; error?: string }>;
  getCharacterImageCacheInventory(): Promise<{
    ok: boolean; count?: number; totalBytes?: number; error?: string;
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
  save(conversation: Conversation, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
  delete(id: string, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: local character card persistence. */
export interface VeniceForgeCharacterCards {
  list(): Promise<{ ok: boolean; cards: CharacterCardV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }>;
  save(card: CharacterCardV1, origin?: MutationOrigin): Promise<{ ok: boolean; card: CharacterCardV1 | null; error?: string }>;
  delete(id: string, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
  chooseImportFile(): Promise<import("./character-card-files").CharacterCardImportChoiceResult>;
  applyImport(payload: import("./character-card-files").CharacterCardImportApplyOptions): Promise<import("./character-card-files").CharacterCardImportApplyResult>;
  undoImport(payload: { handle: string }): Promise<{ ok: boolean; cardId?: string; error?: string }>;
  exportJson(payload: { cardId: string; profile?: "standard" | "privacy-reduced" }): Promise<import("./character-card-files").CharacterCardExportResult>;
  exportPng(payload: { cardId: string; profile?: "standard" | "privacy-reduced" }): Promise<import("./character-card-files").CharacterCardExportResult>;
}

/** Character RP Studio: user persona persistence. */
export interface VeniceForgePersonas {
  list(): Promise<{ ok: boolean; personas: UserPersonaV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }>;
  save(persona: UserPersonaV1, origin?: MutationOrigin): Promise<{ ok: boolean; persona: UserPersonaV1 | null; error?: string }>;
  delete(id: string, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: lorebook persistence. */
export interface VeniceForgeLorebooks {
  list(): Promise<{ ok: boolean; lorebooks: LorebookV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }>;
  save(lorebook: LorebookV1, origin?: MutationOrigin): Promise<{ ok: boolean; lorebook: LorebookV1 | null; error?: string }>;
  delete(id: string, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: multi-character chat persistence. */
export interface VeniceForgeRpChats {
  list(): Promise<{ ok: boolean; chats: RpChatV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }>;
  save(chat: RpChatV1, origin?: MutationOrigin): Promise<{ ok: boolean; chat: RpChatV1 | null; error?: string }>;
  delete(id: string, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: generated asset metadata persistence. */
export interface VeniceForgeRpAssets {
  list(chatId?: string): Promise<{ ok: boolean; assets: RpAssetV1[]; error?: string }>;
  get(id: string): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }>;
  save(asset: RpAssetV1, origin?: MutationOrigin): Promise<{ ok: boolean; asset: RpAssetV1 | null; error?: string }>;
  delete(id: string, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
}

/** Character RP Studio: standalone scenario persistence (Phase 2F). */
export interface VeniceForgeScenarios {
  list(): Promise<{ ok: boolean; scenarios: ScenarioV1[]; truncated: boolean; totalScanned: number; error?: string }>;
  get(id: string): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }>;
  save(scenario: ScenarioV1, origin?: MutationOrigin): Promise<{ ok: boolean; scenario: ScenarioV1 | null; error?: string }>;
  delete(id: string, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
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
  initialize(): Promise<{ ok: boolean; status?: VeniceForgeConfigPayload["status"]; error?: string }>;
  get(): Promise<{ ok: boolean; payload?: VeniceForgeConfigPayload; error?: string }>;
  reload(): Promise<{ ok: boolean; status?: VeniceForgeConfigPayload["status"]; error?: string }>;
  getStatus(): Promise<{ ok: boolean; status?: VeniceForgeConfigPayload["status"]; paths?: { configPath: string; themesPath: string; source: string }; error?: string }>;
  openFolder(): Promise<{ ok: boolean; path: string; error?: string }>;
  writeSanitized(patch: unknown): Promise<{ ok: boolean; error?: string; redactedFields?: string[] }>;
  exportTemplate(): Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
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
  save(record: ConversationRecordV1, origin?: MutationOrigin): Promise<{ ok: boolean; id: string; error?: string }>;
  delete(id: string, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
  archive(id: string, origin?: MutationOrigin): Promise<{ ok: boolean; error?: string }>;
  search(query: string, options?: { limit?: number; includeArchived?: boolean }): Promise<{ ok: boolean; results: SearchResult[]; error?: string }>;
  pullContext(input: { message: string; maxItems?: number; maxTokens?: number; includeArchived?: boolean; excludeConversationIds?: string[]; characterId?: string }): Promise<{ ok: boolean; context: PulledMemoryContext; error?: string }>;
  rebuildIndex(): Promise<{ ok: boolean; itemsIndexed: number; error?: string }>;
  migrateLegacyHistory(): Promise<{ ok: boolean; migrated: number; failed: number; skipped: number; error?: string }>;
  detectLegacyHistory(): Promise<boolean>;
  openConversationsFolder(): Promise<{ ok: boolean }>;
}

/** Persistent main-process background task bridge. */
export interface VeniceForgeBackgroundTask {
  subscribe(): Promise<{ ok: boolean; error?: string }>;
  unsubscribe(): Promise<{ ok: boolean; error?: string }>;
  create(input: BackgroundTaskCreateInput): Promise<{ ok: boolean; task?: BackgroundTask; error?: string }>;
  update(taskId: string, updates: Partial<BackgroundTask>): Promise<{ ok: boolean; task?: BackgroundTask | null; error?: string }>;
  list(): Promise<{ ok: boolean; tasks?: BackgroundTask[]; error?: string }>;
  cancel(taskId: string): Promise<{ ok: boolean; task?: BackgroundTask | null; error?: string }>;
  retry(taskId: string): Promise<{ ok: boolean; task?: BackgroundTask | null; error?: string }>;
  clear(taskId: string): Promise<{ ok: boolean; error?: string }>;
  onUpdate(callback: (envelope: BackgroundTaskIpcEnvelope) => void): () => void;
}

export interface VeniceForgeDocumentAgent {
  documents: {
    create(input: { projectId: string; relativePath: string; format: import("../agent/contracts/documents").DocumentFormat; blocks: import("../agent/contracts/documents").DocumentBlock[]; displayName?: string; overwrite: false }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
    list(projectId: string): Promise<{ ok: boolean; documents?: import("../agent/contracts/documents").ManagedDocument[]; error?: string }>;
    read(input: { documentId: string; revisionId?: string | null; cursor?: string | null }): Promise<{ ok: boolean; result?: import("../agent/contracts/documents").DocumentReadResult; error?: string }>;
    listRevisions(documentId: string): Promise<{ ok: boolean; revisions?: Array<Omit<import("../agent/contracts/documents").DocumentRevision, "blocks">>; error?: string }>;
    proposeEdits(input: { documentId: string; baseRevisionId: string; summary: string; operations: import("../agent/contracts/documents").DocumentEditOperation[] }): Promise<{ ok: boolean; pendingApproval?: import("../agent/contracts/proposals").PendingApproval; preview?: unknown; error?: string }>;
    proposeRestore(input: { documentId: string; currentRevisionId: string; restoreRevisionId: string; reason: string }): Promise<{ ok: boolean; pendingApproval?: import("../agent/contracts/proposals").PendingApproval; preview?: unknown; error?: string }>;
    export(input: { documentId: string; revisionId?: string | null; format: import("../agent/contracts/documents").DocumentFormat; suggestedFileName: string }): Promise<{ ok: boolean; canceled?: boolean; exported?: boolean; displayName?: string; sizeBytes?: number; error?: string }>;
  };
  approvals: {
    list(): Promise<{ ok: boolean; pending?: Array<{ approval: import("../agent/contracts/proposals").PendingApproval; publicView: unknown }>; error?: string }>;
    decide(input: import("../agent/contracts/proposals").ApproveProposalRequest): Promise<{ ok: boolean; rejected?: boolean; revision?: import("../agent/contracts/documents").DocumentRevision; error?: string }>;
  };
  workspace: {
    choose(input: { agentSessionId: string }): Promise<{ ok: boolean; canceled?: boolean; grant?: { id: string; workspaceId: string; displayName: string; allowedOperations: string[]; allowedExtensions: string[]; limits: Record<string, number>; expiresAt?: string }; error?: string }>;
    revoke(input: { grantId: string; agentSessionId: string }): Promise<{ ok: boolean }>;
    list(input: { grantId: string; agentSessionId: string; relativeDirectory: string; recursive?: boolean; maxDepth?: number; offset?: number }): Promise<{ ok: boolean; result?: unknown; error?: string }>;
    read(input: { grantId: string; agentSessionId: string; relativePath: string }): Promise<{ ok: boolean; result?: { content: string; sizeBytes: number }; error?: string }>;
    search(input: { grantId: string; agentSessionId: string; query: string; maxResults?: number }): Promise<{ ok: boolean; result?: Array<{ relativePath: string; line: number; snippet: string }>; error?: string }>;
  };
}

/** Root interface for the Venice Forge preload bridge exposed on the window object. */

export interface VeniceForgeCredentials {
  set(key: string, value: string): Promise<{ ok: boolean; error?: string }>;
  get(key: string): Promise<{ ok: boolean; value: string | null; error?: string }>;
  delete(key: string): Promise<{ ok: boolean; error?: string }>;
}

export interface VeniceForgeMasterPassword {
  isSet(): Promise<boolean>;
  set(password: string): Promise<{ ok: boolean; error?: string }>;
  verify(password: string): Promise<{ ok: boolean; verified: boolean; lockedOutSeconds?: number; error?: string }>;
  clear(): Promise<{ ok: boolean; error?: string }>;
}

export interface VeniceForgeProfilePassword {
  activate(profileId: string, password?: string): Promise<{ ok: boolean; verified: boolean; profileId?: string; lockedOutSeconds?: number; error?: string }>;
  isSet(profileId: string): Promise<boolean>;
  set(profileId: string, password: string): Promise<{ ok: boolean; error?: string }>;
  verify(profileId: string, password: string): Promise<{ ok: boolean; verified: boolean; lockedOutSeconds?: number; error?: string }>;
  clear(profileId: string): Promise<{ ok: boolean; error?: string }>;
}

export interface VeniceForgeProfilePurge {
  purge(profileId: string): Promise<{
    ok: boolean;
    profileId?: string;
    steps?: Record<string, { ok: boolean; removed?: boolean | number; error?: string }>;
    error?: string;
  }>;
}

export interface VeniceForge {
  credentials: VeniceForgeCredentials;
  masterPassword: VeniceForgeMasterPassword;
  profilePassword: VeniceForgeProfilePassword;
  profilePurge: VeniceForgeProfilePurge;
  readonly isDesktop: true;
  venice: VeniceForgeVenice;
  apiKey: VeniceForgeApiKey;
  jinaApiKey: VeniceForgeApiKey;
  providerApiKey: VeniceForgeProviderApiKey;
  providerSettings: VeniceForgeProviderSettings;
  jina: VeniceForgeJina;
  tts: VeniceForgeTts;
  app: VeniceForgeApp;
  files: VeniceForgeFiles;
  chat: VeniceForgeChat;
  conversations: VeniceForgeConversations;
  sync: ElectronSyncAPI;
  updates: VeniceForgeUpdates;
  config: VeniceForgeConfig;
  characterCards: VeniceForgeCharacterCards;
  personas: VeniceForgePersonas;
  lorebooks: VeniceForgeLorebooks;
  rpChats: VeniceForgeRpChats;
  rpAssets: VeniceForgeRpAssets;
  scenarios: VeniceForgeScenarios;
  backgroundTask: VeniceForgeBackgroundTask;
  documentAgent: VeniceForgeDocumentAgent;
}

export interface EncryptedBackupManifestTransport {
  version: number;
  exportedAt: string;
  metadata?: BackupManifestMetadata;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface ReplaceImportRecoveryTransport {
  id: string;
  createdAt: string;
}

export interface ElectronSyncAPI {
  /** Opens a directory picker for the user to choose the sync folder. */
  chooseSyncFolder(): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  
  /** Retrieves the currently configured sync folder path (if any) and runtime status. */
  getSyncFolder(): Promise<({ ok: true; path?: string | null } & SyncRuntimeStatus) | { ok: false; error: string }>;

  /** Sets and initializes a sync folder. */
  setSyncFolder(input: { path: string }): Promise<{ ok: boolean; error?: string }>;

  /** Starts the sync watcher with the given password. Main process uses this to decrypt incoming sync blobs. */
  startSync(input: { password: string; profileId: string; includeMedia?: boolean }): Promise<{ ok: boolean; error?: string }>;

  /** Stops the sync watcher and clears the password from main process memory. */
  stopSync(): Promise<{ ok: boolean; error?: string }>;
  pauseSync(): Promise<{ ok: boolean; error?: string }>;
  getStatus(): Promise<{ ok: boolean } & SyncRuntimeStatus>;

  /** Notifies the main process that the renderer sync session has attached or detached. */
  setRendererSessionAttached(input: { attached: boolean }): Promise<{ ok: boolean; error?: string }>;

  /** Suppresses local sync emission during bulk import to avoid echo loops. */
  setEmissionSuppressed(input: { suppressed: boolean }): Promise<{ ok: boolean; error?: string }>;

  /** Writes a SyncObject to the sync folder. Encryption happens in main process. */
  writePacket(input: { storeName: string; id: string; recordJson: string }): Promise<{ ok: boolean; error?: string }>;
  applyRemoteMutation(input: { storeName: string; id: string; recordJson?: string; delete?: boolean; remoteApplyToken: string }): Promise<{ ok: boolean; error?: string }>;

  /** Acknowledges that a remote operation was applied (or failed) in the renderer. */
  acknowledgeOperation(input: { operationId: string; ok: boolean }): Promise<{ ok: boolean; error?: string }>;

  /** Listen for changes from the watcher */
  onRemoteChange(callback: (event: { storeName: string; id: string; operationId: string; recordJson: string; remoteApplyToken: string }) => void): () => void;
  
  /** Encrypt a manual backup payload */
  beginBackupExport(): Promise<{ ok: boolean; profileId?: string; deviceId?: string; token?: string; error?: string }>;
  encryptBackup(input: { payload: string, password: string, token: string }): Promise<{ ok: boolean; data?: { salt: string, iv: string, ciphertext: string }; error?: string }>;
  
  /** Decrypt a manual backup payload */
  decryptBackup(input: { ciphertext: string, salt: string, iv: string, password: string }): Promise<{ ok: boolean; data?: string; error?: string }>;

  /** Persists and verifies a profile-bound recovery artifact before destructive replace. */
  createReplaceImportRecovery(input: { manifest: EncryptedBackupManifestTransport; password: string }): Promise<{ ok: boolean; recovery?: ReplaceImportRecoveryTransport; error?: string }>;
  getLatestReplaceImportRecovery(): Promise<{ ok: boolean; recovery?: ReplaceImportRecoveryTransport | null; error?: string }>;
  loadReplaceImportRecovery(input: { id: string; password: string }): Promise<{ ok: boolean; manifest?: EncryptedBackupManifestTransport; error?: string }>;
}

declare global {
  /** Augments the global Window interface with the optional Venice Forge API. */
  interface Window {
    veniceForge?: VeniceForge;
  }
}
