# Remediation Order — Venice Forge Exhaustive Audit (2026-09-13)

**Audit baseline SHA:** `2f672682d57f82e5cd2d0ecefa42a4a525a9504c`  
**Governing Principle:** Topology-ordered implementation sequence based on architectural risk and dependencies.

---

## Phase 1 — Release Gates, Security & Data Integrity Blockers

*These four findings are the primary blockers for release publication and user data safety.*

| ID | Title | Subsystem | Files | Status |
|---|---|---|---|---|
| **VF-AUD-20260913-P1-001** | Translate missing keys to unblock release workflow | i18n / Release Gate | `src/i18n/resources/**`, `docs/i18n/translation-status.json` | **RESOLVED** |
| **VF-AUD-20260913-P1-002** | Await dirty conversation flushes before switching active profile | State / Persistence | `src/stores/profile-store.ts`, `src/stores/chat-store.ts` | **RESOLVED** |
| **VF-AUD-20260913-P1-003** | Authorize domain store deletions from tombstone sync grants | Sync Engine | `electron/services/remoteApplyAuthority.ts` | **RESOLVED** |
| **VF-AUD-20260913-P1-004** | Fix SSE decoder CRLF chunk boundary lookahead | Streaming Chat | `src/shared/sseStreamDecoder.ts` | **RESOLVED** |

---

## Phase 2 — Persistence, Sync Engine & State Consistency

*Resolves replication robustness, storage quota resilience, and hydration race conditions.*

| ID | Title | Subsystem | Files | Status |
|---|---|---|---|---|
| **VF-AUD-20260913-P2-001** | Catch SyntaxError in `drainSyncOutbox` and quarantine corrupted entries | Sync Outbox | `electron/services/syncOutbox.ts` | **RESOLVED** |
| **VF-AUD-20260913-P2-002** | Clamp base ID length before appending `_conflict_` suffix | Sync Importer | `src/services/syncPacketImporter.ts` | **RESOLVED** |
| **VF-AUD-20260913-P2-003** | Add `chat_folders` to sync allowlists and bridge mapping | Sync Engine | `electron/services/syncFolderWatcher.ts`, `syncBridge.ts`, `syncHandlers.ts` | **RESOLVED** |
| **VF-AUD-20260913-P2-004** | Prevent `safe-storage.ts` from deleting settings on quota errors | Web Storage | `src/lib/safe-storage.ts` | **RESOLVED** |
| **VF-AUD-20260913-P2-005** | Add hydration gating and `onRehydrateStorage` to async stores | Zustand Stores | `src/stores/workflow-store.ts`, `src/stores/playground-store.ts` | Deferred |
| **VF-AUD-20260913-P2-006** | Expand `useProfileVolatileReset` to clear all 14 persistent stores | Profile Lifecycle | `src/hooks/useProfileVolatileReset.ts` | Deferred |

---

## Phase 3 — Feature Correctness, Error Propagation & Timers

*Addresses user-facing error reporting, model defaults, and residual raw file writes.*

| ID | Title | Subsystem | Files | Status |
|---|---|---|---|---|
| **VF-AUD-20260913-P2-007** | Use `clearTimeout` for `setTimeout` timer handles in background tasks | Background Tasks | `src/stores/background-task-store.ts` | **RESOLVED** |
| **VF-AUD-20260913-P3-001** | Preserve provider error messages in audio retrieval normalizer | Audio Service | `src/services/audio-retrieve-normalizer.ts` | **RESOLVED** |
| **VF-AUD-20260913-P3-002** | Remove hardcoded `af_sky` voice default for non-Kokoro models | Media Contract | `src/shared/venice-media-contract/payload-builders.ts` | **RESOLVED** |
| **VF-AUD-20260913-P3-003** | Update only successfully patched IDs in `media-store.patchMany` | Media Store | `src/stores/media-store.ts` | Deferred |
| **VF-AUD-20260913-P3-004** | Migrate character image cache and theme service to `atomicReplaceFile` | Main Storage | `electron/services/characterImageCache.ts`, `themeService.ts` | **RESOLVED** |

---

## Phase 4 — Regression Test Suite Additions

*Codifies regression tests for the repaired defects.*

| ID | Title | Target Test File | Status |
|---|---|---|---|
| **TG-001** | CRLF chunk boundary split test | `src/shared/sseStreamDecoder.test.ts` | **RESOLVED** |
| **TG-002** | Profile switch partition isolation test | `src/stores/profile-store.test.ts` | **RESOLVED** |
| **TG-003** | Tombstone grant mutation authority test | `electron/services/remoteApplyAuthority.test.ts` | **RESOLVED** |

---

## Phase 5 — Defense-in-Depth Hardening & Performance Optimizations

*Non-defect enhancements and streaming throughput improvements.*

| ID | Title | Subsystem | Files |
|---|---|---|---|
| **VF-AUD-20260913-DR-001** | Streaming chunk inspection in web proxy Safe Mode | Server Proxy | `server.ts` |
| **VF-AUD-20260913-DR-002** | Add 502 and 504 to retryable status codes | Venice Client | `src/services/veniceClient/fetch.ts` |
| **IMP-001** | Add `will-redirect` and `setPermissionCheckHandler` | Electron Main | `electron/main.ts` |
| **IMP-002** | Add fallback `<meta>` CSP to `index.html` | Renderer HTML | `index.html` |
| **IMP-003** | Support CORS preflight `OPTIONS` in proxy | Server Proxy | `server.ts` |
| **IMP-004** | Pin system path for `powershell.exe` | Windows Credential | `electron/services/windowsCredentialStore.ts` |
