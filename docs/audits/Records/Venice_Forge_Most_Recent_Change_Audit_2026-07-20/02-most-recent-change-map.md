# 02 — Most Recent Change Map

**Baseline Commit:** `d21e9fd3af64f67bf4fc50429eb1d3c35ae2ae71` ("venice forge: chat folders, agent media, documents, video (9-phase work order)")  
**Current HEAD Commit:** `ae1db1badf7d08ca32daf9c47ebc1181e3a288b9` ("feat(ui): integrate Bas Milius Meteocons icons, fix local character chats quick-launch, and restore chat TTS responsiveness across web and desktop")  

---

## 1. Summary of Changes Introduced Across Recent Commits

The application snapshot represents a sequence of structural feature additions, security hardening updates, and UI surface refinements across 9 major functional domains:

```text
d21e9fd → 9-phase work order implementation (chat folders, agent media, document agent, video pipeline)
fe186a9 → UI border refinement in DocumentAgentView.tsx
694ad41 → Tool system prompt update
878c3e5 → Fix test failures and documentation links
5e309fc → Incremental update
49fb8d2 → Bounded multi-turn chat agent loop + persona isolation + CSP correction
7abdc66 → Refresh copilot-instructions + bump verify:agent-docs contract
af15319 → Incremental update
27aca76 → Update themes engine
ae1db1b → Bas Milius Meteocons icons + local character quick-launch + TTS responsiveness
```

---

## 2. Detailed Change Map by Functional Domain

### 2.1 Chat Folders & Domain Isolation
- **Files Modified/Created:** `electron/services/chatFolderStorage.ts`, `electron/services/chatFolderService.ts`, `electron/ipc/handlers/chatFolderHandlers.ts`, `src/stores/chat-folder-store.ts`, `src/shared/chatFolderContracts.ts`.
- **Intended Feature:** Separate standard chat folders (`kind: "standard"`) from character chat folders (`kind: "character"`).
- **Actual Implementation:**
  - `ChatFolderKind` enum (`"standard" | "character"`) enforced in `chatFolderStorage.ts` and `chatFolderService.ts`.
  - Migration of legacy folders without `kind` stamps to standard or character based on conversation contents.
  - IPC enforcement: `moveConversation` rejects cross-domain moves in main process.
  - UI separation in `HistoryView.tsx` and `CharacterChatsView.tsx`.

### 2.2 Chat Folder Backup & Import Restoration
- **Files Modified/Created:** `electron/services/chatFolderBackupService.ts`, `electron/services/chatFolderBackupService.test.ts`.
- **Intended Feature:** Encrypted folder export/import (`.vfbackup`) carrying folder structure, conversations, messages, attachment metadata, and media references.
- **Actual Implementation:**
  - Argon2id KDF + XChaCha20-Poly1305 payload encryption.
  - `publicHeader` contains unencrypted preview metadata (folder name, chat count, app version).
  - P0-01 Remediation: `importBackup()` iterates through `manifest.conversations`, validates fields with `prepareImportedConversation()`, saves conversations via `saveConversation()`, and performs atomic rollback of created conversations on error.
  - P0-02 Remediation: `importBackup()` uses canonical `saveChatFolder()` instead of hardcoded paths.

### 2.3 Chat Folder Lock
- **Files Modified/Created:** `electron/services/chatFolderLockService.ts`, `src/shared/chatFolderContracts.ts`.
- **Intended Feature:** Passphrase-protected folder locking with Argon2id KDF, exponential backoff, and optional device unlock.
- **Actual Implementation:**
  - Random 32-byte folder key generated and wrapped via Argon2id KDF + XChaCha20-Poly1305. Wrapped key stored in `secureStore` via `setCredential()`.
  - Passphrase retry backoff (30s base up to 5 minutes after 5 failed attempts).
  - **Architectural Reality:** Stored folder content files on disk remain plain unencrypted JSON files (`conversations/<id>.json`). Folder lock acts as an access control / privacy gate in UI/IPC, NOT per-folder encrypted storage at rest.

### 2.4 Agent Runtime Layering & Date/Time Awareness
- **Files Modified/Created:** `electron/agent/runtime/trusted-agent-request.ts`, `src/shared/agentRuntimeContracts.ts`, `electron/services/guardPipeline.ts`.
- **Intended Feature:** Immutable first-layer system prompt insertion containing trusted date, time, timezone, and authorized tool rules.
- **Actual Implementation:**
  - `buildTrustedRuntimeLayer()` creates a priority 0, `immutable: true` layer.
  - `composeAgentRuntime()` enforces `TRUSTED_PRIORITY_FLOOR = 0` (no custom layer can assert priority < 0).
  - Placeholder substitution for `{{ time && date }}`, `{{ date }}`, `{{ time }}`, `{{ timezone }}`, `{{ iso }}`.

### 2.5 Agent Media Generation & Canonical Chat References
- **Files Modified/Created:** `electron/agent/runtime/agent-tool-executor.ts`, `electron/agent/runtime/chat-agent-runner.ts`, `src/shared/chatMediaReferenceContracts.ts`.
- **Intended Feature:** Execute `media.generateImage` tool calls through the canonical guarded Venice client, persist generated media, and attach canonical `ChatMediaReference` objects to assistant messages.
- **Actual Implementation:**
  - `agent-tool-executor.ts` routes `media.generateImage` through `performGuardedVeniceRequest("/image/generate")` enforcing Family Safe Mode.
  - Persistence via `persistGeneratedMedia()` into `generatedMediaStore`.
  - `chat-agent-runner.ts` extracts `chatRef` via `extractCanonicalChatMediaReferences()` producing `ChatMediaReferenceContract[]`.

### 2.6 Multi-Turn Agent Loop & Persona Isolation
- **Files Modified/Created:** `electron/agent/runtime/chat-agent-runner.ts` (modified in `49fb8d2`).
- **Intended Feature:** Allow up to 8 model turns and 16 executed tool calls per agent invocation while preserving character persona isolation.
- **Actual Implementation:** Bounded loop streams tool calls, executes tools via `executeAgentTool()`, feeds tool output messages back into the next model turn, and terminates on finish reason or max turn limit.

### 2.7 Document Agent & Workspace Tools
- **Files Modified/Created:** `electron/ipc/handlers/documentAgentHandlers.ts`, `electron/agent/documents/attachment-import-service.ts`, `src/components/DocumentAgentView.tsx`.
- **Intended Feature:** Workspace document reading, creation, proposal approvals, and revision history.
- **Actual Implementation:** Document read/create/proposeEdits services wired via IPC. DocumentAgentView UI built with revision inspection and approval triggers.

### 2.8 Video Persistence & Playback
- **Files Modified/Created:** `electron/services/videoRetrieveService.ts`, `electron/services/generatedVideoDownload.ts`, `src/components/gallery/ManagedVideoPlayer.tsx`.
- **Intended Feature:** Background polling, `download_url` retrieval, durable local persistence, and custom protocol streaming (`venice-media://`).
- **Actual Implementation:** Video retrieval service downloads binary video, persists to local content store, and renders via `ManagedVideoPlayer` supporting custom protocol streaming and native Save As.

### 2.9 Recent UI Polish (Meteocons & Chat TTS)
- **Files Modified/Created:** `src/components/ui/Meteocon.tsx`, `src/components/chat/HistoryView.tsx`, `src/components/chat/CharacterChatsView.tsx`, `src/services/chatTtsController.ts` (modified in `ae1db1b`).
- **Intended Feature:** Integrated Bas Milius Meteocons weather/theme icon components, fixed local character chat quick-launch buttons, and restored TTS audio playback responsiveness across web and desktop transports.
