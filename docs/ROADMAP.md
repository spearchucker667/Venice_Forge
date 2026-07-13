# Venice Forge Roadmap

This is the canonical product roadmap and open task ledger. For the append-only session history, see `docs/summary_of_work.md`.

---

## P0 — Safety / Security / Data Protection

### [x] Finish Backup/Sync Conflict and Lifecycle Coverage
- **Description:** Backup/Sync now has approved-path custody, authenticated encryption, packet validation, atomic writes, a durable encrypted outbound outbox, encrypted sync-set/key identity, profile-bound sessions and packets, main-authoritative remote apply grants, one logical-object apply queue, deterministic timestamp/conflict/message convergence, bounded retry/journal behavior, durable current-object checkpoints, and device-acknowledged historical event collection. Event blobs are removed only after a checkpoint exists and every registered device has acknowledged; offline devices block collection, while new devices hydrate from retained object checkpoints.
- **Status:** Closed (2026-07-12)
- **Affected Files/Modules:** `src/services/storageService.ts`, `src/services/syncDeleteCoordinator.ts`, `src/services/syncEngine.ts`, `src/services/backupImportService.ts`, `electron/services/syncBridge.ts`, `electron/services/syncFolderWatcher.ts`, `electron/services/syncOutbox.ts`, Electron save/delete handlers, sync protocol types and tests
- **Validation Required:** focused backup/import/sync tests, `npm run test:electron`, `npm run test:unit`, `npm run test:ui`, `npm run test:coverage`, `npm run verify:backup-sync`, `npm run verify:contracts`

### [x] Complete Scene Reference Request/UI Integration
- **Description:** Scene Composer renders the included/omitted reference plan, character scene generation passes planned references to the canonical image payload, the reference-capable model is explicitly gated, and unsupported models omit `reference_image_urls` and remain text-only.
- **Status:** Closed (live-tree reconciliation 2026-07-12)
- **Validation Required:** `npm run verify:scene-references` and focused scene/payload tests

---

## P1 — Runtime-Critical Bugs / Security Adjustments

### [x] Scene-Composer Field Sanitization & Reference Resolution
- **Description:** Run write-time sanitization on all fields (SC-01); resolve Prompt Library references before compiling or sending scenes to the Image Studio (SC-02); and ensure `redactSecrets` is called in `sceneCompiler.ts` (SC-03).
- **Status:** Closed
- **Affected Files/Modules:** `src/stores/scene-composer-store.ts`, `src/services/sceneCompiler.ts`
- **Validation Required:** `npm run verify:scene-composer`
- **Headed/Manual Smoke Required:** No

### [x] Storage-Privacy Inventory Mapping & Store Preloading
- **Description:** Correctly map `Conversation[]` to `StorageInventoryRecord[]` in the privacy inventory (SP-01), and ensure RP Studio IndexedDB stores are fully loaded/hydrated before reading them (SP-02).
- **Status:** Closed
- **Affected Files/Modules:** `src/services/storageService.ts`, `src/stores/rp-chat-store.ts`, `src/stores/character-store.ts`
- **Validation Required:** `npm run verify:storage-privacy`
- **Headed/Manual Smoke Required:** No

### [x] Vitest 4 Coverage Threshold Schema Correction
- **Description:** Correct the Vitest 4 coverage threshold schema to enforce the documented 70/80/80/80 percentages (branches, functions, lines, statements). The current `thresholds.global` object is interpreted as a glob-specific threshold and does not enforce the global baseline correctly.
- **Status:** Closed
- **Affected Files/Modules:** `vitest.config.ts`
- **Validation Required:** `npm run test:coverage`
- **Headed/Manual Smoke Required:** No

### [x] Clear Stale Release Artifacts Before Packaging
- **Description:** Every `dist:*` packaging script begins with `npm run clean`, and `scripts/build-electron.cjs` independently removes stale `release/` artifacts before building (REL-001).
- **Status:** Closed (live-tree reconciliation 2026-07-12)
- **Affected Files/Modules:** `scripts/build-electron.cjs`
- **Validation Required:** `npm run verify:release-packaging-hardening`
- **Headed/Manual Smoke Required:** No

---

## P2 — Product Completion / Quality & DX

### [x] Persist and Resume Background Tasks
- **Description:** Moved provider queue ownership to a persistent main-process `BackgroundTaskManager` that sync-writes to `<userData>/background-tasks.json`, loads/recovers on startup, and polls only resumable `video`/`music` tasks. `image`, `research`, and `document` tasks are persisted and survive renderer reload, but are not auto-resumed by the main process because they are renderer-driven or terminal. The 2026-07-11 repairs had closed video-response normalization, polling correctness, progress scaling, queue validation, timeout truthfulness, hook/store circular imports, and the renderer task center; this session closed restart durability for Electron.
- **Status:** Closed
- **Affected Files/Modules:** `src/types/background-task.ts`, `src/stores/background-task-store.ts`, `electron/services/backgroundTaskManager.ts`, `electron/ipc/handlers/backgroundTaskHandlers.ts`, `electron/preload.ts`, `src/services/desktopBridge.ts`, `electron/main.ts`, generation hooks
- **Validation Required:** focused task-manager/IPC tests (21 PASS), `npm run test:electron`, `npm run test:ui`, renderer-reload smoke, packaged restart smoke
- **Headed/Manual Smoke Required:** Yes (renderer-reload and packaged-restart smoke remain future work)

### [x] WorkflowTemplatesView UI Hardening & Controls
- **Description:** Title/tag edits are debounced and flushed on selection changes; templates load on mount; version, import/export, favorite, tag, compile, and per-action run controls are implemented.
- **Status:** Closed (live-tree reconciliation 2026-07-12)
- **Affected Files/Modules:** `src/components/workflows/WorkflowTemplatesView.tsx`
- **Validation Required:** `npm run verify:workflow-templates`
- **Headed/Manual Smoke Required:** Recommended to verify UI interactions.

### [x] Research Subsystem: Local Vitest & Localhost Blocking
- **Description:** `scripts/verify-research-workspace.cjs` resolves the project-local Vitest package/bin (R-01), and the generic HTTP scrape provider rejects both `localhost` and `.localhost` hosts (R-02).
- **Status:** Closed (live-source reconciliation 2026-07-12)
- **Affected Files/Modules:** `scripts/verify-research-workspace.cjs`, `src/research/providers/genericHttpScrapeProvider.ts`
- **Validation Required:** `npm run verify:research-workspace`
- **Headed/Manual Smoke Required:** No

### [x] Release & Packaging Hardening Extensions
- **Description:** Root `LEGAL.md` is linked from `docs/RELEASE/release.md` (REL-002), the hardening verifier covers portable and single-architecture scripts (REL-003), and the Windows release job runs `verify:dist:portable` (REL-004).
- **Status:** Closed (live-source reconciliation 2026-07-12)
- **Affected Files/Modules:** `.github/workflows/release.yml`, `scripts/verify-release-packaging-hardening.cjs`
- **Validation Required:** `npm run verify:release-packaging-hardening`
- **Headed/Manual Smoke Required:** No

---

## P3 — UI / Polish / Refactoring

### [x] Clean Up Workflow Test Casts
- **Description:** The workflow store test has no `@ts-nocheck`, `as any`, or `as unknown` suppression. Corrupt non-array storage coverage now invokes the typed Vitest mock through `Reflect.apply` without weakening the runtime fixture.
- **Status:** Closed (2026-07-12)
- **Affected Files/Modules:** `src/stores/workflow-template-store.test.ts`
- **Validation Required:** `npm run verify:workflow-templates`
- **Headed/Manual Smoke Required:** No

---

## P4 — Docs / Release / Historical Triage

### [x] Triage Remaining Medium/Low Static Audit Findings
- **Description:** Continue live source verification for the ~54 remaining medium security/logic findings from the static audit. Do not bulk-import snapshot claims as confirmed defects without manual verification.
- **Status:** Closed (Superseded/Resolved by previous Phase 2 sweeps; verified via live spot checks that issues like AUDIT-024 and AUDIT-025 are already fixed)
- **Affected Files/Modules:** Various codebase files
- **Validation Required:** `npm run verify:contracts`
- **Headed/Manual Smoke Required:** No

---

## Recently Closed

- **[x] Node 22.13 dependency-engine compatibility (2026-07-12)**
  - Pinned `http-proxy-middleware` to the maintained v3 line (`^3.0.7`), whose published Node engine range includes the repository's supported Node 22.13 floor. The server uses the compatible `createProxyMiddleware` and event-handler API shared by v3/v4.
  - **Validation:** `npm run verify:lockfile`, `npm run test:server` (59 tests), `npm run verify:safety-guard`, `npm run typecheck`, and `npm audit --audit-level=moderate` pass with zero vulnerabilities.

- **[x] Security audit remediation: provider custody and truthful task cancellation (2026-07-12)**
  - Made the validated request `profileId` the sole provider-credential selector, rejected unavailable/unknown providers before credential access, and retained incomplete cloud adapters only as fail-closed stubs with no ambient-identity or custom-executor path.
  - Moved Gemini credentials from the URL query string to `x-goog-api-key` and replaced the provider adapter's regex-only verifier with project-local behavioral Vitest coverage.
  - Kept paid video/music jobs under reconciliation when provider-side cancellation is unavailable, surfaced that limitation in task metadata/UI, and serialized background-task persistence through an awaitable drain used by deterministic tests.
  - Repaired Prompt Library destructive-action confirmation so asynchronous failures preserve the pending action and dirty state.
  - Removed the unused AWS Bedrock and Google Vertex SDK dependencies; `npm audit --audit-level=moderate` reports zero vulnerabilities.
  - **Validation:** focused provider/task/prompt tests pass; ESLint, both TypeScript pipelines, `npm run test:electron`, `npm run test:ci`, and `npm run verify:contracts` pass. Build/dist validation is recorded in `docs/summary_of_work.md`.

- **[x] Image and Video Studio accessibility/correctness tranche (2026-07-11)**
  - Made generated images keyboard-openable buttons with focus restoration, focus-visible actions, and content-stable keys; labelled and compatibility-filtered prompt templates; exposed Steps/Variants values; and replaced aggressive preview word breaking.
  - Separated the Video reference file input from its trigger, exposed remove actions on focus, reduced capability-tag dominance, made queue-ID deduplication consult persisted Media items, and labelled pricing as Live, Catalog, Estimated, or Unavailable.
  - **Validation:** 2 focused files / 21 tests pass; full UI aggregate passes and exits naturally; ESLint and both TypeScript pipelines pass.

- **[x] Responsive shell and task/status compaction (2026-07-11)**
  - Collapsed the eight-chip status surface to a severity-aware aggregate control below extra-wide layouts and replaced per-task header chips with one task center exposing Open, Cancel, Retry, and Dismiss.
  - Made the Traffic Inspector a clamped desktop pane/compact overlay with Escape close, trigger-focus restoration, labelled controls, and Blob-based exports. Width persistence/resizing remains future work.
  - Made the Research session sidebar collapsible and fluid, replaced clickable rows with semantic selected options, and restored an accent-bar/bold non-color-only selection cue.
  - **Validation:** 4 focused files / 21 tests pass; full UI aggregate passes and exits naturally; ESLint and both TypeScript pipelines pass.

- **[x] Accessible modal foundation and high-severity dialog migrations (2026-07-11)**
  - Added one semantic dialog shell using the canonical focus-trap hook, responsive sizing, scroll locking, labelled title/description relationships, optional Escape/backdrop policy, and focus restoration.
  - Migrated Prompt Create, Memory Manager, Onboarding, Master Password, and profile-password dialogs; added programmatic form labels, announced errors/status, keyboard-visible memory actions, accurate local/remote/profile copy, and multi-word comma-separated prompt tags with storage-aligned limits.
  - **Validation:** 7 focused files / 24 tests pass; complete UI aggregate passes and exits naturally; ESLint and both TypeScript pipelines pass.

- **[x] Phase 9 — Backup and sync completion (2026-07-10)**
  - Closed backup/sync gaps: export/import round-trip tests, conflict copies, LWW merge, chat merge, tombstones, wrong passphrase, tamper rejection, plaintext scan, desktop local-change propagation, desktop delete tombstones, sync-folder config unification through `useSettingsStore`, BackupSyncPanel active-status read fix, and error redaction for `sync:encryptBackup`/`sync:decryptBackup`.
  - Added `electron/services/syncBridge.ts`, `scripts/verify-backup-sync.cjs`, and regression tests across renderer, Electron, and scripts.
  - Added regression guards VERIFY-087 through VERIFY-091.
  - Did not modify `package.json` scripts or the `AGENTS.md` VERIFY registry.
  - **Validation:** New tests 34/34 PASS; `npm run test:electron` 501 PASS; `npm run test:unit` 2762 PASS; `node scripts/verify-backup-sync.cjs` PASS; `npm run typecheck` PASS.

- **[x] Phase 8 — Bundle budget hardening and theme guard, Phase 10 — Documentation refresh (2026-07-10)**
  - Investigated the 608 KB main bundle (`index-COt0Xo8-.js`) causing `verify:bundle-budget` to fail.
  - Updated `vite.config.ts` `manualChunks` to route the markdown ecosystem (`micromark`, `mdast`, `hast`, `unist`, `hastscript`, etc.) into `vendor-markdown` and TanStack Query (`@tanstack/react-query`, `@tanstack/query-core`) into `vendor-tanstack`.
  - Rebuilt web bundle; main entry chunk dropped to ~521 KB and `node scripts/verify-bundle-budget.cjs` passes.
  - Added `// VERIFY-092` regression guard comment to the softened dark-theme body-text test in `src/theme/contrast.test.ts`.
  - Refreshed `docs/ROADMAP.md`, `docs/DOCS_INDEX.md`, and `docs/summary_of_work.md`.
  - **Validation:** `node scripts/verify-bundle-budget.cjs` PASS; `npx vitest run src/theme/contrast.test.ts` PASS; `npm run lint:eslint` PASS; `npm run typecheck` PASS.

- **[x] Repository identity, lockfile, privacy, and chat correctness foundation (2026-07-10)**
  - Canonicalized active agent instructions and portable documentation links; added `verify:repository-identity` and `verify:lockfile`.
  - Regenerated the npm lockfile with Node 22/npm 10 and proved `npm ci` succeeds.
  - Added current-chat memory exclusion and stale-result rejection, persisted model hot-swap/fallback, stable message IDs, inline editing, branching/truncation/forking, active-chat search, prompt selection reconciliation, persona images, RP budget blocking, and softened named theme tokens.

- **[x] Repository Documentation Hygiene, README Rebuild, & Legal/About Refresh (P2/P3)**
  - **Description:** Refactored README, consolidated legal/privacy/security docs, cleaned index map, deleted stale stub files, and resolved absolute path leaks in active docs.
  - **Closed Date:** 2026-07-08
  - **Affected Files:** `README.md`, `docs/ABOUT.md`, `docs/DOCS_INDEX.md`, `docs/FILE_TREE.md`, legal policies, and various historical reports.
  - **Validation:** `npm run verify:markdown-links` and `npm run verify:repo-handoff-hygiene`.

- **[x] Secure Password Storage & Windows PowerShell Credential Manager Bridge (P1)**
  - **Closed Date:** 2026-07-08
  - **Details:** Implemented Windows Credential Manager integration for strict password preferences, falling back cleanly on other platforms.

- **[x] Web-Contents-View Research Browser Toolbar & Splashes (P0/P1)**
  - **Closed Date:** 2026-07-09
  - **Details:** Resolved toolbar overlay, removed file:// path splash dependencies, and added viewport resize geometry listeners.
