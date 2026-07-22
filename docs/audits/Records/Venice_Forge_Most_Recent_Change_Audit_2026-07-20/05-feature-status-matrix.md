# 05 — Feature Status Matrix

**Audit Date:** 2026-07-20 (Executed: 2026-07-22)  
**Repository:** `spearchucker667/Venice_Forge` (`main` branch)  

---

## 1. Comprehensive Feature Status Matrix

| Feature | Status | Production Path | Test Evidence | UI Reachability | Remaining Gap | Work-Order ID |
| ------- | ------ | --------------- | ------------- | --------------- | ------------- | ------------- |
| **Standard & Character Chat Folders** | `verified` | `electron/services/chatFolderStorage.ts`, `chatFolderService.ts` | `electron/services/chatFolderService.test.ts` | Reachable in `HistoryView.tsx` & `CharacterChatsView.tsx` | None | VF-CHAT-FOLDERS-001 |
| **Drag & Drop Chat Movement** | `verified` | `src/components/chat/HistoryView.tsx`, `chat-folder-store.ts` | `src/stores/chat-folder-store.test.ts` | Reachable via mouse drag | None | VF-CHAT-FOLDERS-002 |
| **Keyboard Chat Movement** | `partial` | `src/components/chat/HistoryView.tsx` | Manual UI evidence | Accessible menu present | Arrow-key reorder navigation lacks dedicated key listener | VF-CHAT-FOLDERS-003 |
| **Folder Create / Rename / Delete / Reorder** | `verified` | `electron/ipc/handlers/chatFolderHandlers.ts`, `chat-folder-store.ts` | `electron/ipc/handlers/chatFolderHandlers.test.ts` | Fully reachable via folder context menu | None | VF-CHAT-FOLDERS-004 |
| **Folder Backup Export** | `verified` | `electron/services/chatFolderBackupService.ts` (`exportBackup`) | `electron/services/chatFolderBackupService.test.ts` | Reachable via Folder context menu | None | VF-CHAT-FOLDERS-005 |
| **Folder Import Restoration** | `verified` | `electron/services/chatFolderBackupService.ts` (`importBackup`) | `electron/services/chatFolderBackupService.test.ts` | Reachable via Folder import dialog | None (P0-01 conversation & message restoration verified) | VF-CHAT-FOLDERS-006 |
| **Folder Merge Import** | `verified` | `chatFolderBackupService.ts` (`collectExistingConversationIds`) | `chatFolderBackupService.test.ts` | Reachable via Import mode selection | None | VF-CHAT-FOLDERS-007 |
| **Folder Media Inclusion** | `partial` | `chatFolderBackupService.ts` | `chatFolderBackupService.test.ts` | Toggle present in export dialog | Media blobs count present in manifest; zip binary streaming partial | VF-CHAT-FOLDERS-008 |
| **Folder Lock (Privacy Gate)** | `partial` | `electron/services/chatFolderLockService.ts` | `electron/services/chatFolderLockService.test.ts` | Reachable via Lock option | On-disk conversation files remain plain JSON (`conversations/<id>.json`). Lock acts as privacy access gate, NOT per-folder encrypted storage at rest | VF-CHAT-FOLDERS-009 |
| **Legacy Folder Migration** | `verified` | `electron/services/chatFolderStorage.ts` (`listChatFolders`) | `chatFolderStorage.test.ts` | Automatic on app load | None | VF-CHAT-FOLDERS-010 |
| **Agent Media Generation** | `verified` | `electron/agent/runtime/agent-tool-executor.ts` | `electron/agent/runtime/agent-tool-executor.test.ts` | Triggered by model tool call | None | VF-AGENT-MEDIA-001 |
| **Agent Media Model Selection** | `verified` | `agent-tool-executor.ts` (`MODEL_ID_RE`) | `agent-tool-executor.test.ts` | Programmatic in tool arguments | None | VF-AGENT-MEDIA-002 |
| **Agent Media Guard Integration** | `verified` | `agent-tool-executor.ts` → `performGuardedVeniceRequest` | `electron/services/guardPipeline.test.ts` | Automatic on every tool call | None | VF-AGENT-MEDIA-003 |
| **Chat Media Rendering** | `verified` | `chat-agent-runner.ts`, `src/components/chat/message-bubble.tsx` | `chat-agent-runner.test.ts` | Visible in message bubble | None | VF-AGENT-MEDIA-004 |
| **Gallery Independence** | `verified` | `electron/services/generatedMediaStore.ts` | `generatedMediaStore.test.ts` | Reachable in Gallery View | Removing chat media ref leaves gallery blob intact | VF-AGENT-MEDIA-005 |
| **Runtime Date/Time Awareness** | `verified` | `electron/agent/runtime/trusted-agent-request.ts` | `trusted-agent-request.test.ts` | Injected into all agent calls | None | VF-AGENT-RUNTIME-001 |
| **Immutable Tool-Runtime Layer** | `verified` | `trusted-agent-request.ts` (`TRUSTED_PRIORITY_FLOOR = 0`) | `trusted-agent-request.test.ts` | Programmatic floor | None | VF-AGENT-RUNTIME-002 |
| **User System Prompt Limits** | `verified` | `src/shared/promptLimits.ts` | `src/shared/promptLimits.test.ts` | Character & Chat Settings editors | 8k warning / 12k max / 16k override verified | VF-PROMPT-LIMITS-001 |
| **Limited Document Tools** | `partial` | `electron/ipc/handlers/documentAgentHandlers.ts` | `documentAgentHandlers.test.ts` | Reachable in Document View | Approval modal preview rendering partial | VF-DOCUMENTS-001 |
| **Full Document Agent** | `partial` | `src/components/DocumentAgentView.tsx` | `document-patch-engine.test.ts` | Reachable in Document View | Multi-file changeset execution unverified | VF-DOCUMENTS-002 |
| **Durable Video Playback** | `verified` | `electron/services/videoRetrieveService.ts`, `ManagedVideoPlayer.tsx` | `videoRetrieveService.test.ts` | Video Studio & Gallery | `venice-media://` protocol streaming active | VF-VIDEO-001 |
| **Video Native Save As** | `verified` | `electron/ipc/handlers/fileHandlers.ts` | `fileHandlers.test.ts` | Native dialog button on player | None | VF-VIDEO-002 |
| **Image API Invariants** | `verified` | `src/services/veniceClient.ts` | `veniceClient.adapters.test.ts` | All image operations | Uses `model` (not `modelId`); edit/upscale contracts enforced | VF-API-CONTRACTS-001 |
| **Retrieve Audio & Video Contracts**| `verified` | `electron/services/videoRetrieveService.ts` | `videoRetrieveService.test.ts` | Background task poller | Preserves `download_url` and handles binary payloads | VF-API-CONTRACTS-002 |
| **Character Greetings & Isolation** | `verified` | `src/components/chat/CharacterChatsView.tsx` | `CharacterChatsView.test.tsx` | Character Chat screen | Greeting rendered exactly once, generic empty state excluded | VF-CHARACTER-001 |
| **Character Avatars & Protocols** | `verified` | `src/components/chat/CharacterAvatar.tsx` | `characterImageCache.test.ts` | Sidebar & Chat headers | Caches hosted images; serves `vf-character-avatar://` | VF-CHARACTER-002 |
| **Hosted / Local Character Hub** | `verified` | `src/components/CharactersView.tsx` | `src/components/CharactersView.test.tsx` | Characters View | Favorites, duplicate, refresh, details active | VF-CHARACTER-003 |
| **App-Wide Encrypted Backup** | `verified` | `electron/services/backupCrypto.ts` | `backupCrypto.test.ts` | Settings -> Backup & Sync | Argon2id/XChaCha20-Poly1305 app backup | VF-BACKUP-SYNC-001 |
| **Encrypted Sync Folder** | `verified` | `electron/services/syncEngine.ts`, `syncFolderWatcher.ts` | `syncEngine.test.ts` | Settings -> Backup & Sync | E2E folder sync active | VF-BACKUP-SYNC-002 |
| **WebDAV / S3 Providers** | `deferred` | None | N/A | N/A | Post-beta.1 roadmap item | VF-BACKUP-SYNC-003 |
| **Live Sync-Key Rotation** | `deferred` | None | N/A | N/A | Post-beta.1 roadmap item | VF-BACKUP-SYNC-004 |
| **Packaged Release Verification** | `broken` | `scripts/verify-release-metadata.cjs`, `vitest` | `verify-release-metadata.cjs` output | Automated build/CI scripts | `verify:release-metadata` fails on `AGENTS.md` version line; `test:ci` fails on `chat-store.test.ts` | VF-RELEASE-QA-001 |
