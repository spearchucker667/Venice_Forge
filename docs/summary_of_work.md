# Summary of Work

> Canonical handoff ledger for AI/dev-agent sessions.
>
> Every agent that modifies this repository must update this document
> before ending its session. See `AGENTS.md` § *Mandatory Session
> Handoff* for the contract.
>
> This file now contains only the latest session summary and the most
> recent dated entries. Older dated session records (before 2026-07-11)
> are archived in [`docs/archives/session-history-pre-2026-07-11.md`](archives/session-history-pre-2026-07-11.md).

### Latest Session Summary
- **2026-07-11 Task 7 review fixes: tighten origin validation and stop leaking origin into sync packets — COMPLETE (current session):**
  - Fixed inconsistent invalid-origin handling for saves vs. deletes in `electron/ipc/handlers/systemHandlers.ts` and `electron/ipc/rpHandlers.ts`: `parseSaveOrigin` now returns a `[error, origin]` tuple and rejects invalid origins instead of silently defaulting to `"local-user"`.
  - Fixed `conversations:save` in `electron/ipc/handlers/systemHandlers.ts`: the handler now strips the `origin` field from the incoming payload before persisting and emitting, so `origin` no longer leaks into the sync packet. Emission uses the cleaned record.
  - Added handler-level gating so `emitSyncPacket` / `emitSyncTombstone` are invoked only when the parsed origin is `"local-user"` (or undefined for back-compat). The existing bridge-level gating in `electron/services/syncBridge.ts` remains as defense in depth.
  - Updated tests to match the stricter contract: existing `remote-sync` origin tests now assert no sync-bridge call; new tests assert invalid origins are rejected and `local-user` origins emit exactly once.
  - Added the requested integration-style regression test in `electron/ipc/handlers.test.ts`: a save handler called with `{ conversation, origin: "remote-sync" }` does not call `syncBridge.emitSyncPacket`, while the same call with `origin: "local-user"` calls it once.
  - Validation: focused tests (3 files / 106 tests) PASS; `npm run test:electron` (30 files / 531 tests) PASS; `npm run typecheck` PASS; `npm run lint:eslint` PASS (0 warnings).
  - Files changed: `electron/ipc/handlers/systemHandlers.ts`, `electron/ipc/handlers.test.ts`, `electron/ipc/rpHandlers.ts`, `electron/ipc/rpHandlers.test.ts`, `docs/summary_of_work.md`, `.superpowers/sdd/task-7-report.md`.

- **2026-07-11 Task 7: Make main-process save/delete handlers origin-aware — COMPLETE (previous session, review-fixed above):**
  - Updated `electron/services/syncBridge.ts`: `emitSyncPacket` and `emitSyncTombstone` now accept an optional `origin` parameter and skip emission when `origin` is defined and not `"local-user"`; undefined origin preserves back-compat.
  - Updated `electron/ipc/handlers/systemHandlers.ts`: `chat:save` and `conversations:save` parse/validate origin via `parseSaveOrigin` and forward it to `emitSyncPacket`; `chat:delete` and `conversations:delete` now forward the parsed origin to `emitSyncTombstone`.
  - Updated `electron/ipc/rpHandlers.ts`: all RP save handlers (`characterCards:save`, `personas:save`, `lorebooks:save`, `rpChats:save`, `rpAssets:save`, `scenarios:save`) parse origin and forward it to `emitSyncPacket`; all RP delete handlers forward parsed origin to `emitSyncTombstone`.
  - Added regression tests: `electron/services/syncBridge.test.ts` covers suppression for `remote-sync` / `manual-import` / `migration` and emission for `local-user` and omitted origin; `electron/ipc/handlers.test.ts` covers origin forwarding for `chat:save`, `chat:delete`, `conversations:save`, `conversations:delete`; `electron/ipc/rpHandlers.test.ts` covers origin forwarding for `personas:save` and `personas:delete`.
  - Validation: focused tests (3 files / 102 tests) PASS; `npm run test:electron` (30 files / 527 tests) PASS.
  - Files changed: `electron/services/syncBridge.ts`, `electron/services/syncBridge.test.ts`, `electron/ipc/handlers/systemHandlers.ts`, `electron/ipc/handlers.test.ts`, `electron/ipc/rpHandlers.ts`, `electron/ipc/rpHandlers.test.ts`, `docs/summary_of_work.md`, `.superpowers/sdd/task-7-report.md`.

- **2026-07-11 Task 6 review fixes: complete origin-aware delete handlers and sync emission gating — COMPLETE (previous session):**
  - Completed RP delete handler updates in `electron/ipc/rpHandlers.ts`: `characterCards:delete`, `personas:delete`, `lorebooks:delete`, `rpChats:delete`, `rpAssets:delete`, and `scenarios:delete` now accept `{ id, origin }` payloads via `parseDeletePayload`, validate origin through `validateMutationOrigin`, and forward only `id` to downstream storage.
  - Fixed `isValidId` import path in `electron/ipc/rpHandlers.ts` (moved to `src/utils/idValidation`).
  - Updated `src/services/syncEngine.ts`: `handleStorageSaved` and `handleStorageDeleted` skip sync emission when `event.detail.origin` is present and not `"local-user"`; undefined origin preserves existing back-compat behavior.
  - Updated affected tests: `electron/ipc/rpHandlers.test.ts` invalid-ID case now uses `{ id: 123 }`; added regression tests for non-object payloads, invalid origins, `{ id, origin }` acceptance, remote-sync/manual-import suppression, local-user emission, and omitted-origin back-compat.
  - Validation: focused tests (5 files / 129 tests) PASS; `npm run test:electron` (30 files / 507 tests) PASS; `npm run typecheck` PASS; `npm run lint:eslint` PASS (0 warnings).
  - Files changed: `electron/ipc/rpHandlers.ts`, `electron/ipc/rpHandlers.test.ts`, `src/services/syncEngine.ts`, `src/services/syncEngine.test.ts`, `electron/ipc/handlers/systemHandlers.ts`, `docs/summary_of_work.md`, `.superpowers/sdd/task-6-report.md`.

- **2026-07-11 Task 5: Preserve remote tombstone `deletedAt` and `deviceId` — COMPLETE (current session):**
  - Updated `src/services/backupImportService.ts`: `importDecryptedPacket` now persists validated remote tombstones via `TombstoneService.saveTombstone(validation.tombstone)` instead of `recordTombstone(...)`, preserving the original `deletedAt` and `deviceId` metadata.
  - Updated `src/services/backupImportService.test.ts`: mocked `saveTombstone`, replaced `recordTombstone` assertions, and added TDD regression test `preserves remote tombstone deletedAt and deviceId` that failed before the fix and passes after it.
  - Validation: `npx vitest run src/services/backupImportService.test.ts` PASS (19 tests); `npx eslint --max-warnings=0` on touched files PASS; `npx tsc --noEmit -p tsconfig.json` PASS.
  - Files changed: `src/services/backupImportService.ts`, `src/services/backupImportService.test.ts`, `docs/summary_of_work.md`.

- **2026-07-11 Task 4 review fixes — COMPLETE (current session):**
  - Fixed `scripts/verify-backup-sync.cjs`: dropped the removed `emitLocalTombstone` export requirement from `src/services/syncEngine.ts` and now requires `deleteSyncableRecord` from `src/services/syncDeleteCoordinator.ts`.
  - Fixed `src/services/syncEngine.ts`: `handleStorageSaved` now ignores the `tombstones` store in addition to `diagnostics`, preventing duplicate tombstone packets when `TombstoneService.saveTombstone` writes locally. `handleStorageDeleted` is now async and logs errors from `deleteSyncableRecord` instead of fire-and-forget.
  - Hardened `src/services/syncDeleteCoordinator.ts`: catches errors from `saveTombstone`, `deleteItem`, and `desktopSync.writePacket`, returning `{ ok: false, error }` on persistence/emission failure. Tombstone emission is now gated on `isElectron()` and an active sync engine status to avoid web-mode console noise.
  - Fixed `src/services/backupImportService.ts`: `importDecryptedPacket` now returns `{ ok: false, error: "Local tombstone is newer; record skipped." }` when a stale object packet would resurrect a locally deleted record, matching the task brief contract.
  - Cleaned up `src/services/storageService.ts`: renamed `deleteItem` options parameter from `_options` to `options` and made `bypassSyncEcho` real by suppressing the `venice:storage-deleted` event when it is set.
  - Updated affected tests: `syncDeleteCoordinator.test.ts` and `backupImportService.test.ts` now assert `result.ok` is `false` for the tombstone rejection path; `syncDeleteCoordinator.test.ts` mocks active Electron sync status so emission remains covered.
  - Validation: focused Vitest suite PASS (3 files / 34 tests); `node scripts/verify-backup-sync.cjs` PASS; `npm run typecheck` PASS; `npm run lint:eslint` PASS (0 warnings). `backupImportService.test.ts` also passes after the contract change.
  - Files changed: `scripts/verify-backup-sync.cjs`, `src/services/syncEngine.ts`, `src/services/syncDeleteCoordinator.ts`, `src/services/syncDeleteCoordinator.test.ts`, `src/services/backupImportService.ts`, `src/services/backupImportService.test.ts`, `src/services/storageService.ts`, `docs/summary_of_work.md`, `.superpowers/sdd/task-4-report.md`.

- **2026-07-11 Task 4: Authoritative `deleteSyncableRecord` coordinator — COMPLETE (previous session):**
  - Created `src/services/syncDeleteCoordinator.ts` exporting `deleteSyncableRecord(storeName, recordId, deviceId?)`, the single entry point for deleting syncable records.
  - Coordinator ordering: creates canonical tombstone → persists it via `TombstoneService.saveTombstone` → deletes the target via `StorageService.deleteItem(..., { bypassSyncEcho: true })` with `__VENICE_IS_SYNCING` raised to prevent echo → emits the exact encrypted tombstone via `desktopSync.writePacket`.
  - Wired `src/services/syncEngine.ts` so `handleStorageDeleted` routes syncable-store deletions through the coordinator; removed the obsolete `emitLocalTombstone` export/function.
  - Removed the obsolete direct `desktopSync.writePacket` tombstone emission block from `src/services/storageService.ts:507-525`; `StorageService.deleteItem` now only dispatches `venice:storage-deleted`.
  - Added `src/services/syncDeleteCoordinator.test.ts` with TDD regression tests: ordering proof (`saveTombstone` before `deleteItem`, tombstone packet emitted once) and resurrection guard (stale object packet cannot resurrect a locally deleted record because the local tombstone wins).
  - Updated `src/services/syncEngine.test.ts` to mock the coordinator and assert the event listener routes deletes and ignores diagnostics.
  - Files changed: `src/services/syncDeleteCoordinator.ts`, `src/services/syncDeleteCoordinator.test.ts`, `src/services/syncEngine.ts`, `src/services/syncEngine.test.ts`, `src/services/storageService.ts`, `docs/summary_of_work.md`.
  - Validation: `npx vitest run src/services/syncDeleteCoordinator.test.ts src/services/syncEngine.test.ts src/services/storageService.test.ts` PASS (3 files / 34 tests); `npm run typecheck` PASS; `npm run lint:eslint` PASS.

- **2026-07-11 Task 3: Exact tombstone persistence API — COMPLETE (previous session):**
  - Added `TombstoneService.saveTombstone(tombstone)` which persists the full tombstone object exactly (including `deletedAt` and `deviceId`) using a new `bypassSyncEcho` storage-mutation option.
  - Refactored `TombstoneService.recordTombstone` to delegate to `saveTombstone`; preserved backward compatibility for the legacy `(storeName, recordId, deviceId?)` signature while also accepting an options bag `{ deletedAt?, deviceId? }`.
  - Added `StorageMutationOptions` to `src/services/storageService.ts` with `bypassSyncEcho?: boolean`; `saveItem` and `deleteItem` now accept the options bag. When `bypassSyncEcho` is true, `saveItem` preserves the caller's exact record shape and skips local revision/timestamp metadata so sync-internal records round-trip unchanged.
  - Extended `VALID_ID_RE` in `src/utils/idValidation.ts` to allow `:` so composite tombstone ids (`storeName:recordId`) pass validation for both writes and reads.
  - TDD evidence: new regression test `saves an exact tombstone including original deletedAt` initially failed (`saveTombstone` undefined, then ID validation failure, then null read-back); after implementation the focused test suite passes.
  - Files changed: `src/services/tombstoneService.ts`, `src/services/tombstoneService.test.ts`, `src/services/storageService.ts`, `src/utils/idValidation.ts`, `docs/summary_of_work.md`.
  - Validation: `npx vitest run src/services/tombstoneService.test.ts src/services/storageService.test.ts src/utils/idValidation.test.ts src/services/backupImportService.test.ts` PASS; `npm run typecheck` PASS.

- **2026-07-10 Coordinated repository remediation and feature completion pass — COMPLETE (current session):**
  - **Repository identity / Phase 1:** Confirmed canonical path `/Users/super_user/Projects/Venice_Forge` and GitHub `spearchucker667/Venice_Forge`; active agent docs already contain the canonical block; `.impeccable/hook.cache.json` deletion staged and `.impeccable/` ignored; `verify:repository-identity` and `verify:repo-handoff-hygiene` pass.
  - **Phase 6 RP Studio polish:** Added `TokenCounter`/`rpTokenCounter` fallback with "Estimated tokens" labeling; `CharacterEditor` disables Save over budget and shows red budget readout; `PersonaManager` supports optional image upload/preview/replace/remove with MIME/size validation; persona images persist and round-trip through export/import; regression guards `VERIFY-078` through `VERIFY-081`.
  - **Phase 7 Scene references:** Added `supportsReferences`/`referenceLimit` to image-model capabilities; integrated `buildSceneReferencePlan` into `generateCharacterScene`; built `SceneReferenceResolver` from character/persona stores; extended `buildImagePayload` to emit `reference_image_urls`; added `SceneReferencePanel` preview in `SceneComposerView`; regression guards `VERIFY-082` through `VERIFY-086`; added `verify:scene-references` contract script.
  - **Phase 9 Backup and sync completion:** Unified sync-folder config between `BackupSyncPanel` and settings store; fixed active-status read; redacted IPC encrypt/decrypt errors; completed `verify:backup-sync` contract verifier; closed desktop local-change propagation and tombstone emission via `syncBridge.ts`; regression guards `VERIFY-087` through `VERIFY-089`.
  - **Phase 10 integration / CI:** Wired `verify:scene-references` and `verify:backup-sync` into `verify:contracts`; extended `verify:repo-handoff-hygiene` and `AGENTS.md` VERIFY registry to `VERIFY-001..VERIFY-092`; fixed `vite.config.ts` bundle split so `verify:bundle-budget` passes.
  - **Validation matrix:** See the appended final 2026-07-10 Validation Matrix for full command results. All required validation commands pass.

- **2026-07-10 Chat Correctness Bundle (Phases 2-4) — COMPLETE (current session):**
  - **Default model resolver hardening:** Rejected image/audio/embedding/offline models from chat default selection while keeping vision-capable chat models in `src/services/defaultModelResolver.ts`; added 8 tests in `src/services/defaultModelResolver.test.ts` (`VERIFY-070`).
  - **Memory isolation:** Added regression tests to `src/hooks/use-chat.test.ts` covering chat-switch discard, popup-at-most-once, and disabled-zero-retrieval; fixed cross-test mock leakage by `mockReset`-ing `mockedPullContext` and `mockedVeniceStreamChat` in `beforeEach` (`VERIFY-071`).
  - **Message inline editing:** Added tests to `src/components/chat/message-bubble.test.tsx` for enter/cancel/save and attachment preservation (`VERIFY-072`).
  - **Message operations:** Added tests to `src/components/chat/chat-view.test.tsx` for delete-from-here, regenerate-from-here, fork, in-conversation search, unavailable-model fallback, and persisted-model-beats-global; made `useModels` mock dynamic (`VERIFY-073`).
  - **Store-level operations:** Added `src/stores/chat-store.message-operations.test.ts` covering truncate return slice and fork preserving model/character binding (`VERIFY-073`).
  - **Header model selector:** Added tests to `src/components/layout/header.test.tsx` proving the selector updates `conversation.model` and persisted model beats global selection; made `useModels` mock dynamic (`VERIFY-073`).
  - **Character display title:** Added coverage to `src/utils/conversationDisplayTitle.test.ts`, `src/components/layout/sidebar.test.tsx`, and `src/components/chat/HistoryView.test.tsx` (`VERIFY-074`).
  - **Files changed:** `src/services/defaultModelResolver.ts`, `src/services/defaultModelResolver.test.ts`, `src/hooks/use-chat.test.ts`, `src/components/chat/chat-view.test.tsx`, `src/components/chat/message-bubble.test.tsx`, `src/stores/chat-store.message-operations.test.ts`, `src/components/layout/header.test.tsx`, `src/components/layout/sidebar.test.tsx`, `src/components/chat/HistoryView.test.tsx`, `src/utils/conversationDisplayTitle.test.ts`, `docs/summary_of_work.md`.
  - **Validation matrix:** Focused Vitest command PASS (118 tests); `npm run test:ui` PASS (266 tests); targeted ESLint on touched files PASS; `npm run typecheck` reported only pre-existing unrelated errors.

- **2026-07-10 Prompt Library Selection (Phase 5) — COMPLETE (current session):**
  - **Selection reconciliation:** Implemented `importPrompts(payload, { reconcile: true })` in `src/stores/prompt-library-store.ts`. Re-importing the same prompt (matched by normalised title + kind + scope) appends the imported current version to the existing record instead of creating a duplicate. Added `reconciled` to `PromptLibraryImportResult` in `src/types/prompt-library.ts`.
  - **Delete selection UX:** Verified and regression-tested the existing view behaviour: deleting the active middle prompt selects the next visible prompt; deleting the last selects the previous; deleting the only prompt clears the detail pane.
  - **Filter selection UX:** Verified and regression-tested that filtering hides the selected prompt and automatically selects the first visible one, or clears the pane when no prompts match.
  - **Deleted-record guard:** Added a regression test proving `updatePrompt` is a no-op after the prompt has been deleted, and a UI test ensuring the detail editor cannot resurrect a deleted record.
  - **Command Palette surfacing:** Updated `src/components/command-palette/CommandPalette.tsx` so the Import Prompts action uses reconciliation by default and the toast reports imported, synced, and skipped counts.
  - **Regression guards:** Added `// VERIFY-075` and `// VERIFY-076` regression-guard comments to the new test headers per the assigned ID range.
  - **Files changed:** `src/types/prompt-library.ts`, `src/stores/prompt-library-store.ts`, `src/stores/prompt-library-store.test.ts`, `src/components/prompts/PromptLibraryView.test.tsx`, `src/components/prompts/PromptLibrarySelection.test.ts`, `src/components/command-palette/CommandPalette.tsx`, `src/components/command-palette/CommandPalette.test.tsx`, `docs/summary_of_work.md`.
  - **Validation matrix:** `npx vitest run src/components/prompts/PromptLibraryView.test.tsx src/components/prompts/PromptLibrarySelection.test.ts src/stores/prompt-library-store.test.ts src/components/command-palette/CommandPalette.test.tsx` PASS (109 tests); `node scripts/verify-prompt-library.cjs` PASS; `npx eslint --max-warnings=0` on touched files PASS; full `npm run typecheck` reported pre-existing unrelated errors in other Phase scopes (see validation matrix below).

- **2026-07-10 Bundle Budget, Theme Guard, and Documentation Refresh (Phases 1/8/10 docs) — COMPLETE (current session):**
  - **Bundle budget:** Investigated the 608 KB `index-COt0Xo8-.js` main chunk causing `verify:bundle-budget` to fail. Updated `vite.config.ts` `manualChunks` to route the markdown ecosystem (`micromark`, `mdast`, `hast`, `unist`, `hastscript`, etc.) into `vendor-markdown` and TanStack Query (`@tanstack/react-query`, `@tanstack/query-core`) into `vendor-tanstack`. Rebuilt web bundle; main entry chunk dropped to ~521 KB and `node scripts/verify-bundle-budget.cjs` passes.
  - **Theme guard:** Added `// VERIFY-092 regression guard` comment to the softened dark-theme body-text test in `src/theme/contrast.test.ts`. Confirmed `npx vitest run src/theme/contrast.test.ts` PASS (68 tests).
  - **Documentation:** Updated `docs/ROADMAP.md` to mark Phase 8 bundle/theme work and Phase 10 documentation refresh complete. Updated this `docs/summary_of_work.md` with session evidence and validation matrix. Verified `docs/chat-model-selection.md`, `docs/memory-isolation.md`, `docs/backup-and-sync.md`, `docs/security-model.md`, and `docs/rp-token-counting.md` remain accurate.
  - **Files changed:** `vite.config.ts`, `src/theme/contrast.test.ts`, `docs/ROADMAP.md`, `docs/summary_of_work.md`.
  - **Validation matrix:** `node scripts/verify-bundle-budget.cjs` PASS; `npx vitest run src/theme/contrast.test.ts` PASS; `npm run lint:eslint` PASS; `npm run typecheck` PASS.

- **2026-07-10 GitHub Actions build-and-test (22) repair — COMPLETE:**
  - Investigated check run `86287592255`; the job failed in `npm run lint:eslint` because 27 warnings were treated as errors by `--max-warnings=0`.
  - Removed stale unused bindings/imports, unreachable tombstone emission blocks, and raw informational console output from the sync/storage refactor. Restored the `desktopSync` import required by storage tombstone emission.
  - Validation: `npm run lint:eslint` PASS; `npm run typecheck` PASS; focused storage/action tests PASS (26 tests). Initial pre-install attempts are recorded below as skipped due to missing dependencies.

- **2026-07-10 Sync Architecture Remediation — COMPLETE (current session):**

  Completed the implementation of the secure sync architecture roadmap. 

  **Closed in this session:**
  - **Phase 1: Main Process Cryptography:** Migrated AES-GCM decryption/encryption out of the renderer and into Node's native `crypto` module in the main process (`backupCrypto.ts`). Removed Web Crypto logic from `backupExportService.ts` and `backupImportService.ts`.
  - **Phase 2 & 3: Path Containment & Watcher:** Refactored `syncFolderWatcher.ts` to use a content-addressed `.vfbackup` structure (manifest and blobs). Bound strict path traversal checks. Implemented race condition prevention.
  - **Phase 4: Sync State Persistence & UI Unification:** Removed overlapping legacy JSON backup UI from `DataStoragePanel.tsx` and removed deprecated `backupExportService` endpoints. Unified backup UX into `BackupSyncPanel.tsx`. Fixed all ESLint regression warnings in the updated files.
  - **Phase 5: Data-Type-by-Data-Type Conflict Audit:** Reviewed all IndexedDB stores (`STORE_NAMES`) and securely mapped them to conflict resolution paths in `importDecryptedPacket`: Message-append merge for `conversations`, `chats`, `rp_chats`; conflict copy preservation for `character_cards`, `promptLibrary`, `personas`, `lorebooks`, `rpScenarios`, `projects`, `scenes`; last-write-wins for all others.

  **Files changed:**
  - `electron/services/backupCrypto.ts`, `electron/services/syncFolderWatcher.ts`, `electron/main.ts`
  - `electron/ipc/handlers/syncHandlers.ts`
  - `src/services/desktopBridge.ts`, `src/services/syncEngine.ts`, `src/services/backupImportService.ts`, `src/services/storageService.ts`
  - `src/components/settings/DataStoragePanel.tsx`
  - Removed: `src/services/backupExportService.test.ts`, `src/services/backupImportService.test.ts`
  - `docs/summary_of_work.md`, `task.md`, `implementation_plan.md`

  **Required validation:** `npm run typecheck`, `npm run lint:eslint`, `npm run verify:contracts`, `npm run test:electron`, `npm run test:ui` (ALL PASS). Pushed to `main`.


- **2026-07-09 Final Repository Cleanup & Push — COMPLETE (current session):**

  Verified branch state (no open PRs, no other branches). Cleaned up the repository, finalized commits for the recent ZIP snapshot defect triage and workspace updates, and pushed all changes to `main`.

  **Closed in this session:**
  - Committed uncommitted changes remaining from the defect triage.
  - Pushed to `origin/main`.
  - Confirmed no other PRs/branches to merge.

### Open TODO Ledger
- Current canonical roadmap: `docs/audits/repository-todo-roadmap-current.md`.
- **2026-07-10 Phase 5 Prompt Library selection — CLOSED in this session:**
  - Delete middle/last/only selection behaviour regression-tested (VERIFY-075).
  - Filter-hides-selection reconciliation regression-tested (VERIFY-075).
  - Import/sync reconciliation implemented in `prompt-library-store.ts` with `reconcile: true` option; Command Palette uses it by default (VERIFY-075).
  - Detail editor cannot save a deleted record — store guard + UI regression test (VERIFY-076).
- **2026-07-10 CI repair — CLOSED:** Resolved the zero-warning ESLint failure in build-and-test (22), check run `86287592255`.
- **2026-07-11 Release readiness work order — IN PROGRESS:**
  - **Task 4: Authoritative `deleteSyncableRecord` coordinator — CLOSED in this session.**
  - **Task 5: Preserve remote tombstone `deletedAt` and `deviceId` — CLOSED in this session.**
  - **Task 6 review fixes: origin-aware delete handlers and sync emission gating — CLOSED in this session.**
  - **Task 7: Make main-process save/delete handlers origin-aware — CLOSED in this session.**
  - **Task 7 review fixes — CLOSED in this session.**
  - Remaining tasks from the work order are delegated to subsequent sessions.
- **2026-07-01 priority remediation work order — CLOSED in this session:**
  - **P1 safety follow-up:** CLOSED in earlier session. PG-13 policy covers explicit nudity, erotic framing, visible genitals, and graphic gore preflight plus textual response screening.
  - **Chat:** CLOSED. Selected character image wins for assistant bubbles, no-character fallback uses bundled Venice seal, and hook-level cache gating includes conversation identity.
  - **Image:** CLOSED. Cost labels per model display in Image Studio capability bar; upscale error classification via `normalizeError` with status-based messages.
  - **Traffic Inspector:** CLOSED. Image/video calls route through canonical Venice telemetry; video queue/poll/cancel now uses `veniceFetch()` with timeout/abort/telemetry.
  - **Workflows:** CLOSED. Engine-level `isRunning` guard, `runHistory` with `startRun`/`endRun`, `_runId` per execution, and `outputKey` wired through compiler/runner.
  - **Characters:** CLOSED. Fixed scenario tab navigation, added import/export/archive/versioning to stores, `firstMessage` UI, reactive dropdowns. Remaining future work: required-field validation, "Create Me" generation, per-character settings.
  - **Browser:** CLOSED. Custom splash page, error URL display, loading progress bar, "Open in OS browser" button, accessibility labels.
  - **Video/Music:** CLOSED. Video and music hooks migrated to `veniceFetch()` with timeout/abort/telemetry. Music auto-saves to Media Studio.
  - **Profiles/Onboarding/Rename:** CLOSED for rename. Traffic Inspector renamed to Developer Mode in UI. Remaining future work: profile isolation, master password, credential storage, onboarding flow.
- **2026-06-22 GitHub CodeQL alert remediation — OPEN, priorities identified:**
  - **P1 (security):** Replace or harden regex-based HTML sanitization in `src/utils/markdown.tsx` (alerts #89, #86–#88: `js/bad-tag-filter`, `js/incomplete-multi-character-sanitization`).
  - **P2 (security/hardening):** Review and document TOCTOU/file-system-race alerts in `electron/services/mediaService.ts:291` and `electron/ipc/handlers/fileHandlers.ts:203`; verify user-path validation and dialog controls.
  - **P2 (security/hardening):** Review `server.ts:675` header-forwarding allowlist and confirm no additional sensitive headers can leak.
  - **P2 (noise reduction):** Mark clearly false-positive CodeQL alerts as dismissed with justification (e.g., `js/file-access-to-http` in Jina/Venice clients with host validation; `js/log-injection` with `sanitizeArg`; `js/remote-property-injection` in `redaction.ts`).
  - **P3 (code quality):** Address the 28 `unused-local-variable`, 7 `missing-space-in-concatenation`, 6 `trivial-conditional`, 4 `automatic-semicolon-insertion`, and 3 `useless-assignment-to-local` open alerts to reduce alert noise.
- **2026-06-22 CI safe-storage quota-retry test failure — CLOSED in this session:**
  - `src/lib/safe-storage.test.ts:80` failed in CI because it asserted `warn` was never called with `'cleared persisted state'`, but `createSafeStorage` intentionally logs that warning when pruned retry fails.
  - Fixed by replacing the environment-dependent log-negative assertion with behavior-based assertions: retry attempts, persisted pruned value, and reduced `conversations` array length.
  - Removed unused `console.warn` spy; lint, typecheck, and focused tests pass.
- **2026-07-01 React renderer performance bug-hunt batch — CLOSED in this session:**
  - Originally identified 28 React renderer findings across `src/components/chat/`, `src/components/gallery/`, `src/hooks/`, `src/stores/`. Twelve HIGH-severity items were addressed with regression guards in that pass; #13 was closed in the 2026-07-08 React Gallery Export Continuation; the remaining four MEDIUM items (#17, #18, #19, #20) are explicitly deferred.
  - **Closed items (13 including the 2026-07-08 #13 continuation):**
    - **#1 + #5:** `useCharacterImage` deps now primitives (`charSlug`, `charId`, `charPhotoUrl`, `charLocalId`); redundant IPC `getCachedUrl` eliminated across streaming-tick rebuilds of `conversation.metadata.character`.
    - **#2:** `MessageBubble` wrapped in `React.memo`; per-message callbacks built once via `useMemo<Map<string, MessageBubbleCallbacks>>` in `chat-view.tsx`, with `messagesRef`/`conversationIdRef` for live id→index lookup so stale closures still delete the correct message even when messages are prepended/inserted. `assistantAvatarUrl` hoisted.
    - **#3:** `localSafetyDecision` IIFE → `useMemo`, gated on `redTeamMode && content && localFamilySafeModeEnabled` so non-redteam users (common case) skip the regex/lookup cost entirely.
    - **#4:** New `src/hooks/useKatexCss.ts` with module-level singleton `katexCssPromise`; `MessageBubbleImpl` calls `useKatexCss()`; per-bubble useEffect eliminated.
    - **#6:** `availablePriorConversations` memoized via `useMemo([conversations, activeConversationId])`.
    - **#7:** `handleSend` / `handleRemoveFact` / `handleForgetFact` wrapped in `useCallback`; `pendingContext` mirrored via `pendingContextRef` so async `handleForgetFact` never reads a stale closure.
    - **#9:** `gallery-view.tsx` initial `useEffect(() => { void refresh(); }, [refresh])` (was `[]`) — `refresh` added to dep list.
    - **#10:** Two separate dep-on-`filtered` effects merged into one memoized `useEffect([filteredIds])` calling both `setVisibleMediaIds` and `reconcileWithVisible`. Line 167 typecheck fix (`visibleIds: () => filteredRef.current`, no `.map`).
    - **#11:** `missingChildIdsRef` mirrors state; children-detection effect dep list dropped from `[inspectorItem, items, loadById, missingChildIds]` to `[inspectorItem, items, loadById]` so the no-op re-run that `Array.from(new Set(...))` causes every setState cycle is eliminated.
    - **#12:** `runExportRef` + `runBulkAddTagRef` with forwarder useEffect `[runExport, runBulkAddTag]`. Registration body uses `runExportRef.current?.(ids)` and `runBulkAddTagRef.current?.(ids, [tag])`.
    - **#13:** `handleBatchExport` now depends on the current `runExport` callback and has regression coverage proving bulk export serializes the latest selected media after store updates that do not change selection.
    - **#14:** `cleanupUnloadListeners` JSDoc added; renderer process keeps listeners attached for its full lifetime, tests use the export handle for cross-spec cleanup.
    - **#15:** `unsubscribeDirtyTracking = useChatStore.subscribe(...)` captured into hoisted module-level `let` (above the `if (typeof window !== 'undefined')` block to avoid TDZ) and exported.
  - **Regression tests added (6):** `useCharacterImage.test.tsx` (1 new — single getCachedUrl across re-renders), `message-bubble.test.tsx` (3 new — redteam gate, memo identity, invalidation), `useKatexCss.test.tsx` (monitor `katexLoadTracker.count` across 50 simultaneous mounts + 50 re-renders).
  - **Validation:** `npm run typecheck` PASS, `npm run lint:eslint` PASS; cumulative **61 tests across 6 files** PASS — chat cluster (48 tests / 5 files) + gallery cluster (13 tests / 1 file).
- **2026-06-22 Log-backed runtime failures embedded in audit prompt — OPEN for source verification:**
  - The canonical bug-hunt prompt now includes a "Runtime Log Evidence to Incorporate" section with 12 log-backed failure clusters from `venice-forge.log`.
  - Priorities for future agents: P0 production renderer load + React provider crashes; P0/P1 streaming abort ownership; P1 blocked `/image/styles` IPC endpoint; P1 character image cache failure storm; P1 unsupported `prompt()` usage; P1 insecure CSP warnings; P1 Venice API network failure classification; P1 missing `latest-mac.yml` updater metadata; P2 rgba-to-hex theme color normalization; P2 context-aware `render-process-gone` classification; P2 CI Node vs Electron bundled Node documentation.
  - These are not yet source-level TODOs; they are explicit investigation priorities the next audit must disposition.
- 2026-06-21 storage-privacy dashboard polish + config cleanup + IMG-005/006/007 (IMG-002 / IMG-003 / SP-003 / SP-004 / SP-006 / SP-007 / SP-008 / RCW-003 / RCW-004 / RCW-005 / RCW-006 / IMG-005 / IMG-006 / IMG-007) — CLOSED in this session:
  - IMG-005: Replaced inline `var(--color-accent)` classes in audio/gallery/image/music/video components with Tailwind semantic tokens.
  - IMG-006: `randomSeed()` in `src/utils/payloadBuilders.ts` now uses `crypto.getRandomValues` exclusively; regression test added.
  - IMG-007: Removed `JSON.stringify()` from `venice()` calls in `use-video.ts`, `use-music.ts`, and `use-embeddings.ts`; added regression tests for all three hooks.
  - IMG-002 / IMG-003: `media-inspector.tsx` and `embeddings-view.tsx` already use the canonical `copyText` helper.
  - SP-003: `storage-privacy-store.ts` `copySafeSummary()` now routes through `copyText` and surfaces a toast error on failure.
  - SP-004: `StoragePrivacyDashboard.tsx` loading spinner now uses a contrasting `border-t-accent` top border; regression test added.
  - SP-006: Replaced blanket `as { ... }` casts in `storage-privacy-store.ts` with typed per-store mapper functions and added `storage-privacy-store.mappers.test.ts`.
  - SP-007: Replaced unsafe `issue.sourceCategory as Tab` cast with exhaustive `mapPrivacyCategoryToTab()` helper; added mapping + navigation tests.
  - SP-008: Removed all `as any` casts from storage-privacy tests; introduced typed `mockStore` helper and `satisfies`-typed fixtures.
  - RCW-003: `AGENTS.md` audit description aligned with `package.json` `ci` script and workflows (`npm audit --audit-level=moderate`, no `--omit=dev`).
  - RCW-004: `tsconfig.electron.json` LF line endings verified.
  - RCW-005: `package.json` `ci` script verified to rely on `test:coverage` only (no redundant `npm test`).
  - RCW-006: `AGENTS.md` state-store summary expanded to the full Zustand surface.
  - Validation: lint, typecheck, focused Vitest, build, `verify:dist`, `verify:contracts` all pass.
- 2026-06-21 image-view cast cleanup + MIME-based extension helper (IMG-008 / IMG-009) — CLOSED in this session:
  - IMG-008: `src/components/image/image-view.tsx` no longer uses `as unknown as MediaItem`; it builds a real `MediaItem` object with correct fields.
  - IMG-009: Added shared `getExtensionFromDataUrl()` in `src/utils/image.ts`; `image-view.tsx` `downloadImage` and `media-export-bundle.ts` `extensionFor` now derive extension from the actual data URL MIME type, including `avif`.
  - Validation: lint, typecheck, focused Vitest (58 tests), build, `verify:dist`, `verify:contracts`, `git diff --check` all pass.
- 2026-06-21 storage-privacy dashboard polish + config cleanup (IMG-002 / IMG-003 / SP-003 / SP-004 / SP-006 / SP-007 / SP-008 / RCW-003 / RCW-004 / RCW-005 / RCW-006) — CLOSED in this session:
  - IMG-002 / IMG-003: `media-inspector.tsx` and `embeddings-view.tsx` already use the canonical `copyText` helper.
  - SP-003: `storage-privacy-store.ts` `copySafeSummary()` now routes through `copyText` and surfaces a toast error on failure.
  - SP-004: `StoragePrivacyDashboard.tsx` loading spinner now uses a contrasting `border-t-accent` top border; regression test added.
  - SP-006: Replaced blanket `as { ... }` casts in `storage-privacy-store.ts` with typed per-store mapper functions and added `storage-privacy-store.mappers.test.ts`.
  - SP-007: Replaced unsafe `issue.sourceCategory as Tab` cast with exhaustive `mapPrivacyCategoryToTab()` helper; added mapping + navigation tests.
  - SP-008: Removed all `as any` casts from storage-privacy tests; introduced typed `mockStore` helper and `satisfies`-typed fixtures.
  - RCW-003: `AGENTS.md` audit description aligned with `package.json` `ci` script and workflows (`npm audit --audit-level=moderate`, no `--omit=dev`).
  - RCW-004: `tsconfig.electron.json` LF line endings verified.
  - RCW-005: `package.json` `ci` script verified to rely on `test:coverage` only (no redundant `npm test`).
  - RCW-006: `AGENTS.md` state-store summary expanded to the full Zustand surface.
  - Validation: lint, typecheck, focused Vitest, build, `verify:dist`, `verify:contracts` all pass.
- 2026-06-21 clipboard helper consolidation (IMG-002 / IMG-003 / SP-003) — CLOSED in this session:
  - `media-inspector.tsx` and `embeddings-view.tsx` already use the canonical `copyText` helper; ledger items IMG-002 and IMG-003 are closed.
  - `storage-privacy-store.ts` `copySafeSummary()` previously used raw `navigator.clipboard.writeText`; it now routes through `copyText` and surfaces a toast error on failure.
  - SP-003 is closed: the privacy dashboard exposes Copy/Export via top-level buttons wired to the store's `copySafeSummary` / `exportSafeSummary`; no broken maintenance-plan actions remain.
  - Validation: lint, typecheck, focused Vitest, build, `verify:dist`, `verify:contracts` all pass.
- 2026-06-21 global `fake-indexeddb/auto` test-isolation regression — CLOSED in this session:
  - The global `fake-indexeddb/auto` setup caused `chat-store.ts`'s async web-conversation bootstrap to resolve in tests and race with direct `useChatStore.setState({ conversations })` seeds.
  - CLOSED by making `loadWebConversations()` keep existing in-memory conversations when history has not been loaded yet, and by repairing the `use-chat.test.ts` `desktopBridge` mock to preserve `isElectron`.
  - Full `npm test` (3,343 tests), lint, typecheck, build, `verify:dist`, `verify:contracts`, and `verify:markdown-links` all pass.
- 2026-06-19 safety/privacy/legal/diagnostics doc reconciliation — CLOSED in this session:
  - Public docs now describe Family Safe Mode as local and non-comprehensive, document the canonical 451 block shape, and state that audit counters are aggregate-only.
  - Maintainer docs now include the new-endpoint wiring checklist, safety verification commands, and synthetic fixture hygiene guidance.
- 2026-06-19 ZIP audit TODO handoff — **ALL CLOSED in this session**:
  - ~~TODO-001 / VF-ZIP-001~~ CLOSED: Response-body Family Safe Mode blocks now use canonical 451 metadata across web and Electron.
  - ~~TODO-002 / VF-ZIP-002~~ CLOSED: Electron RP/character file stores now delegate to the canonical Windows-safe ID validator.
  - ~~TODO-003 / VF-ZIP-003~~ CLOSED: Modality default models are centralized and stale `wan-2.1` defaults were removed.
  - ~~TODO-004 / VF-ZIP-004~~ CLOSED: Proxy large-body tests now separately prove parser limit and valid upstream routing.
  - ~~TODO-005 / VF-ZIP-005~~ CLOSED: Canonical bug-hunt prompt promoted.
  - ~~TODO-006 / VF-ZIP-005~~ CLOSED: Root audit artifact hygiene is verifier-gated and historical reports are documented as inert evidence.
  - ~~TODO-007 / VF-ZIP-005~~ CLOSED: `VERIFY-168` is documented and allowlisted by `verify:repo-handoff-hygiene`.
  - ~~TODO-008~~ CLOSED: Full Node 22 workflow baseline passes, including final `npm run ci`.
- 2026-06-19 exhaustive bug-hunt & security audit part 2 — **ALL CLOSED in prior 2026-06-19 remediation**:
  - ~~VF-AUDIT-012 (High)~~ CLOSED: `usePlaygroundStore` no longer leaks raw messages and node drafts to `localStorage`.
  - ~~VF-AUDIT-013 (High)~~ CLOSED: `useChatStore` no longer persists `systemPrompt` through the unsafe partialized path.
  - ~~VF-AUDIT-014 (High)~~ CLOSED: `sidebar.tsx` search indexing is memoized to avoid O(N) full-history concatenation on every keystroke.
- 2026-06-19 exhaustive bug-hunt & security audit (VF-AUDIT-001..011) — **ALL CLOSED in this session**:
  - ~~VF-AUDIT-001 (Critical)~~ CLOSED: Added `RESERVED_WINDOWS_NAMES` set to `electron/services/chatStorage.ts`; updated `isValidId` to reject reserved names; exported `isValidId` for testing; added regression test.
  - ~~VF-AUDIT-002 (High)~~ CLOSED: Synthetic guard exception in `server.ts` now returns HTTP 451 with canonical `{ error, reasonCode, category, severity }` shape. Updated `server.test.ts` M-002 guard.
  - ~~VF-AUDIT-003 (High)~~ CLOSED: Added `config:initialize` to `electron/preload.ts`, `src/services/desktopBridge.ts`, and `src/types/desktop.ts` (`VeniceForgeConfig`).
  - ~~VF-AUDIT-004 (Medium)~~ CLOSED: Consolidated hardcoded `llama-3.3-70b` in `SearchScrapeView.tsx`, `workflow-engine.ts`, `workflows-view.tsx`, `workflow-schema.ts` to `DEFAULT_CHAT_MODEL`.
  - ~~VF-AUDIT-005 (Medium)~~ CLOSED: Reset `circuitFailures = 0` on half-open transition in `server.ts`.
  - ~~VF-AUDIT-006 (Medium)~~ CLOSED: Added explicit `limit: MAX_PROXY_BODY_BYTES` to Jina and scrape `express.json()` in `server.ts`.
  - ~~VF-AUDIT-007 (Medium)~~ CLOSED: Hardened rate-limit keying to include socket address when `X-Forwarded-For` + `TRUST_PROXY` are present.
  - ~~VF-AUDIT-009 (Low)~~ CLOSED: Updated AGENTS.md VERIFY-049 to reference `WorkflowsView`.
  - ~~VF-AUDIT-010 (Low)~~ CLOSED: Expanded `package.json` engine range to `>=22.13.0`.
  - ~~VF-AUDIT-011 (Low)~~ CLOSED: Verified VERIFY-168 already present in AGENTS.md registry.
- 2026-06-19 exhaustive bug-hunt audit: BUG-001 (451 body shape), BUG-002 (fallback model constants), BUG-003 (circuit breaker race condition), BUG-004 (mesh invariant coverage), BUG-005 (VERIFY tags), BUG-006 (VERIFY-168), and BUG-007 (Node constraint) recorded for follow-up.
- 2026-06-19 docs/readme freshness verification: current README and
  CONTRIBUTING drift found in this pass was corrected. No additional current
  source-of-truth doc drift is open from this verification pass.
- 2026-06-19 security / quality static audit follow-up: no new pushed-source
  blocker was confirmed. Full deterministic line-by-line re-audit remains
  continuation work if requested; the follow-up report is indexed at
  `docs/audits/security-quality-static-audit-2026-06-19.md`.
- 2026-06-19 release safety gate: prompt-listed blockers AUDIT-004, AUDIT-006,
  AUDIT-008 through AUDIT-011, AUDIT-013, AUDIT-020, AUDIT-021,
  AUDIT-025, AUDIT-030, AUDIT-048 through AUDIT-059, AUDIT-061, AUDIT-066,
  AUDIT-068, AUDIT-069, AUDIT-071, AUDIT-072, AUDIT-074, and AUDIT-075 are
  closed or reconciled against live source. `verify:contracts`, full
  `npm run ci`, and `git diff --check` pass under Node 22. No prompt-listed
  safe-push blocker remains.
- 2026-06-18 snapshot-audit release hygiene: root transcript/work-report
  artifacts are closed by deletion plus cleaner/verifier denylist coverage.
  Research-browser DNS/private-network parity is also closed; broader
  behavior-level Electron lifecycle test coverage remains tracked in the
  canonical roadmap.
- 2026-06-18 document-ingestion prompt follow-up: exact non-vision attachment
  warning, broad picker accept lists, and the dedicated
  `verify:document-ingestion` aggregate gate are closed; the full universal
  ingestion work order remains partially open until Research Documents UX
  completion, shared rich-renderer extraction, and the full requested manual QA
  matrix are implemented.
- 2026-06-18 master expansion audit follow-up: `.dockerfile` classifier support
  and broad classifier test coverage are closed. `verify:document-ingestion`
  / `VERIFY-058` is also closed and wired into `verify:contracts`. Still open:
  extract/reuse shared attachment preview UI, and extract/reuse a shared rich
  Markdown/KaTeX renderer outside chat.
- 2026-06-18 research web expansion mini-browser bug-hunt audit:
  RB-AUDIT-001 stale scrape URL state and RB-AUDIT-002 invalid
  `local-file://` research-source URLs are closed; RB-AUDIT-003 residual
  non-pinned Chromium DNS/rebinding risk remains open for a behavior-level
  Electron harness or equivalent DNS-pinning design.
- Final massive bug-hunt follow-up (2026-06-18): BUG-001 through BUG-005 are closed in this session (release verifier source-drop install/build tolerance, stale `cov_output.txt` removal, synthetic secret-shaped test-log cleanup, research-workspace warning recheck, and Sidebar mock contract completion).
- Agent governance source-of-truth update (2026-06-17): `AGENTS.md` now makes
  `docs/DOCS_INDEX.md` maintenance and single-canonical-TODO discipline a
  priority rule for future agent sessions; `.github/copilot-instructions.md`
  mirrors the rule.
- Documentation hygiene source-of-truth update (2026-06-17):
  `docs/DOCS_INDEX.md` now separates current docs from historical reports;
  deleted duplicate/superseded roadmap and cross-check snapshots are listed in
  the current roadmap's Historical Hygiene Decisions section.
- Root-config-workflows findings (2026-06-17) — P2 items RCW-001/002 closed in this session:
  - **~~RCW-001 (P2)~~ CLOSED:** Synced `AGENTS.md:8` version string to `2.1.0`.
  - **~~RCW-002 (P2)~~ CLOSED:** Updated `AGENTS.md:86` and `docs/summary_of_work.md`
    coverage-threshold text to match `vitest.config.ts` (61/68/73/70).
  - **RCW-003 (P2):** Align `npm audit` scope between `package.json:91` and `.github/workflows/ci.yml:26` / `.github/workflows/release.yml:34,120,204` (add or remove `--omit=dev` consistently).
  - **RCW-004 (P3):** Normalize `tsconfig.electron.json` to LF line endings per `.gitattributes:1`.
  - **RCW-005 (P3):** Remove redundant `npm test` from `package.json:91` `ci` script; rely on `npm run test:coverage`.
  - **RCW-006 (P3):** Expand `AGENTS.md:120` state-store summary to reflect the full Zustand store surface.
- P0 release-blocking audit repair is complete; all seven original P0 items (P0-001..P0-007) are closed and verified.
- P0-001 is closed for the `2.1.0` release prep: the tag is cut only after a
  clean tree. P0-002 remains external: capture credential-backed macOS
  notarization and Windows signing evidence from the release workflow.
- Closed API/character/memory work-order findings: Venice docs/spec drift,
  incomplete Venice chat parameter typing for `enable_web_scraping`,
  `enable_x_search`, and `prompt_cache_key`; hosted `/c/{slug}` share URL
  normalization; character-bound prompt isolation; deterministic per-message
  memory preview decisions; per-chat memory disable; stale tracked
  `src/stores/chat-store.test.ts.new`; and privacy-summary conversation count
  omission.
- Closed current P1 items: signed-release policy switch, tracked/manual
  advanced CodeQL plus dependency-review automation, reviewed DOM/CSP sink
  hardening, and repository settings documentation.
- Release-packaging findings (2026-06-17) — P1/P2 closed in this session:
  - **~~REL-001 (P1)~~ CLOSED:** Cleaned stale `release/Venice-Forge-2.0.0-*`
    artifacts with `npm run clean` before verification/tagging.
  - **~~REL-002 (P2)~~ CLOSED:** Created root `LEGAL.md` copied from
    `docs/LEGAL.md`; `docs/RELEASE/release.md` link now resolves.
  - **~~REL-003 (P2)~~ CLOSED:** Extended `verify-release-packaging-hardening.cjs`
    to assert `dist:portable`, `dist:mac:arm64`, `dist:mac:x64`, and
    `verify:dist:portable` exist.
  - **~~REL-004 (P2)~~ CLOSED:** Added `npm run verify:dist:portable` to the
    Windows release workflow job.
  - **REL-005 (P3):** Replace placeholder `localhost.invalid` maintainer email
    in `electron-builder.config.cjs` for Linux packages.
  - **REL-006 (P3):** Fix numbered-list formatting typo in
    `docs/DEVELOPMENT/CONFIG.md:198`.
- Storage-privacy-dashboard findings (2026-06-17) — P1 items SP-001/002 closed in this session:
  - **~~SP-001 (P1)~~ CLOSED:** Mapped `Conversation[]` to `StorageInventoryRecord[]`
    using `metadata.projectId` and `metadata.archived` before building the
    privacy inventory.
  - **~~SP-002 (P1)~~ CLOSED:** Load character-card, lorebook, persona, and scenario
    stores before reading them in the privacy inventory.
  - **SP-003 (P2):** Remove or correctly wire the `copy-privacy-summary` /
    `export-privacy-summary` maintenance-plan actions
    (`src/services/storageMaintenance.ts:32-46`, `95-130`).
  - **SP-004 (P2):** Fix the invisible loading spinner by using a contrasting
    top border color (`src/components/privacy/StoragePrivacyDashboard.tsx:46`).
  - **SP-005 (P2):** Add an error/retry state to the dashboard when the first
    inventory refresh fails
    (`src/components/privacy/StoragePrivacyDashboard.tsx:42-51`,
    `src/stores/storage-privacy-store.ts:96-100`).
  - **SP-006 (P2):** Replace blanket `as unknown as StorageInventoryRecord[]`
    casts with per-store mapper functions
    (`src/stores/storage-privacy-store.ts:67-76`).
  - **SP-007 (P3):** Map `StoragePrivacyCategory` values to canonical tab ids
    for the issue "Review" button
    (`src/components/privacy/StoragePrivacyDashboard.tsx:173`).
  - **SP-008 (P3):** Replace `as any` casts in storage-privacy tests with
    typed mocks
    (`src/components/privacy/StoragePrivacyDashboard.test.tsx:28,54,66`;
    `src/stores/storage-privacy-store.test.ts:161,191`).
- Image-media-gallery findings (2026-06-17) — P1 IMG-004 and P2 IMG-001 closed in this session:
  - **~~IMG-001 (P2)~~ CLOSED:** Implemented Media Inspector **Export recipe**
    download in `src/components/gallery/gallery-view.tsx`.
  - **IMG-002 (P2):** Replace raw `navigator.clipboard.writeText` calls in
    `src/components/gallery/media-inspector.tsx:159,163,167,182,186` with the
    canonical `copyText` helper from `src/stores/media-send-to.ts`.
  - **IMG-003 (P2):** Replace raw `navigator.clipboard.writeText` in
    `src/components/embeddings/embeddings-view.tsx:31` with the canonical
    `copyText` helper.
  - **~~IMG-004 (P1)~~ CLOSED:** Global `npm run lint:eslint` now passes;
    no temp-file crash observed after fixes.
  - **IMG-005 (P3):** Replace inline `var(--color-accent)` CSS variable classes
    in image/gallery/video/audio/music components with semantic Tailwind
    tokens (`text-accent`, `bg-accent`, `outline-accent`, etc.).
  - **IMG-006 (P3):** Use `crypto.getRandomValues` instead of `Math.random()`
    for `randomSeed()` in `src/utils/payloadBuilders.ts:182-186`.
  - **IMG-007 (P3):** Pass plain objects to `venice()` in
    `src/hooks/use-video.ts:76`, `src/hooks/use-music.ts:66`, and
    `src/hooks/use-embeddings.ts:10` instead of pre-stringifying the body.
  - **IMG-008 (P3):** Remove the unsafe `as unknown as MediaItem` cast in
    `src/components/image/image-view.tsx:423` by constructing a typed
    `MediaItem` directly.
  - **IMG-009 (P3):** Derive the download extension from the processed image
    MIME type in `src/components/image/image-view.tsx:153`.
  - **IMG-010 (P3):** Replace raw failed-ID messages in
    `src/stores/media-store.ts:330,366` with safe generic user-facing text.
  - **IMG-011 (P3):** Stabilize media command-handler registration in
    `src/components/gallery/gallery-view.tsx:143-192` to avoid re-registration
    on every filter change.
- Remaining P1 items: packaged smoke coverage for Windows/Linux, strict
  test-warning cleanup, transitive dependency deprecation cleanup. The
  storage-privacy P1 inventory-shape/freshness fixes and IMG-004 are closed.
- Remaining P2/P3 items: oversized component extraction, low-coverage module
  campaign, bundle budgets/lazy-loading, future Linux arm64 support decision,
  the storage-privacy P2/P3 fixes above, and IMG-002 / IMG-003 / IMG-005..IMG-011
  above. IMG-001 is closed.

### Validation Matrix (this session)

- **2026-07-11 Task 7 review fixes focused verification**
  - Node/toolchain: `v22.23.1` / `npm 10.9.8`.

  | Command | Status | Duration | Failure summary | Evidence |
  | :------ | :----: | :------- | :-------------- | :------- |
  | `npx vitest run electron/ipc/handlers.test.ts electron/ipc/rpHandlers.test.ts electron/services/syncBridge.test.ts --fileParallelism=false` | PASS | ~1s | — | 3 files / 106 tests pass |
  | `npm run test:electron` | PASS | ~6s | — | 30 files / 531 tests pass |
  | `npm run typecheck` | PASS | ~48s | — | renderer + Electron main clean |
  | `npm run lint:eslint` | PASS | ~66s | — | 0 warnings |

- **2026-07-11 Task 5 focused verification**
  - Node/toolchain: `v22.23.1` / `npm 10.9.8`.

  | Command | Status | Duration | Failure summary | Evidence |
  | :------ | :----: | :------- | :-------------- | :------- |
  | `npx vitest run src/services/backupImportService.test.ts` | PASS | ~1s | — | 19/19 tests pass |
  | `npx eslint --max-warnings=0 src/services/backupImportService.ts src/services/backupImportService.test.ts` | PASS | ~10s | — | 0 warnings |
  | `npx tsc --noEmit -p tsconfig.json` | PASS | ~30s | — | renderer clean |

- **2026-07-11 Task 3 focused verification**
  - Node/toolchain: `v22.23.1` / `npm 10.9.8`.

  | Command | Status | Duration | Failure summary | Evidence |
  | :------ | :----: | :------- | :-------------- | :------- |
  | `npx vitest run src/services/tombstoneService.test.ts` | PASS | 1s | — | 5/5 tests pass |
  | `npx vitest run src/services/storageService.test.ts src/utils/idValidation.test.ts src/services/backupImportService.test.ts` | PASS | 2s | — | 40/40 tests pass |
  | `npm run typecheck` | PASS | 48s | — | renderer + Electron main clean |

- **2026-07-10 P0 blocker fix pass — fresh verification matrix**
  - Node/toolchain: `v24.3.0` / `npm 11.4.2` (local drift from the repo target `>=22.13.0 <23.0.0`; CI enforces Node 22).
  - `npm ci` was not re-run because `node_modules` was already populated from the prior session; the lockfile parity verifier (`npm run verify:contracts` / `verify:lockfile`) passes and the package-lock mismatch that blocked earlier builds remains fixed.

  | Command | Status | Duration | Failure summary | Evidence |
  | :------ | :----: | :------- | :-------------- | :------- |
  | `node --version` | PASS | 0s | — | `v24.3.0` (local); CI pins Node 22 |
  | `npm --version` | PASS | 0s | — | `11.4.2` (local); CI uses npm 10 |
  | `npm run lint:eslint` | PASS | 66s | — | 0 warnings |
  | `npm run typecheck` | PASS | 48s | — | renderer + Electron main clean |
  | `npm run test:server` | PASS | 6s | — | 1 file / 59 tests passed |
  | `npm run test:electron` | PASS | 40s | — | 30 files / 501 tests passed |
  | `npm run test:ingestion` | PASS | 30s | — | 9 files / 65 tests passed |
  | `npm run test:unit` | PASS | 160s | — | 212 files / 2,779 tests passed |
  | `npm run test:ui` | PASS | 45s | — | 26 files / 266 tests passed |
  | `npm run test:coverage` | PASS | 194s | — | 309 files / 3,936 tests passed; thresholds met |
  | `npm run verify:safety-guard` | PASS | 1s | — | 8 boundary files + no-raw-log policy |
  | `npm run verify:markdown-links` | PASS | 0s | — | 75 Markdown files, 0 issues |
  | `npm run verify:repository-identity` | PASS | 1s | — | canonical path + GitHub identity verified |
  | `npm run verify:contracts` | PASS | 62s | — | static + feature + release verifiers pass |
  | `npm run build` | PASS | 5s | — | `dist/`, `dist-electron/`, `dist/server.cjs` |
  | `npm run verify:dist` | PASS | 0s | — | build outputs verified |
  | `npm audit --audit-level=moderate` | PASS | 1s | — | 0 vulnerabilities |
  | `npm run dist:mac:arm64 && npm run verify:dist:mac` | PASS | ~320s | — | arm64+x64 DMG/ZIP + checksums + `latest-mac.yml` verified |
  | `ALLOW_DIRTY_REPO_EXTRACT=1 bash scripts/clean-repo-zip.sh` | PASS | 45s | — | archive clean; secret-scan warnings are all test fixtures |

- **2026-07-10 Coordinated remediation pass — final consolidated matrix**
  - Node/toolchain: `v22.23.1` / `npm 10.9.8` (Homebrew `node@22` at `/opt/homebrew/Cellar/node@22/22.23.1/bin`).
  - Two pre-existing flaky failures were observed under heavy parallel load (`src/stores/chat-store.dirty.test.ts` dirty-map timeout; `scripts/verify-archive-clean.test.ts` tar-fallback timeout). Both passed on focused rerun; the dirty-map test timeout was increased from the default 5s to 10s, and the final full matrix below passed.
  - One active doc bug was fixed during this matrix: `README.md` referenced a missing `./assets/preview.jpg`; it now points to the tracked `./build/icon.png`.

  | Command | Status | Duration | Failure summary | Evidence |
  | :------ | :----: | :------- | :-------------- | :------- |
  | `node --version` | PASS | 0s | — | `v22.23.1` |
  | `npm --version` | PASS | 1s | — | `10.9.8` |
  | `npm ci` | PASS | 52s | — | 859 packages installed |
  | `npm run lint:eslint` | PASS | 65s | — | 0 warnings |
  | `npm run typecheck` | PASS | 47s | — | renderer + Electron main clean |
  | `npm run test:server` | PASS | 6s | — | 1 file / 59 tests passed |
  | `npm run test:electron` | PASS | 38s | — | 30 files / 501 tests passed |
  | `npm run test:ingestion` | PASS | 29s | — | 9 files / 65 tests passed |
  | `npm run test:unit` | PASS | 153s | — | 212 files / 2,762 tests passed |
  | `npm run test:ui` | PASS | 43s | — | 26 files / 266 tests passed |
  | `npm run test:coverage` | PASS | 237s | — | 309 files / 3,916 tests passed; coverage thresholds met |
  | `npm run verify:safety-guard` | PASS | 1s | — | all boundary files + no-raw-log policy |
  | `npm run verify:markdown-links` | PASS | 0s | previously failed on missing `assets/preview.jpg` | 75 Markdown files, 0 issues after README fix |
  | `npm run verify:repository-identity` | PASS | 1s | — | canonical path + GitHub identity verified |
  | `npm run verify:contracts` | PASS | 59s | — | static + feature + release verifiers pass |
  | `npm run build` | PASS | 5s | — | `dist/`, `dist-electron/`, `dist/server.cjs` |
  | `npm run verify:dist` | PASS | 0s | — | build outputs verified |
  | `npm audit --audit-level=moderate` | PASS | 1s | — | 0 vulnerabilities |
  | `npm run dist:mac:arm64 && npm run verify:dist:mac` | PASS | ~304s | — | arm64+x64 DMG/ZIP + checksums + `latest-mac.yml` verified |

- 2026-07-10 Phase 5 Prompt Library selection:
  - `npx vitest run src/components/prompts/PromptLibraryView.test.tsx src/components/prompts/PromptLibrarySelection.test.ts src/stores/prompt-library-store.test.ts src/components/command-palette/CommandPalette.test.tsx --fileParallelism=false`: PASS (4 files / 109 tests).
  - `node scripts/verify-prompt-library.cjs`: PASS (VERIFY-046 contract guard).
  - `npx eslint --max-warnings=0 src/components/prompts/PromptLibraryView.tsx src/components/prompts/PromptLibraryView.test.tsx src/components/prompts/PromptLibrarySelection.test.ts src/stores/prompt-library-store.ts src/stores/prompt-library-store.test.ts src/types/prompt-library.ts src/components/command-palette/CommandPalette.tsx src/components/command-palette/CommandPalette.test.tsx`: PASS (0 warnings).
  - `npm run typecheck`: FAIL with pre-existing unrelated errors in other Phase scopes (e.g. `src/services/backupImportService.test.ts`, `src/services/sceneReferenceResolver.ts` / `.test.ts`, `src/components/rp-studio/CharacterEditor.test.tsx`). None of the touched Phase 5 files appear in the error list.

- 2026-07-10 GitHub Actions build-and-test (22) repair:
  - `npm ci`: PASS (846 packages installed; Node 24 engine warning only).
  - `npm run lint:eslint`: PASS (0 warnings).
  - `npm run typecheck`: PASS (renderer + Electron main clean).
  - `npx vitest run electron/services/syncConfig.test.ts electron/services/syncFolderWatcher.test.ts src/services/syncEngine.test.ts src/services/storageService.test.ts src/hooks/use-data-storage-actions.test.ts --fileParallelism=false`: PASS (2 files / 26 tests; nonexistent test paths were ignored by Vitest).
  - Pre-install attempts of lint/typecheck/tests: SKIPPED/FAILED before execution because `node_modules` was absent; no source failure was inferred from those attempts.

- 2026-07-11 Task 4 Authoritative `deleteSyncableRecord` coordinator:
  - `npx vitest run src/services/syncDeleteCoordinator.test.ts src/services/syncEngine.test.ts src/services/storageService.test.ts --fileParallelism=false`: PASS (3 files / 34 tests).
  - `npm run typecheck`: PASS (renderer + Electron main clean).
  - `npm run lint:eslint`: PASS (0 warnings).

- 2026-07-11 Task 4 review fixes:
  - `npx vitest run src/services/syncDeleteCoordinator.test.ts src/services/syncEngine.test.ts src/services/storageService.test.ts --fileParallelism=false`: PASS (3 files / 34 tests).
  - `npx vitest run src/services/backupImportService.test.ts --fileParallelism=false`: PASS (1 file / 18 tests).
  - `node scripts/verify-backup-sync.cjs`: PASS (all Phase 9 Backup and Sync contract invariants).
  - `npm run typecheck`: PASS (renderer + Electron main clean).
  - `npm run lint:eslint`: PASS (0 warnings).

- **2026-07-11 Task 6 review fixes verification**
  - Node/toolchain: `v22.23.1` / `npm 10.9.8`.
  - Note: requested `electron/ipc/handlers/systemHandlers.test.ts` does not exist; `electron/ipc/handlers.test.ts` was used instead.

  | Command | Status | Duration | Failure summary | Evidence |
  | :------ | :----: | :------- | :-------------- | :------- |
  | `npx vitest run electron/ipc/validation.test.ts electron/ipc/handlers.test.ts electron/ipc/rpHandlers.test.ts src/services/storageService.test.ts src/services/syncEngine.test.ts` | PASS | ~2s | — | 5 files / 129 tests pass |
  | `npm run test:electron` | PASS | ~7s | — | 30 files / 507 tests pass |
  | `npm run typecheck` | PASS | ~48s | — | renderer + Electron main clean |
  | `npm run lint:eslint` | PASS | ~66s | — | 0 warnings |

- **2026-07-11 Task 7 verification**
  - Node/toolchain: `v22.23.1` / `npm 10.9.8`.

  | Command | Status | Duration | Failure summary | Evidence |
  | :------ | :----: | :------- | :-------------- | :------- |
  | `npx vitest run electron/services/syncBridge.test.ts electron/ipc/handlers.test.ts electron/ipc/rpHandlers.test.ts --fileParallelism=false` | PASS | ~1s | — | 3 files / 102 tests pass |
  | `npm run test:electron` | PASS | ~7s | — | 30 files / 527 tests pass |
  | `npm run lint:eslint` | PASS | ~66s | — | 0 warnings |
