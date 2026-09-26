# Summary of Work

This is the active handoff and validation ledger. The canonical current-work ledger is `docs/ROADMAP.md`. The ledger as it stood before the 2026-09-23 compaction is `docs/reports/historical/summary-of-work-before-2026-09-23.md`.

## Current State (machine-readable; refresh per session — VF-AUD-20260916-P3-002)

```text
repository_head_sha: cf42e89adae78bbe4267045828bddccbc5adb703
application_code_sha: cf42e89adae78bbe4267045828bddccbc5adb703
verified_against_sha: cf42e89adae78bbe4267045828bddccbc5adb703
verified_at:         2026-09-26 (Pacific)
package_version:     3.1.0
node_engine:         >=22.15.0 <23.0.0
branch:              feature/graphite-cockpit-redesign
working_tree:        committing handoff and docs index
ci_status:           all static, feature, and release contracts passed locally; focused test suites passed (UI layout, chat, media, settings, workflows, theme)
codeql_status:       not checked this session; historical runs below do not cover current edits
open_findings:       FRAT-REAUD-006 (live provider acceptance); FRAT-REAUD-007 (native-language review); P2-016 headed human accessibility QA; VF-VERIFY-005 external release evidence
```
external_acceptance_outstanding:
  - headed accessibility/visual QA with a human signature (P2-016)
  - qualified native-language review (P3-020)
  - funded live provider calls, signed/notarized installers, and two-device sync (VF-VERIFY-005, FRAT-AUD-010)
```

## Latest Session Summary

- **2026-09-26 Graphite Cockpit UI re-envisioning with Stitch MCP & full component refactor.** Completed full design system synchronization and UI re-envisioning of Venice Forge into **Graphite Cockpit Flat Instrumentation** on isolated branch `feature/graphite-cockpit-redesign`. Synchronized canonical `DESIGN.md` with Google Stitch MCP project `12225516409245957947` (asset `e0602d8ee669493f93e05387d8d20026`). Registered new design tokens (`--border-hot: #743940`, `--telemetry-cyan: #6ee7d3`) into Theme Engine V2 (`applyTheme.ts`, `theme.css`, `bootstrap-theme.js`). Refactored shell layout and telemetry headers (`App.tsx`, `header.tsx`), Chat transcript reading container (`chat-view.tsx`), Media Studio and Workflow Canvas fluid grids (`image-page.tsx`, `media-card.tsx`, `WorkflowTemplatesView.tsx`), and dense telemetry system drawers (`TaskCenterDrawer.tsx`, `DiagnosticsDrawer.tsx`, `SettingsView.tsx`). Maintained 100% preservation across all 15 canonical tabs, dual Electron IPC / Express proxy transports, and 22+ Zustand stores. Verified across `lint:eslint` (PASS, 0 errors/0 warnings), `typecheck` (PASS, 3 projects), `build` (PASS), `verify:contracts` (PASS, 104/104 checks), `verify:safety-guard` (PASS), `verify:markdown-links` (PASS), `test:ui:media` (PASS, 136 tests), `test:ui:layout` (PASS, 120 tests), `test:ui:chat` (PASS, 115 tests), `test:ui:settings` (PASS), `test:workflow:ui` (PASS), and `test:unit:theme` (PASS, 788 tests).
- **2026-09-26 repository-wide documentation review, updating, and cleaning across docs/ (uncommitted).** Conducted a systematic audit of all tracked documentation across the canonical `docs/` tree (448 markdown documents). Identified and resolved stale version references (e.g. `3.0.0-beta.3` -> `3.1.0` in `docs/architecture/data-export-format.md` and `docs/discovery/DISCOVERY_DOCUMENT_AGENT.md`), updated Node engine requirements to Node `22.15.0` (`>=22.15.0 <23.0.0`) in `docs/FAQ.md`, normalized link labels to match canonical filenames (`building.md`, `platform-support.md`, `troubleshooting.md`, `signing-and-notarization.md`, `DEVELOPMENT/CONFIG.md`), updated historical audit directory citations in `docs/DEVELOPMENT/FILE_TREE.md` and `docs/discovery/DISCOVERY_DOCUMENT_AGENT.md`, refreshed HEAD SHAs and verification dates in `docs/ROADMAP.md`, and purged untracked `docs/.DS_Store` metadata. Validated with `verify:contracts:static` (all 28 checks PASS), `verify:markdown-links` (448/448 markdown files checked, 0 broken links), `verify:agent-docs` (PASS), `verify:roadmap-current` (PASS), `verify:release-metadata` (PASS), `verify:repo-handoff-hygiene` (PASS), `verify:archive-clean` (PASS), `typecheck` (PASS), and `lint:eslint` (PASS). 100% green.
- **2026-09-26 repository-maintenance review and repository hygiene execution (uncommitted).** Conducted full review of `docs/repository-maintenance/` (`README.md`, `REPOSITORY_HYGIENE_REPORT.md`, `FILE_MOVE_MANIFEST.md`, `DELETION_MANIFEST.md`) and executed comprehensive repository hygiene workflows. Remediated gitignore rule collision where trailing lines 401–403 in `.gitignore` conflicted with lines 67–68, restoring 0 ignored tracked files in `git ls-files -c -i --exclude-standard`. Normalized POSIX naming hygiene by relocating `docs/audits/Agent Handoff — Venice Forge Theme Engine & Theme System Exhaustive Audit.md` (which contained non-ASCII em-dash and spaces) to canonical `docs/audits/Records/2026-09-25-theme-engine-theme-system-exhaustive-audit-handoff.md` and indexed in `docs/DOCS_INDEX.md`. Isolated root clutter by moving `kimi-export-session_-20260926-051728.md` into gitignored `.agent-backups/session-exports/`, and purged untracked Finder `.DS_Store` metadata. Synchronized all four maintenance documents with the 2,248 tracked file inventory and v3.1.0 metadata. Verified with `verify:contracts:static` (28/28 checks PASS), `verify:archive-clean` (PASS), `verify:repository-identity` (PASS), `verify:repo-handoff-hygiene` (PASS), `verify:markdown-links` (448/448 markdown files PASS), `verify:agent-docs` (PASS), and `verify:superdesign-init` (PASS). 100% green.

## Session History

### 2026-09-26 — Graphite Cockpit Flat Instrumentation UI re-envisioning & Stitch MCP synchronization

- **Baseline.** Operating on branch `feature/graphite-cockpit-redesign` branched from `main` (`3087051b`). Node `v22.15.0`, npm `10.9.2`, `venice-forge@3.1.0`. All 15 canonical tabs and 4 legacy aliases preserved.
- **Stitch MCP Design System Integration:**
  - Connected and authenticated with Google Stitch MCP.
  - Linked to project `projects/12225516409245957947` ("Venice Forge Design System").
  - Uploaded canonical `DESIGN.md` via `upload_design_md` and synchronized design system tokens using `create_design_system_from_design_md`, generating active asset `e0602d8ee669493f93e05387d8d20026`.
- **Theme Engine V2 & Token Cluster Alignment:**
  - Registered `--border-hot` (`#743940`) and `--telemetry-cyan` (`#6ee7d3`) into `buildThemeVariableMap` in `src/theme/applyTheme.ts`.
  - Added CSS custom properties `--border-hot` and `--telemetry-cyan` to `@theme` in `src/styles/theme.css`.
  - Added keys to `ALLOWED_KEYS` in `public/bootstrap-theme.js` to ensure anti-FOUC hydration.
  - Implemented safe casting `(t as unknown as Record<string, string | undefined>)` in `applyTheme.ts` to cleanly satisfy TypeScript compiler checks without modifying canonical `ThemeTokens`.
- **Layout Shell & Telemetry Header/Sidebar:**
  - Updated `src/App.tsx` and `src/components/layout/header.tsx` with semantic background tokens (`bg-bg`, `bg-surface`, `border-border`).
  - Maintained accessibility skip link, focus bounds, and multi-profile selectors.
- **Chat & Transcript Views:**
  - Standardized `src/components/chat/chat-view.tsx` transcript column with `max-w-vf-comfort` (760px) reading budget, hairline semantic borders, and stepped graphite surfaces.
- **Media Studio & Workflow Canvas:**
  - Refactored `src/components/image/image-page.tsx`, `src/components/gallery/media-card.tsx`, and `src/components/workflows/WorkflowTemplatesView.tsx` with stepped graphite cards, semantic borders, and monospace font styling.
- **System Drawers & Configuration:**
  - Adapted `src/components/status/TaskCenterDrawer.tsx`, `src/components/status/DiagnosticsDrawer.tsx`, and `src/components/settings/SettingsView.tsx` to dense monospace telemetry panels and stepped graphite cards.
- **Superdesign & Identity Verification:**
  - Updated `.superdesign/init/routes.md` source fingerprint to `2af15d2f2972c880` following `App.tsx` semantic token updates.
  - Converted plan cross-reference links in `docs/superpowers/plans/2026-09-26-graphite-cockpit-ui.md` to relative links per `verify:repository-identity`.
  - Registered spec and plan in `docs/DOCS_INDEX.md`.
- **Validation:**
  - `npm run lint:eslint`: PASS (0 errors, 0 warnings across all files).
  - `npm run typecheck`: PASS (0 errors across app, electron, electron.test).
  - `npm run build`: PASS (web, server, and Electron bundles built in 1.48s).
  - `npm run verify:contracts`: PASS (all 28 static contract checks, all feature contract checks, all 104 release packaging hardening checks).
  - `npm run verify:safety-guard`: PASS.
  - `npm run verify:markdown-links`: PASS (451 files checked, 0 broken links).
  - `npm run test:ui:media`: PASS (82/82 gallery tests, 54/54 image tests, 136 tests total).
  - `npm run test:ui:layout`: PASS (19/19 files, 120/120 tests).
  - `npm run test:ui:chat`: PASS (12/12 files, 115/115 tests).
  - `npm run test:ui:settings`: PASS.
  - `npm run test:workflow:ui`: PASS.
  - `npm run test:unit:theme`: PASS (14/14 files, 788/788 tests).

### 2026-09-26 — repository-wide documentation review, updating, and cleaning across docs/

- **Baseline.** Verified root/branch/Node per AGENTS.md bootstrap: `main` at `3087051bb793498b29855edd17620aa694457b27`, Node `v22.15.0`, npm `10.9.2`, `venice-forge@3.1.0`. Preserved pre-existing user-owned working tree modifications in `docs/design/*.md`, `docs/repository-maintenance/*.md`, `docs/DOCS_INDEX.md`, and `.gitignore`.
- **Systematic Documentation Audit & Cleanups:**
  - *`docs/architecture/data-export-format.md`:* Updated version reference from `3.0.0-beta.3` to `3.1.0` and updated sample JSON envelope `appVersion` to `"3.1.0"`.
  - *`docs/FAQ.md`:* Updated Node.js requirement to `22.15.0 or newer within Node 22.x (contract: >=22.15.0 <23.0.0)`; normalized link labels to canonical lowercase filenames (`[platform-support.md]`, `[building.md]`, `[troubleshooting.md]`).
  - *`docs/ABOUT.md`:* Corrected path label from `docs/CONFIG.md` to `DEVELOPMENT/CONFIG.md`.
  - *`docs/DEVELOPMENT/FILE_TREE.md`:* Replaced stale reference to non-existent audit results directory with canonical `docs/audits/Records/` description for historical audit evidence and snapshots.
  - *`docs/DEVELOPMENT/macos.md`:* Normalized link label `[SIGNING_AND_NOTARIZATION.md]` to canonical filename `[`signing-and-notarization.md`]`.
  - *`docs/discovery/DISCOVERY_DOCUMENT_AGENT.md`:* Added version context indicating discovery was originally drafted for `v3.0.0-beta.3` and active in `v3.1.0`; updated canonical specification reference from `docs/audits/TODO/Function_calling_todo.md` to `docs/audits/Records/Function_calling_todo.md`.
  - *`docs/ROADMAP.md`:* Updated machine-readable state header with current HEAD commit `3087051bb793498b29855edd17620aa694457b27` and verified date `2026-09-26 (Pacific)`.
  - *Untracked OS Metadata Purge:* Removed untracked `docs/.DS_Store`.
- **Validation:**
  - `npm run verify:contracts:static`: PASS (all 28 static contract checks passed).
  - `npm run verify:markdown-links`: PASS (448/448 markdown files checked, 0 broken links).
  - `npm run verify:agent-docs`: PASS.
  - `npm run verify:roadmap-current`: PASS.
  - `npm run verify:release-metadata`: PASS.
  - `npm run verify:repo-handoff-hygiene`: PASS.
  - `npm run verify:archive-clean`: PASS.
  - `npm run typecheck`: PASS (0 errors across app, electron, electron.test).
  - `npm run lint:eslint`: PASS (0 errors, 0 warnings across `src`, `electron`, `server.ts`, `scripts`).
  - Out of scope: manual Electron QA, live provider calls. No commit, push, or release performed.
- **2026-09-25 docs/design review and synchronization to current app status (uncommitted).** Conducted comprehensive audit of all specifications, contracts, and guides under `docs/design/`. Synchronized `DESIGN.md` (36 canonical semantic tokens, 33 code/syntax tokens, 43 built-in dual-mode theme families, local offline font stack, 4px grid), `THEME_SYSTEM.md` (44 starter YAML templates, 43 built-in families in full catalog), `CHARACTER_RP.md` and `SCENE_GENERATION.md` (centralized `veniceFetch` client dispatch via desktopBridge, removing prohibited direct fetch/bridge references), `MEDIA_STUDIO.md` (Media Studio Power Tools, 2..4 compare mode, lineage graph, bulk project tagging, safe export bundles, custody recovery queue), `CHAT_DESIGN_SYSTEM_REFRESH_2026-09-13.md` (approved/implemented status, 36 roles, canonical tab registry references), `pastel-theme-pack-report.md` (archival implementation banner), `REPOSITORY_TREE.md` (tracked docs/design, removed stale CLAUDE/GEMINI/CHANGELOG references, added missing component directories, 36 roles, 44 YAML templates), `VENICE_UI_EXTRACTION.md` (completed foundational status), and `VENICE_FORGE_REFERENCE_UI_REDESIGN.md` (approved and fully implemented status across phases 1-10). Verified with `verify:agent-docs`, `verify:markdown-links` (442 files), `verify:contracts:static` (28 verifiers), `lint:eslint`, `typecheck`, `test:unit:theme` (787 tests), and `test:contracts` (304 tests). 100% green.
- **2026-09-25 Theme Engine & Theme System exhaustive audit remediation (Waves 1 & 2, uncommitted).** Completed full remediation of findings from the 2026-09-25 exhaustive theme audit and session handoff across Wave 1 (token cluster + lifecycle + engine + placeholder AA) and Wave 2 (24 legacy V1 theme conversions, documentation corrections, P3 UI/CSS polish, and test suite harmonization). All 19 P2 and 13 P3 findings remediated and verified locally across 113 Electron test suites (1,299 tests), 14 theme unit test files (787 tests), 28 contract test files (304 tests), full static/feature/release contract verifiers (104 checks), theme tokens/collisions verifiers, and full production build. Embedded and linked `assets/Venice-Forge.mp4` and `assets/Venice_Forge.mp4` video teasers in `README.md` intro and Showcase sections. Zero regressions.
- **2026-09-25 Theme Engine & Theme System exhaustive audit (uncommitted report).** Audited `main` at `8ee5ddd2` per the user's agent handoff via six read-only workstreams + executable probes. Confirmed: one authoritative V2 engine; all 43 built-ins schema-valid; export→import value-stable; injection/pollution-safe; deterministic fallbacks. Confirmed 19 P2 + 13 P3 findings (0 P0/P1). Full report: `docs/audits/VENICE_FORGE_THEME_SYSTEM_EXHAUSTIVE_AUDIT_2026-09-25.md`.
- **2026-09-25 Diagnostics connectivity correction (uncommitted).** Started from clean `main` at `dde601f9cadf3d4d25b3772af9d3a6fb0ffeaf6b`, with the previous research fix committed. Diagnostics now recognizes a successful live model-catalog request instead of always warning after key configuration. Cached catalogs and failed refreshes retain the warning. The connected label reuses existing locale translations under the diagnostics namespace.
- Theme/mesh report remains **blocked by missing reproduction evidence** in `docs/ROADMAP.md`: requested affected theme names and screens. The supplied diagnostics screenshot's API outline is the intentional selected-section indicator. Shared mesh CSS has translucent gradients, but no change to their design is justified from this screenshot alone. No manual Electron QA or live provider call was performed.

## Session History

### 2026-09-26 — repository-maintenance review and repository hygiene execution

- **Baseline.** Verified root/branch/Node per AGENTS.md bootstrap: `main` at `3087051bb793498b29855edd17620aa694457b27`, Node `v22.15.0`, npm `10.9.2`, `venice-forge@3.1.0`. Preserved pre-existing user-owned working tree modifications in `docs/design/*.md` and `docs/summary_of_work.md`.
- **Documentation Review & Synchronization:**
  - Reviewed `docs/repository-maintenance/README.md`, `REPOSITORY_HYGIENE_REPORT.md`, `FILE_MOVE_MANIFEST.md`, and `DELETION_MANIFEST.md`.
  - Updated `REPOSITORY_HYGIENE_REPORT.md` with 2026-09-26 revalidation section, updated package version header to `3.1.0`, and synchronized Section 2 inventory table to reflect 2,248 active tracked files across 16 canonical directories with a clean 28-file root perimeter.
  - Updated `FILE_MOVE_MANIFEST.md` with Section 0 recording the relocation and kebab-case renaming of the closed theme system audit handoff into `docs/audits/Records/`.
  - Updated `DELETION_MANIFEST.md` with Section 0 recording 0 tracked file deletions, root transient session export isolation, and local `.DS_Store` purging.
- **Gitignore Rule Collision Remediation:**
  - Located trailing lines 401–403 in `.gitignore` (`.superdesign`, `/.superdesign`, `/.superdesign/init`) added in commit `00bc462c` that conflicted with existing rules at lines 67–68 (`/.superdesign/*`, `!/.superdesign/init/`). The trailing entries caused Git to treat tracked design specifications in `.superdesign/init/` as ignored (`git ls-files -c -i --exclude-standard` reported 6 tracked files).
  - Removed lines 401–403 from `.gitignore`. Verified that `git ls-files -c -i --exclude-standard` now returns exactly 0 results. Verified `verify:superdesign-init` passes with source fingerprint `d0da102d82865bb1`.
- **POSIX Naming Hygiene & Audit Archive Normalization:**
  - Located `docs/audits/Agent Handoff — Venice Forge Theme Engine & Theme System Exhaustive Audit.md` introduced in commit `00bc462c`. The file contained a non-ASCII em-dash (`—`) and whitespace, producing quote-escaped strings in POSIX tools and violating Section 1 Key Outcome 2 (`git ls-files | grep -E '[^a-zA-Z0-9._/-]'`).
  - Because the theme audit and remediation waves have fully completed and landed on `main`, moved the document to `docs/audits/Records/2026-09-25-theme-engine-theme-system-exhaustive-audit-handoff.md` per `docs/audits/README.md` governance.
  - Indexed the new path in `docs/DOCS_INDEX.md`. Verified that `git ls-files | grep -E '[^a-zA-Z0-9._/-]'` returns exactly 0 results.
- **Root Clutter Isolation & OS Metadata Purge:**
  - Cleared root transient session export `kimi-export-session_-20260926-051728.md` into gitignored `.agent-backups/session-exports/`.
  - Purged untracked Finder `.DS_Store` metadata from working tree directories.
- **Verification:**
  - `npm run verify:contracts:static`: PASS (all 28 static contract checks passed).
  - `npm run verify:archive-clean`: PASS.
  - `npm run verify:repository-identity`: PASS (git mode).
  - `npm run verify:repo-handoff-hygiene`: PASS.
  - `npm run verify:markdown-links`: PASS (448/448 markdown files checked).
  - `npm run verify:agent-docs`: PASS.
  - `npm run verify:superdesign-init`: PASS.
  - `node scripts/clean-release-staging.cjs`: PASS.
  - Out of scope: manual Electron QA, live provider calls. No commit, push, or release performed.

### 2026-09-25 — docs/design review and synchronization to current app status

- **Baseline.** Verified root/branch/Node per AGENTS.md bootstrap: `main` at `3087051bb793498b29855edd17620aa694457b27`, Node `v22.15.0`, npm `10.9.2`, `venice-forge@3.1.0`. Clean worktree before session edits.
- **Audit & Synchronizations:**
  - *`docs/design/DESIGN.md`:* Updated color strategy to 36 canonical semantic roles + 33 code/syntax roles; documented all 43 built-in dual-mode theme families; documented local offline font stack (`MesloLGM Nerd Font` / `MesloLGS Nerd Font Mono` / `JetBrains Mono`); corrected spacing system to 4px/0.25rem increments and 16px/1rem base; updated navigation to reflect canonical grouped sidebar (`CANONICAL_TAB_ORDER` across Conversation, Generate, Build, System).
  - *`docs/design/THEME_SYSTEM.md`:* Updated starter template count from 36 to 44 (43 built-in dual-variant themes + `example.theme.yaml`); expanded full catalog listing to all 43 built-in theme families.
  - *`docs/design/CHARACTER_RP.md` & `docs/design/SCENE_GENERATION.md`:* Replaced prohibited direct `fetch('/api/venice/image/generate')` and `bridge.venice.request` references with centralized `veniceFetch()` in `src/services/veniceClient.ts` routed through `desktopBridge` and `performGuardedVeniceRequest`.
  - *`docs/design/MEDIA_STUDIO.md`:* Documented Media Studio Power Tools (VERIFY-044), including 2..4 compare mode (`MEDIA_COMPARE_MAX = 4`), lineage graph tracing, bulk project assignment/tagging, and multi-item safe export bundles; updated Venice client dispatch to `veniceFetch()`; documented Electron generated-media custody and recovery queue (`generatedMediaStore.ts` / `generatedMediaRecoveryQueue.ts`).
  - *`docs/design/CHAT_DESIGN_SYSTEM_REFRESH_2026-09-13.md`:* Marked status as approved and implemented, subsumed by the Reference-Driven UI Redesign; updated theme role counts to 36; replaced hardcoded tab numbers with `src/config/tabs.ts` registry references.
  - *`docs/design/pastel-theme-pack-report.md`:* Added historical implementation report banner explaining that baseline `DocumentAgentView` errors were resolved on `main`.
  - *`docs/design/REPOSITORY_TREE.md`:* Documented that `docs/design/*.md` and redesign evidence are tracked; removed references to removed governance docs (`CLAUDE.md`, `GEMINI.md`, root `CHANGELOG.md`); updated theme system to 36 roles and 44 templates; added missing component subdirectories (`character-creator`, `characters`, `documents`, `generation`, `image-inspector`, `notifications`, `search`, `settings`); corrected `sceneGenerationService.ts` path.
  - *`docs/design/VENICE_UI_EXTRACTION.md`:* Added completed/archived foundation status header and documented full production integration of the unified sidebar and studios.
  - *`docs/design/VENICE_FORGE_REFERENCE_UI_REDESIGN.md`:* Updated status from pending to approved and fully implemented across phases 1–10.
- **Validation:**
  - `npm run verify:agent-docs`: PASS.
  - `npm run verify:markdown-links`: PASS (442 Markdown files checked).
  - `npm run verify:contracts:static`: PASS (all 28 static contract verifiers passed).
  - `npm run lint:eslint`: PASS (0 errors, 0 warnings across `src`, `electron`, `server.ts`, `scripts`).
  - `npm run typecheck`: PASS (0 errors across `tsconfig.json`, `tsconfig.electron.json`, `tsconfig.electron.test.json`).
  - `npm run test:unit:theme`: PASS (14/14 test files, 787/787 tests passed).
  - `npm run test:contracts`: PASS (28/28 test files, 304/304 tests passed).
  - Out of scope: manual Electron QA, headed visual QA, live provider calls. No commit, push, or release performed.

### 2026-09-25 — Theme Engine & Theme System exhaustive audit remediation (Waves 1 & 2)

- **Baseline.** Verified root/branch/Node per AGENTS.md bootstrap: `main` at `8ee5ddd2a14691739d5bfda7c3759a06ce352b66`, Node `v22.15.0`, npm `10.9.2`, `venice-forge@3.1.0`. Preserved pre-existing user-owned worktree state (untracked handoffs; one audit file moved to `docs/audits/Records/`).
- **Wave 1 Remediations:**
  - *Dead-token cluster & verifier (THEME-P2-010…015):* Repointed ~45 obsolete shadcn and ghost tokens across ~30 component files (`CharacterCreator*`, `AccessibleDialog`, `ContextMenu`, `AssetGallery`, `CharacterEditor`, `RpChatView`, `DocumentAgentView`, `media-inspector`, `media-toolbar`, `GenerationLoadingIndicator`, `ImageInspectorView`, `image-view`, `ProgressToast`, `ToastItem`, `playground-view`, `preview-node`, `SceneComposerView`, `BackupSyncPanel`, `DataStoragePanel`, `ImportPlanModal`, `PrimaryApiRoutePanel`, `ProvidersPanel`, `WorkflowTemplatesView`) to canonical `--color-surface-*`, `--color-text-*`, and `--color-border-*`. Renamed `--width-*` container tokens to `--container-*`. Defined 9 derived `@theme` color-mix tokens in `src/styles/theme.css`. Extended `scripts/verify-theme-tokens.cjs` to audit 589 files for resolvability against `@theme` and `:root`; added `tests/theme/extendedShellAliasTokens.test.ts`. Extended `tests/theme/inlineColorInvariant.test.ts` to enforce `THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR`.
  - *Accessibility & contrast (THEME-P2-001, THEME-P2-002, THEME-P2-019):* Rewrote `src/theme/contrast.ts` to parse modern `rgb(r g b / alpha)` and 8-digit hex values accurately. Re-tuned placeholder contrast across all 52 built-in theme variants in `src/theme/builtins/` to WCAG AA (≥ 4.5:1 vs `inputBackground`). Added `src/theme/builtinsContrast.test.ts` with 172 contrast checks.
  - *Lifecycle & runtime (THEME-P2-003…009, THEME-P2-016):* Handled `customThemes` hydration dead path in `src/App.tsx`; fixed `handleSelect('custom')` persistence in `src/components/ThemeMaker.tsx`; added membership guard to `deleteCustomTheme` in `src/stores/settings-store.ts`; added `useSystemThemeMode` hook (`src/hooks/use-system-theme-mode.ts`) responding to OS `prefers-color-scheme`; updated pre-paint cache in `public/bootstrap-theme.js` and `src/App.tsx`; added web CRUD gate and 25 MiB cap in `ThemeMaker.tsx` and `src/services/desktopBridge.ts`; reserved id `themes` in `src/theme/yaml/validate.ts`; deleted collision `config/themes/copper.yaml` and created `scripts/verify-theme-collisions.cjs` and its test; fixed `isBuiltInId` in `src/theme/registry.ts`; removed dead `mode` option in `src/theme/yaml/serialize.ts`; tightened `SAFE_COLOR_RE` in `src/theme/validateColor.ts`.
- **Wave 2 Remediations:**
  - *24 Legacy V1 theme conversions:* Converted all 24 `config/themes/*.yaml` single-mode files into dual-variant Schema V2 theme families (`amber-archive` through `ultraviolet-rain`) with zero companion flattening.
  - *Documentation corrections (THEME-P2-017, P3-001…004):* Corrected `docs/ui-modernization/THEME_IMPORT_EXPORT.md` (removed `version: 1.0.0` and included legacy `text_*` trio); rewritten `docs/ui-modernization/THEME_MIGRATION.md` (§2/§3 removing references to non-existent `deriveComplementaryVariant`); updated `docs/ui-modernization/THEME_SCHEMA.md` and `docs/design/THEME_SYSTEM.md` (documented 36 token roles and accepted color formats); updated `README.md` and `docs/DOCS_INDEX.md` (43 built-in themes, V2 override structure, and updated archived audit link in `docs/DOCS_INDEX.md`).
  - *P3 UI/CSS polish (THEME-P3-005…013):* Fixed `ThemeMaker.tsx` export return check, Unicode filename sanitization, and localized code token labels; added `--vf-z-toast: 400` in `theme.css` and adopted in `ToastViewport.tsx`; removed dead `@theme` variables and redundant `@media (prefers-reduced-motion)` in `theme.css`; removed redundant hover backgrounds in `image-view.tsx` and `ToastItem.tsx`; removed duplicate `bg-overlay/75` in `AccessibleDialog.tsx`.
  - *Test suite harmonization:* Updated `electron/services/configService.test.ts` to support both V1 and V2 theme schemas; updated `.superdesign/init/routes.md` tracked source fingerprint.
- **Validation:**
  - `npm run lint:eslint`: PASS (0 errors, 0 warnings across all files).
  - `npm run typecheck`: PASS (0 errors across app, electron, electron.test).
  - `npm run test:electron`: PASS (113/113 test files, 1,299/1,299 tests passed).
  - `npm run test:server`: PASS (102/102 tests passed).
  - `npm run test:unit:theme`: PASS (14/14 test files, 787/787 tests passed).
  - `npm run test:contracts`: PASS (28/28 test files, 304/304 tests passed).
  - `npm run test:character-cards`: PASS (8/8 test files, 79/79 tests passed).
  - `npm run test:ingestion`: PASS (12/12 test files, 117/117 tests passed).
  - `npm run verify:theme-tokens`: PASS (202 files scanned for forbidden hardcoded classes; 589 files scanned for token resolvability).
  - `npm run verify:theme-collisions`: PASS (24 registry-relevant documents checked; 24 intentional dual-variant V2 overrides recognized; 0 collisions).
  - `npm run verify:markdown-links`: PASS (442 Markdown files checked).
  - `npm run verify:contracts`: PASS (all static, feature, and release contracts passed; 104/104 checks passed).
  - `npm run verify:contracts:static`: PASS (all 28 verifiers passed).
  - `npm run verify:roadmap-current`: PASS.
  - `npm run build`: PASS (web, server, and Electron bundles).
  - Out of scope: No commit, push, or release performed per user-owned git policy. Manual Electron QA, headed visual QA, and live provider calls not run.

### 2026-09-25 — Theme Engine & Theme System exhaustive audit (audit-first, no remediation)

- **Baseline.** Verified root/branch/Node per AGENTS.md bootstrap: `main` at `8ee5ddd2a14691739d5bfda7c3759a06ce352b66`, Node `v22.15.0`, npm `10.9.2`, `venice-forge@3.1.0`. Preserved pre-existing user-owned worktree state (untracked handoff doc; one audit file moved to `docs/audits/Records/`). Read the six `.superdesign/init/` context files (all present and non-empty; init complete).
- **Method.** Parent read of the full engine core (`themeTypes`, `validation`, `validateColor`, `registry`, `resolver`, `applyTheme`, `migration`, `fallbacks`, builtins index/venice/dark/light, `yamlTheme`, `codeSyntax`, full `yaml/` pipeline, `contrast`, `REQUIRED_THEME_TOKEN_KEYS`) plus executable probes via `npx tsx` against the real modules; six parallel read-only workstreams (persistence/runtime, Theme Maker UI, Electron integration, CSS token layer, component surfaces, tests/CI/docs). Every high-severity workstream claim was parent-verified against source or compiled dist CSS before entering the report.
- **Probe results (all 43 built-ins):** schema-valid via `validateThemeFamily`; 36 valid colors per variant; export→import round-trip value-stable (dark+light, code presets included); placeholder-vs-inputBackground contrast < 4.5 AA in 37/43 dark and 15/43 light variants (venice default fails both: 4.32 dark, 3.43 light); `contrast.ts` returns luminance 0 for valid 8-digit hex and ignores alpha in modern `rgb()`; 9 self-aliases; top-level YAML `mode:` written but never read; `isBuiltInId` broken for aliases (zero callers — latent); security probes (url/expression/javascript/@import/__proto__) all rejected; unknown/corrupt persisted ids resolve deterministically.
- **Findings.** 0 P0, 0 P1, 19 P2, 13 P3 — full evidence (files, lines, repro, fixes, validation) in `docs/audits/VENICE_FORGE_THEME_SYSTEM_EXHAUSTIVE_AUDIT_2026-09-25.md`. Headline P2s: dead-token cluster (P2-010…P2-013) with CI verifier blind spot (P2-015); placeholder AA (P2-002); contrast parser (P2-001); hydration dead path (P2-003); FOUC bootstrap (P2-004); inert system mode (P2-005); ThemeMaker persistence + YAML-delete side effects (P2-006/007); Electron `themes`-id vanish + copper shadow (P2-008/009); web CRUD gap (P2-016); doc example rejected + phantom migration algorithms (P2-017); test gaps (P2-018); transparency checkerboard (P2-019).
- **Not run:** `npm run typecheck`, full `npm test`, `npm run build`, `npm run ci`; manual Electron QA, headed visual QA, live OS-appearance toggle, hosted CI/CodeQL inspection for `8ee5ddd2`. No commit, push, or release. No repository source files were modified (report + ledger entries only).
- The blocked user theme/mesh report (`THEME-OVERLAY-2026-09-25`) remains blocked; the audit notes `--app-mesh-opacity` is hardcoded per mode (`applyTheme.ts:97`), not token-controllable.

### 2026-09-25 — Diagnostics connectivity correction and theme investigation

- **Confirmed defect:** `src/services/diagnosticsService.ts`, `buildApiStatus`, returned a warning for every configured key regardless of successful live model loading. A regression with 166 live models failed before the fix. It now reports Connected only for ready/live catalog evidence with a success timestamp and no error, retaining credential/hydration gates. The existing status-store catalog subscription refreshes diagnostics. This confirms model-endpoint connectivity, not every generation endpoint.
- Added regressions for live success, subsequent failed refresh, and cached-only catalog evidence in `src/services/diagnosticsService.test.ts`. Reused existing Connected translations in all 12 `common.json` catalogs; no native-review status changed.
- **Theme report: blocked by missing evidence.** Traced selected-section borders in `src/components/status/DiagnosticsDrawer.tsx` and translucent mesh styles in `src/styles/components.css`. Requested theme/screen examples before altering intentional focus indicators or global mesh styling. See `docs/ROADMAP.md`.

### 2026-09-25 — Research output and scrape-click correction

- **Confirmed defect:** `src/components/search/SearchScrapeView.tsx`, `runAiResearch` appended the structured `{ content, reasoning }` callback argument directly to a string. It now appends `delta.content`, preserving citations and keeping reasoning out of answer text. Static callback-contract inspection and a failing component regression reproduced the defect.
- **Confirmed defect:** `src/components/search/ScrapeTab.tsx`, the Scrape button passed React's click event to `runScrape(explicitUrl?)`, producing the reported `.trim is not a function` rejection before any request. The button now invokes its no-argument callback explicitly. The regression reproduced the exact exception; after correction, entered URL trimming and clicked-result URL selection both pass.
- Inspected only diagnostic response shapes/statuses from the supplied traffic export. Search/scrape responses contained string fields and successful statuses; raw user/provider content and credentials were not copied into fixtures or documentation. Updated `src/components/search/SearchScrapeView.test.tsx` to exercise real Scrape and AI Research components with neutral synthetic fixtures.

### 2026-09-25 — Fraterna routing re-audit remediation

- Reproduced FRAT-REAUD-001 with failing shared safety tests and FRAT-REAUD-002 with a Fraterna 429/retry/fallback transport test. Shared, Electron guard, and web request paths now map provider preference to `moderation: "auto" | "low"` for `/images/generations`; native image routes retain `safe_mode`. Retryable responses after one same-provider `Retry-After` retry continue to configured fallback providers, while a 401 remains terminal and streamed output cannot fall back.
- Reproduced FRAT-REAUD-003 with failing renderer error tests; shared 500/503 and unknown-body errors now use route-neutral wording. Reproduced FRAT-REAUD-004 with failing server and bridge tests; the web server exposes a read-only route value and the bridge hydrates it before React mounts. Status, SafeDiagnostics, and model cache identity already consume the same store field. Web route writes are rejected.
- Reconciled current ledger state and marked the erroneous initial Fraterna implementation narrative below as historical. The exact baseline `86b55805` had CI run `36204271635` (11/11 success) and CodeQL run `36204271633` (2/2 success), verified through GitHub; these runs do not cover the current uncommitted edits. Live provider smoke and native linguistic review remain open.

### 2026-09-25 — Fraterna primary API routing post-implementation audit remediation

Executed remediation of findings FRAT-AUD-001 through FRAT-AUD-009 from the 2026-09-25 post-implementation audit handoff:

1. **FRAT-AUD-001 (P1): `/images/generations` cross-layer routing reachability.**
   - Added `/images/generations` to `ALLOWED_VENICE_ENDPOINTS` and `VENICE_ENDPOINT_METHODS` (`POST`) in `src/shared/validation.ts`.
   - Updated `server.ts` to allow `/images/generations` through Express proxy routes and FSM media screening.
   - Added validation and safety pipeline regression tests in `tests/safety/guardPipeline.test.ts`.

2. **FRAT-AUD-002 (P1): Route-aware connection failure classification.**
   - Updated `classifyConnectivityFailure` in `electron/ipc/handlers/apiKeyHandlers.ts` to receive `activeRoute`.
   - Distinct classification for Fraterna: 401/403 responses indicate Fraterna consorzio membership/route configuration requirements rather than telling users their Venice API key is invalid. Network failures distinguish whether Fraterna or Venice direct was unreachable.
   - Added 10 regression tests in `electron/ipc/handlers/apiKeyHandlers.routeConnectivity.test.ts`.

3. **FRAT-AUD-003 & FRAT-AUD-004 (P2): Upstream observability & route-aware transport errors.**
   - Added `selectedPrimaryRoute`, `effectiveUpstream`, and `routingReason` to `VeniceIpcResponse`, `performSingleVeniceRequest` in `electron/services/veniceClient.ts`, and `resolvePrimaryApiRouteForRequest` in `electron/services/providerAdapters.ts`.
   - Threaded headers `x-venice-forge-primary-route`, `x-venice-forge-effective-upstream`, and `x-venice-forge-routing-reason` through `server.ts` proxy responses; registered in `DIAG_HEADER_NAMES` (`src/constants/venice.ts`).
   - Extended `VeniceApiError` in `src/services/veniceClient/errors.ts` and Inspector telemetry contracts (`src/shared/inspectorTelemetryContracts.ts`, `src/services/inspectorTelemetry.ts`, `src/stores/inspector-store.ts`).
   - Added localized UI inspector rows for `Primary Route`, `Effective Upstream`, and `Routing Reason` in `src/components/layout/inspector-pane.tsx`.
   - Updated shared transport/streaming errors to dynamically cite the effective upstream name (`Fraterna` vs `Venice`).

4. **FRAT-AUD-005 & FRAT-AUD-007 (P2): Route panel UI mutation hardening & docs link.**
   - Hardened `src/components/settings/PrimaryApiRoutePanel.tsx` with async `isSaving` state disabling `<select>` during update, `try/catch` wrapping `desktopProviderSettings.update()`, localized `role="alert"` error on `{ ok: false }` or rejected IPC, and authoritative rehydration via `desktopProviderSettings.get()`.
   - Added external link to `https://fraterna.ai/docs` with `target="_blank"` and `rel="noopener noreferrer"`.
   - Exported `FRATERNA_DOCS_URL` from `src/shared/primaryApiRoute.ts`.

5. **FRAT-AUD-006 (P2): Focused component regression test suite.**
   - Created `src/components/settings/PrimaryApiRoutePanel.test.tsx` testing: Venice default, Fraterna selection, success, `{ ok: false }`, rejected IPC, disabled pending state, external docs link, and web-mode notice (8/8 tests pass).

6. **FRAT-AUD-009 (P2 risk): Centralized model-catalog runtime store reset.**
   - Verified that per-hook `useEffect` in `useModels` caused redundant and potentially conflicting store resets across concurrent consumers.
   - Removed `lastRouteRef` and `useEffect` from `src/hooks/use-models.ts`. Centralized reset in `src/stores/settings-store.ts` via `useSettingsStore.subscribe` on `primaryApiRoute` change.
   - Added concurrent consumer test in `src/hooks/use-models.test.tsx` verifying exact single reset across concurrent `text` and `image` consumers without race conditions (8/8 tests pass).

7. **FRAT-AUD-008 (P2): Reconciled documentation and source comments.**
   - Corrected capability matrix in `docs/DEVELOPMENT/FRATERNA_ROUTING.md`, `docs/security/security-model.md`, and `src/hooks/use-models.ts` comments (clarified `/models` is supported by Fraterna, embeddings is Venice-only, UI location is in `VeniceApiKeysPanel.tsx`, and privacy posture reflects no Venice Forge analytics while accurately documenting Fraterna's server-side request metadata).

- **Validation:**
  - `npm run lint:eslint`: PASS (0 errors, 0 warnings).
  - `npm run typecheck`: PASS (0 errors across app, electron, electron.test).
  - `npm run test:server`: PASS (101/101 tests passed).
  - `npm run test:electron`: PASS (113/113 test files, 1,292/1,292 tests passed).
  - `npm run verify:contracts`: PASS (104/104 checks passed).
  - `npm run verify:agent-docs`: PASS.
  - `npm run verify:markdown-links`: PASS (446 Markdown files checked).
  - `npm run verify:i18n` & `npm run verify:i18n-hardcoded-regressions`: PASS (0 regressions).
  - `npm run build`: PASS (web, server, and electron bundles).
  - No commit, push, or release performed.

### 2026-09-25 — Copilot instruction refresh

- Added the primary API routing contract to `.github/copilot-instructions.md` after checking the canonical route resolver and the routing reference. The concise guidance preserves the canonical default, endpoint subset, transparent Venice fallback, configuration split, and mandatory centralized transport/validation path.
- Documentation-only change. No application code, tests, dependency metadata, or pre-existing user edits were modified.

### 2026-09-25 — Post-publish code-review pass: doc/i18n drift corrections

A second two-axis `mattpocock-skills:code-review` pass against the
published commits (fixed-point `0a1bfdf4`) surfaced drift between the
corrected FRATERNA implementation and three documentation surfaces
that the prior spec-axis pass missed. Real bugs fixed:

- `docs/security/security-model.md` — hostname drift (`api.fraterna.ai`
  → `fraterna.ai`); the earlier hostname sweep missed this file.
- `docs/DEVELOPMENT/FRATERNA_ROUTING.md` — capability-matrix table was
  the pre-correction matrix (image edit/upscale/multi-edit/embeddings
  marked Fraterna-supported, `/models` marked Venice-only); replaced
  with the §4.1 set.
- `src/shared/primaryApiRoute.ts` — `PRIMARY_API_ROUTE_DESCRIPTIONS`
  was carrying the old matrix AND the disallowed "no separate
  credential or privacy posture" claim; rewritten with the §4.1 set
  and the honest third-party-service wording per §3.2.
- `src/i18n/resources/en-US/settings.json` + 11 non-English catalogs
  — capability-matrix and privacy-overstatement propagated to all
  locales as `__MISSING__:` placeholders so the source-language
  catalog stays `isProductionComplete: false`.
- `src/hooks/use-models.ts` — added the missing Spec §10 runtime-store
  reset so the previous host's `status` / `totalCount` /
  `liveModelIds` do not surface as authoritative state for the new
  host while the refetch is in flight; added the matching focused
  regression test.
- Removed the unused `supportedNotice` / `unsupportedNotice` i18n
  keys (the panel never rendered them; they only re-encoded the wrong
  matrix).

Validation (re-run on local Node 22.15.0 / npm 10 before commit):
`npm run lint:eslint` clean, `npm run typecheck` clean (3 projects),
7 use-models tests pass (incl. new Spec §10 reset regression),
9 primaryApiRoute tests pass, 56 providerAdapters tests pass,
`verify:i18n` 12/12 locales pass, `verify:network-boundaries` OK.

Committed as `2c551019 fix(routing): align FRATERNA docs/i18n with
corrected §4.1/§4.2 contract` and pushed (`e90516d9..2c551019 main ->
main`). Hosted acceptance re-checked:
- CI run `36185930241` — `completed success` (11/11 jobs green)
- CodeQL run `36185930234` — `completed success`

Local and remote `main` both at `2c5510192f8ee62a2f7c24a6af6e160c94f1dfb8`.

### 2026-09-25 — Published FRATERNA routing implementation + audit handoff to main

- **Commits.** Two commits on local `main` directly from `0a1bfdf4`:
  - `1d6c89c1 feat(routing): add Fraterna primary API route selection` — the implementation (55 files, 1983 insertions, 59 deletions).
  - `8bb9c4dc docs(audit): archive FRATERNA primary routing handoff` — the canonical handoff record (1 file, 1840 insertions).
  - Author: `fayeblade <spearchucker667@users.noreply.github.com>`.
- **Push.** `git push origin main` — `0a1bfdf4..8bb9c4dc  main -> main`. Local and remote SHA match (`8bb9c4dc63c2736b4e019ecd92d1a628d32994aa`). No force-push.
- **Hosted acceptance (inspected).** Both GitHub Actions runs for the new SHA are green:
  - **CI** run `36179854415` — `completed success`. All jobs succeeded: `lint-and-typecheck`, `contracts`, `unit-and-integration-tests`, `coverage`, `windows-sensitive-tests`, `macos-sensitive-tests`, `script-coverage`, `build`, `electron-smoke-macos`, `electron-smoke-linux`, `electron-smoke-windows`.
  - **CodeQL** run `36179854370` — `completed success` (Analyze actions + Analyze javascript-typescript).
- **Pre-push local gates (re-run before commit).** `npm run lint:eslint` clean, `npm run typecheck` clean (3 projects), 410 focused tests pass across 15 files (incl. FRATERNA-201 priority-order regression test), 25 static contract verifiers pass (network-boundaries, repository-identity, roadmap-current, safety-guard, venice-api-docs, venice-contract-drift, ci-contract, provider-adapters, ipc-parity, agent-docs, theme-tokens, image-policy, work-orders, no-native-dialogs, inactive-feature-archive, repo-handoff-hygiene, bundle-budget, release-metadata, meteocon-csp, custom-protocol-privileges, superdesign-init, hardcoded-strings, prompt-language, transitive-deprecations, i18n, markdown-links), 5 feature verifiers pass (chat/image/workflow/rp/settings), `verify:contracts:release` 104 pass, `npm run build` web + server + electron succeed. `verify:lockfile` is blocked by sandbox `/tmp/npm-cache` EPERM (pre-existing on a clean baseline at `0a1bfdf4`, unrelated to this work).
- **Out of scope.** No release, signing, notarization, funded provider call, or two-device sync was performed. External release evidence (`VF-VERIFY-005`) remains separate.
- **Untracked (user-owned).** `docs/audits/Records/Venice_Forge_Exhaustive_Audit_Remediation_Handoff_2026-09-24.md` — pre-existing input, not touched by this session.

### 2026-09-25 — Code-review corrections to FRATERNA routing implementation

Ran the two-axis `mattpocock-skills:code-review` skill against the working tree (fixed-point `0a1bfdf4`). **Standards axis: clean** (no AGENTS.md / CONTRIBUTING.md breaches, no hard smell hits beyond three judgement-call duplications). **Spec axis: 5 real deviations from the untracked handoff surfaced** and fixed in place:

1. **Hostname** — `api.fraterna.ai` (everywhere) → `fraterna.ai` per handoff §2.1 / §4. Updated `src/shared/primaryApiRoute.ts`, `server.ts`, all the focused tests, and `scripts/verify-network-boundaries.cjs`.
2. **Capability matrix inverted** — implemented Fraterna allowed `/chat/completions`, `/image/generate`, `/image/edit`, `/image/upscale`, `/image/multi-edit`, `/embeddings`. Corrected to handoff §4.1: `/models`, `/chat/completions`, `/image/generate`, `/images/generations`. Image edit/upscale/multi-edit and embeddings belong on Venice Direct per §4.2. Tests updated to match.
3. **PRIVACY.md overstated privacy** — "no separate privacy posture" removed per handoff §3.2; replaced with the honest statement that Fraterna is a third-party service that records selected request metadata per its public docs.
4. **Fallback chain bypassed when Fraterna selected** — `performSingleVeniceRequest` set `fallbackRouteResult = null` whenever the primary route resolved, which would have routed explicit `provider:foo:bar` requests through Fraterna. Re-ordered to: resolve `provider:` prefix FIRST, then consult the primary route only if no third-party route was selected (handoff §7.3.4). Added the `[FRATERNA-201]` priority-order regression test.
5. **Doc in wrong location** — `docs/features/FRATERNA_ROUTING.md` → `docs/DEVELOPMENT/FRATERNA_ROUTING.md` per handoff §17.2. All references in README, PRIVACY, security-model, summary_of_work, DOCS_INDEX, and the network-boundaries verifier allowlist updated.

Two secondary fixes landed in the same pass:

- Extracted `PrimaryApiRoutePanel.tsx` and mounted it in `VeniceApiKeysPanel.tsx` (rate-limits section) per handoff §3.1 (Settings → API Keys, adjacent to the Venice credential) — not in `ProvidersPanel.tsx`.
- `desktopBridge.update()` now re-hydrates the renderer mirror on IPC failure so the UI rolls back the user's just-selected route rather than showing a stale value (handoff §6.3).

Re-ran `npm run lint:eslint`, `npm run typecheck`, the focused tests (381 pass across 13 files in the touched scopes), and the static contract verifiers (network-boundaries, repository-identity, roadmap-current, safety-guard, venice-api-docs, venice-contract-drift, provider-adapters, ipc-parity, i18n, hardcoded-strings — all pass). No commit, push, release, signing, or notarization was performed.

### 2026-09-25 — Historical pre-correction Fraterna primary API routing implementation (superseded)

- **Bootstrap.** Verified the repository root, branch `main`, head `0a1bfdf4`; switched to Node `22.15.0` via fnm to satisfy the engine contract; read AGENTS.md, `docs/DEVELOPMENT/agents/AGENT_REINITIALIZATION.md`, `docs/summary_of_work.md`, `docs/DOCS_INDEX.md`, `docs/ROADMAP.md`, the handoff document, and inspected the existing transport (`electron/services/veniceClient.ts`), provider adapter resolver (`electron/services/providerAdapters.ts`), settings store (`electron/services/providerSettingsStore.ts`), IPC validation (`electron/ipc/validation.ts`), desktop bridge (`src/services/desktopBridge.ts`), settings-store mirror (`src/stores/settings-store.ts`), web proxy (`server.ts`), and the network-boundaries verifier. All 11 non-English i18n catalogs were already first-pass-machine.
- **Phase 1 — shared route contract.** Created `src/shared/primaryApiRoute.ts` with the route id, host, base-path, capability matrix, `resolvePrimaryApiRoute()`, `isPrimaryApiRouteId()`, and `normalizePrimaryApiRouteId()`. Added 9 focused tests covering defaulting, Venice universality, Fraterna allowlist, unsupported endpoints, and the normalize/isPrimaryApiRouteId helpers (`src/shared/primaryApiRoute.test.ts`).
- **Phase 2 — persistence v2 + IPC + bridge.** Bumped `electron/services/providerSettingsStore.ts` to schema v2 with a profile-scoped `primaryApiRoute` field; v1 files migrate transparently. Updated the IPC handler (`electron/ipc/handlers/apiKeyHandlers.ts`) to reject unknown route ids with a typed error, and propagated the field through `electron/preload.ts`, `src/types/desktop.ts`, `src/services/desktopBridge.ts` (both `get()` and `update()`), and `src/stores/settings-store.ts` (persist version `18 → 19`, with `migrate` + `merge` coercion).
- **Phase 3 — Electron transport.** Added `resolvePrimaryApiRouteForRequest(request, profileId)` in `electron/services/providerAdapters.ts` and wired it into `performSingleVeniceRequest` BEFORE the fallback chain so the selected primary route is honored first; the `Authorization: Bearer <key>` is attached from the same secure-store credential.
- **Phase 4 — web proxy.** Added a `resolveServerPrimaryApiRoute()` env-driven selector, extended `applyVeniceProxyHeaders` to accept an `upstreamHost` parameter, and created parallel `fraternaProxyBase`, `standardFraternaProxy`, `fsmMediaFraternaProxy`, and `fsmChatStreamFraternaProxy` middleware instances that share every existing guard with their Venice pair.
- **Phase 5 — settings UI.** Added a Primary API Route panel to `src/components/settings/ProvidersPanel.tsx` (desktop-only selector; web mode shows the env-var notice). Added `settings:providers.primaryRoute.*` keys in `src/i18n/resources/en-US/settings.json` and `statusDiagnostics:api.routeDetail` in `src/i18n/resources/en-US/common.json`, then propagated to all 11 non-English catalogs as `__MISSING__:` placeholders.
- **Phase 6 — model cache.** Extended `useModels` query key with `primaryApiRoute` and added a red/green test that flips the route and confirms both cache entries coexist.
- **Phase 7 — diagnostics.** Added `primaryApiRoute?: PrimaryApiRouteId` to `SafeDiagnosticsSnapshot`, extended the api status item with a `statusDiagnostics.api.routeDetail` localization key, and added a `resolvePrimaryApiRouteForDiagnostics()` helper.
- **Phase 8 — documentation.** Created `docs/DEVELOPMENT/FRATERNA_ROUTING.md` (capability matrix, security/privacy posture, failure modes, implementation seams). Updated `README.md` (features index), `docs/legal/PRIVACY.md` (Network Architecture section), and `docs/security/security-model.md` (new "Primary API route selection" section). Registered the new doc in `docs/DOCS_INDEX.md`.
- **Phase 9 — verifier.** Extended `scripts/verify-network-boundaries.cjs` so the canonical `api.fraterna.ai` host is enumerated alongside `api.venice.ai`, and added a dedicated rule that rejects hard-coded Fraterna references outside the canonical routing files.
- **Phase 10 — validation.** `npm run lint:eslint` (0 errors / 0 warnings), `npm run typecheck` (3 projects), `verify:contracts:static` (25 verifiers incl. i18n, network-boundaries, venice-api-docs, venice-contract-drift, ipc-parity, prompt-language), and 1,802 tests across 103 test files all pass. The pre-existing EPERM `syncIdentity.test.ts` failures reproduce on a clean baseline (sandbox `/tmp` perms) and are unrelated to this change.
- **Out of scope.** No commit, push, release, signing, notarization, funded live provider call, or two-device sync was performed. Headed visual / accessibility QA, qualified native-language review, and external release evidence remain open per `docs/ROADMAP.md`.

### 2026-09-24 — Pre-push validation and publication to main

- Executed full pre-push validation gates: safety-guard, markdown-links, contracts (including features, release packaging, static), ESLint, TypeScript typechecking, full vitest suite (588 files, 7,055 tests passed), segmented electron/server/ingestion test suites, production build, dist verification, and full local `npm run ci`.
- Committed the audit remediations (mobile sidebar layout, legacy conversation vault migration retry custody, main-frame IPC check hardening, esbuild override spec, acceptance capture runner reporting), point-in-time audit handoff record in `docs/audits/Records/`, and first-pass locale catalog completion.
- Pushed directly to `origin/main` without force flags.

### 2026-09-24 — Six audit remediations and first-pass locale completion

- Preserved the dirty starting worktree, including its locale edits and untracked selected audit. Used red/green regression tests for valid legacy-history retry custody and unavailable IPC main-frame identity. Updated one general IPC test event to supply a matching frame after the stricter boundary exposed its incomplete fixture.
- Reproduced and fixed the 390 px mobile sidebar width defect, then adjusted History search/filter and Privacy controls found by the same eight-tuple History/Privacy capture. The capture script now records limited geometry failures, actual browser version, and pending human review rather than unearned PASS statements.
- Changed esbuild's override to npm's `$esbuild` reference. A disposable direct-dependency update resolved without `EOVERRIDE`; the committed lockfile was not regenerated.
- Cleared 128 standard i18n errors with nine translated UI strings and exact locale-specific technical-value approvals. At the user's direction, filled 594 `__MISSING__` values using existing translations, first-pass translation, and focused manual corrections. Preserved interpolation and product/transport tokens; strict structural verification passes. Qualified language review is still required and production-complete flags remain false.
- Replaced four pre-existing `ZXQ`/`ZXQPH` translation artifacts in Spanish/Swedish copy and added a red/green verifier test so such artifacts fail i18n checks. Updated the Superdesign source fingerprint after changing the tracked sidebar source.
- Built unsigned macOS arm64 DMG/ZIP and ran packaged Electron smoke. No commit, push, signing, notarization, funded provider call, or human per-tab sign-off was performed.

### 2026-09-24 — Application/repository audit and remediation handoff

- Reviewed the current source/IPC/persistence/UI/CI architecture and all four GitHub workflows; produced `docs/audits/Records/2026-09-24-application-repository-audit-handoff.md` and registered it in `docs/DOCS_INDEX.md`. This is point-in-time evidence; unfinished work is in `docs/ROADMAP.md`.
- Reproduced a shared mobile shell defect with eight History/Privacy Chrome captures and an independent DOM measurement: closed drawer position is relative, width 288 px, and main width 102 px in a 390 px viewport. Traced the CSS rule and missing geometry assertion.
- Traced valid legacy conversation migration through save failure, source relocation, and UI result handling; audited the main-frame IPC option and its security tests; verified the capture tool's unconditional review claims; corroborated Dependabot's esbuild failure with hosted run data and a disposable npm manifest outside the repository.
- Ran full local CI, macOS arm64 packaging, and packaged Electron smoke. Preserved pre-existing locale edits and the untracked prior audit draft. No application code, commit, push, or release was made.

### 2026-09-24 — Audit handoff reconciliation

- Verified repository identity and remote `main` at `56924240509f8580b9cee5d9ef31202d35439908`, Node `v22.15.0`, npm `10.9.2`, package `3.1.0`, and the dirty user-owned locale/audit state before editing.
- Rechecked the six headline audit findings against the current checkout. Five are stale as written; the security-document finding is superseded by a policy conflict between the selected audit and the current implementation/tests. Corrected a separately verified MIT label in `docs/design/REPOSITORY_TREE.md`.
- Resolved three audit verification items by static evidence: `verify:i18n-hardcoded-regressions` is part of `verify:contracts:static`, and `.github/workflows/ci.yml` runs `verify:contracts`; `@testing-library/dom` is in `devDependencies`; Playwright is installed and imported by current smoke tests.
- Preserved all existing locale edits and the untracked audit handoff. No commit, push, release, or runtime safety change was made.

### 2026-09-23 — Roadmap compaction and remaining-risk closeout

- Archived the previous session ledger and reduced `docs/ROADMAP.md` to current unfinished work.
- Recorded the IPC registrar check and the single border-token definitions.
- External acceptance items stay open. Details and commands are in the validation matrix below.

## Open TODO Ledger

* **GRAPHITE-COCKPIT-UI-2026-09-26** — Completed. Full UI re-envisioning to Graphite Cockpit Flat Instrumentation, Stitch MCP design system sync, and component refactor on branch `feature/graphite-cockpit-redesign`. 100% contracts and UI test suites green.
* **DOCS-AUDIT-CLEANUP-2026-09-26** — Completed. Full audit and cleaning of `docs/` directory. Synchronized versioning to v3.1.0, Node engine to 22.15.0, link labels, canonical paths, and roadmap SHAs. 100% verifiers green. Working tree uncommitted.
* **REPO-HYGIENE-2026-09-26** — Completed. Full review of `docs/repository-maintenance/`, `.gitignore` collision resolution (`.superdesign`), closed theme audit handoff relocation/rename to `docs/audits/Records/`, root clutter isolation (`.agent-backups/session-exports/`), and full static contract validation (28/28 checks PASS). Working tree uncommitted.
* **THEME-AUDIT-2026-09-25** — Completed. Full remediation of Waves 1 and 2 (19 P2 + 13 P3 findings) executed and verified in the local working tree (uncommitted). See Session History and Validation Matrix.
* **DIAGNOSTICS-CONNECTIVITY-2026-09-25** — Unconditional warning corrected locally with regression coverage. No commit/push performed.
* **THEME-OVERLAY-2026-09-25** — Awaiting affected theme names/screens or an overlay screenshot; tracked in `docs/ROADMAP.md`.

* **RESEARCH-RENDERING-2026-09-25** — Both reported UI defects corrected locally with failing-then-passing regressions. Manual Electron replay was not performed; existing project-wide open work stays in `docs/ROADMAP.md`.

* **FRAT-REAUD-2026-09-25** — FRAT-REAUD-001 through FRAT-REAUD-005 are present in the committed `1fb4849d` baseline. Hosted status for that SHA was not checked during the research UI session. FRAT-REAUD-006 (funded live Fraterna four-endpoint smoke) and FRAT-REAUD-007 (qualified native-language review) remain open in `docs/ROADMAP.md`.

* **FRATERNA-ROUTING-2026-09-25 (historical, superseded)** — Initial implementation evidence is preserved in Session History. Current status is the FRAT-REAUD entry above and `docs/ROADMAP.md`.

* **AUDIT-2026-09-24-APPLICATION** — Six evidence-backed items in the registered audit (`UX-P1-001`, `CI-P1-001`, `DATA-P2-001`, `SEC-P2-001`, `CI-P2-002`, `QA-P2-001`) have local remediations, focused validation, and regression tests committed. Headed human QA, signing, funded provider checks, and two-device sync remain separate external acceptance.

* **AUDIT-SAFETY-CONTRACT-2026-09-24** — Resolve the selected handoff's mandatory child-safety assertion against current Adult Mode behavior before changing safety enforcement or its documentation. See `docs/ROADMAP.md`.

* **AUDIT-I18N-WORKTREE-2026-09-24** — The 128 standard errors and 594 `__MISSING__` markers in the locale catalogs are resolved and committed; strict structural verification passes. Qualified native-language review remains `P3-020`.

* **REPO-MANAGEMENT-REAVALIDATION-2026-09-23** — Hygiene delta is in the worktree and uncommitted. Reports: `docs/audits/Records/2026-09-23-repository-audit.md`, `docs/audits/Records/2026-09-23-repository-hygiene-audit.md`, `docs/audits/Records/2026-09-23-repository-hygiene-final-report.md`.

* **ROADMAP-COMPACTION-2026-09-23** — Live roadmap and live ledger compacted. Prior ledger text is `docs/reports/historical/summary-of-work-before-2026-09-23.md`.

* **EXTERNAL-ACCEPTANCE** — `P2-016`, `P3-020`, and `VF-VERIFY-005` stay open. They are not local code defects. See `docs/ROADMAP.md`.

## Validation Matrix

### 2026-09-26 — Graphite Cockpit Flat Instrumentation UI re-envisioning & Stitch MCP synchronization

- Baseline: branch `feature/graphite-cockpit-redesign` at `3087051b`; Node `v22.15.0`; npm `10.9.2`; package `3.1.0`. All 15 canonical tabs and 4 legacy aliases verified.
- `npm run lint:eslint` — PASS (0 errors, 0 warnings across all files).
- `npm run typecheck` — PASS (0 errors across `tsconfig.json`, `tsconfig.electron.json`, `tsconfig.electron.test.json`).
- `npm run build` — PASS (web, server, and Electron bundles built in 1.48s).
- `npm run verify:contracts` — PASS (all static, feature, and release contracts passed; 104/104 checks passed).
- `npm run verify:safety-guard` — PASS (passed).
- `npm run verify:markdown-links` — PASS (451 Markdown files checked, 0 broken links).
- `npm run test:ui:media` — PASS (82/82 gallery tests, 54/54 image tests, 136 tests passed).
- `npm run test:ui:layout` — PASS (19/19 files, 120/120 tests passed).
- `npm run test:ui:chat` — PASS (12/12 files, 115/115 tests passed).
- `npm run test:ui:settings` — PASS (passed).
- `npm run test:workflow:ui` — PASS (passed).
- `npm run test:unit:theme` — PASS (14/14 files, 788/788 tests passed).
- `npm run verify:superdesign-init` — PASS (source fingerprint updated to `2af15d2f2972c880`).
- Out of scope: manual Electron QA, live provider calls. Working strictly on branch `feature/graphite-cockpit-redesign`.

### 2026-09-26 — repository-wide documentation review, updating, and cleaning across docs/

- Baseline: `main` at `3087051bb793498b29855edd17620aa694457b27`; Node `v22.15.0`; npm `10.9.2`; package `3.1.0`. Preserved pre-existing user-owned working tree modifications in `docs/design/*.md`, `docs/repository-maintenance/*.md`, `docs/DOCS_INDEX.md`, and `.gitignore`.
- `npm run verify:contracts:static` — PASS (all 28 static contract checks passed: lockfile, identity, roadmap, release metadata, bundle budget, safety guard, markdown links, repo handoff hygiene, theme tokens, meteocon CSP, network boundaries, custom protocol privileges, venice API docs, venice contract drift, CI contract, agent docs, superdesign init, image policy, work orders, no native dialogs, inactive feature archive, provider adapters, i18n, i18n hardcoded regressions, IPC parity, prompt language, transitive deprecations, theme collisions).
- `npm run verify:markdown-links` — PASS (448/448 markdown files checked, 0 broken links or anchors).
- `npm run verify:agent-docs` — PASS (passed).
- `npm run verify:roadmap-current` — PASS (passed).
- `npm run verify:release-metadata` — PASS (passed, stack facts verified).
- `npm run verify:repo-handoff-hygiene` — PASS (passed).
- `npm run verify:archive-clean` — PASS (passed).
- `npm run typecheck` — PASS (0 errors across app, electron, electron.test).
- `npm run lint:eslint` — PASS (0 errors, 0 warnings across `src`, `electron`, `server.ts`, `scripts`).
- `rm -f docs/.DS_Store` — PASS (untracked metadata purged).
- Out of scope: manual Electron QA, live provider calls. No commit, push, or release performed.

### 2026-09-26 — repository-maintenance review and repository hygiene execution

- Baseline: `main` at `3087051bb793498b29855edd17620aa694457b27`; Node `v22.15.0`; npm `10.9.2`; package `3.1.0`. Preserved pre-existing user-owned working tree modifications in `docs/design/*.md` and `docs/summary_of_work.md`.
- `npm run verify:contracts:static` — PASS (all 28 static contract checks passed: lockfile, identity, roadmap, release metadata, bundle budget, safety guard, markdown links, repo handoff hygiene, theme tokens, meteocon CSP, network boundaries, custom protocol privileges, venice API docs, venice contract drift, CI contract, agent docs, superdesign init, image policy, work orders, no native dialogs, inactive feature archive, provider adapters, i18n, i18n hardcoded regressions, IPC parity, prompt language, transitive deprecations, theme collisions).
- `npm run verify:archive-clean` — PASS (archive exclusion config and tracked files clean).
- `npm run verify:repository-identity` — PASS (git mode).
- `npm run verify:repo-handoff-hygiene` — PASS (clean).
- `npm run verify:markdown-links` — PASS (448/448 markdown files checked, 0 broken links or anchors).
- `npm run verify:agent-docs` — PASS (passed).
- `npm run verify:superdesign-init` — PASS (source fingerprint d0da102d82865bb1).
- `node scripts/clean-release-staging.cjs` — PASS (idempotent, safe release check).
- `git ls-files -c -i --exclude-standard` — PASS (0 tracked files ignored).
- `git ls-files | grep -E '[^a-zA-Z0-9._/-]'` — PASS (0 non-ASCII or unescaped filenames).
- Out of scope: manual Electron QA, headed visual QA, live provider calls. No commit, push, or release performed.

### 2026-09-25 — docs/design review and synchronization to current app status

- Baseline: `main` at `3087051bb793498b29855edd17620aa694457b27`; Node `v22.15.0`; npm `10.9.2`; package `3.1.0`.
- `npm run verify:agent-docs` — PASS.
- `npm run verify:markdown-links` — PASS (442 Markdown files checked, 0 errors).
- `npm run verify:contracts:static` — PASS (all 28 static contract verifiers passed).
- `npm run lint:eslint` — PASS (0 errors, 0 warnings across `src`, `electron`, `server.ts`, `scripts`).
- `npm run typecheck` — PASS (0 errors across `tsconfig.json`, `tsconfig.electron.json`, `tsconfig.electron.test.json`).
- `npm run test:unit:theme` — PASS (14/14 test files, 787/787 tests passed).
- `npm run test:contracts` — PASS (28/28 test files, 304/304 tests passed).
- Out of scope: manual Electron QA, headed visual QA, live provider calls. No commit, push, or release performed.

### 2026-09-25 — Theme Engine & Theme System exhaustive audit remediation (Waves 1 & 2)

- Baseline: `main` at `8ee5ddd2a14691739d5bfda7c3759a06ce352b66`; Node `v22.15.0`; npm `10.9.2`; package `3.1.0`. Worktree carried pre-existing user-owned audit files; preserved.
- `npm run lint:eslint` — PASS (0 errors, 0 warnings across `src`, `electron`, `server.ts`, `scripts`).
- `npm run typecheck` — PASS (0 errors across `tsconfig.json`, `tsconfig.electron.json`, `tsconfig.electron.test.json`).
- `npm run test:electron` — PASS (113/113 test files, 1,299/1,299 tests passed, 77.35s).
- `npm run test:server` — PASS (102/102 tests passed).
- `npm run test:unit:theme` — PASS (14/14 test files, 787/787 tests passed).
- `npm run test:contracts` — PASS (28/28 test files, 304/304 tests passed).
- `npm run test:character-cards` — PASS (8/8 test files, 79/79 tests passed).
- `npm run test:ingestion` — PASS (12/12 test files, 117/117 tests passed).
- `npm run verify:theme-tokens` — PASS (202 files scanned for forbidden hardcoded classes; 589 files scanned for token resolvability).
- `npm run verify:theme-collisions` — PASS (24 registry-relevant documents checked; 24 intentional dual-variant V2 overrides recognized; 0 collisions).
- `npm run verify:markdown-links` — PASS (442 Markdown files checked).
- `npm run verify:contracts` — PASS (all static, feature, and release contracts passed; 104/104 checks passed).
- `npm run verify:contracts:static` — PASS (all 28 static contract verifiers passed).
- `npm run verify:roadmap-current` — PASS.
- `npm run build` — PASS (web, server, and Electron bundles all succeed and stay within chunk size limits).
- Not run: manual Electron QA, headed visual QA, live provider calls, hosted CI/CodeQL checks for uncommitted changes. No commit, push, or release performed.

### 2026-09-25 — Theme Engine & Theme System exhaustive audit (audit-only)

- Baseline: `main` at `8ee5ddd2a14691739d5bfda7c3759a06ce352b66`; Node `v22.15.0`; npm `10.9.2`; package `3.1.0`. Worktree carried only pre-existing user-owned audit files; preserved.
- `npm run test:unit:theme` — PASS (10 files, 313 tests).
- `npx vitest run tests/theme tests/csp/inlineStyleInvariant.test.ts tests/accessibility/theme-focus.test.ts electron/services/themeService.test.ts --no-file-parallelism` — PASS (8 files, 48 tests).
- `npm run verify:theme-tokens` — PASS (202 files scanned); audit finding THEME-P2-015 confirms this verifier cannot detect undefined consumed tokens.
- `npm run lint:eslint` — PASS (0 errors, 0 warnings).
- `npx tsx` probes (`/tmp/themeAudit*.ts`, `/tmp/themeMatrix*.ts`, scratch only): all 43 built-ins schema-valid; round-trip value-stable; placeholder AA failures 37/43 dark + 15/43 light; contrast parser alpha/8-digit defects; security probes rejected; fallbacks deterministic.
- Parent `rg`/source verification of every P2 claim (App.tsx:221, ThemeMaker.tsx:551-573, themeService.ts:124-125, config/themes/copper.yaml, undefined `--color-bg-primary`, dist `max-w-*` absence, single point-in-time `prefers-color-scheme` read, zero change listeners).
- `npm run verify:markdown-links` — FAIL (1 issue): pre-existing broken link at `docs/DOCS_INDEX.md` to `audits/VENICE_FORGE_FRATERNA_POST_IMPLEMENTATION_AUDIT_AGENT_HANDOFF_2026-09-25.md`, caused by the pre-existing user-owned move of that file to `docs/audits/Records/` before this session; left untouched per user-owned-state rules. `npm run verify:roadmap-current` and `npm run verify:agent-docs` — PASS.
- Not run: `npm run typecheck`, full `npm test`, `npm run build`, `npm run ci`. Not performed: manual Electron QA, headed visual/accessibility QA, live OS-appearance toggle, hosted CI/CodeQL inspection for `8ee5ddd2`. No commit/push/release.

### 2026-09-25 — Diagnostics connectivity correction

- Root/branch/Node assertions passed; package `3.1.0`, Node 22, declared Node/npm engines unchanged. Baseline `dde601f9cadf3d4d25b3772af9d3a6fb0ffeaf6b` was clean.
- Initial diagnostics regression: expected 1 failure, 27 passes (live success incorrectly remained warn).
- `npx vitest run src/services/diagnosticsService.test.ts src/stores/status-store.test.ts src/components/status/DiagnosticsDrawer.test.tsx --no-file-parallelism` — PASS (50 tests, 3 files).
- `npm run typecheck` — PASS on final code. Initial typecheck caught an out-of-namespace translation key; moved the reused label into the required diagnostics namespace.
- `npm run verify:i18n` and `npm run verify:i18n-hardcoded-regressions` — PASS; existing missing-marker warnings remain, zero hardcoded-string regressions.
- Focused ESLint and `npm run verify:superdesign-init` — PASS; fingerprint unchanged.
- Full CI, full repository suite, live provider calls, manual Electron/theme replay, and hosted checks not run. Theme reproduction remains pending user detail.

### 2026-09-25 — Research output and scrape-click correction

- Baseline: clean `main` at `1fb4849d4da6d35350cb6a5fbbdf2607fb0599cd`; Node `v22.15.0`, npm `10.9.2`, package `3.1.0`.
- Red regression: `npx vitest run src/components/search/SearchScrapeView.test.tsx --no-file-parallelism` — expected 2 failures, 3 passes; reproduced the scrape `.trim` rejection and missing synthesized answer.
- `npx vitest run src/components/search src/research/agent/researchSynthesis.test.ts --no-file-parallelism` — PASS (18 tests across 4 files).
- `npm run typecheck` — PASS across all three TypeScript projects. The first run caught an unsupported `exact` option in the new test selector; removed it and reran typechecking and all 18 focused tests successfully.
- `npm run verify:agent-docs`, `npm run verify:markdown-links`, and `git diff --check` — PASS.
- Focused ESLint on the three changed source/test files — PASS. `npm run verify:superdesign-init` — PASS; tracked source fingerprint unchanged.
- Not run: full CI, full repository tests, paid/live provider replay, manual Electron QA, hosted CI/CodeQL. No publication performed.

### 2026-09-25 — Fraterna routing re-audit remediation (uncommitted)

- Baseline: `main` at `86b5580503e9b36746bac7a1b63d9602e49baea1`, clean before edits; Node `v22.15.0`, npm `10.9.2`, package `3.1.0`. `git ls-remote origin refs/heads/main` matched the baseline. GitHub CI run `36204271635` and CodeQL run `36204271633` each completed successfully for that baseline only.
- Red regressions: initial focused run failed in the expected provider moderation, Retry-After fallback, and route-neutral error cases (9 failures); web runtime route tests failed in the expected missing-endpoint/hydration cases (2 failures); unsupported caller `safe_mode` test failed before stripping that field. The first `npm run ci` stopped at one stale `normalizeError(500)` test expectation in `src/services/veniceClient.test.ts`, then the assertion was updated.
- `npx vitest run tests/safety/veniceSafeMode.test.ts electron/services/veniceClient.adapters.test.ts electron/services/veniceClient.retryAfter.test.ts electron/services/guardPipeline.test.ts src/services/veniceClient/errors.test.ts src/services/veniceClient.web.test.ts src/services/desktopBridge.test.ts src/components/settings/PrimaryApiRoutePanel.test.tsx src/services/diagnosticsService.test.ts src/hooks/use-models.test.tsx server.test.ts --no-file-parallelism` — PASS (287/287 tests across 12 files, before the final unsupported-field test). Final focused safety/client rerun — PASS (57/57 tests across 2 files).
- `npm run ci` — PASS on final code: lint, three TypeScript projects, segmented `test:ci`, both npm audits (0 vulnerabilities), web/server/Electron build, static/feature/release contracts, and `verify:dist`. Electron suite: 1,297/1,297 tests; server suite: 102/102 tests. An Electron test emitted `[shutdown] sync cleanup failed: journal write failed` without failing the suite.
- `npm test` — PASS (7,141 passed, 4 skipped; 589 passing files, 2 skipped files). `npm run verify:agent-docs`, `npm run verify:roadmap-current`, `npm run verify:markdown-links`, `npm run verify:i18n`, and `npm run verify:i18n-hardcoded-regressions` — PASS. The i18n verifier reports 165 allowed `__MISSING__` warnings for native-review debt; no new hardcoded-string regressions.
- Not run: funded Fraterna live calls, manual headed UI QA, hosted CI/CodeQL for these uncommitted edits, signing/notarization, and two-device sync. No commit or push was performed.

### 2026-09-25 — Copilot instruction refresh

- `npm run verify:agent-docs` — PASS.
- `git diff --check` — PASS.
- Broad test/build suites — not run; this was a documentation-only update.

### 2026-09-25 — Code-review corrections to FRATERNA routing implementation

- `npx vitest run src/shared/primaryApiRoute.test.ts electron/services/providerAdapters.test.ts electron/services/veniceClient.adapters.test.ts electron/services/veniceClient.test.ts electron/services/veniceClient.error.test.ts electron/services/veniceClient.retry.test.ts electron/services/veniceClient.stream.test.ts electron/services/veniceClient.multipart.test.ts electron/services/veniceClient.sseParser.test.ts electron/services/providerSettingsStore.test.ts electron/ipc/handlers.test.ts server.test.ts src/stores/settings-store.test.ts src/hooks/use-models.test.tsx --no-file-parallelism` — PASS (381 tests across 13 files; includes the new `[FRATERNA-201]` priority-order test that confirms explicit `provider:foo:bar` bypasses Fraterna).
- `npm run lint:eslint` — PASS (0 errors / 0 warnings).
- `npm run typecheck` (3 projects) — PASS.
- `node scripts/verify-network-boundaries.cjs` — PASS (canonical hosts and the dedicated Fraterna-host rule; updated to `fraterna.ai`).
- `node scripts/verify-venice-contract-drift.cjs` — PASS.
- `node scripts/verify-provider-adapters.cjs` — PASS.
- `node scripts/verify-ipc-parity.cjs` — PASS.
- `node scripts/verify-i18n.cjs --allow-missing-markers --allow-key-name-fallbacks` — PASS.
- `node scripts/verify-hardcoded-strings.cjs --baseline config/i18n-hardcoded-baseline.json --no-regressions` — PASS.
- `node scripts/verify-repository-identity.cjs` — PASS.
- `node scripts/verify-roadmap-current.cjs` — PASS.
- `node scripts/verify-safety-guard.cjs` — PASS.
- `node scripts/verify-venice-api-docs.cjs` — PASS.
### 2026-09-25 — Fraterna primary API routing post-implementation audit remediation

- `npm run lint:eslint` — PASS (0 errors, 0 warnings across src, electron, server.ts, scripts).
- `npm run typecheck` — PASS (app, electron, electron.test).
- `npm run test:server` — PASS (101/101 tests passed).
- `npm run test:electron` — PASS (113/113 test files, 1,292/1,292 tests passed).
- `npx vitest run src/components/settings/PrimaryApiRoutePanel.test.tsx` — PASS (8/8 tests passed).
- `npx vitest run src/hooks/use-models.test.tsx` — PASS (8/8 tests passed, including centralized multi-hook concurrent reset test).
- `npx vitest run electron/ipc/handlers/apiKeyHandlers.routeConnectivity.test.ts` — PASS (10/10 tests passed).
- `npx vitest run tests/safety/guardPipeline.test.ts` — PASS (46/46 tests passed, including `/images/generations` safety coverage).
- `npm run verify:contracts` — PASS (104/104 contract invariant checks passed).
- `npm run verify:agent-docs` — PASS.
- `npm run verify:markdown-links` — PASS (446 Markdown files checked).
- `npm run verify:i18n` — PASS (12 locales, 12 namespaces; sentinel, missing-marker, and key-name-fallback aware).
- `npm run verify:i18n-hardcoded-regressions` — PASS (0 regressions).
- `npm run build` — PASS (client, server, and electron bundles).
- `git status --short` — working tree contains remediations for FRAT-AUD-001 through FRAT-AUD-009; no commit, push, or release performed.

### 2026-09-25 — Fraterna primary API routing implementation

- `npx vitest run src/shared/primaryApiRoute.test.ts --no-file-parallelism` — PASS (9 tests).
- `npx vitest run electron/services/providerSettingsStore.test.ts --no-file-parallelism` — PASS (8 tests, 4 new for `primaryApiRoute` persistence).
- `npx vitest run electron/services/providerAdapters.test.ts --no-file-parallelism` — PASS (56 tests, 5 new for `resolvePrimaryApiRouteForRequest`).
- `npx vitest run src/hooks/use-models.test.tsx --no-file-parallelism` — PASS (6 tests, 1 new for primary-route cache invalidation).
- `npx vitest run server.test.ts --no-file-parallelism` — PASS (124 tests, 2 new for the env-driven selector and the upstream-host override).
- `npx vitest run electron/services/veniceClient*.test.ts electron/services/providerAdapters.test.ts electron/ipc/handlers.test.ts electron/services/providerSettingsStore.test.ts src/stores/settings-store.test.ts src/hooks/use-models.test.tsx src/services/diagnosticsService.test.ts src/shared/primaryApiRoute.test.ts server.test.ts --no-file-parallelism` — PASS (1,802 tests across 103 files in the touched scopes).
- `npm run lint:eslint` — PASS (0 errors / 0 warnings).
- `npm run typecheck` (3 projects) — PASS.
- `node scripts/verify-i18n.cjs --allow-missing-markers --allow-key-name-fallbacks` — PASS (12 locales, 12 namespaces; sentinel, missing-marker, key-name-fallback aware).
- `node scripts/verify-network-boundaries.cjs` — PASS (canonical hosts and the dedicated Fraterna-host rule).
- `npm run verify:contracts:static` (25 verifiers: lockfile, repository-identity, roadmap-current, release-metadata, bundle-budget, safety-guard, markdown-links, repo-handoff-hygiene, theme-tokens, meteocon-csp, network-boundaries, custom-protocol-privileges, venice-api-docs, venice-contract-drift, ci-contract, agent-docs, superdesign-init, image-policy, work-orders, no-native-dialogs, inactive-feature-archive, provider-adapters, i18n, i18n-hardcoded-regressions, ipc-parity, prompt-language, transitive-deprecations) — PASS.
- `node scripts/verify-hardcoded-strings.cjs --baseline config/i18n-hardcoded-baseline.json --no-regressions` — PASS (0 regression(s)).
- `git status --short` — the FRATERNA worktree is uncommitted (expected; no commit/push/release authority was granted).
- Not run (out of scope for this session, no commit/push/release authority granted): full `npm run build`, full `npm run ci`, full `npm test`, hosted CI / CodeQL / release evidence — those remain in `VF-VERIFY-005`.

### 2026-09-24 — Pre-push validation and publication to main

- `npm run verify:safety-guard` — PASS.
- `npm run verify:markdown-links` — PASS (443 files checked).
- `npm run verify:contracts` — PASS (all static, feature, and release packaging contracts).
- `npm run lint:eslint` — PASS (0 errors, 0 warnings).
- `npm run typecheck` — PASS (app, electron, electron.test).
- `npm test` — PASS (588 test files, 7,055 tests passed).
- `npm run test:electron` — PASS.
- `npm run test:server` — PASS (92 tests passed).
- `npm run test:ingestion` — PASS (12 test files, 117 tests passed).
- `npm run build && npm run verify:dist` — PASS (web, server, and Electron bundles verified).
- `npm run ci` — PASS (full gate and dist verification).
- `git diff --check` — PASS (0 whitespace errors).
- `npm run verify:archive-clean`, `npm run verify:superdesign-init`, `npm run verify:i18n`, `npm run verify:roadmap-current`, and `npm run verify:repo-handoff-hygiene` — PASS.
- Hosted CI run `36082441197` — PASS, 11/11 jobs (`windows-sensitive-tests`, `contracts`, `lint-and-typecheck`, `unit-and-integration-tests`, `macos-sensitive-tests`, `coverage`, `script-coverage`, `build`, `electron-smoke-windows`, `electron-smoke-macos`, `electron-smoke-linux`), SHA `107e6e12`.
- Hosted CodeQL run `36082441227` — PASS, Analyze actions and Analyze javascript-typescript, SHA `107e6e12`.
- Local `HEAD` matches `origin/main` at `107e6e12a75aa5bc119b633d4117939b90339cb4`.

### 2026-09-24 — Audit remediation and first-pass locale completion

- `npm ci` — PASS (857 packages; zero reported vulnerabilities).
- Focused `electron/services/conversationVault.test.ts` and `electron/ipc/handlers/common.security.test.ts` — PASS (52 tests); general `electron/ipc/handlers.test.ts` — PASS (89 tests) after updating its main-frame fixture.
- Focused Sidebar, Privacy, reference-viewport, and History tests — PASS (56 tests across five files).
- `npm run lint:eslint`, `npm run typecheck`, and `npm run verify:lockfile` — PASS on the remediation worktree before the final locale-only changes; aggregate CI reruns these checks.
- `npm run verify:i18n` — PASS after the initial 128-error correction. `node scripts/verify-i18n.cjs --strict` — PASS after filling all 594 markers; 12 locales and 12 namespaces.
- `npx vitest run scripts/i18n-tooling.test.ts --no-file-parallelism` — PASS (16 tests) after a red test demonstrated that token artifacts were previously accepted. `npm run verify:superdesign-init` — PASS after refreshing the sidebar source fingerprint.
- History/Privacy automated capture — PASS across 8 desktop/mobile and en-US/ar tuples after layout corrections; this is not human visual, keyboard, or screen-reader acceptance.
- `npm run dist:mac:arm64` — PASS after the final locale edits; unsigned DMG/ZIP and checksums generated. The packaged `app.asar` contains the final zh-CN Settings copy. `npm run smoke:electron` — PASS against that package, 3 files / 8 tests. Signing and notarization were not performed.
- Initial full `npm run ci` after locale work — FAIL at `verify:superdesign-init` because the tracked sidebar change invalidated the source fingerprint; all preceding CI stages passed. After refreshing it, the settled-worktree `npm run ci` — PASS through lint, typecheck, segmented tests, dependency audits, build, contracts, release checks, and `verify:dist`.
- `npm run verify:roadmap-current` and `npm run verify:repo-handoff-hygiene` — PASS after the final documentation update.
- `git diff --check` — PASS. No hosted run exists for these uncommitted edits.

### 2026-09-24 — Application/repository audit

- `npm audit --json` — PASS, zero reported vulnerabilities.
- `npm run ci` — FAIL at `verify:i18n` with 128 errors from the pre-existing locale edits. Lint, typecheck, segmented tests, dependency audits, and build ran before that failure.
- `npm run verify:contracts:features` — PASS when run separately after the aggregate stop (chat, image, workflow, RP, research, settings, backup/sync).
- `npm run verify:contracts:release` — PASS, 104 release-packaging checks.
- `npm run dist:mac:arm64` — PASS; unsigned arm64 DMG/ZIP and checksums generated.
- `npm run smoke:electron` — PASS, 3 test files / 8 tests against the packaged executable.
- `npm run verify:dist:mac` — FAIL because the full macOS verifier requires an x64 DMG and this session built only arm64. This does not establish a defect in the arm64 package.
- `npm run verify:per-tab-acceptance` — FAIL, 0/2,700 signed state evaluations; automated screenshots are not human review.
- Focused Chrome capture — 8 History/Privacy tuples completed. Independent 390 px DOM measurement showed sidebar width 288 px and main width 102 px. No screen-reader or qualified visual sign-off claimed.
- Hosted CI and CodeQL — PASS at exact HEAD; older Dependabot esbuild run 35999725421 — FAIL at dependency resolution.

### 2026-09-24 — Audit handoff reconciliation

- `npm ci` — PASS (857 packages added; npm audit reported 0 vulnerabilities).
- `npm run lint:eslint` — PASS.
- `npm run typecheck` — PASS.
- `npm test` — PASS (586 files / 7,048 tests passed; 2 files / 4 tests skipped).
- `npm run build` — PASS (web, server, and Electron bundles).
- `npm run verify:agent-docs`, `npm run verify:markdown-links`, `npm run verify:release-metadata`, `npm run verify:i18n-hardcoded-regressions`, `npm run i18n:verify-hardcoded`, and `npm run verify:safety-guard` — PASS on the current worktree.
- `npm run verify:roadmap-current` and `npm run verify:repo-handoff-hygiene` — PASS after the handoff update.
- `npm run verify:i18n` — FAIL (128 unapproved untranslated-English errors, 594 warnings in the pre-existing locale edits); no locale files were changed by this session.
- `git diff --check` — PASS after the design-tree correction.
- Hosted CI run `36064443092` and CodeQL run `36064443001` — PASS for exact HEAD `56924240`; these runs do not cover the current uncommitted locale edits.
- `npm run ci`, runtime UI QA, platform packaging, and live-provider checks — not run in this session.

### 2026-09-23 — Roadmap compaction and remaining-risk closeout

- Hosted CI run `35957327247` — PASS, 11/11 jobs, SHA `6747b0ad`.
- Hosted CodeQL run `35957327282` — PASS, Analyze actions and Analyze javascript-typescript, SHA `6747b0ad`.
- Local `HEAD` matches `origin/main` at `6747b0ad`.
- `npm ci`, `npm run lint:eslint`, `npm run typecheck`, `npm test`, `npm run build` — not run. This pass did not change application source.
- `npm run verify:markdown-links` — PASS (441 files).
- `npm run verify:repository-identity` — PASS.
- `npm run verify:roadmap-current` — PASS.
- `npm run verify:repo-handoff-hygiene` — PASS.
- `npm run verify:agent-docs` — PASS.

### 2026-09-23 — Repository-management revalidation

- `npm run verify:markdown-links` — PASS (440 files) before this compaction.
- `npm run verify:repository-identity` — PASS.
- `npm run verify:roadmap-current` — PASS.
- `npm run verify:repo-handoff-hygiene` — PASS.
- `npm run verify:image-policy` — PASS.
- `npm run verify:agent-docs` — PASS.
- `git check-ignore -v out/foo` — PASS.
