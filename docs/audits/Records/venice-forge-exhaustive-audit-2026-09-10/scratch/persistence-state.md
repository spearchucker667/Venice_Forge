# Persistence / State Audit Findings

- **Audit ID prefix:** `VF-AUD-20260910-PER`
- **Date:** 2026-09-10
- **Baseline SHA:** `c3ae21af2f723111d92b43c7888a60930226d213`
- **Branch:** `main`
- **Package:** `venice-forge@3.0.0-beta.3`
- **Scope:** Zustand stores; renderer `StorageService` / IndexedDB migrations; Electron chat, media, sync, backup, `secureStore`; profile switching / tombstones / lost updates; secret lifecycle; log redaction; UI vs durable desync
- **Method:** Static, independently verified against the checked-out tree. Historical audits were not copied. No secrets, prompts, or private machine paths are included.
- **Manual QA:** not run
- **Hosted CI:** not run

## Counts

| Classification | Count |
|---|---|
| CONFIRMED DEFECT | 17 |
| LIKELY DEFECT | 2 |
| DESIGN RISK | 6 |
| TEST GAP | 1 |
| DOCUMENTATION DEFECT | 1 |
| IMPROVEMENT | 1 |
| FALSE POSITIVE | 0 |
| **Total findings** | **28** |

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 6 |
| P2 | 15 |
| P3 | 7 |

## Inventory (verified)

Renderer Zustand persist middleware is used by only five stores: `profile-store`, `settings-store`, `chat-store`, `playground-store`, `workflow-store`. Other stores hydrate from IndexedDB, Electron IPC, or are memory-only.

Durable backends (Electron unless noted):

| Domain | Authoritative store | Encryption | Profile isolation |
|---|---|---|---|
| Chat (primary write) | Conversation Vault (`electron/services/conversationVault.ts`) | AES-256-GCM, key wrapped with `safeStorage` | Yes (`profiles/<id>`) |
| Chat (legacy / fallback) | `userData/chat-history/*.json` | Plaintext JSON `mode 0o600` | Yes |
| Chat (web) | IndexedDB `conversations` | AES-GCM via `cryptoService` | Physical id `profileId:logicalId` |
| Character cards / RP collections | `userData/characters`, `personas`, `lorebooks`, `rp-chats`, `rp-assets`, `rp-scenarios` | Plaintext JSON | **No** |
| Media catalog | Renderer IndexedDB `images` | AES-GCM wrapper | Yes (filter + physical id) |
| Media blobs (Electron) | `userData/media/blobs/sha256` | Content-addressed files | **No** |
| API keys | `secure-prefs.json` + OS `safeStorage` / Windows Credential Manager | Encrypted except Linux plaintext opt-in | Yes (`apiKey_<profileId>`) |
| Structured provider credentials | same `secure-prefs.json` | Encrypted | Yes |
| Provider consent | `provider-settings.json` | Plain JSON | Yes (per-profile map) |
| Background tasks | `userData/background-tasks/tasks.json` | Sanitized metadata only | Task records carry `profileId` |
| Sync packets | encrypted `.vfbackup` objects | Passphrase | Session `currentProfileId` |
| Settings / profiles | `localStorage` via `createSafeStorage()` | None | Settings keyed `name_<profileId>`; profiles global |

IndexedDB: `DB_NAME = venice_canvas_studio_v1`, `DB_VERSION = 20`, 25 named stores. Encryption key lives in a separate DB `venice_forge_keys` as a non-extractable `CryptoKey`.

---

## Findings

### VF-AUD-20260910-PER-001

- **Severity:** P1
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/stores/chat-store.ts:1412-1433` and `src/services/backupExportService.ts:52-58` / `src/services/syncPacketImporter.ts:139-143` and `:232-234`

```1412:1433:src/stores/chat-store.ts
async function writeConversation(conv: Conversation): Promise<void> {
  const record = toConversationRecord(conv);
  // ...
  const convRes = await desktopConversations.save(record);
  if (convRes.ok) return;
  const chatRes = await desktopChat.save(conv);
```

```52:58:src/services/backupExportService.ts
export async function fetchStoreRecords(storeName: SyncStoreName): Promise<unknown[]> {
  if (isElectron()) {
    switch (storeName) {
      case "conversations": {
        const chatsResult = await desktopChat.list();
        return chatsResult.ok ? chatsResult.conversations : [];
```

- **Observed:** Desktop chat mutations persist first to the encrypted Conversation Vault and return without writing `chat-history`. Backup export and sync packet import/list for `conversations` use only `desktopChat` (legacy plaintext files).
- **Expected:** One canonical conversation owner. Backup/sync must read/write the same store the live UI writes.
- **Root cause:** Dual transport left in place after vault introduction; backup/sync were not migrated to `desktopConversations`.
- **Impact:** Encrypted `.vfbackup` / sync packets can omit the user's live chats. A restore from backup can look successful while conversations are empty. Legacy `chat-history` can also diverge if a vault write fails and the fallback path is used.
- **Remediation:** Make vault the only Electron conversation backend for save/list/delete/backup/sync, or dual-write with a proven reconciler. Add a backup fixture that saves via vault and asserts export contains the record.
- **Tests:** No test asserts backup/sync conversation I/O against `desktopConversations`. `TEST GAP` also recorded as PER-025.

### VF-AUD-20260910-PER-002

- **Severity:** P1
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `electron/ipc/rpHandlers.ts:99-102`; `electron/services/characterCardStorage.ts:45-47`; `electron/services/rpSingleFileStore.ts:29-34`; `electron/services/rpChatStorage.ts:23-25`

```99:102:electron/ipc/rpHandlers.ts
  handleIpc("characterCards:list", async () => {
    try {
      const { cards, truncated, totalScanned } = await listCharacterCards();
      return { ok: true, cards, truncated, totalScanned };
```

```29:34:electron/services/rpSingleFileStore.ts
export function createSingleFileStore<T>(
  dirName: string,
  validate: (obj: unknown) => obj is T
) {
  const dir = () => path.join(app.getPath("userData"), dirName);
```

- **Observed:** Character cards, personas, lorebooks, RP chats, RP assets, and scenarios are stored in unscoped `userData` directories. IPC list/save/delete does not take a profile id. Web IndexedDB paths *are* profile-scoped via `StorageService`.
- **Expected:** Profile-scoped durable data. Switching or deleting a profile must not expose another profile's RP library.
- **Root cause:** RP file stores predate profile isolation; chat vault / chat-history / chat-folders were scoped later, these were not.
- **Impact:** All desktop profiles share one character/RP library. Profile B can edit/delete profile A's cards and RP transcripts. Cross-profile leakage of adult/character content.
- **Remediation:** Namespace directories as `profiles/<profileId>/…` (mirror chat-folders), bind IPC to the active main-process session, migrate existing default-profile files, and purge on profile delete.
- **Tests:** `electron/ipc/rpHandlers.test.ts` does not assert profile scoping.

### VF-AUD-20260910-PER-003

- **Severity:** P1
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `electron/services/profilePurge.ts:54-64`; `src/services/profilePurge.ts:114-123`

```54:64:electron/services/profilePurge.ts
  const veniceApiKey = await runStep(() => deleteApiKey(profileId));
  const jinaApiKey = await runStep(() => deleteJinaApiKey(profileId));
  let providerCount = 0;
  const providerApiKeys = await runStep(() => {
    for (const providerId of Object.keys(PROVIDER_REGISTRY)) {
      deleteProviderApiKey(providerId, profileId);
      providerCount += 1;
    }
  });
```

- **Observed:** Profile purge deletes per-provider *API keys* and Venice/Jina keys, but never calls `deleteProviderCredential`. Structured credentials (`azure_openai`, `aws_bedrock`, `google_vertex`) remain in `secure-prefs.json` under `${providerId}Credential_${profileId}`.
- **Expected:** Deleting a profile removes every credential bound to that profile, including structured blobs.
- **Root cause:** Purge was written against the single-key API and never extended when structured credentials were added. `electron/services/profilePurge.test.ts` mocks only `deleteProviderApiKey`.
- **Impact:** Recreating a profile with the same id, or reading `secure-prefs.json` after "deletion", can recover Azure/Bedrock/Vertex secrets. Renderer web purge has the same gap (`desktopProviderApiKey.delete` only).
- **Remediation:** Call `deleteProviderCredential` for every structured provider in both main and renderer purge. Assert absence after purge in `secureStore.providerCredential.test.ts` / `profilePurge.test.ts`.
- **Tests:** Current purge test expects `deleteProviderApiKey` only.

### VF-AUD-20260910-PER-004

- **Severity:** P1
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `electron/services/profilePurge.ts:51-66`; `src/services/profilePurge.ts:29-59`

```51:66:electron/services/profilePurge.ts
  const conversationVault = await runStep(() => purgeProfileConversationVault(profileId));
  const chatHistory = await runStep(() => purgeProfileChatHistory(profileId));
  const ttsCache = await runStep(() => purgeProfileTtsCache(profileId));
  // ... keys and password verifier only
  const steps = { conversationVault, chatHistory, ttsCache, veniceApiKey, jinaApiKey, providerApiKeys, passwordVerifier };
```

- **Observed:** Main-process purge removes vault chats, legacy chat-history, TTS cache, and keys. It does not delete character cards, personas, lorebooks, RP chats/assets/scenarios, generated-media blobs, background-task journal rows, or `provider-settings.json` profile entries. Renderer purge *does* scan IndexedDB by `profileId`, which is insufficient on desktop because those collections are file-backed.
- **Expected:** Profile deletion is a complete, retryable transaction over every profile-owned durable surface.
- **Root cause:** Same incomplete profile-isolation rollout as PER-002, plus generated media being content-addressed globally.
- **Impact:** "Delete profile" leaves character prompts, RP transcripts, and media blobs on disk. Combined with PER-002, the leftover data is still visible to remaining profiles.
- **Remediation:** Extend `purgeMainProfileData` with per-store profile directories (after PER-002) and a generated-media GC that only removes blobs unreferenced by remaining profiles. Fail closed if any step fails (already the `every(step.ok)` shape).
- **Tests:** `electron/services/profilePurge.test.ts` does not cover RP dirs or media blobs.

### VF-AUD-20260910-PER-005

- **Severity:** P1
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/stores/chat-store.ts:483-490`, `:1576-1609`; `src/main.tsx:79-92`; `src/hooks/useProfileVolatileReset.ts:49-76`

```483:490:src/stores/chat-store.ts
        set((s) => ({
          conversations: [conv, ...s.conversations],
          conversationSummaries: [
            toConversationSummary(conv),
            ...s.conversationSummaries,
          ],
          activeConversationId: id,
          _hasLoadedHistory: true,
        }));
```

```79:92:src/main.tsx
const HYDRATION_TIMEOUT_MS = 2500;
export async function bootApp(
  target: HTMLElement,
  hydrationReady: Promise<void>,
): Promise<void> {
  const hydrationTimeout = new Promise<void>((resolve) => {
    setTimeout(resolve, HYDRATION_TIMEOUT_MS);
  });
  try {
    await Promise.race([hydrationReady, hydrationTimeout]);
```

```1576:1609:src/stores/chat-store.ts
        if (!useChatStore.getState()._hasLoadedHistory && result.ok) {
          const records = result.records ?? result.conversations ?? [];
          useChatStore.getState().setConversations(records as never);
        }
  queueMicrotask(() => {
    // vault list, then legacy desktopChat.list
```

- **Observed:** Conversation bootstrap is a module-level microtask gated on `_hasLoadedHistory`. `createConversation` / `createCharacterConversation` / `createLocalCharacterConversation` set that flag to `true` immediately, so a later vault/legacy list is discarded. `bootApp` mounts React after 2.5s even if `activateRestoredProfileSession` is still running. `useProfileVolatileReset` then clears conversations and again leaves `_hasLoadedHistory === true` via `setConversations([])`.
- **Expected:** History load is authoritative and re-run after profile activation. Creating a chat before hydration completes must merge, not suppress, the durable list. Boot must not present a profile session until main-process activation finishes (or must reload).
- **Root cause:** Flag conflates "user created a chat" with "durable history loaded". Boot timeout was added so web mode still starts, and it races desktop profile activation.
- **Impact:** Empty or wrong-profile chat sidebar until a full reload. Lost-update appearance: chats exist on disk but UI shows only the in-memory new chat (or nothing after volatile reset).
- **Remediation:** Split `_hasLoadedHistory` from "user mutated". Queue creates until list returns, or merge by id. Do not mount App until `activateRestoredProfileSession` resolves on Electron. After profile activation, force `setConversations` from vault for the activated profile.
- **Tests:** Chat bootstrap tests cover the microtask vs synchronous create in isolation; they do not cover the 2.5s boot race plus profile activation.

### VF-AUD-20260910-PER-006

- **Severity:** P1
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `electron/services/chatStorage.ts:265-285`; `electron/services/conversationVault.ts:137-178`; `src/stores/chat-store.ts:1602-1609`

```265:285:electron/services/chatStorage.ts
export async function saveConversation(conversation: Conversation, profileId: string = "default"): Promise<{ ok: boolean; error?: string }> {
  // ...
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), { encoding: "utf-8", mode: 0o600 });
  await fs.rename(tempPath, filePath);
```

- **Observed:** Two on-disk chat authorities exist. Vault encrypts records. Legacy `chat-history` writes full conversation JSON (messages, system prompts) in plaintext. Bootstrap still falls back to legacy if vault list does not set `_hasLoadedHistory`.
- **Expected:** A single encrypted owner inside the app-data boundary, with a one-way migrator from leftover plaintext files.
- **Root cause:** Compatibility fallback never removed; backup/sync still target the plaintext store (PER-001).
- **Impact:** Disk-level readers of `userData/chat-history` recover chat bodies even when vault encryption is healthy. Inconsistent with IndexedDB AES-GCM (web) and vault (desktop primary).
- **Remediation:** Migrate remaining `chat-history` files into the vault, then stop writing/listing the legacy dir except a versioned importer.
- **Tests:** `electron/services/chatStorage.test.ts` covers the plaintext path as current behavior.

### VF-AUD-20260910-PER-007

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/stores/settings-store.ts:389-477`

```389:477:src/stores/settings-store.ts
    {
      name: 'venice-settings',
      version: 16,
      storage: createJSONStorage(() => createSafeStorage()),
      migrate: (persisted) => {
        const state = persisted && typeof persisted === 'object'
          ? persisted as Partial<SettingsState>
          : {}
        return {
          ...state,
          // ...
          pendingSettingsSection: coerceSettingsSection(state.pendingSettingsSection),
```

```463:477:src/stores/settings-store.ts
      merge: (persisted, current) => {
        const persistedState = persisted && typeof persisted === 'object'
          ? persisted as Partial<SettingsState>
          : {}
        const merged = {
          ...current,
          ...persistedState,
```

- **Observed:** Comment at line 420 claims `pendingSettingsSection` is "covered by `partialize`". There is no `partialize`. The entire settings object, including `localFamilySafeModeEnabled`, `veniceApiSafeMode`, `syncFolderPath`, `imageDownloadDirectory`, `enabledProviders`, and `pendingSettingsSection`, is written to unencrypted localStorage. `merge` spreads untrusted persisted JSON over live state (the anti-pattern `profile-store` already replaced with `sanitizePersistedProfileState`).
- **Expected:** Allowlisted persist fields; session-only keys omitted; actions never overwritten; safety flags not sourced from localStorage when YAML/main is authoritative.
- **Root cause:** Persist hardening applied to `profile-store` was not replicated here. Comment drift hid the missing `partialize`.
- **Impact:** Tampered localStorage can replace action functions with strings and break the UI. Safety / provider-consent flags can desync from main-process YAML (`runtimeSafetySettings`) until `refreshConfig` / `desktopProviderSettings.get` runs — and they win if those calls fail. Machine paths leak into localStorage.
- **Remediation:** Add a sanitizing `partialize` + `merge` allowlist (mirror profile-store). Stop persisting safety flags and filesystem paths; keep those in YAML / main. Add a merge-tamper unit test.
- **Tests:** `src/stores/settings-store.test.ts` does not assert partialize or merge sanitization.

### VF-AUD-20260910-PER-008

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/services/dbMigrations.ts:213-257`; `src/constants/venice.ts:226`; `src/services/storageService.ts:208-214`

```213:257:src/services/dbMigrations.ts
    description:
      "Add profileId index to every store for multi-profile isolation",
    up(db, tx) {
      const stores = [
        // ... playground, tombstones
      ] as const;
      // createIndex profileId if store exists
    },
  },
  {
    toVersion: 16,
    description: "Add tombstones store for Phase 2G Sync hard deletes",
    up(db) {
      if (!db.objectStoreNames.contains("tombstones")) {
        db.createObjectStore("tombstones", { keyPath: "id" });
      }
    },
  },
```

- **Observed:** v15 tries to index `tombstones` before v16 creates the store (`contains` skip). v16 then creates `tombstones` with no `profileId` index. v17–v20 (`characterCardDrafts`, `chat_folders`, `imageInspectorSessions`, `character_creator_drafts`) are also created without `profileId` (or `timestamp`) indexes. The openDB safety net only `createObjectStore({ keyPath: "id" })`.
- **Expected:** Every new store that participates in profile isolation is created with the `profileId` index, or a later migration backfills indexes. Migration order must create a store before indexing it.
- **Root cause:** Index migration was written against a store list that included a not-yet-created name; later stores copied the create-only pattern.
- **Impact:** Functional reads still work (JS filter after `getAll`). Pagination that requires `profileId`/`timestamp` indexes cannot be added without a new migration. Fresh installs via the safety net also lack indexes. `getItemsPageWithMeta` already warns when `profileId` is missing.
- **Remediation:** Append a v21 migration that creates `profileId` (and `timestamp` where needed) on every current store. Never put a store in an index migration before its create step.
- **Tests:** `src/services/dbMigrations.test.ts` does not assert indexes on v16+ stores.

### VF-AUD-20260910-PER-009

- **Severity:** P2
- **Confidence:** Medium
- **Classification:** LIKELY DEFECT
- **Location:** `src/services/storageService.ts:193-221` vs `src/services/cryptoService.ts:32-58`

```193:221:src/services/storageService.ts
  openDB(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      // indexedDB.open — no in-flight latch, no db.onversionchange / onclose
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
```

- **Observed:** Concurrent first `openDB()` calls each invoke `indexedDB.open`. The cached connection has no `onversionchange`/`onclose` handler, so a second context that upgrades or closes the DB leaves `StorageService.db` pointing at a dead connection. `cryptoService` already uses a `keyPromise` latch.
- **Expected:** Single-flight open; drop cache on close/versionchange and reopen.
- **Root cause:** Missing connection lifecycle, unlike the key DB helper.
- **Impact:** Web multi-tab or a failed upgrade can make subsequent reads/writes hang or throw until reload. First-paint races (chat persist adapter + conversation load + media refresh) all call `openDB`.
- **Remediation:** Latch the open promise; on `versionchange` close and null `this.db`.
- **Tests:** `storageService.test.ts` uses a single fake-indexeddb instance; no concurrent-open or versionchange case.

### VF-AUD-20260910-PER-010

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/services/storageService.ts:659-666`; `src/stores/media-store.ts:307-310`

```659:666:src/services/storageService.ts
  async patchMedia<T extends object>(id: string, patch: ...): Promise<T> {
    const existing = (await this.getItem("images", id)) as T | null;
    if (!existing) throw new Error(`patchMedia: record not found: ${id}`);
    const patchRecord = typeof patch === "function" ? patch(existing) : patch;
    const next = { ...(existing as object), ...patchRecord, id, timestamp: ... };
    await this.saveItem("images", next);
```

```307:310:src/stores/media-store.ts
  patch: async (id, patch) => {
    const existing = get().items.find((item) => item.id === id);
    if (!existing) return null;
```

- **Observed:** "Atomic" function-based patch is still get-then-put across two IndexedDB transactions; `saveItem` also regenerates `revisionId`. `media-store.patch` no-ops when the id is not in the in-memory page (max 60 loaded, cache cap 1000) even if IDB has the row. `patchMany` hits IDB directly — inconsistent.
- **Expected:** IDB-transactional read-modify-write; store `patch(id)` loads from IDB when uncached (`loadById` already exists).
- **Root cause:** AUDIT-007 reduced the race window but did not use a single readwrite transaction. UI cache was treated as existence.
- **Impact:** Concurrent favorite/tag/vault/parent-child updates lose writes. Inspector/chat actions against off-page media silently fail. Sync `revisionId` churn can create false conflicts.
- **Remediation:** Perform get+put in one `readwrite` transaction; OCC on `revisionId` if syncable. Route `patch` through `getItem`/`loadById`.
- **Tests:** media-store tests do not cover uncached `patch` or concurrent `patchMedia`.

### VF-AUD-20260910-PER-011

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/stores/workflow-store.ts:223-230`; `src/stores/playground-store.ts:125-129`

```223:230:src/stores/workflow-store.ts
      partialize: (state) => ({
        workflows: state.workflows.slice(0, 20),
        activeWorkflowId: state.activeWorkflowId,
      }),
```

```129:129:src/stores/playground-store.ts
      partialize: (s) => ({ messages: s.messages.slice(-40), draft: s.draft, linkedWorkflowId: s.linkedWorkflowId }),
```

- **Observed:** Persist writes a truncated snapshot. The next successful persist of a 21st workflow drops workflow 21+ from IndexedDB `visualWorkflows`. Playground silently keeps only the last 40 messages.
- **Expected:** Either unbounded durable records with paging, or a user-visible cap that does not delete persisted workflows on later saves.
- **Root cause:** Quota avoidance implemented as silent slice rather than separate archival.
- **Impact:** Durable data loss that the UI may still show until reload, then older workflows vanish.
- **Remediation:** Persist full records in IDB (already encrypted) and cap only the in-memory working set, or archive overflow explicitly.
- **Tests:** No test that creating 21 workflows, reloading, still lists 21.

### VF-AUD-20260910-PER-012

- **Severity:** P2
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Location:** `electron/services/runtimeSafetySettings.ts:1-19`; `src/stores/config-store.ts:187-188`; `src/stores/settings-store.ts:320-323`; `src/services/desktopBridge.ts:438-471`

```1:11:electron/services/runtimeSafetySettings.ts
let localFamilySafeModeEnabled = false;
export function setRuntimeLocalFamilySafeModeEnabled(enabled: boolean): void {
  localFamilySafeModeEnabled = enabled;
}
```

```443:447:src/services/desktopBridge.ts
      useSettingsStore.setState({
        enabledProviders: settings.enabledProviders,
        autoFallbackEnabled: settings.autoFallbackEnabled,
        fallbackOrdering: settings.fallbackOrdering,
      });
```

- **Observed:** Family Safe / Venice API safe mode live in (1) main-process runtime snapshot, (2) YAML via `configService`, (3) Zustand + localStorage. Provider fallback consent lives in (1) `provider-settings.json` and (2) the same settings persist slice. `desktopProviderSettings.update` in web mode ignores `input` and returns current state (`:469-470`). Renderer `veniceFetch` reads the Zustand flag; Electron IPC guards read the main snapshot.
- **Expected:** One authoritative writer. Renderer displays a projection. Web update must apply the mutation or fail closed.
- **Root cause:** Intentional dual transport plus settings persist of copies of main-owned fields.
- **Impact:** After a failed `refreshConfig` (or the 2.5s boot timeout in PER-005), renderer-side family-safe headers / client filters can disagree with the process that actually talks to Venice. Fallback routing UI can show localStorage enablement before main consent is loaded.
- **Remediation:** Stop persisting safety and provider-consent in `venice-settings`. Hydrate only from `desktopConfig` / `desktopProviderSettings`. Make web `update` apply the input to the store or return `ok: false`.
- **Tests:** Sidebar/SettingsView tests cover rollback on IPC failure, not persist-vs-YAML boot order.

### VF-AUD-20260910-PER-013

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/services/rp/personaPreferenceService.ts:3-16`; `src/services/profilePurge.ts:31-59`

```3:16:src/services/rp/personaPreferenceService.ts
const STORAGE_KEY = "venice_active_persona_id";
export async function getActivePersonaId(): Promise<string | null> {
  return typeof window !== 'undefined' && window.localStorage
    ? window.localStorage.getItem(STORAGE_KEY)
    : null;
}
```

- **Observed:** Active persona id is a single global localStorage key, not `venice_active_persona_id_${profileId}`. It is not in `PROFILE_SCOPED_LOCAL_STORES` and does not match the `_${profileId}` purge suffix.
- **Expected:** Preference keys are profile-scoped and removed on purge.
- **Root cause:** Preference helper predates profile isolation; purge allowlist was never updated.
- **Impact:** Switching profiles can auto-select another profile's persona (and, with PER-002, that persona still exists). Deleted profiles leave the id behind.
- **Remediation:** Scope the key via `getActiveProfileId()`; add to purge; migrate the unscoped key to the default profile only.
- **Tests:** `personaPreferenceService.test.ts` does not cover profiles.

### VF-AUD-20260910-PER-014

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/components/image/image-view.tsx:860-879`; `src/services/taskMediaCatalog.ts:38-41`; `src/types/storage.ts:24-26`

```860:879:src/components/image/image-view.tsx
            if (isElectron()) {
              const persistence = await desktopMedia.persistGeneratedImage(processedImg);
              // ...
              displayImage = durableMedia.url;
            }
            // Only stable main-owned URLs are written to desktop IndexedDB;
            // web mode retains its existing data-URL fallback.
            processedImages.push(displayImage);
            const mediaItem: MediaItem = {
              id,
              image: displayImage,
```

- **Observed:** Electron generated images persist `venice-media://` URLs into IndexedDB (good). Web mode (and `persistCompletedTaskMedia` when `resultUrl` is a `data:` URL) writes the full image payload into the encrypted `images` store. `GalleryImage.image` is a string with no MIME/size guard at the storage layer.
- **Expected:** AGENTS.md media contract: do not persist large media as task/store data URLs; use content/blob store + stable ids.
- **Root cause:** Desktop blob store was not given a web equivalent; catalog still uses the legacy `image` field.
- **Impact:** Quota failures, multi-second encrypt/decrypt, and IndexedDB records that hold raw image bytes. AES-GCM number-array encoding further inflates size.
- **Remediation:** Web: persist blob handles / hashes, not data URLs. Reject `data:` at `putMedia` except a documented migration.
- **Tests:** Image-view tests document the web fallback rather than forbid it.

### VF-AUD-20260910-PER-015

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/stores/media-store.ts:368-370` and `:419-421`; `src/App.tsx:246-248`; `src/stores/playground-store.ts:21-35`; `src/shared/logger.ts:62-69`

```368:370:src/stores/media-store.ts
    } catch (e) {
      console.error(e);
    }
```

```62:69:src/shared/logger.ts
export const warn = isProduction
  ? noop
  : (...args: unknown[]) => console.warn(...args.map((arg) => sanitizeArg(arg)));
```

- **Observed:** Media delete paths log the raw exception with `console.error`. App sync-folder init and playground/workflow IDB adapters do the same. Renderer `logger` redacts and is silent in production; these call sites bypass it, so production Electron still prints.
- **Expected:** All persistence errors go through `redactErrorMessage` / `logger.error` (or Electron `logError`).
- **Root cause:** Ad hoc diagnostics around modal/IDB failures.
- **Impact:** Paths, driver messages, and any secret-shaped text in an Error can hit the Chromium console / crash reporter. Not an API-key store leak, but it violates the logging contract.
- **Remediation:** Replace with `logger.error(..., redactErrorMessage(e))`. Add a lint/verifier for `console.*` in `src/stores` and `electron/services` outside tests.
- **Tests:** None for this call site.

### VF-AUD-20260910-PER-016

- **Severity:** P2
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `electron/services/generatedMediaStore.ts:126-128` (no `profileId` in module); `src/services/taskMediaCatalog.ts:8-41`

```126:128:electron/services/generatedMediaStore.ts
export function getGeneratedMediaRoot(): string {
  return path.join(app.getPath('userData'), 'media', 'blobs', 'sha256')
}
```

- **Observed:** Durable generated blobs are global by SHA-256. The renderer catalog (`images` IDB) is profile-filtered. Custom-protocol access is session/capability based, not profile-partitioned at rest. Profile purge does not delete blobs (PER-004).
- **Expected:** Blobs are either profile-namespaced or garbage-collected when no remaining profile catalog references the hash.
- **Root cause:** Content-addressed store optimized for dedupe, not isolation.
- **Impact:** Profile B's catalog cannot *list* profile A's items, but a guessed/leaked `venice-media://<sha256>` or shared hash can still resolve bytes. Deleted-profile media remains until manual userData wipe.
- **Remediation:** Store an opaque id → `{sha256, profileId}` index in main process; authorize protocol requests against the active profile session; GC on purge.
- **Tests:** generatedMediaStore tests cover integrity, not profile isolation.

### VF-AUD-20260910-PER-017

- **Severity:** P2
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Location:** `src/services/cryptoService.ts:43-47`, `:65-73`; `src/services/storageService.ts:31-64`

```43:47:src/services/cryptoService.ts
    const key = await crypto.subtle.generateKey(
      { name: ALGO, length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
```

- **Observed:** IndexedDB at-rest key is non-extractable and stored in `venice_forge_keys`. Desktop still uses this for `images`, `projects`, `promptLibrary`, `scenes`, `researchSessions`, playground/workflows, etc. Conversation bodies live in the main-process vault with a different key. Clearing site data, OS profile reset, or key-store loss makes encrypted IDB rows undecryptable (`decodeRow` returns null and increments `decryptFailures`) while vault chats and `venice-media://` blobs remain.
- **Expected:** Either one app-owned key hierarchy (main process) for all durable user content on desktop, or a documented recovery story when the IDB key vanishes.
- **Root cause:** Renderer IDB encryption predates the Electron vault/blob stores.
- **Impact:** Partial data-loss that looks like "gallery empty, chats still there". No user-facing recovery. `warn` in storageService is development-only (`logger.warn` no-ops in production).
- **Remediation:** Desktop: move catalog metadata to main-process encrypted files (like vault) or wrap the IDB key with `safeStorage`. Surface decrypt-failure counts in Status. Do not silently drop rows.
- **Tests:** `storageService.test.ts` covers decryptFailures counting, not desktop key-loss UX.

### VF-AUD-20260910-PER-018

- **Severity:** P2
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Location:** `electron/services/characterCardStorage.ts` (plaintext `character.json`); `electron/services/rpSingleFileStore.ts:101`; `electron/services/rpChatStorage.ts`

```101:102:electron/services/rpSingleFileStore.ts
    await fs.writeFile(tmp, JSON.stringify(input, null, 2), { mode: 0o600 });
    await fs.rename(tmp, target);
```

- **Observed:** Web RP/character records are AES-GCM in IndexedDB. Desktop writes the same schemas as plaintext JSON (system prompts, greetings, lorebook entries, RP transcripts) with `0o600`. Chat vault is encrypted; these are not.
- **Expected:** Consistent at-rest protection for equivalently sensitive user content inside `userData`.
- **Root cause:** File stores used JSON for debuggability; encryption was applied to IDB and the conversation vault only.
- **Impact:** Anyone with userData access reads character system prompts and RP logs without OS keychain unwrapping. Inconsistent privacy story vs chats.
- **Remediation:** Reuse vault wrapping or `safeStorage` for RP JSON, or document an explicit "RP files are plaintext in userData" privacy exception in `docs/legal/PRIVACY.md` after product decision.
- **Tests:** File-store tests assert JSON round-trip, not encryption.

### VF-AUD-20260910-PER-019

- **Severity:** P2
- **Confidence:** Medium
- **Classification:** DESIGN RISK
- **Location:** `src/shared/redaction.ts:3-42`; `src/services/desktopBridge.ts:158-178`

```13:20:src/shared/redaction.ts
const VENICE_KEY_PATTERN = /\bvn-[A-Za-z0-9._~+/=-]{8,}\b/gi;
const VENICE_UNDERSCORE_PATTERN = /\bvenice_[A-Za-z0-9._~+/=-]{8,}\b/gi;
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9._~+/=-]{8,}\b/gi;
```

```158:178:src/services/desktopBridge.ts
const _webSessionVeniceApiKey = {
  value: "",
  setAt: 0,
  TTL_MS: 24 * 60 * 60 * 1000,
  set(key: string) {
    this.value = key;
    this.setAt = Date.now();
  },
```

- **Observed:** String redaction catches `vn-`, `venice_`, `sk-`, Bearer, and `NAME=value` env assignments. It does not catch arbitrary Jina/provider keys, JWTs (`eyJ…`), or `jina_`. Key *names* matching `/token/` are redacted in objects (also hits theme `tokens` — already special-cased in `exportImport.ts`). Web session key is held in renderer memory and POSTed to `/api/session-key` (dev/loopback only; 404 in production). Auth store keeps `apiKey: string | null` but current setters store `null` after save.
- **Expected:** Redaction covers every credential format the app can persist; renderer never retains raw keys.
- **Root cause:** Pattern list tracks Venice/OpenAI shapes; fallback providers use other formats.
- **Impact:** A provider key logged via PER-015 or included in an Error message may survive redaction. Web TTL cache is an accepted dev tradeoff, not a desktop leak.
- **Remediation:** Redact named credential fields at the object layer (already done) and add provider-key / JWT patterns. Keep web session key out of any persist path (currently true — verified against localStorage in `desktopBridge.test.ts`).
- **Tests:** `redaction.test.ts` does not include Jina/JWT fixtures.

### VF-AUD-20260910-PER-020

- **Severity:** P2
- **Confidence:** Medium
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/stores/chat-store.ts:1314-1332`

```1314:1332:src/stores/chat-store.ts
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ChatState>) || {};
        return {
          ...currentState,
          ...persisted,
          conversations: currentState.conversations,
          conversationSummaries: currentState.conversationSummaries,
          _hasLoadedHistory: currentState._hasLoadedHistory,
        };
      },
      partialize: (state) => ({
        activeConversationId: state.activeConversationId,
        veniceParams: state.veniceParams,
        systemPrompt: state.systemPrompt,
```

- **Observed:** Chat persist correctly omits conversations, but `merge` still spreads the persisted object first. A crafted `chats` IDB value can overwrite `setConversations` / `createConversation` with non-functions. `systemPrompt` is duplicated: global persist blob in store `chats` *and* per-conversation vault/IDB records.
- **Expected:** Allowlisted merge (as profile-store). Global system prompt has one owner.
- **Root cause:** Same persist-merge pattern as settings; conversations were carved out later.
- **Impact:** Integrity of the chat store depends on IDB contents. Duplicate system-prompt copies can diverge from YAML `chat.system_prompt`.
- **Remediation:** Sanitize merge; stop persisting `systemPrompt` here if YAML/config owns it, or stop injecting YAML into the store.
- **Tests:** Chat persist tests cover conversation exclusion, not action-overwrite.

### VF-AUD-20260910-PER-021

- **Severity:** P2
- **Confidence:** Medium
- **Classification:** LIKELY DEFECT
- **Location:** `src/stores/research-store.ts:108-110`, `:259-262`; `src/stores/character-card-store.ts:79-81`; `src/stores/chat-folder-store.ts:74-76`

```108:110:src/stores/research-store.ts
  updateSession: async (sessionId, patch) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) return;
```

```71:72:src/stores/research-store.ts
    if (get().hydrated || get().isInitialLoading) return;
```

- **Observed:** Research mutations no-op if the session is not in the in-memory array (never loads from IDB). `ensureResearchLoaded` returns immediately while `isInitialLoading`, dropping a concurrent first load's caller without waiting. Character-card `load` and chat-folder `loadFolders` drop overlapping calls the same way.
- **Expected:** Mutations fetch-or-fail from durable storage. Hydration is single-flight (return the in-flight promise).
- **Root cause:** Memory cache treated as source of truth.
- **Impact:** UI vs IDB desync: buttons appear to work (no throw) but durable data is unchanged. Matches the class of "cannot delete research tabs" reports if hydration lost the race.
- **Remediation:** `getItem` fallback; latch `ensureResearchLoaded` on a shared promise.
- **Tests:** Research store tests do not cover unhydrated update/delete.

### VF-AUD-20260910-PER-022

- **Severity:** P3
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/stores/chat-store.ts:123-162` (persist adapter); dual stores `chats` vs `conversations` in `src/constants/venice.ts:175-180`

```123:162:src/stores/chat-store.ts
const asyncStorageAdapter: StateStorage = {
  getItem: async (name) => {
    // migrate localStorage → StorageService.saveItem("chats", { id: name, value: legacy })
    const item = await StorageService.getItem<{ id: string; value: string }>("chats", name);
    return item?.value || null;
  },
```

- **Observed:** Zustand chat persist uses IndexedDB store `chats` as a single blob keyed `venice-chat`. Actual messages live in `conversations` (web) or vault (desktop). Store `chats` is also listed as encrypted/syncable. Syncing that blob can revive `veniceParams` / `systemPrompt` without conversations.
- **Expected:** `chats` is either removed after migration or excluded from sync/backup.
- **Root cause:** Legacy gallery/chat IDB names retained.
- **Impact:** Confusing dual schema; sync noise; leftover `chats` records after v3 persist migration.
- **Remediation:** Exclude `chats` from `STORE_NAMES` sync set; delete leftover blobs in a migration.
- **Tests:** None asserting `chats` is not exported.

### VF-AUD-20260910-PER-023

- **Severity:** P3
- **Confidence:** High
- **Classification:** DOCUMENTATION DEFECT
- **Location:** `src/constants/venice.ts:225`; `src/stores/settings-store.ts:420-422`

```225:226:src/constants/venice.ts
/** Version of the IndexedDB schema. Bumped to 6 ... 15 for multi-profile profileId index on every store; 16 for Phase 2G Sync tombstones store; 17 for chat_folders; 19 for imageInspectorSessions; 20 for character_creator_drafts. */
export const DB_VERSION = 20;
```

- **Observed:** Comment says v17 is `chat_folders`; actual v17 is `characterCardDrafts`, v18 `chat_folders`. Settings persist comment claims `partialize` that does not exist (PER-007).
- **Expected:** Comments match `MIGRATIONS` and persist config.
- **Root cause:** Comment-only updates skipped when versions were inserted.
- **Impact:** Agents/humans add indexes to the wrong version. Not a runtime bug by itself.
- **Remediation:** Fix the comment; derive diagnostics from `getMigrationHistory()`.
- **Tests:** n/a

### VF-AUD-20260910-PER-024

- **Severity:** P3
- **Confidence:** High
- **Classification:** CONFIRMED DEFECT
- **Location:** `src/App.tsx:241-249`; `src/stores/settings-store.ts:212-217`

```241:249:src/App.tsx
  const syncFolderPath = useSettingsStore((s) => s.syncFolderPath);
  useEffect(() => {
    if (typeof window !== "undefined" && syncFolderPath) {
      desktopSync.setSyncFolder({ path: syncFolderPath }).catch((err: unknown) => {
        console.error("Failed to initialize sync folder on boot:", err);
      });
    }
  }, [syncFolderPath]);
```

- **Observed:** Sync folder filesystem path is persisted in localStorage (`venice-settings` / `venice-settings_<profile>`) and applied on boot. Errors dump unredacted `err`. Main process already has `syncConfig` as the trusted path.
- **Expected:** Paths stay in main-process config; renderer holds a boolean "configured" flag. Logs use `sanitizeErrorText`.
- **Root cause:** Convenience persist of a desktop path into the generic settings blob.
- **Impact:** Machine path in a web-origin storage area; console leakage (PER-015 family).
- **Remediation:** Drop `syncFolderPath` from persist; query main on boot.
- **Tests:** None for persist of the path.

### VF-AUD-20260910-PER-025

- **Severity:** P3
- **Confidence:** High
- **Classification:** TEST GAP
- **Location:** backup/sync conversation path (PER-001); RP profile isolation (PER-002); structured credential purge (PER-003); chat bootstrap vs `_hasLoadedHistory` (PER-005)

- **Observed:** Focused tests exist for vault write, legacy chat-history, tombstone-before-delete, settings migrate v16, and profile-store sanitizer. Missing end-to-end tests:
  1. vault save → `createEncryptedBackup` includes the conversation
  2. two profiles cannot list each other's character cards on desktop
  3. `purgeMainProfileData` removes structured credentials
  4. `createConversation` during in-flight vault list still loads history
  5. `patch` on an unloaded media id hits IDB
- **Expected:** Contract tests for each dual-authority boundary.
- **Root cause:** Stores were tested at their own layer, not at the backup/profile/boot seams.
- **Impact:** The P1 defects above can regress without CI failure.
- **Remediation:** Add the five cases above as focused electron/unit tests.
- **Tests:** (this finding *is* the gap)

### VF-AUD-20260910-PER-026

- **Severity:** P3
- **Confidence:** High
- **Classification:** IMPROVEMENT
- **Location:** `src/services/chatStorage.ts:51-62`

```51:62:src/services/chatStorage.ts
export async function getConversation(id: string): Promise<Conversation | null> {
  if (isElectron()) {
    const result = await desktopChat.get(id);
    return result.ok ? result.conversation : null;
  }
  const items = await StorageService.getItems<Conversation & { id: string }>(FALLBACK_STORE);
  return items.find((c) => c.id === id) ?? null;
}
```

- **Observed:** Web `getConversation` decrypts the entire `conversations` store. `StorageService.getItem` already exists and is profile-aware. Electron branch also uses legacy `desktopChat.get`, not vault get (related to PER-001).
- **Expected:** Point reads by physical id; Electron uses vault.
- **Root cause:** Early web fallback.
- **Impact:** Unnecessary decrypt CPU; wrong backend on desktop if this helper is used.
- **Remediation:** `StorageService.getItem("conversations", id)`; Electron `desktopConversations.get`.
- **Tests:** `src/services/chatStorage.test.ts` should cover the point-read path.

### VF-AUD-20260910-PER-027

- **Severity:** P3
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Location:** `src/stores/document-agent-store.ts:14-31`; `src/stores/background-task-store.ts:64-67`; `src/stores/image-workspace-store.ts:54-67`

```26:31:src/stores/document-agent-store.ts
export const useDocumentAgentStore = create<DocumentAgentState>()((set) => ({
  agentSessionId: crypto.randomUUID(),
  preset: 'limited_documents',
  workspaceGrant: null,
```

- **Observed:** Document-agent preset/session id, image-workspace handoffs, inspector logs, and renderer background-task maps are memory-only. Desktop background tasks *are* journaled in main (`tasks.json` with sanitized metadata — good). Renderer `registerQueueTask` in web mode polls only in memory (`background-task-store.ts:147`).
- **Expected:** Web paid queues either persist enough to resume or clearly die on refresh. Agent session ids regenerating on remount is acceptable if main validates grants.
- **Root cause:** Intentional split; web has no main journal.
- **Impact:** Refresh during web video/music generation loses the poller (user can still have a provider queue id nowhere). Not a desktop restart bug.
- **Remediation:** Document web as non-durable for queues, or persist queue ids in encrypted IDB without payloads.
- **Tests:** Electron restart-idempotency tests exist; web does not.

### VF-AUD-20260910-PER-028

- **Severity:** P3
- **Confidence:** High
- **Classification:** DESIGN RISK
- **Location:** `src/lib/safe-storage.ts:73-87`; `src/stores/auth-store.ts:88-91`

```73:87:src/lib/safe-storage.ts
function pruneOversized(value: string): string | null {
  const parsed = JSON.parse(value) as { state?: Record<string, unknown>; version?: number }
  for (const key of ['conversations', 'workflows', 'messages']) {
    const arr = state[key]
    if (Array.isArray(arr) && arr.length > 5) {
      state[key] = arr.slice(0, Math.max(5, Math.floor(arr.length / 2)))
```

- **Observed:** Quota recovery for localStorage silently halves `conversations`/`workflows`/`messages` arrays. Chat/workflow persist no longer puts those arrays in localStorage (IDB adapters), so this is mostly dead — except if a future persist field reuses those names. Auth store still has an `apiKey` field (kept null after set).
- **Expected:** Quota handler should refuse to persist rather than mutate user content; `apiKey` should not exist on renderer state.
- **Root cause:** Legacy quota logic; leftover auth field for diagnostics `memoryOnly`.
- **Impact:** Low today. Reintroducing conversation persist to localStorage would truncate chats without notice.
- **Remediation:** Delete prune-by-key or make it a no-op that clears the key and warns. Remove `apiKey` from `AuthState`.
- **Tests:** `safe-storage.test.ts` likely asserts prune; treat as behavior change.

---

## Secret lifecycle (summary)

| Stage | Evidence | Verdict |
|---|---|---|
| Entry | Auth store `setApiKey` → `desktopApiKey.set`; UI does not keep the string (`apiKey: null`) | Pass |
| OS storage | `secureStore.setApiKey` uses `safeStorage.encryptString`; Win/mac fail closed; Linux plaintext requires `VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE` | Pass |
| Windows passwords | Strict credentials → Credential Manager; no plaintext fallback | Pass |
| Renderer visibility | No persist of keys; web session key is memory + `/api/session-key` (dev/loopback, production 404) | Pass with PER-019 note |
| localStorage | `createSafeStorage` policy + `verify-storage-policy` comments; model cache / theme bootstrap / first-run ack only | Pass (paths in settings persist: PER-024) |
| Logs | Electron `logger.ts` redacts; several renderer `console.error` bypass it (PER-015) | Fail (P2) |
| Profile delete | Venice/Jina/single keys deleted; structured credentials not (PER-003) | Fail (P1) |
| Sync/backup | `sanitizePortableData` drops secret-named keys; packets encrypted | Pass for keys; conversations may be missing (PER-001) |

## Dual-authority map (UI vs durable)

| Surface | Memory | Durable | Desync risk |
|---|---|---|---|
| Chats (Electron) | chat-store | Vault (write) / chat-history (backup+fallback) | PER-001, PER-005, PER-006 |
| Chats (web) | chat-store | IDB `conversations` | PER-005 |
| Settings/safety | settings-store persist | YAML + `runtimeSafetySettings` | PER-007, PER-012 |
| Providers | settings-store | `provider-settings.json` | PER-012 |
| Media catalog | media-store page cache | IDB `images` | PER-010, PER-014 |
| Media bytes | object URLs | `generatedMediaStore` | PER-016 |
| RP library | character-card / rp-chat stores | unscoped JSON files | PER-002, PER-004 |
| Background tasks | renderer map | `tasks.json` (Electron only) | PER-027 |
| Research / prompts / projects | zustand lists | IDB encrypted | PER-021 |

## Out of scope / not reproduced

- No P0 live secret written to localStorage or plaintext log was found in the current setters.
- `redactSecrets` on theme `tokens` is handled at the export boundary; not filed as a defect.
- Tombstone-before-delete in `syncDeleteCoordinator` is correct (persist tombstone, then `deleteItemRaw`).
- Conversation dirty-map identity check (`dirtyConversations.get(id) === conv`) is a sound lost-update guard for the in-memory journal.
- Electron `backgroundTaskManager` ephemeral signed-URL map is not persisted — matches the media contract.

## Suggested fix order

1. PER-003 structured-credential purge (small, secret-bearing).
2. PER-001 / PER-006 single conversation backend for live UI, backup, and sync.
3. PER-002 / PER-004 profile-scope and purge RP + media indexes.
4. PER-005 boot/hydration flag split.
5. PER-007 settings persist allowlist; PER-008 index backfill; PER-010 media patch; PER-015 log sinks.
)
