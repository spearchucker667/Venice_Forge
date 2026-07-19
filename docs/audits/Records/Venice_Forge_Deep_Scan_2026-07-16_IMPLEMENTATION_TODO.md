# Venice Forge Deep Scan — Verification and Implementation Ledger

> Audit implementation evidence only. `docs/ROADMAP.md` remains the single authority for current work.

## Repository Baseline

- Repository: `/Users/super_user/Projects/Venice_Forge`
- Branch: `main`
- Starting commit: `1b5beff fix(perf): stabilize model status and chat streaming (VERIFY-138)`
- Package version: `3.0.0-beta.1`
- Node version: `v26.5.0` (outside the declared `>=22.13.0 <23.0.0` engine)
- npm version: `11.17.0`
- Working tree status: pre-existing deletions under the July 14/15 audit evidence folders plus untracked immutable audit source; preserved without reset, restore, stash, or deletion
- Audit source: `docs/audits/Venice_Forge_Deep_Scan_2026-07-16.md`
- Audit snapshot identity: `Venice_Forge-clean-20260716-013926.zip`
- Stack: Electron `^42.3.0`, React 19, TypeScript 5, Vite 7, Vitest 4, electron-builder 26
- Started: 2026-07-16
- Last updated: 2026-07-16
- Last completed validation command: `npm run verify:contracts` passed the full static, feature, and 103-check release contract suite after `npm run test:ci` passed 3,906 tests
- Next exact action: complete external signed/paid/two-device/accessibility/theme/sound/reduced-motion QA under `VF-VERIFY-005`; no automated deep-scan finding remains open

## Status Legend

- [ ] Not started
- [~] Investigating or implementation in progress
- [x] Verified and completed
- [!] Blocked
- [-] False positive, stale, duplicate, deferred, or accepted design

## Severity Summary (re-count after classification)

| Priority | Audit count | Confirmed | Fixed | Non-actionable | Blocked / Unverified |
|---|---:|---:|---:|---:|---:|
| P0 | 3 | 3 | 3 | 0 | 0 |
| P1 | 7 + QA | 6 | 6 | 1 | 0 |
| P2 | 8 | 5 | 5 | 3 | 0 |
| P3 | 4 | 2 | 2 | 2 | 0 |

## Finding Inventory

### P0 Findings

- [x] VF-2026-0716-001 — Partial model catalogs produce false global status warnings
- [x] VF-2026-0716-002 — Typed model fetches clear the canonical cross-modality cache
- [x] VF-2026-0716-003 — Profile deletion leaves profile-scoped Conversation Vault data

### P1 Findings

- [x] VF-2026-0716-004 — Canonical documentation gate is broken
- [x] VF-2026-0716-005 — Version and release-readiness statements are inconsistent
- [x] VF-2026-0716-006 — Privacy, sync, and export documentation contradict current behavior
- [x] VF-2026-0716-007 — Required sync documentation is missing
- [x] VF-2026-0716-008 — Workflows UI does not match the advertised visual canvas
- [-] VF-2026-0716-009 — Full test feedback is not bounded or reliably completable
- [x] VF-2026-0716-010 — Renderer IndexedDB encryption boundary is under-explained
- [!] Required packaged, paid-provider, sync, accessibility, theme, sound, and reduced-motion QA

### P2 Findings

- [x] VF-2026-0716-011 — Report governance creates multiple current authorities
- [x] VF-2026-0716-012 — Likely orphaned production modules and compatibility shims
- [-] VF-2026-0716-013 — Generation-animation replacement is incomplete
- [-] VF-2026-0716-014 — Mesh and gradient design adoption is incomplete
- [x] VF-2026-0716-015 — Archive Orphans action cannot execute
- [x] VF-2026-0716-016 — Provider catalog is broader than implemented adapters
- [-] VF-2026-0716-017 — Large monolithic modules increase regression and responsiveness risk
- [x] VF-2026-0716-018 — Header model-fetch strategy is inconsistent or wasteful

### P3 Findings

- [-] VF-2026-0716-019 — Duplicate agent/editor rule files
- [-] VF-2026-0716-020 — Agent guide is hard-coded to one local machine path
- [x] VF-2026-0716-021 — Root debug probes remain in the clean snapshot
- [x] VF-2026-0716-022 — README terminology can reintroduce image-tool confusion

## Release Acceptance Gates

- [ ] Clean dependency installation succeeds under the declared Node 22 engine
- [x] Typecheck succeeds
- [x] Lint succeeds
- [x] Production build succeeds
- [x] Static contracts succeed
- [x] Aggregate feature/release contracts succeed
- [x] Bundle budget succeeds
- [x] All required automated shards produce conclusive summaries
- [ ] Packaged and external QA is completed or explicitly classified as blocked/unverified

## Issue Records

### VF-2026-0716-001

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: A typed catalog load can make valid selections in unloaded modalities appear unavailable.
- Audit evidence anchors: audit lines 130-190; `use-models.ts`, `diagnosticsService.ts`, `header.tsx`, runtime store
- Files inspected: `src/hooks/use-models.ts`; `src/stores/model-catalog-runtime-store.ts`; `src/services/diagnosticsService.ts`; related tests
- Symbols or line ranges: `useModels`; `markReady`; `buildModelStatus`
- Reproduction steps: publish a text-only live catalog, retain a saved image selection, compute app status
- Commands executed: focused Vitest batch; typecheck; ESLint
- Observed result: pre-fix diagnostics compared the image selection to a text-only global ID union and warned
- Root cause: runtime state had no authoritative per-type completeness and diagnostics validated indiscriminately
- Decision: track per-type IDs, loaded types, and per-type status; validate only authoritative modalities
- Files changed: runtime store, model hook, diagnostics service, model service, tests
- Tests added or updated: partial-load diagnostics; typed completeness; cached stale state
- Focused validation: final 5-file run passed 38/38
- Regression validation: `npm run typecheck` and `npm run lint:eslint` passed
- Acceptance criteria: unloaded modalities are unknown, loaded modalities authoritative, cached data stale
- Completion evidence: focused Vitest, renderer/Electron typecheck, and zero-warning ESLint all exited 0
- Remaining risks: live provider behavior remains covered by mocked deterministic responses
- Related findings: 002, 018

### VF-2026-0716-002

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: Typed model fetches clear unrelated canonical metadata.
- Audit evidence anchors: audit lines 193-233; `modelCatalogCache.ts:3-8`; `use-models.ts`
- Files inspected: cache, hook, legacy model service, pricing/capability lookup callers
- Symbols or line ranges: `replaceCanonicalModels`; new `mergeCanonicalModels`
- Reproduction steps: load text, then image, then inspect both IDs; refresh text and inspect stale text ID
- Commands executed: focused Vitest batch; typecheck; ESLint
- Observed result: pre-fix `replaceCanonicalModels` cleared the map on every typed request
- Root cause: complete and typed responses shared one destructive replacement operation
- Decision: retain atomic full replacement and add type-owned scoped replacement
- Files changed: cache, hook, model service, cache/hook tests
- Tests added or updated: text→image preservation; typed replacement; complete replacement
- Focused validation: final 5-file run passed 38/38
- Regression validation: `npm run typecheck` and `npm run lint:eslint` passed
- Acceptance criteria: unrelated metadata survives typed loads; full catalog replaces atomically
- Completion evidence: cache and hook regressions passed within the 38-test focused run
- Remaining risks: none identified in deterministic cache contract
- Related findings: 001, 018

### VF-2026-0716-003

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: Renderer profile deletion does not remove the profile-scoped main-process Conversation Vault.
- Audit evidence anchors: audit lines 235-289; `profilePurge.ts`; `conversationVault.ts`; `ProfilePanel.tsx`; Electron IPC/preload
- Files inspected: renderer purge/store/UI; preload/types/bridge; system IPC; Conversation Vault/write queue; secure store
- Symbols or line ranges: `purgeProfileData`; `deleteProfile`; `purgeMainProfileData`; `purgeProfileConversationVault`; `profile:purge`
- Reproduction steps: create default/work vault records, purge work, verify default remains and work cannot rehydrate
- Commands executed: focused 7-file Vitest; typecheck; ESLint
- Observed result: renderer omitted the vault and provider-key calls omitted target profile; no main transaction existed
- Root cause: profile lifecycle authority stopped at renderer-reachable stores while vault ownership moved to main process
- Decision: active-session-bound main transaction with per-store results; retain metadata on partial failure
- Files changed: vault/write queue, new main purge service, IPC/preload/types/bridge, renderer purge/store/UI, tests
- Tests added or updated: default/traversal rejection, isolation, idempotency, redaction, session authority, retry retention
- Focused validation: 153/153 passed
- Regression validation: renderer/Electron typecheck and zero-warning ESLint passed
- Acceptance criteria: typed, idempotent, isolated main-process purge with redacted structured results
- Completion evidence: targeted work vault is removed, default vault survives, second purge is idempotent, partial cleanup retains metadata
- Remaining risks: signed packaged secure-storage deletion remains part of manual release QA
- Related findings: 006, 010

### VF-2026-0716-004

- Status: Verified and completed
- Classification: PARTIALLY CONFIRMED
- Audit claim: `DOCS_INDEX.md` links a missing session-history archive and blocks contract gates.
- Audit evidence anchors: audit lines 291-320
- Files inspected: docs index, canonical report index, roadmap, file tree, roadmap verifier/test, retained archive
- Symbols or line ranges: current-work routing and `EVIDENCE_PATH`
- Reproduction steps: run markdown verifier, then static contracts after link repair
- Commands executed: `npm run verify:markdown-links`; focused roadmap-verifier tests; `npm run verify:contracts:static`
- Observed result: named archive exists; live failures were three links into pre-existing user-deleted July 14/15 audit folders plus a hard-coded verifier path
- Root cause: documentation authority moved but indexes/verifier still required deleted evidence folders
- Decision: route to immutable July 16 audit/evidence ledger and keep roadmap authoritative; do not restore user deletions
- Files changed: docs indexes, roadmap/file tree, roadmap verifier
- Tests added or updated: existing `VERIFY-107` suite rerun against new canonical evidence path
- Focused validation: markdown links 85 files; roadmap verifier 5/5
- Regression validation: complete static contract chain passed, including provider adapters 36/36
- Acceptance criteria: markdown, static, and aggregate contract gates pass
- Completion evidence: markdown and static contracts exit 0
- Remaining risks: aggregate feature/release contracts not yet rerun
- Related findings: 005, 006, 007, 011

### VF-2026-0716-005

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: machine-readable, UI, legal, release, and historical version/readiness claims drift.
- Audit evidence anchors: audit lines 322-350
- Files inspected: `package.json`; summary ledger
- Symbols or line ranges: see Batch Disposition Evidence
- Reproduction steps: version/readiness phrase sweep
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: see Batch Disposition Evidence below
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: one current version truth and snapshot-bound historical claims
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: see Batch Disposition Evidence below
- Related findings: 004, 006, 007, 011

### VF-2026-0716-006

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: privacy language conflates portable JSON, encrypted backup, sync-folder replication, diagnostics, and hosted sync.
- Audit evidence anchors: audit lines 352-383
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: see Batch Disposition Evidence below
- Reproduction steps: reconcile UI actions and data paths against active docs
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: see Batch Disposition Evidence below
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: five export/sync boundaries described accurately
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: see Batch Disposition Evidence below
- Related findings: 003, 005, 007, 010, 011

### VF-2026-0716-007

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: five named sync documents are absent.
- Audit evidence anchors: audit lines 385-419
- Files inspected: baseline docs index only
- Symbols or line ranges: see Batch Disposition Evidence below
- Reproduction steps: inventory existing sync documentation before creating anything
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: avoid duplicates; create only distinct missing roles
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: distinct privacy, troubleshooting, architecture, testing, and provider-interface coverage
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: see Batch Disposition Evidence below
- Related findings: 004, 005, 006, 011

### VF-2026-0716-008

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: routed workflow templates do not match the advertised React Flow visual canvas.
- Audit evidence anchors: audit lines 421-457
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: `WorkflowTemplatesView`; canvas reachability; `@xyflow`
- Reproduction steps: see Batch Disposition Evidence below
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: explicit restore-canvas or templates-only product direction required
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: routed UI, docs, schema, dependency, and tests agree
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: product decision may require user authority
- Related findings: 012

### VF-2026-0716-009

- Status: Non-actionable after live timing
- Classification: STALE / ALREADY FIXED
- Audit claim: serial full-test feedback exceeded audit time bounds and lacked conclusive completion.
- Audit evidence anchors: audit lines 459-495
- Files inspected: package script inventory; Vitest config and segmented scripts
- Symbols or line ranges: segmented test scripts
- Reproduction steps: measure shards and slow files with bounded timing
- Commands executed: see Batch Disposition Evidence below
- Observed result: current summary ledger records a later successful 3,913-test `test:ci`, so staleness must be assessed
- Root cause: see Batch Disposition Evidence below
- Decision: measure before changing architecture
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: named bounded shards and conclusive aggregate summary without exclusions
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: runtime mismatch may distort timings
- Related findings: 017

### VF-2026-0716-010

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: docs overstate renderer IndexedDB encryption versus compromised-renderer access.
- Audit evidence anchors: audit lines 497-514
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: see Batch Disposition Evidence below
- Reproduction steps: compare key lifecycle and main-process vault boundary to docs
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: document threat boundary without removing encryption or breaking migrations
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: offline-at-rest and renderer-compromise boundaries are distinct
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: see Batch Disposition Evidence below
- Related findings: 003, 006

### VF-2026-0716-011

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: reports/audits create multiple apparent current authorities.
- Audit evidence anchors: audit lines 516-539
- Files inspected: `docs/ROADMAP.md`; `docs/summary_of_work.md`; `docs/DOCS_INDEX.md`
- Symbols or line ranges: authority banners/index routing
- Reproduction steps: inventory active/current wording
- Commands executed: see Batch Disposition Evidence below
- Observed result: canonical roadmap rule exists; deleted audit evidence is pre-existing and must be preserved
- Root cause: see Batch Disposition Evidence below
- Decision: retain history with banners and one current-work hierarchy
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: no competing current-work authority
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: user-owned deletions may be an in-progress governance change
- Related findings: 004-007

### VF-2026-0716-012

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: production modules and compatibility shims may be unreachable.
- Audit evidence anchors: audit lines 541-576
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: audit-named modules in Batch Disposition Evidence
- Reproduction steps: TypeScript-aware static/dynamic reachability and build inspection
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: remove only confirmed dead code and measure bundle impact
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: every removal has reachability proof
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: dynamic registries and preload IPC can hide reachability
- Related findings: 008, 017

### VF-2026-0716-013

- Status: Classified and documented
- Classification: INTENTIONAL / ACCEPTED DESIGN
- Audit claim: generation loading-animation replacement is incomplete.
- Audit evidence anchors: audit lines 578-602
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: see Batch Disposition Evidence below
- Reproduction steps: inventory semantic generation/loading states
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: enforce a semantic loading-system contract, not blanket GIF replacement
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: consistent accessible reduced-motion-aware generation state
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: headed visual QA required
- Related findings: 014

### VF-2026-0716-014

- Status: Classified and documented
- Classification: INTENTIONAL / ACCEPTED DESIGN
- Audit claim: mesh/gradient structural surface adoption is inconsistent.
- Audit evidence anchors: audit lines 604-626
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: see Batch Disposition Evidence below
- Reproduction steps: token and component inventory plus visual QA
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: preserve control borders and focus affordances
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: structural and control surface rules are tokenized and accessible
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: visual QA
- Related findings: 013

### VF-2026-0716-015

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: “Archive Orphans” is advertised but cannot execute.
- Audit evidence anchors: audit lines 628-643
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: see Batch Disposition Evidence below
- Reproduction steps: invoke action path and inspect mutation handler
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: rename analyze-only or implement safe preview/confirm archival
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: label and executable behavior agree
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: destructive operations require isolation proof
- Related findings: none

## Batch Disposition Evidence

| Finding | Evidence, correction, and validation |
|---|---|
| `005` | Active version drift was confirmed. `AGENTS.md`, legal/about/config docs, README badge, and in-app About now source or match `package.json` `3.0.0-beta.1`; `verify:release-metadata` and its 2 tests pass. Historical 2.1.x snapshots remain snapshot-bound. |
| `006` | Privacy/export ambiguity was confirmed. Root/detailed privacy, About, backup/sync, and security docs now distinguish redacted JSON, encrypted `.vfbackup`, encrypted user-selected sync folders, and safe diagnostics; third-party folder providers receive ciphertext only. Markdown, release metadata, typecheck, and lint pass. |
| `007` | Missing roles were confirmed. Added `docs/privacy.md`, `docs/sync-troubleshooting.md`, and the repository-convention paths `docs/DEVELOPMENT/sync-{architecture,testing,provider-interface}.md`; indexed all five. WebDAV/S3 adapters and live key rotation remain explicitly deferred. |
| `008` | Mismatch confirmed. Chose templates-only for the Workflows tab, renamed it Workflow Templates, corrected README/About copy, removed unreachable `workflows-view.tsx`, and retained `@xyflow` because Playground/engine use it. Workflow 104+12 tests, navigation 39 tests, typecheck, and lint pass. |
| `009` | Stale on the live tree. `/usr/bin/time -p npm run test:ci` completed 3,906 tests with zero failures in 174.76 seconds. `docs/DEVELOPMENT/testing.md` records shard timings and 120-second/300-second escalation bounds without weakening isolation. |
| `010` | Documentation gap confirmed. Root/detailed privacy, security model, and sync threat model now state that the renderer-held non-extractable Web Crypto key resists casual offline inspection but remains usable by compromised renderer-origin code; the main-process OS-backed vault is a stronger boundary. Existing formats remain unchanged. |
| `011` | Multiple-authority wording confirmed. Canonical report/index wording now limits current authority to ROADMAP, summary, DOCS_INDEX, and policy; dated reports carry historical snapshot banners. Markdown and static governance contracts pass. |
| `012` | Reachability scan confirmed all named candidates were production-unreachable; test-only imports were removed with their dead units. Removed 18 source/test files including the orphan canvas. Typecheck, lint, production build, and bundle budget pass. Bundle size did not materially change because Vite already tree-excluded them. Compatibility shims with live verifier/entrypoint roles were retained. |
| `013` | Accepted semantic design after inventory. Long provider/generation work uses the generation indicator; compact list/metadata loads may keep accessible spinners/text; destructive/security/error states remain static. `LOADING_AND_SURFACE_CONTRACT.md` locks reduced-motion and usage rules; headed QA remains external. |
| `014` | Accepted semantic design. Structural separations use mesh/soft separators while interactive controls retain visible tokenized borders/focus/error rings. The new design contract records this distinction; theme-token verifier passes. 100/200/400% headed visual QA remains external. |
| `015` | Confirmed and corrected. The dry-run item is now non-destructive “Analyze Orphan References,” says no records change, and retains a disabled preview-only affordance. Storage-maintenance tests pass. |
| `016` | Partially implemented provider surface confirmed but already fail-closed. Deferred descriptions now say “Not implemented. No credentials or requests are accepted”; removed three unreachable placeholder modules. Provider focused tests 21/21 and adapter contracts 36/36 pass. |
| `017` | No measured runtime defect reproduced, so broad splitting is deferred. `performance-baselines.md` records current line counts, ~499.55/490.72 KiB main chunks, existing `VERIFY-138` render fixtures, and the profiling matrix required before a coupling-reducing refactor. Build/budget pass. |
| `019` | Stale/already fixed. Agent/editor files are thin AGENTS pointers; `verify:agent-docs` prevents drift. Duplicate branding notices are intentional source/public packaging copies. Agent-doc and handoff verifiers pass. |
| `020` | Accepted design for this maintainer repository. The user-supplied project rules explicitly require the canonical local-root bootstrap and forbid changing it; hosted CI never receives the absolute-path assertion. Repository-identity and agent-doc verifiers pass. |
| `021` | Confirmed. Reachability search found no source/script/workflow/package/test/doc references; deleted `debug-webcrypto.cjs` and `test_playwright.js`. Archive-clean passes and the closed roadmap item was removed. |
| `022` | Confirmed. README now says “Model-aware generation, prompt enhancement, image editing, background removal, and API-compliant 2x/4x upscaling,” eliminating obsolete enhancer-control ambiguity. Markdown and release metadata gates pass. |

## External QA Disposition

Classification: **UNVERIFIED — REQUIRES MANUAL OR PAID QA**. Signed/notarized macOS, signed Windows, live paid Venice/Jina/provider operations, two-machine third-party-folder sync, screen-reader/high-zoom, theme, sound/TTS/toast, and headed reduced-motion matrices require credentials, additional machines/platforms, or human sensory/accessibility review not available in this shell session. These remain open under `VF-VERIFY-005` in `docs/ROADMAP.md`; no automated pass is presented as a substitute.

### VF-2026-0716-016

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: configured provider catalog exceeds implemented adapters.
- Audit evidence anchors: audit lines 645-671
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: provider registry and adapters
- Reproduction steps: compare enabled providers to fail-closed adapter resolution
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: no fake availability; defer honestly unless roadmap authorizes implementation
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: every selectable provider has an adapter or explicit unavailable state
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: paid-provider QA
- Related findings: none

### VF-2026-0716-017

- Status: Classified with measured baseline
- Classification: DEFERRED BY PRODUCT SCOPE
- Audit claim: large monolithic modules pose regression and responsiveness risk.
- Audit evidence anchors: audit lines 673-708
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: audit-named modules in Batch Disposition Evidence
- Reproduction steps: collect bundle, render, and module-coupling baselines
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: no cosmetic split; refactor only measured bottlenecks
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: measured coupling or responsiveness improvement
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: profiling environment
- Related findings: 009, 012

### VF-2026-0716-018

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: Header requests all models when no header selector is rendered.
- Audit evidence anchors: audit lines 710-728; `header.tsx:39-43`
- Files inspected: header, tabs registry, use-models hook, header tests
- Symbols or line ranges: `hasOwnSelector`; `useModels`
- Reproduction steps: mount Header on Media/Video and inspect hook options
- Commands executed: initial focused Vitest batch; typecheck; ESLint
- Observed result: pre-fix no-selector and view-owned tabs invoked an enabled all-model query
- Root cause: hook call used `undefined` type instead of disabling query work
- Decision: keep hook order stable but pass typed fallback with `enabled: false`
- Files changed: header and header test
- Tests added or updated: explicit disabled-query assertion
- Focused validation: header assertion passed within the final 38/38 run
- Regression validation: `npm run typecheck` and `npm run lint:eslint` passed
- Acceptance criteria: no header catalog request unless a header selector is rendered
- Completion evidence: no-selector Header mount calls `useModels('text', { enabled: false })`
- Remaining risks: owning views retain their intentional typed requests
- Related findings: 001, 002

### VF-2026-0716-019

- Status: Non-actionable on live tree
- Classification: STALE / ALREADY FIXED
- Audit claim: agent/editor rule files are exact duplicates.
- Audit evidence anchors: audit lines 730-747
- Files inspected: root rule-file inventory
- Symbols or line ranges: `AGENTS.md`; `CLAUDE.md`; `GEMINI.md`; `.cursorrules`; `.windsurfrules`
- Reproduction steps: hash/compare and inspect verifier parity requirements
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: preserve tool discovery; use canonical source plus generated pointers or drift verifier
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: no silent drift and every tool still discovers rules
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: tool-specific pointer support
- Related findings: 020

### VF-2026-0716-020

- Status: Classified against explicit repository policy
- Classification: INTENTIONAL / ACCEPTED DESIGN
- Audit claim: local absolute root is embedded in the agent guide.
- Audit evidence anchors: audit lines 749-763
- Files inspected: `AGENTS.md`
- Symbols or line ranges: bootstrap block
- Reproduction steps: inspect repository identity verifier and fixtures before changing
- Commands executed: see Batch Disposition Evidence below
- Observed result: absolute bootstrap root is intentional under current supplied rules; classification see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: repository-relative discovery with optional maintainer root only if compatible with user rule
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: portable discovery without weakening identity protection
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: direct conflict with current explicit project rule may require accepted-design classification
- Related findings: 019

### VF-2026-0716-021

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: root debug probe scripts remain in the snapshot.
- Audit evidence anchors: audit lines 765-779
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: root probes named by the audit
- Reproduction steps: ownership/reachability/package inclusion scan
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: move or remove only after reachability and ownership proof
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: no accidental release inclusion
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: pre-existing user files
- Related findings: 012

### VF-2026-0716-022

- Status: Verified and completed
- Classification: CONFIRMED
- Audit claim: README image terminology can reintroduce obsolete endpoint/tool confusion.
- Audit evidence anchors: audit lines 781-797
- Files inspected: see Batch Disposition Evidence below
- Symbols or line ranges: see Batch Disposition Evidence below
- Reproduction steps: reconcile README language to live image API contracts
- Commands executed: see Batch Disposition Evidence below
- Observed result: see Batch Disposition Evidence below
- Root cause: see Batch Disposition Evidence below
- Decision: use terminology matching implemented API operations
- Files changed: see Batch Disposition Evidence below
- Tests added or updated: see Batch Disposition Evidence below
- Focused validation: see Batch Disposition Evidence below
- Regression validation: see Batch Disposition Evidence below
- Acceptance criteria: user-facing terms map unambiguously to implemented contracts
- Completion evidence: see Batch Disposition Evidence below
- Remaining risks: see Batch Disposition Evidence below
- Related findings: none
