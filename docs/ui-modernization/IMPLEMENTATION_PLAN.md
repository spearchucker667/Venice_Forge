# UI Modernization Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for bounded implementation and review. Work exclusively on local `main`; the coordinator owns staging, commits, and publication.

**Goal:** Complete the user-approved incremental UI modernization with verified theme compatibility and honest runtime acceptance.

**Architecture:** Preserve ThemeFamily v2, the centralized resolver, CSS variables, Tailwind v4, and desktop bridge. Extend existing components and validated persistence without replacing the frontend or changing provider behavior.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vite 8, Electron 43; Node 22.15.0/npm 10.9.2.

**Spec:** User-approved design of 2026-09-14, recorded below. The original full UI work order supplies screen coverage and acceptance requirements.

## Approved design

Retain ThemeFamily v2 and both authored variants. Add only bounded optional presentation controls with safe defaults. Consolidate semantic surfaces, spacing, typography, controls, elevation, static meshes, and restrained motion. Preserve streaming, background tasks, scroll regions, focus, and transport boundaries. Theme tools must preview before applying, preserve metadata, handle conflicts and persistence failures, and protect unsaved edits. Acceptance includes automated checks and actual application inspection; unexecuted checks remain explicitly unverified.

## Global constraints

- Preserve unrelated video pricing edits and all existing user work.
- No inline JSX styles, relaxed CSP, new styling framework, provider calls, credentials, or private paths in artifacts.
- Current schema stays version 2 with backward-compatible optional fields only.
- Tests sharing globals run serially. Node must satisfy `>=22.15.0 <23.0.0`.
- Existing reports are inherited claims until reproduced; roadmap remains the sole project-wide work ledger.

## Task 1: Import, export, and persistence contract

Files: `src/theme/yaml/{parse,validate,normalize,serialize}.ts`, theme tests, `electron/services/themeService.ts`, IPC theme handlers, `src/theme/applyTheme.ts`.

- [x] Reproduce unknown-version, metadata round-trip, unsafe ID, and two-variant bootstrap cases.
- [x] Reject unsupported explicit schema versions and cyclic documents before normalization. Keep valid legacy import paths.
- [x] Preserve author, description, aliases, both variants and code overrides through deterministic export and trusted persistence.
- [x] Ensure canonical family lookup precedes lossy legacy custom projections during bootstrap.
- [x] Run theme and Electron persistence regressions serially (101/101 tests pass).

## Task 2: Visual foundation and shared components

Files: `src/styles/{theme,components,accessibility}.css`, `src/components/ui/`, top-level shell and workspace wrappers, `tests/theme/`, `tests/accessibility/`.

- [x] Inventory current surfaces and inherited CSS changes before editing.
- [x] Unify motion, spacing, radius, elevation, semantic controls, responsive panel behavior; avoid broad blur and transition-all rules.
- [x] Provide reduced-motion/transparency and forced-color fallbacks; preserve focus and pointer targets.
- [x] Validate shared interaction behavior and CSP/theme contracts (39/39 tests pass).

## Task 3: Theme editor interaction safety

Files: `src/components/ThemeMaker.tsx`, `ThemePreview.tsx`, their tests and locale catalogs.

- [x] Verify duplicate/reset/save/import flows against both variants and failure paths.
- [x] Preview imported themes without changing the active theme before confirmation.
- [x] Guard unsaved edits and expose meaningful reset labels and validation messages.
- [x] Preserve state until persistence succeeds; prevent built-in replacement and accidental name collisions.
- [x] Run focused editor tests (54/54 pass) and localization checks (`verify:i18n-hardcoded-regressions` clean).

## Task 4: Workspace audit and runtime acceptance

Files: existing `docs/ui-modernization/` reports and workspace views.

- [x] Inventory every registered route, shared dialog/menu/editor surface, hardcoded styles and responsive constraints.
- [x] Document Agent modal accessibility: converted New Document and New Working Group modals to `AccessibleDialog`.
- [x] History folder context menu: added Escape dismissal, initial button focus, ARIA menu/menuitem semantics, and viewport edge clamping.
- [x] Mobile sidebar isolation: added `invisible pointer-events-none` when collapsed on mobile (`< md`) to prevent offscreen keyboard tab traversal; added Escape dismissal.
- [x] Compact workspace layouts: added responsive vertical stacking and list scroll containment on `SceneComposerView.tsx`, `ImageInspectorView.tsx`, `PromptLibraryView.tsx`, `CharacterChatsView.tsx`, and `playground-view.tsx`.
- [x] Palette de-hardcoding: eliminated hardcoded amber/rose/emerald classes across RP Studio hydration banner, Playground, Character Creator, and Gallery.
- [x] Reconcile evidence in `VISUAL_QA.md`, `ACCESSIBILITY_REVIEW.md`, and `PERFORMANCE_REVIEW.md`.

## Task 5: Validation and publication

- [x] Run full validation battery: `npm run lint:eslint`, `npm run typecheck`, focused vitest shards, `npm run build:web`, `verify:theme-tokens`, `verify:i18n-hardcoded-regressions`, `verify:markdown-links`.
- [x] Update all eight requested reports with current facts, supported example theme, compatibility matrix, and honest limitations.
- [x] Update `docs/summary_of_work.md`, `docs/ROADMAP.md`, and `docs/DOCS_INDEX.md` without absorbing unrelated work.
- [ ] Staged commit and push on `main` held pending explicit user authorization per AGENTS.md policy.

## Execution record

- Baseline `db028726bf308a37a764d1c9dc5ef31613f4d7ad`. Existing modernization and separate video-pricing changes were uncommitted at entry.
- Ruling: Use installed Node 22.15.0 from `.nvmrc`; no dependency-contract downgrade.
- Ruling: Preserve schema v2 and existing architecture; unrelated video pricing files stay outside task staging.
- All 5 tasks executed and verified locally.
