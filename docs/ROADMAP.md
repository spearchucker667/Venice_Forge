# Venice Forge Roadmap

This is the canonical product roadmap and open task ledger. For the append-only session history, see `docs/summary_of_work.md`.

---

## P0 — Safety / Security / Data Protection

### [ ] Finish Backup/Sync Conflict and Lifecycle Coverage
- **Description:** The 2026-07-10 pass hardened approved-path custody, packet validation, initial reconciliation, operation IDs, atomic temp cleanup, pause/resume, secret exclusion, import preview, and conflict preservation. The 2026-07-11 dirty-snapshot audit supersedes the earlier release-ready assessment. Closed from that audit: public IndexedDB deletes persist tombstones before raw deletion; record/tombstone packets share one acknowledgment-held logical-object queue; imported IndexedDB records preserve revision/timestamp metadata; timestamps normalize consistently with deletion winning ties; conflict IDs are deterministic across replay; main-process and renderer packet emission share portable secret/path sanitization; the applied-operation journal enforces its 50,000-entry hard bound even for all-recent-tombstone workloads; failed watcher startup fully stops the retry scheduler; and unit, UI, and coverage aggregates exit naturally. Still required before a release-complete claim: Electron-backed delete coordination with one tombstone authority; a persistent outbound outbox; trusted mutation provenance; profile/sync-set/key isolation; historical packet checkpoint/garbage-collection semantics after journal eviction; and full convergence fixtures.
- **Status:** In progress
- **Affected Files/Modules:** `src/services/storageService.ts`, `src/services/syncDeleteCoordinator.ts`, `src/services/syncEngine.ts`, `src/services/backupImportService.ts`, `electron/services/syncBridge.ts`, `electron/services/syncFolderWatcher.ts`, Electron save/delete handlers, sync protocol types and tests
- **Validation Required:** focused backup/import/sync tests, `npm run test:electron`, `npm run test:unit`, `npm run test:ui`, `npm run test:coverage`, `npm run verify:backup-sync`, `npm run verify:contracts`

### [ ] Complete Scene Reference Request/UI Integration
- **Description:** Entity detection, alias/word-boundary matching, safe image filtering, model capability omission, reference limits, and user-removal planning are implemented. Wire the plan into the Scene Composer preview and a Venice image endpoint/model that officially supports references; unsupported models must remain explicit text-only generation.
- **Status:** In progress
- **Validation Required:** scene UI tests and `npm run verify:scene-composer`

---

## P1 — Runtime-Critical Bugs / Security Adjustments

### [ ] Scene-Composer Field Sanitization & Reference Resolution
- **Description:** Run write-time sanitization on all fields (SC-01); resolve Prompt Library references before compiling or sending scenes to the Image Studio (SC-02); and ensure `redactSecrets` is called in `sceneCompiler.ts` (SC-03).
- **Status:** Open
- **Affected Files/Modules:** `src/stores/scene-composer-store.ts`, `src/services/sceneCompiler.ts`
- **Validation Required:** `npm run verify:scene-composer`
- **Headed/Manual Smoke Required:** No

### [ ] Storage-Privacy Inventory Mapping & Store Preloading
- **Description:** Correctly map `Conversation[]` to `StorageInventoryRecord[]` in the privacy inventory (SP-01), and ensure RP Studio IndexedDB stores are fully loaded/hydrated before reading them (SP-02).
- **Status:** Open
- **Affected Files/Modules:** `src/services/storageService.ts`, `src/stores/rp-chat-store.ts`, `src/stores/character-store.ts`
- **Validation Required:** `npm run verify:storage-privacy`
- **Headed/Manual Smoke Required:** No

### [ ] Vitest 4 Coverage Threshold Schema Correction
- **Description:** Correct the Vitest 4 coverage threshold schema to enforce the documented 70/80/80/80 percentages (branches, functions, lines, statements). The current `thresholds.global` object is interpreted as a glob-specific threshold and does not enforce the global baseline correctly.
- **Status:** Open
- **Affected Files/Modules:** `vitest.config.ts`
- **Validation Required:** `npm run test:coverage`
- **Headed/Manual Smoke Required:** No

### [ ] Clear Stale Release Artifacts Before Packaging
- **Description:** Automate or enforce `npm run clean` to clear stale `release/` v2.0.0 or v2.1.0 artifacts before packaging (REL-001) in the build process.
- **Status:** Open
- **Affected Files/Modules:** `scripts/build-electron.cjs`
- **Validation Required:** `npm run verify:release-packaging-hardening`
- **Headed/Manual Smoke Required:** No

---

## P2 — Product Completion / Quality & DX

### [ ] WorkflowTemplatesView UI Hardening & Controls
- **Description:** Debounce title edits in `WorkflowTemplatesView`, render run/execute buttons for all template actions, call `ensureWorkflowTemplatesLoaded` on mount, and add missing versions, import/export, favorite, and tag controls.
- **Status:** Open
- **Affected Files/Modules:** `src/components/workflows/WorkflowTemplatesView.tsx`
- **Validation Required:** `npm run verify:workflow-templates`
- **Headed/Manual Smoke Required:** Recommended to verify UI interactions.

### [ ] Research Subsystem: Local Vitest & Localhost Blocking
- **Description:** Fix `scripts/verify-research-workspace.cjs` to resolve and use project-local vitest (R-01) instead of global shell commands, and block `.localhost` resolution in the generic HTTP scrape provider (R-02).
- **Status:** Open
- **Affected Files/Modules:** `scripts/verify-research-workspace.cjs`, `src/research/providers/genericHttpScrapeProvider.ts`
- **Validation Required:** `npm run verify:research-workspace`
- **Headed/Manual Smoke Required:** No

### [ ] Release & Packaging Hardening Extensions
- **Description:** Add root `LEGAL.md` and link it in `docs/RELEASE/release.md` (REL-002), extend the hardening verifier to cover portable/single-arch scripts (REL-003), and integrate `verify:dist:portable` into the CI release workflow (REL-004).
- **Status:** Open (Root `LEGAL.md` created in this session, other items remain open)
- **Affected Files/Modules:** `.github/workflows/release.yml`, `scripts/verify-release-packaging-hardening.cjs`
- **Validation Required:** `npm run verify:release-packaging-hardening`
- **Headed/Manual Smoke Required:** No

---

## P3 — UI / Polish / Refactoring

### [ ] Clean Up Workflow Test Casts
- **Description:** Remove `// @ts-nocheck` from `src/stores/workflow-template-store.test.ts` and replace all `as any` / `as unknown` casts with typed mock fixtures.
- **Status:** Open
- **Affected Files/Modules:** `src/stores/workflow-template-store.test.ts`
- **Validation Required:** `npm run verify:workflow-templates`
- **Headed/Manual Smoke Required:** No

---

## P4 — Docs / Release / Historical Triage

### [ ] Triage Remaining Medium/Low Static Audit Findings
- **Description:** Continue live source verification for the ~54 remaining medium security/logic findings from the static audit. Do not bulk-import snapshot claims as confirmed defects without manual verification.
- **Status:** Open
- **Affected Files/Modules:** Various codebase files
- **Validation Required:** `npm run verify:contracts`
- **Headed/Manual Smoke Required:** No

---

## Recently Closed

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
