# Venice Forge Roadmap

This is the canonical product roadmap and open task ledger. For the append-only session history, see `docs/summary_of_work.md`.

---

## P0 — Safety / Security / Data Protection

No critical P0 blockers are currently open. All previously identified P0 issues (including streaming lifecycle preservation across tab switches, no-.git archive validation idempotency, and upscale enhancer preflight guards) are resolved and verified.

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
