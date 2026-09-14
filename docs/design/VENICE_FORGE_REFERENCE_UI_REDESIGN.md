# Venice Forge — Reference-Driven UI Redesign

> **Status:** APPROVED direction (2026-09-14) — pending phased implementation.
> **Authority:** Work order "Complete Reference-Driven UI Redesign" (2026-09-14).
> **Baseline:** `b5760db2dad215385fbdf27659bc8395222b3ddc` on `main`.
> **Companion ledger:** `VENICE_FORGE_REFERENCE_UI_REDESIGN_MATRIX.md` (completeness proof, §27 of the work order).
> **Supersedes:** nothing — the Theme Engine V2 contracts (`docs/ui-modernization/THEME_SYSTEM.md` role: `docs/design/THEME_SYSTEM.md`) remain authoritative for theme mechanics; this document is authoritative for the visual/material redesign layered on top of them.

---

## 1. Reference analysis

Reference asset: `Screenshot_20260914-132444.png` (1536×1291, SHA-256 `971b87b9b854025be0a8560f3366cc83f5be4e1d544c977b54ffb28d5d8f8e24`), uploaded to the Superdesign project as reference node `76159e6f-1357-4037-b099-5ee43bab619b`. The image is a perspective photograph of a dark technical control surface; the redesign adopts its **visual grammar**, not its literal content:

- near-black graphite layered surfaces (`#050505` / `#111014` / `#19181C` / `#212025` / `#333036`);
- three-zone shell: dense left navigation rail | large framed central workspace | optional right utility stack;
- thin cool-gray separators, low radii (6–10 px), elevated panels separated by value + border rather than large shadows;
- restrained crimson illumination (`#EF555F`/`#F65964` family, bloom `rgba(246,89,100,0.20–0.42)`) used **as state** — active nav rail, selection, progress, alerts, chart traces — never as decoration;
- dark inset content canvases with faint data-grid lines; subtle static grain;
- compact technical typography; small but readable (never shrunk below accessible minimums to imitate the photo);
- charts/graphs recede: graphite canvas, faint grid, muted series, one accent-hot current trace.

## 2. Approved visual contract (Superdesign)

Project `50e9d3b6-0d15-4340-8672-f378572d35ec` (canvas: https://superdesign.dev/teams/8158753b-7152-486e-af21-774029691843/projects/50e9d3b6-0d15-4340-8672-f378572d35ec).

| Surface | Current baseline | **Approved direction** |
|---|---|---|
| App shell (Sidebar + Header) | `ac4383cc-a940-4ee6-ac00-b509234672a5` | **`33368bdb-4d5e-438a-bdae-9913b93718d1`** |
| Chat | `f597fcd8-dbc2-4165-b59c-5692008b8b55` | **`33d6ac04-e982-4a4d-97c5-f2dcfbb712ed`** |
| Settings / Theme Maker | `2a805d6a-8e53-4beb-a608-9865aa0928b8` | **`93d23773-babd-4249-a8b3-faef475066e6`** |
| Status | `2f7b9d9f-c2c5-4924-b306-e660042fc037` | **`8faeedd3-9fee-4e42-9d12-75f593af073f`** |

These four drafts are the canonical visual contract for the global rollout (work order §6.6 approval gate passed 2026-09-14).

## 3. Architecture decision: derived material layer (Option A)

The theme engine is preserved byte-for-byte. The new material language is a **derived CSS-variable layer** in `src/styles/theme.css`, computed with `color-mix()` from the semantic tokens `applyTheme` already writes (`--bg`, `--surface`, `--surface-elevated`, `--surface-muted`, `--border`, `--border-strong`, `--accent`, `--accent-hover`, `--foreground`, `--foreground-muted`):

```text
--vf-shell-bg            (deepest graphite: darker than --bg via color-mix toward black)
--vf-shell-bg-deep       (app window base)
--vf-panel-bg            (raised working surface)
--vf-panel-bg-raised     (cards, controls)
--vf-panel-bg-inset      (editors, canvases, code surfaces)
--vf-panel-border        (1px cool-gray hairline)
--vf-panel-border-hot    (selected/active border)
--vf-panel-highlight     (top inner highlight)
--vf-grid-line           (data-grid hairlines)
--vf-accent-glow         (color-mix(in oklab, --accent 20–42%, transparent))
--vf-accent-glow-strong  (focused critical controls)
--vf-control-hover       (one tonal step)
--vf-control-active      (selected wash)
--vf-noise-opacity       (theme-aware grain, static only)
```

Rules:

- **No raw reference hexes in components.** The default Venice dark variant's *token values* retune toward graphite-neutral + crimson (`--accent` family → `#EF555F`-ish); every other family keeps its hue and inherits the new geometry/material automatically.
- **Light variants are first-class**: same hierarchy inverted (near-white shell, slightly darker insets, restrained borders, accent-derived focus, very subtle grain). No fake dark overlay.
- The `THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR` marker contract and `verify:theme-tokens` remain in force; the audit in work order §28 (pre-baseline: 39 raw colors / 1272 arbitrary values / 168 large radii-shadows / 449 mesh-glass usages) must not grow.

Implementation note: tokens live in the Tailwind v4 `--color-vf-*` namespace so utility classes (bg-vf-panel-bg, border-vf-panel-border, …) generate automatically; the design names map 1:1.

## 4. Shell contract

Existing structure retuned, not rebuilt (`src/App.tsx` keeps its three-zone composition):

- **Root canvas:** predominantly flat graphite; `AppMeshOverlay` becomes a static grain + extremely subtle vignette layer (`pointer-events: none`, `aria-hidden`, non-selectable, theme-aware opacity, no animated noise, no large radial clouds).
- **Sidebar** (`src/components/layout/sidebar.tsx`): dark shell distinct from workspace; thin separator; group headings as subdued uppercase micro-labels; selected item = accent wash + 3px luminous left rail + higher-contrast icon/label (no pills); hover = one tonal step. Resize (220–480px), collapsed 60px rail, and mobile `md` drawer contracts preserved exactly (test-asserted).
- **Header** (`src/components/layout/header.tsx`): ~52px near-black chrome, thin lower separator, controls inset one tonal step, compact task badge, technical model selector, non-dominating API-key status.
- **Right utility rail:** one shared `UtilityRail`/`UtilityRailSection` primitive adopted by InspectorPane, DiagnosticsDrawer, TaskCenterDrawer, and workspace property panes. Each keeps its own feature — shared visual grammar only.
- **Responsive:** ≥1280px three-zone; mid-width rail collapses/overlays; mobile drawer behavior preserved; no horizontal overflow.

## 5. Component language

Evolve the canonical primitive set (`src/components/ui/primitives.tsx`); migrate `shared.tsx` consumers; remove the duplicated `Card`/`EmptyState`. New shared primitives (only where ≥2 substantial surfaces consume them):

`ShellPanel`, `PanelHeader`, `PanelSection`, `InsetCanvas`, `UtilityRail`/`UtilityRailSection`, `StatusRow`, `MetricStrip`, `DenseListRow`, `InspectorCard`, `AccentProgress`, `DataGridSurface`.

Component rules: 1px semantic borders; radii 6–10px; panels separated by value + border, minimal shadow; buttons compact with glow only on hover/focus/active; inputs dark inset with accent focus border + 2px accessible focus ring; tabs flat with active indicator (no pills); badges keep semantic tones (crimson is accent, not the universal status color); tables dense with strong selected row; modals framed panels with compact footers; tooltips near-black and compact.

## 6. Workspace rollout

Phases per work order §34: (1) material foundation → (2) global shell → (3) Chat family (chat, character-chats, history) → (4) Generate family (image, media, image-inspector, prompts, scenes, audio, music, video, embeddings, search, characters) → (5) Build family (character-creator, rp-studio, workflows, documents, playground) → (6) System family (privacy, settings, Theme Maker, status) → (7) global overlays (API key dialog, onboarding, first-run, command palette, toasts, modal-requests, master-password dialogs, drawers) → (8) accessibility/responsive/RTL pass → (9) visual QA theme matrix → (10) documentation cleanup.

Every view keeps its information architecture; charts/analytics appear only where quantitative data already exists (Status, Inspector, token meters, workflow execution). Code/syntax surfaces keep the complete `--code-*`/`--syntax-*` theme system; no hardcoded red syntax colors.

## 7. Accessibility, i18n, RTL

WCAG AA contrast on the retuned default + automated contrast checks for built-ins; visible focus; keyboard navigation; ARIA state semantics preserved; touch targets ≥28px for compact icon controls; reduced-motion honored (state color changes and progress semantics survive); 200% zoom usable. All new labels go through i18n (en-US canonical; de, pt-BR, ar verified); Arabic RTL: sidebar direction/spacing, panel headers, utility rail, sliders, tabs, popovers, dialog action layout — charts stay conventionally LTR.

## 8. Validation & acceptance

- Continuous: `npm run lint:eslint`, `npm run typecheck`, focused vitest, `verify:theme-tokens`, `verify:i18n`, `verify:i18n-hardcoded-regressions`.
- Pre-commit each phase: focused suites + `verify:workspace-contracts` (shell tests), theme matrix spot-check.
- Final: full `npm test`, `npm run verify:contracts`, `npm run build`, `npm run verify:dist`, plus work-order §33 screenshot matrix (default dark / light / alternate dark / RTL) with headed manual QA of every canonical tab.
- No verifier may be weakened to pass; no behavior changes (API shape, persistence, safety, media recovery, sync authority, secure storage are presentation-independent).

## 9. Out of scope / non-negotiable exclusions

No feature removal/rename; no Electron boundary changes (sandbox, contextIsolation, nodeIntegration:false, CSP, IPC validation, capability-token media URLs); no theme-engine replacement; no logo/icon replacement (real Venice assets only); no web fonts; no animated grain; no giant blur/glow fields; no fake analytics.
