# Venice Forge Theme Engine & Theme System — Exhaustive Audit Report

**Audit date:** 2026-09-25
**Audited commit:** `8ee5ddd2a14691739d5bfda7c3759a06ce352b66` (`main`, "Fix diagnostics API connectivity status")
**Package:** `venice-forge@3.1.0` · Node `v22.15.0` / npm `10.9.2` · Electron `^43.2.0` · React `^19.2.8` · Tailwind v4 · Zustand (persist → localStorage)
**Method:** Fact-driven repository audit per the 2026-09-25 agent handoff. Static analysis + executable probes (`npx tsx` against the real theme modules), six parallel read-only workstreams (persistence/runtime, Theme Maker UI, Electron integration, CSS token layer, component surfaces, tests/CI/docs), and parent-level verification of every high-severity claim. No repository files were modified; no manual Electron QA was performed.
**Worktree note:** Pre-existing user-owned changes (an audit doc moved to `docs/audits/Records/`, the untracked handoff) were preserved untouched.

---

## 1. Executive Summary

Venice Forge has **one authoritative, centralized, schema-safe theme engine** — Theme Engine V2 (`ThemeFamily`, `schemaVersion: 2`, dual light/dark variants). It is deterministic, persistence-safe, injection-resistant, and export/import round-trips value-stably across all 43 built-in themes. The core engine is **sound; no P0 or P1 defects were confirmed**.

The defects concentrate at the **consumption layer and the lifecycle edges**:

- **A large cluster of never-defined CSS tokens** (~40 utility classes + 5 legacy shadcn variables across ~20 files) silently disables hover feedback, focus borders, toggle "on" states, button styling, and width constraints — and the CI verifier cannot detect any of it.
- **Accessibility:** placeholder text fails WCAG AA in 37/43 dark variants and 15/43 light variants (including the default `venice` theme); the contrast calculator misparses alpha/8-digit hex.
- **Lifecycle edge cases:** the renderer hydration path never passes the custom-theme library (dead resolution branch), the pre-paint bootstrap theme covers only 4 hard-coded palettes, "system" appearance mode has no OS change listener, deleting an active YAML theme clobbers an unrelated legacy slot, and a shipped `copper.yaml` shadows its own built-in.
- **Documentation drift:** the published "authoritative" import/export example is rejected by the actual importer; one migration doc describes algorithms that do not exist.

Bottom line per the handoff's final standard: the engine is **deterministic, centralized, schema-safe, import/export-safe, and resilient to malformed state**; it is **not yet runtime-consistent or visually coherent across every surface** because token consumption outran token definitions, and its **accessibility and documentation** need correction.

**Severity tally:** P0: 0 · P1: 0 · P2: 19 · P3: 13.

---

## 2. Repository Baseline

| Item | Value |
|---|---|
| Commit / branch | `8ee5ddd2` / `main` (worktree dirty with pre-existing user-owned audit files) |
| Renderer | React 19.2.8, Vite, Tailwind CSS v4 (`@theme` token layer in `src/styles/theme.css`) |
| State | Zustand `venice-settings` store, persisted to per-profile localStorage via `createSafeStorage()` (`src/lib/safe-storage.ts`) |
| Styling | Tailwind v4 utilities mapped to CSS variables; three stylesheets: `theme.css`, `components.css`, `accessibility.css` |
| Theme engine | `src/theme/` — types, 43 built-in families, registry, resolver, applicator, migration, YAML pipeline, contrast |
| Electron | `electron/services/themeService.ts` (file layer), `configService.ts`, narrow IPC; **no `nativeTheme` usage anywhere** |
| Persistence | Renderer: localStorage (`selectedThemeId`, `appearanceMode`, `customTheme`, `customThemes`). Main: `config/themes/*.yaml`, `userData/themes/*.yaml`, legacy `themes.yaml` — atomic 0o600 writes |
| Editor | No Monaco/CodeMirror; code blocks = refractor highlighting themed via `--syntax-*`; KaTeX via `currentColor` |

---

## 3. Theme Architecture

Authoritative implementation map (verified against source):

```text
┌ Built-in families (43, src/theme/builtins/*.ts, DEFAULT = venice) ───────┐
│ Packaged YAML  config/themes/*.yaml ── 24 V1 + 21 flat (skipped)        │
│ Custom YAML    userData/themes/*.yaml (atomic, 0o600)                   │
│ Legacy merged  userData/themes.yaml                                     │
└──────┬──────────────────────────────────────────────────────────────────┘
       ▼  electron/services/themeService.ts  (scan, validate, watch)
IPC config:loadMergedThemes  ──►  config-store.yamlThemes (renderer)
       │
┌──────▼───────────────┐   registerBuiltinThemes() runs on module eval
│ themeRegistry        │   (builtIns / custom / yaml maps; precedence
│ src/theme/registry.ts│    YAML > custom > built-in; alias fallback)
└──────┬───────────────┘
       │
┌──────▼────────────────────────────────────────────┐
│ settings-store (Zustand → per-profile localStorage)│
│ selectedThemeId · appearanceMode · customTheme ·   │
│ customThemes (≤100)                                │
└──────┬────────────────────────────────────────────┘
       │ App.tsx effect (deps: selectedThemeId, customTheme,
       ▼  appearanceMode, yamlThemes)
resolveInitialTheme(bootstrap, yamlThemes)   applyTheme.ts:183-231
   order: YAML > id 'custom' > customThemes > customTheme
          > registry(+legacy-id migration) > light/default fallback
       ▼
resolveTheme(family, appearanceMode, systemMode?)   resolver.ts:14-35
   completeThemeTokens (36 tokens) + completeCodeThemeConfig
       ▼
applyTheme(resolved)   applyTheme.ts:56-148
   ~70 CSS vars on documentElement + dataset.themeMode
   + root.style.colorScheme + 'applyTheme:complete' event
       ▼
Tailwind v4 @theme aliases (--color-*) → utilities → components
   ChatMarkdown/refractor ← --syntax-* vars; KaTeX ← currentColor

Pre-paint: public/bootstrap-theme.js (index.html:14) reads
vf.theme.bootstrap — hardcoded palettes for venice/dracula/
gruvbox-dark/rosepine + customTheme tokens only.
```

**Single engine confirmed.** There is exactly one runtime theme system (V2). Legacy paths exist but are migration shims: legacy single-mode `Theme` objects are lifted to families via `legacyThemeToFamily`/`yamlThemeToFamily` (both duplicate the same tokens into both variants), and legacy ids are mapped by `migration.ts`. The only "second system" is the dead `config.yaml theme.active` key (displayed in ConfigPanel, never applied) — see §14.

---

## 4. Theme Lifecycle

Traced end-to-end; transition-by-transition verdict:

| Transition | Verdict | Notes |
|---|---|---|
| Definition → schema validation | OK | `validateThemeFamily` (JS) + `validateRawThemeYaml` (YAML). All 43 built-ins pass (probe). |
| YAML import → registry | OK w/ gaps | Strict allowlist (36 tokens/variant), color safety, dangerous-key rejection, 1 MiB cap. `protectedIds` never passed at production call sites (P3-026). |
| Registry → selector | OK | ThemeMaker lists built-ins + customs + YAML; precedence YAML > custom > built-in. |
| Selector → store | OK w/ defects | `customThemes` not subscribed by App (P2-003); "Custom Theme" entry never persisted (P2-006). |
| Store → persistence | OK | Sync localStorage writes, atomic per key; whole-blob write amplification (P3-030). Main YAML files atomic 0o600. |
| Startup → hydration | Defective | Pre-paint bootstrap partial (P2-004); post-paint hydration misses `customThemes` (P2-003). |
| Hydration → resolver | OK | Deterministic ordering; unknown ids fall back safely (probe-verified). |
| Resolver → CSS vars | OK | ~70 vars, `colorScheme` pinned, event dispatched. |
| CSS vars → components | Defective | ~40 dead utility classes + 5 undefined shadcn vars (P2-010…P2-013). |
| Theme switch at runtime | OK | Effect-driven re-apply; no rebuild; double-apply per ThemeMaker click (P3-030). |

No dropped/renamed values were found between schema, registry, resolver, and applicator for the 36-token contract; `applyTheme` maps all 36 tokens plus 8 code-surface and 25 syntax tokens.

---

## 5. Built-In Theme Inventory

43 families in `src/theme/builtins/` (41 in `BUILTIN_THEME_FAMILIES` order + `light`/`dark`); `DEFAULT_THEME_FAMILY = venice`. Every family carries both variants and passes `validateThemeFamily` with 36 valid colors per variant (probe). Export→import round-trip is value-stable for all 43 (both variants, code presets included — verified value-wise, key-order aside).

Per-theme matrix (placeholder contrast = `placeholder` vs `inputBackground`, WCAG AA ≥ 4.5):

| Theme | Canonical | Schema | Round-trip | PH dark | PH light | Notes |
|---|---|---|---|---|---|---|
| venice | dark | ✓ | ✓ | 4.32 ✗ | 3.43 ✗ | default family |
| dark | dark | ✓ | ✓ | 4.57 | 5.25 | cross-mode code preset (light variant uses 'dark' preset) |
| light | light | ✓ | ✓ | 4.57 | 6.23 | cross-mode code preset (dark variant uses 'light' preset) |
| obsidian-ember | dark | ✓ | ✓ | 3.08 ✗ | 4.65 | self-alias |
| midnight-cobalt | dark | ✓ | ✓ | 3.69 ✗ | 5.05 | self-alias |
| terminal-forest | dark | ✓ | ✓ | 3.06 ✗ | 4.21 ✗ | self-alias |
| porcelain-sky | light | ✓ | ✓ | 4.34 ✗ | 4.76 | self-alias |
| sandstone | light | ✓ | ✓ | 4.40 ✗ | 3.50 ✗ | self-alias |
| obsidian-bloom | dark | ✓ | ✓ | 4.19 ✗ | 4.99 | |
| harbor-fog | light | ✓ | ✓ | 4.35 ✗ | 3.52 ✗ | |
| circuit-mint | dark | ✓ | ✓ | 3.98 ✗ | 4.46 ✗ | |
| amber-archive | light | ✓ | ✓ | 4.44 ✗ | 3.27 ✗ | |
| neon-dusk | dark | ✓ | ✓ | 4.56 | 5.43 | |
| aurora-boreal | dark | ✓ | ✓ | 3.73 ✗ | 4.31 ✗ | |
| sakura-terminal | dark | ✓ | ✓ | 3.33 ✗ | 4.77 | |
| basalt-noir | dark | ✓ | ✓ | 3.80 ✗ | 4.65 | |
| solar-ash | light | ✓ | ✓ | 4.40 ✗ | 3.10 ✗ | |
| cyber-orchid | dark | ✓ | ✓ | 5.09 | 5.29 | |
| arctic-glass | light | ✓ | ✓ | 4.39 ✗ | 3.08 ✗ | |
| desert-copperfield | light | ✓ | ✓ | 4.36 ✗ | 3.07 ✗ | |
| toxic-limewire | dark | ✓ | ✓ | 3.81 ✗ | 4.45 ✗ | |
| midnight-velvet | dark | ✓ | ✓ | 4.18 ✗ | 5.13 | |
| porcelain-daybreak | light | ✓ | ✓ | 4.35 ✗ | 3.44 ✗ | |
| synthwave-harbor | dark | ✓ | ✓ | 4.08 ✗ | 5.15 | |
| moss-circuit | dark | ✓ | ✓ | 3.82 ✗ | 4.34 ✗ | |
| ember-monastery | dark | ✓ | ✓ | 3.85 ✗ | 4.63 | |
| glacial-ink | dark | ✓ | ✓ | 3.14 ✗ | 4.73 | |
| ultraviolet-rain | dark | ✓ | ✓ | 3.86 ✗ | 4.96 | |
| copper | dark | ✓ | ✓ | 4.57 | 4.78 | **shipped YAML V1 shadows this family (P2-009)** |
| dracula | dark | ✓ | ✓ | 3.95 ✗ | 4.79 | hardcoded in bootstrap |
| gruvbox-dark | dark | ✓ | ✓ | 3.06 ✗ | 4.46 ✗ | hardcoded in bootstrap |
| rosepine | dark | ✓ | ✓ | 3.07 ✗ | 4.98 | hardcoded in bootstrap |
| nord | dark | ✓ | ✓ | 3.21 ✗ | 4.74 | |
| tokyo-night | dark | ✓ | ✓ | 3.16 ✗ | 4.90 | |
| catppuccin | dark | ✓ | ✓ | 3.07 ✗ | 5.01 | |
| solarized | dark | ✓ | ✓ | 3.78 ✗ | 4.99 | |
| one-dark | dark | ✓ | ✓ | 3.28 ✗ | 4.69 | |
| monokai | dark | ✓ | ✓ | 3.08 ✗ | 4.37 ✗ | |
| github-light | light | ✓ | ✓ | 4.33 ✗ | 6.39 | |
| cotton-candy-console | light | ✓ | ✓ | 4.42 ✗ | 7.58 | self-alias |
| sweet-nightmare | dark | ✓ | ✓ | 6.10 | 4.80 | self-alias |
| dual-persona | light | ✓ | ✓ | 4.34 ✗ | 5.95 | self-alias |
| polaroid-board | light | ✓ | ✓ | 4.31 ✗ | 9.87 | self-alias |

Placeholder AA failures: **37/43 dark variants, 15/43 light variants** (see THEME-P2-002). Border-vs-background ratios sit at 1.31–1.50 across nearly all themes (WCAG 1.4.11 risk where a border is the only component indicator). Runtime visual testing was **not** performed; "Round-trip" here is the export→import value invariant.

---

## 6. Theme Token Inventory

**Contract:** `REQUIRED_THEME_TOKEN_KEYS` (`src/config/configSchema.ts:42-79`) — 36 camelCase keys = the union of 17 legacy (`background, surface, surfaceElevated, border, textPrimary, textSecondary, textMuted, accent, accentHover, accentForeground, success, warning, danger, info, focusRing, overlay, glow`) and 29 semantic tokens (10 overlapping names). `ThemeTokens` (`src/theme/themeTypes.ts`) is the same 36-key set. `completeThemeTokens()` derives semantic defaults from legacy inputs (e.g. `foreground ?? textPrimary`, `selectionBackground ?? accent`, `statusForeground = light ? #fff : background`).

Token coverage matrix:

| Token family | Schema | Built-ins | Custom import | CSS variable | Consumers | Status |
|---|---|---|---|---|---|---|
| 36 core tokens | ✓ 36-key allowlist | ✓ all 43 | ✓ required per variant | ✓ 1:1 in `applyTheme` map (`--bg`…`--glow`) | ✓ semantic utilities | OK |
| Code surface (8) | ✓ `CODE_SURFACE_TOKEN_KEYS` | ✓ | ✓ optional, allowlisted | ✓ `--code-*` | ✓ `ChatMarkdown`/theme.css | OK |
| Syntax (25) | ✓ `CODE_SYNTAX_TOKEN_KEYS` | ✓ 44 presets | ✓ optional, allowlisted | ✓ `--syntax-*` | ✓ refractor highlighter | OK |
| Legacy aliases | — | — | `text_*` trio **required** per variant | `--text-primary/-secondary/-muted` alias `--foreground*` | ✓ | Redundant strictness (P3-025) |
| `--app-mesh-opacity` | ✗ hardcoded by mode | — | not theme-controllable | set in `applyTheme.ts:97` | AppMeshOverlay | Not a token (relevant to THEME-OVERLAY-2026-09-25) |
| Ghost `vf-*`/`text-*`/`bg-*` names | ✗ | — | — | **never defined** | ~40 classes in ~20 files | **Defect cluster (P2-013)** |
| Legacy shadcn `--color-bg-primary/-secondary/-tertiary/-hover`, `--color-primary` | ✗ | — | — | **never existed** (git log -S: zero commits) | ProvidersPanel, PrimaryApiRoutePanel, ModelSelect | **Defect (P2-010/011)** |

Defined-but-unused (dead `@theme` output, ~24 tokens): `--color-bg-base/-raised/-overlay`, `--color-text-tertiary/-quaternary`, `--color-code-*` (4), `--color-glow`, `--color-link`, `--color-selection-bg/-fg`, `--color-surface-base`, `--color-surface-layer-0…-3/-overlay`, `--color-vf-panel-border-hot`, `--easing-*` (4, wrong namespace for v4 `ease-*`), `--motion-instant/-slow`, `--shadow-*` (3), `--space-panel`, `--width-narrow/-wide`. No runtime cost (Tailwind v4 emits only used tokens); maintainability debt only.

---

## 7. Confirmed Defects

Format per handoff §78. P0: none. P1: none.

### THEME-P2-001 — Contrast engine misparses alpha and 8-digit hex; corrupts warnings, mode inference, and flat-theme import

- **Severity:** P2 · **Confidence:** Confirmed (numerical probe)
- **Affected files/symbols:** `src/theme/contrast.ts:3-26` (`toRgb`, `luminance`, `contrastRatio`); consumers `src/components/ThemePreview.tsx:45-83`, `src/theme/yaml/legacy.ts:157`, `src/theme/codeSyntax.ts:66`
- **Observed:** `toRgb` only accepts `#rgb`/`#rrggbb` (regex `^#[0-9a-f]{3}(?:[6])?$` shape) — `#rrggbbaa` and `#rgba` return null → luminance 0. Modern `rgb(r g b / a)` partially matches (alpha silently ignored). Probe: `contrastRatio('#ffffff00','#ffffff')` (invisible text) = **21.00, no warning**; `#ffffffcc` on `#111111` = **1.11, spurious warning**. `parseFlatTheme` infers light/dark from `luminance(background)` → an 8-digit hex background always infers dark.
- **Expected:** Parsed alpha blended over the paired background, or contrast-restricted input formats.
- **Root cause:** Validator (`validateColor.ts`) accepts hex3–8/rgb/hsl/alpha and modern syntax; the contrast parser implements a narrower grammar.
- **Repro:** ThemePreview warning panel with an 8-digit-hex theme; or `npx tsx` probe above.
- **Recommended fix:** Extend `toRgb` to 4/8-digit hex and alpha-aware compositing over the compared background; add unit tests.
- **Validation:** `contrastRatio` unit tests for 8-digit hex and modern rgb; ThemePreview test asserting a warning for `#ffffff00`-on-white.
- **Regression risk:** Low — parser-only change; existing 6-digit paths unchanged.

### THEME-P2-002 — Placeholder text fails WCAG AA in most built-in variants (incl. the default theme)

- **Severity:** P2 (accessibility) · **Confidence:** Confirmed (computed, `contrastRatio`)
- **Affected files:** `src/theme/builtins/*` (37/43 dark variants, 15/43 light variants fail 4.5:1; venice dark 4.32, venice light 3.43); also `border` vs `background` ≈ 1.31–1.50 everywhere (1.4.11 non-text risk where borders are the sole component indicator)
- **Observed:** `placeholder` falls back to `foregroundSubtle ?? textMuted`, tuned for subtlety, not AA. Real failures listed in §5's matrix.
- **Expected:** Placeholder/input pairs meet 4.5:1 (placeholders are text); borders that identify components meet 3:1.
- **Recommended fix:** Re-tune `placeholder`/`textMuted` in failing variants toward their `inputBackground`; consider deriving `placeholder` from `inputBackground` + ratio floor in `completeThemeTokens` as a guardrail. Border tokens are a design decision — document or raise where they are the only component boundary.
- **Validation:** Script asserting `contrastRatio(placeholder, inputBackground) ≥ 4.5` per variant (probe exists in `/tmp/themeAudit.ts`); commit as a verifier or focused test after re-tuning.
- **Regression risk:** Visual change across most themes — needs a design pass, not a blind brightening.

### THEME-P2-003 — App hydration omits `customThemes`; `resolveInitialTheme` customThemes branch is dead in production

- **Severity:** P2 · **Confidence:** Confirmed (parent-verified probe)
- **Affected files/symbols:** `src/App.tsx:216-229` (effect passes `{ selectedThemeId, appearanceMode, customTheme }` only); `src/theme/applyTheme.ts:206-213`; `src/components/ThemeMaker.tsx:561-563`
- **Observed:** Probe: `selectedThemeId='user-b'` present in `customThemes`, `customTheme='user-a'` → resolves `venice`/dark, not `user-b`. Passing `customThemes` resolves correctly. Production correctness currently depends on ThemeMaker keeping the `customTheme` side-car in sync on every selection.
- **Expected:** Hydration resolves the selected theme from the custom library regardless of the side-car.
- **Root cause:** App effect subscribes/passes the legacy `customTheme` field but not the `customThemes` array.
- **Repro:** Persist `selectedThemeId='user-b'` with a different `customTheme`; cold boot → renders Venice Parity Dark.
- **Recommended fix:** Subscribe to `customThemes` in App and pass it into `resolveInitialTheme` incl. effect deps.
- **Validation:** App-level test with mismatched side-car/library asserting the resolved id; note `applyTheme.test.ts:182` covers the branch in isolation — the app just never reaches it.
- **Regression risk:** Low; adds a subscription.

### THEME-P2-004 — Pre-paint bootstrap theme is partial and stale → real FOUC window

- **Severity:** P2 · **Confidence:** Confirmed (static + dist sync verified)
- **Affected files:** `public/bootstrap-theme.js` (hardcoded palettes for venice/dracula/gruvbox-dark/rosepine + `customTheme` tokens only), `index.html:14`, `src/main.tsx:110-139` (React mount gated behind `Promise.race(hydration, 2500ms)`), `src/App.tsx:225` (writes `vf.theme.bootstrap` post-mount), `src/styles/theme.css:13-52` (`@theme` aliases have no fallbacks)
- **Observed:** The other 39 built-ins, all YAML themes, and ~66/90 variables (all `--code-*`/`--syntax-*`, `--app-mesh-opacity`, `colorScheme`) are unset until React's first effect; unset vars compute to invalid/transparent. `appearanceMode:'system'` is coerced to dark pre-paint. No main-process injection exists.
- **Expected:** Pre-paint theme matches the persisted selection across all theme kinds (or at least the full variable set is populated).
- **Root cause:** Bootstrap cache schema predates ThemeFamily V2 and the YAML pipeline; it cannot represent family variants or YAML themes.
- **Recommended fix:** Store the last **resolved** token map (all ~90 vars + mode + colorScheme) written by the App effect after `applyTheme`; bootstrap applies it verbatim under its existing injection guard.
- **Validation:** Cold-load snapshot checks for a non-hardcoded built-in and a YAML theme.
- **Regression risk:** Guard must keep rejecting non-allowlisted values (extend, don't bypass).

### THEME-P2-005 — "System" appearance mode never reacts to OS changes (no listener exists); garbage storage values map into it

- **Severity:** P2 · **Confidence:** Confirmed (grep across src/public/electron: exactly one point-in-time `matchMedia` read at `src/theme/resolver.ts:7`; zero change listeners)
- **Affected files:** `src/theme/resolver.ts:5-8`, `src/theme/migration.ts:35-38`, `src/App.tsx:220-229`
- **Observed:** `appearanceMode:'system'` resolves once per re-apply; an OS flip re-themes only after unrelated state changes. No UI control sets `'system'` (ThemeMaker always pins a concrete mode — and `saveCustomTheme` (`settings-store.ts:371`) force-overwrites any existing `'system'` preference), but `migrateAppearanceMode` maps **any** invalid persisted value to `'system'`, so corrupt storage lands in the least-functional mode.
- **Expected:** System mode follows OS appearance live, or is removed/documented as resolve-only.
- **Recommended fix:** Decide product intent (open question §21). If kept: one App-level `matchMedia('(prefers-color-scheme: dark)')` change listener re-resolving only when `appearanceMode==='system'`. If dropped: remove `'system'` from the persisted union and make `migrateAppearanceMode` default to `'dark'`.
- **Validation:** jsdom test dispatching `MediaQueryListEvent`; storage-garbage hydration test.

### THEME-P2-006 — ThemeMaker "Custom Theme" palette entry applies live but never persists

- **Severity:** P2 · **Confidence:** Confirmed (parent read of `ThemeMaker.tsx:551-573`)
- **Observed:** The `id === "custom"` branch calls `setDraft/setPreviewMode/applyTheme` but never `setSelectedThemeId("custom")` nor `setAppearanceMode(mode)`. On restart, `resolveInitialTheme` only restores the legacy slot when `selectedThemeId === 'custom'` (`applyTheme.ts:202`) → the choice silently reverts.
- **Expected:** Selection persists like every other entry, or the entry is removed.
- **Recommended fix:** Add `setSelectedThemeId("custom")` + `setAppearanceMode(mode)` in the else branch (or formally deprecate the legacy slot — see open question).
- **Validation:** Component test asserting `selectedThemeId==='custom'` after click; hydration test through `resolveInitialTheme`.

### THEME-P2-007 — Deleting the active YAML theme clobbers the unrelated legacy `customTheme` slot

- **Severity:** P2 (data loss of a legacy record) · **Confidence:** High (static)
- **Affected files:** `src/stores/settings-store.ts:380-390` (`wasActive = selectedThemeId === id` with no membership check), `src/components/ThemeMaker.tsx:1132-1148, 785-804`
- **Observed:** The delete button renders for YAML themes. Deleting an active YAML theme runs `deleteCustomTheme(yamlId)`, which overwrites `customTheme` with `filtered[0]` or `null` — destroying a record the user never deleted — and jumps selection to it.
- **Expected:** Deleting a YAML theme resets selection deterministically without touching unrelated state.
- **Recommended fix:** Guard `wasActive` with `state.customThemes.some(t => t.id === id)`; let ThemeMaker own YAML deletion fallback.
- **Validation:** Store test: delete active YAML id with populated `customTheme`; assert slot untouched.

### THEME-P2-008 — Saving a theme with id `themes` persists OK but silently vanishes after reload

- **Severity:** P2 · **Confidence:** Confirmed (parent-verified)
- **Affected files:** `electron/services/themeService.ts:124-125` (loader skips `themes.yaml` master name), `:202-209` (save path); `src/theme/yaml/validate.ts:190-206`
- **Observed:** `saveTheme` writes `userData/themes/themes.yaml`; `scanThemesDirectory` skips any file named `themes.yaml`; `saveTheme` returns ok. Theme gone from UI after restart/watcher refresh.
- **Expected:** Reserved ids rejected at save time.
- **Recommended fix:** Reject id `themes` (case-insensitive) in `validateThemeId` or the save/delete handlers.
- **Validation:** Unit test `saveTheme` id='themes' rejects.

### THEME-P2-009 — Shipped `config/themes/copper.yaml` (V1 single-mode) shadows the dual-mode JS built-in `copper`

- **Severity:** P2 · **Confidence:** Confirmed (parent-verified file + precedence logic)
- **Affected files:** `config/themes/copper.yaml` (V1 `themes:` block, `mode: dark`), `src/theme/builtins/copper.ts`, `src/theme/yamlTheme.ts:59-69`, `electron/services/themeService.ts:138-173`
- **Observed:** Of 45 packaged YAML files, 24 are V1 blocks loading into the YAML tier; one id collides with the 43 JS builtins. Registry precedence YAML > built-in applies the shadow; `yamlThemeToFamily` duplicates the single-mode tokens into **both** variants → the builtin's light variant (`#f5f6f7`) is unreachable; light appearance renders dark tokens (`#0d1117`).
- **Expected:** Shipped YAML overrides must not silently flatten dual-mode built-ins.
- **Recommended fix:** Convert shipped `copper.yaml` to a V2 dual-variant family (or drop it); add a verifier flagging id collisions between `config/themes/*.yaml` and `src/theme/builtins/`.
- **Validation:** Verifier + existing builtin validation suites.

### THEME-P2-010 — Never-defined legacy shadcn variables render Settings surfaces transparent

- **Severity:** P2 · **Confidence:** Confirmed (0 definitions in `src/styles`, 0 in dist CSS; `git log -S` shows these names never existed)
- **Affected:** `src/components/settings/ProvidersPanel.tsx:193,212,229,256,272,290,320,336-409` (`--color-bg-primary/-secondary/-tertiary`, `--color-bg-hover`); `src/components/settings/PrimaryApiRoutePanel.tsx:106,148`
- **Observed:** `bg-[var(--color-bg-*)]` on inputs/cards → invalid at computed-value time → transparent backgrounds in every theme.
- **Expected:** Opaque, theme-tracking surfaces.
- **Recommended fix:** Repoint to existing tokens (`bg-input-bg`, `bg-vf-panel-bg-inset`, `bg-[var(--color-vf-control-hover)]`).
- **Validation:** Visual QA Providers panel dark+light; add the §P2-015 scanner so it cannot regress.

### THEME-P2-011 — Provider/auto-fallback toggle has no "on" track color (`--color-primary` undefined)

- **Severity:** P2 · **Confidence:** Confirmed
- **Affected:** `src/components/settings/ProvidersPanel.tsx:212,290` (both on/off branches reference undefined vars — only the white knob renders), `src/components/ModelSelect.tsx:100` (`bg-primary/20 text-primary` badge)
- **Expected:** Accent track when enabled (cf. `AudioSpeechPanel.tsx:64` which uses `peer-checked:bg-accent` correctly).
- **Recommended fix:** `bg-accent` (on) / muted token (off); `text-accent-fg` badge.
- **Validation:** Toggle renders visibly on/off in dark and light.

### THEME-P2-012 — Width tokens live in the wrong Tailwind namespace — chat bubble and column constraints are dead

- **Severity:** P2 · **Confidence:** Confirmed (0 rules for `max-w-chat-bubble`/`max-w-vf-wide`/`max-w-vf-comfort` in compiled `dist/assets/index-*.css`)
- **Affected:** `src/styles/theme.css:109-116` (defines `--width-narrow/reading/comfort/wide/chat-bubble`); call sites `src/components/chat/message-bubble.tsx:573`, `chat-input.tsx:499`, `chat-view.tsx:801,903`
- **Observed:** Tailwind v4 resolves named `max-w-*` from `--container-*`; the defined `--width-*` keys feed nothing. The 78% bubble cap and the reading-column widths silently do nothing. `--width-narrow/-wide` are additionally consumer-less.
- **Expected:** Bubble width capped; column widths capped.
- **Recommended fix:** Rename to `--container-chat-bubble: 78%` etc., or switch call sites to `max-w-[var(--width-chat-bubble)]`.
- **Validation:** Rendered geometry assertion in chat under a constrained viewport (long-content case).

### THEME-P2-013 — ~40 dead utility classes reference never-defined tokens (hover/focus/button affordances silently missing)

- **Severity:** P2 · **Confidence:** Confirmed (undefined in `theme.css @theme` + absent from compiled dist CSS; repo-wide scan)
- **Affected (token → representative sites):**
  - `hover:bg-vf-panel-bg-hover`, `bg-vf-control-hover-hover`, `text-text` — `src/components/ui/ContextMenu.tsx:216,231` (non-destructive menu items get **no hover background** while destructive items do)
  - `border-vf-panel-border-strong` (focus state) — `chat-input.tsx:669`, `venice-params.tsx:261`, `ui/shared.tsx:64`, `DocumentAgentView.tsx:891` (focus indication lost on 4 input surfaces)
  - `bg-vf-control-hover-muted` (9×/5 files) — ResearchWorkspaceView, DocumentAgentView, WorkspaceTree, agent-model-picker, playground-chat (no hover background)
  - `bg-vf-panel-bg-muted` (10×/4 files) — ImageInspectorView, SearchTab, audio-view, image-page (chips/thumbnails transparent)
  - `bg-vf-panel-bg-sunken` — `message-bubble.tsx:1019`, `DocumentRenderer.tsx:74`
  - `bg-vf-button-primary-bg` / `text-vf-button-primary-text` / `bg-vf-button-primary-hover-bg` — `WalletPanel.tsx:162,173,249,406`
  - `text-accent-contrast` (6×, character-creator CTAs on `bg-accent`) — inherited text color; contrast depends on ambient theme
  - `hover:text-text-brand` — `ToastItem.tsx:74,90`, `ProgressToast.tsx:82`; `text-text-main` + `bg-bg-alt` — `GenerationLoadingIndicator.tsx:162,165`; `text-text-danger` — `media-toolbar.tsx:527`; `text-text` — `ImageInspectorView.tsx:170`; `bg-muted` — `SceneComposerView.tsx:545`; `text-accent-foreground`/`hover:bg-accent-light` — `ImportPlanModal.tsx:192`, `BackupSyncPanel.tsx:299,352`; `border-vf-panel-border-0` — `WorkflowTemplatesView.tsx:278`
- **Root cause:** A planned token layer was partially consumed in TSX but never added to `@theme`; no verifier checks resolvability.
- **Recommended fix:** Bulk-repoint to defined tokens (`vf-panel-bg-inset`, `vf-control-hover`, `accent-fg`, `text-danger`, `bg-accent-hover`…); add genuinely missing tokens only where the design requires; land the P2-015 scanner.
- **Validation:** Rebuild; rescan; hover/focus visual pass on the listed surfaces.
- **Regression risk:** Each repoint is visual — verify per surface.

### THEME-P2-014 — Theme bypass via Tailwind default palette in 11 files

- **Severity:** P2/P3 · **Confidence:** Confirmed
- **Affected:** `text-amber-200/300/400`, `bg-amber-500` (`ProvidersPanel.tsx:262` "Deferred" badge), `text-emerald-*`, `text-green-400`, `text-red-*`, `bg-red-600/950` (allowlisted), `text-rose-*`, `accent-rose-400`, `border-rose-500`, `bg-yellow-400`, `border-teal-400/30` (`PromptDebugDrawer.tsx:23`) across RpChatView, CharacterDraftEditor, CharacterEditor, DocumentAgentView, playground, SceneComposerView, AssetGallery, CharacterLibrary, ManagedVideoPlayer, media-inspector (`media-inspector.tsx:1284-1341` amber "missing references" section — near-invisible on light themes)
- **Observed:** Fixed hues regardless of the active family; several duplicate `--color-warning/success/danger`.
- **Recommended fix:** Map to semantic tokens (`text-warning`, `text-danger`, `text-success`); keep allowlisted media-chrome cases.
- **Validation:** Light-theme render of media-inspector + Providers badge.

### THEME-P2-015 — CI verifier cannot detect undefined consumed tokens

- **Severity:** P2 (process) · **Confidence:** Confirmed (`npm run verify:theme-tokens` exits 0 with "202 files scanned" while P2-010…P2-014 all pass)
- **Affected:** `scripts/verify-theme-tokens.cjs` — checks forbidden white/black classes and a legacy denylist only; never validates that consumed `bg-*/text-*/border-*/max-w-*` classes or `var(--color-*)` references resolve to a defined token (`theme.css @theme` + `applyTheme` map).
- **Recommended fix:** Add a resolvability audit (defined-key set = `@theme` keys + applyTheme map + known runtime writers) to `verify-theme-tokens.cjs` or a sibling verifier in `verify:contracts:static`, with a temporary allowlist for confirmed-dead tokens cleaned in the same change.
- **Validation:** The scanner used for this audit (`/tmp` probe pattern: consumed-vs-defined comm) fails on current HEAD and passes after remediation.

### THEME-P2-016 — Theme CRUD entirely fails on the web transport

- **Severity:** P2 (P1 if the web build is a supported user surface) · **Confidence:** Confirmed (static)
- **Affected:** `src/services/desktopBridge.ts:2470-2477` (`saveTheme`/`deleteTheme` → `{ok:false,"Not available in web"}`), `ThemeMaker.tsx:575-589,785-816,867-919`
- **Observed:** Every create/duplicate/save/import-apply/delete ends in an error toast on web; selection, preview, browse, export work. ThemeMaker mounts unconditionally. Violates the two-transports-one-renderer-contract principle.
- **Recommended fix:** Gate CRUD on `isElectron()` with clear copy, or implement a localStorage-backed path on web.
- **Validation:** Web-mode component test with `isElectron()===false`.

### THEME-P2-017 — Theme documentation is operationally wrong: the canonical import example is rejected; migration algorithms are phantom

- **Severity:** P2 · **Confidence:** Confirmed (runtime probe by the tests/docs workstream)
- **Affected:** `docs/ui-modernization/THEME_IMPORT_EXPORT.md:21-131` — the "authoritative Schema V2 exchange format" example fails `parseThemeYaml` with `Unknown top-level key "version"` and `missing required token` for the `text_primary/text_secondary/text_muted` trio; even after removing `version:` it still fails. `docs/ui-modernization/THEME_MIGRATION.md:46-78` documents `deriveComplementaryVariant` and luminance-based canonical-mode detection — neither exists (grep: zero matches; `applyTheme.ts:41-54` copies identical tokens into both variants).
- **Expected:** The documented canonical example imports cleanly; migration docs describe actual behavior.
- **Recommended fix:** Fix the doc example (add the legacy trio, drop `version:`) **or** decide the trio should not be required for V2 (open question); rewrite THEME_MIGRATION §2/§3 against `applyTheme.ts:41-54` and `yaml/legacy.ts`; add a test that the doc example parses.
- **Validation:** Doc-example parse test.

### THEME-P2-018 — Theme test gaps: no validation invariant, no registry/migration/resolver coverage, unknown-id recovery unasserted

- **Severity:** P2 · **Confidence:** Confirmed
- **Observed:** `validateThemeFamily` has **zero** test references (all 43 built-ins pass by probe, but the invariant is unenforced); `registry.ts`, `migration.ts`, `resolver.ts`, `yaml/legacy.ts` have no test files; the `isBuiltInId` alias bug (P3-020) is untested; `resolveInitialTheme` has no fully-bogus-id test; built-in **semantic** token values get truthiness-only checks (`themes.test.ts:100`) — `isValidColorValue` runs only over code tokens; `themes.test.ts`/`contrast.test.ts` hand-list a 29-key subset instead of the canonical 36.
- **Recommended fix:** `themes.validation.test.ts` (all families × variants × `validateThemeFamily` + per-token `isValidColorValue`; assert the hand-listed key set equals `REQUIRED_THEME_TOKEN_KEYS`); registry/migration tests incl. the alias case and `migrateLegacyThemeId('builtin-solarized-dark')`; bogus-id hydration test.
- **Validation:** New suites run under `test:unit:theme` (already in CI).

### THEME-P2-019 — Transparent-PNG previews lack a theme-aware checkerboard in gallery/chat

- **Severity:** P2 (UX/accessibility) · **Confidence:** Confirmed static (no checkerboard outside `image-tools.tsx:619`); contrast perception verified against venice variants
- **Affected:** `src/components/gallery/media-detail-dialog.tsx:223,342`, `media-card.tsx:162`, `message-bubble.tsx:1019` (also dead-token transparent per P2-013)
- **Observed:** Transparent previews sit on `bg-overlay` (venice light = dark wash `rgba(28,28,31,0.35)`) or panel backgrounds; alpha is not perceptible in several themes. Background removal is a first-class flow, making this a common case.
- **Expected:** Checkerboard/neutral mid-tone behind transparent images in all themes.
- **Recommended fix:** Reuse the `image-tools.tsx:619` conic-gradient checkerboard (extract to a `.vf-transparency-grid` class).
- **Validation:** Light + dark render of a transparent PNG in the detail dialog.

### P3 confirmed findings (summary form)

- **THEME-P3-020 — Registry hygiene:** 9 self-aliases (e.g. `obsidian-ember` lists itself); `isBuiltInId` alias clause broken (`builtIns.get(id)?.aliases?.includes(id)` can never be true on a miss — returns false for `'builtin-venice'`; **zero production callers**, latent only); `registerBuiltinThemes()` registers built-ins into the **custom** map (snapshot duplication); `resolveInitialTheme:217` redundant `?? findBuiltinThemeFamily` (same lookup twice).
- **THEME-P3-021 — Dead write:** `serializeThemeFamilyYaml` emits top-level `mode:` "so yamlToTheme can preserve the original mode" — nothing reads `doc.mode` (`normalizeThemeFamilyYaml` drops it); validator allows it as a no-op.
- **THEME-P3-022 — `isValidPersistedTheme` accepts empty/whitespace names** (`applyTheme.ts:19` checks type and >200 only); probe confirms `''` and `'   '` pass.
- **THEME-P3-023 — Permissive color regex:** `isValidColorValue` accepts nonsense like `hsl(e)` and `#12345` — not exploitable (dangerous patterns rejected first), but sloppy.
- **THEME-P3-024 — Cross-mode code presets:** `dark` family's light variant uses the `dark` code preset and `light` family's dark variant uses the `light` preset (`builtins/dark.ts:33`, `builtins/light.ts:61`) — needs design-intent confirmation.
- **THEME-P3-025 — V2 YAML requires the legacy `text_*` trio** per variant (duplicating `foreground*`); this redundancy is what breaks the published doc example (P2-017).
- **THEME-P3-026 — Electron robustness:** `protectedIds` dead at every production call site (built-in id override unenforced below the UI); watcher covers only `userData/themes/` (legacy `themes.yaml`/builtin-dir edits need restart; non-atomic external writes can transiently wipe YAML themes — no `awaitWriteFinish`); absolute paths in warning records/logs despite the basename-redaction policy; duplicate ids across custom files resolve by `readdir` order; 21 flat terminal-color YAML files ship dead weight (incl. `example.theme.yaml`); `config.theme.active` is dead weight displayed as "Active theme" in ConfigPanel but never applied.
- **THEME-P3-027 — Theme Maker polish:** export fires a success toast even when the save dialog is canceled (`ThemeMaker.tsx:818-828` ignores `exportYaml`'s false return); code-token labels query a nonexistent i18n path (`runtimeGenerated.componentsThememaker.codeToken.*` vs actual `surface.componentsThememaker.codeToken.*`) so they render English in every locale; export filename collapse for non-Latin names (`___.theme.yaml`); web import has no size cap (Electron caps at 25 MiB); dirty drafts silently discarded when navigating settings sections; mode mismatch after active-theme delete (store persists fallback's mode, UI applies canonical mode); YAML "shadow resurrection" (deleting a theme that also exists in `config/themes` reappears on restart).
- **THEME-P3-028 — z-index:** ad-hoc 11-value scale; toasts (`z-[100]`) render below gallery lightbox (150), DiagnosticsDrawer (170), CommandPalette (200); menus (1000) deliberately top master-password (999) per code comment — works today, fragile.
- **THEME-P3-029 — CSS hygiene:** ~24 dead `@theme` tokens; reduced-motion block duplicated between `theme.css:327-334` and `accessibility.css:1-18` (drift risk — the theme.css copy lacks the transform suppression); dead hover rules (`image-view.tsx:1855`, `ToastItem.tsx:74`); ~70 `transition-all` classes (layout-animation perf smell, though no global `* { transition: all }` exists); `AccessibleDialog` stacks two conflicting backdrop backgrounds (unlayered `modal-backdrop-blur` wins over `bg-overlay/75`); media-detail-dialog duplicate bg classes.
- **THEME-P3-030 — Persistence nits:** cross-profile bootstrap cache leak (`vf.theme.bootstrap` is global, never cleared on profile switch); double `applyTheme` + double event dispatch per ThemeMaker selection; whole-blob write amplification (every settings write serializes up to 100 custom themes); `saveCustomTheme` force-pins a concrete mode (silently destroys any `'system'` preference); `setCustomThemes` keeps oldest-100 while `saveCustomTheme` keeps newest-100 (the former has no production callers).
- **THEME-P3-031 — Doc drift details:** THEME_SCHEMA.md claims "37 semantic roles" (canonical = 36; its own tables list 33) and omits accepted color formats (`#rgb/#rgba`, `transparent`, `currentColor`); design/THEME_SYSTEM.md says "29 required tokens" and shows a stale resolver order (custom → YAML; actual YAML → custom); README "built-in and user-supplied themes live under `config/themes/`" (built-ins are TS); DOCS_INDEX "44+ built-in themes" (actual 43); stale meteocon transformer comment (`meteoconSvgTransformer.ts:39-40`).
- **THEME-P3-032 — Test contract nits:** `applyTheme` map has no table-driven contract test (hand-listed ~24 vars + call count 70); `inlineColorInvariant` misses bare `text-white`/`bg-white`/`bg-black/*` and arbitrary-value dead-var refs (all current white/black uses carry the intentional-fixed-color marker, but nothing enforces it).

---

## 8. Architectural Risks

1. **Token consumption outran token definitions.** A planned "reference material" token layer (components.css comments dated 2026-09-14) was partially consumed in TSX but never landed in `@theme`, producing the P2-010…P2-014 cluster. Root fix is process (the P2-015 resolvability verifier), not just repointing classes.
2. **Two near-duplicate theme authorities can disagree:** renderer localStorage (actual) vs `config.yaml theme.active` (displayed in ConfigPanel, never applied). Users can see a config "Active theme" that is not the active theme.
3. **Legacy single-mode lifts flatten dual-variant intent** (`legacyThemeToFamily`, `yamlThemeToFamily`, V1 YAML): the same tokens serve both appearances. Deliberate for backward compatibility, but it is what makes the copper shadow (P2-009) damaging.
4. **Two parallel import paths with different strictness:** Theme Maker file import (unknown token = hard error) vs legacy config.yaml `themes:` block (unknown token = warn-and-ignore). Both feed the same registry.
5. **Bootstrap cache schema predates V2** and cannot represent families/YAML themes (drives P2-004).
6. **`'system'` mode is a third of the persisted union but is effectively dead surface** (no UI control reaches it, no listener serves it, saving a theme destroys it).

## 9. Accessibility Findings

- **Confirmed:** THEME-P2-002 (placeholder AA failures 37/43 dark, 15/43 light; border 1.4.11 risk), THEME-P2-013's `border-vf-panel-border-strong` focus-state loss on 4 input surfaces, THEME-P2-014's amber-on-light inspector text, THEME-P2-019 (transparent PNG perception), THEME-P2-001 (contrast tooling wrong exactly when users need it).
- **Verified good:** global `focus-visible` outlines; forced-colors overrides (Canvas/CanvasText/Highlight); reduced-motion and reduced-transparency handling; coarse-pointer targets; scrollbars theme-aware; `colorScheme` pinned so native controls follow the theme; menus portaled above dialogs; KaTeX `currentColor`; mesh hidden under reduced-transparency/contrast/forced-colors.
- **Needs runtime verification:** ~30 inputs use `outline-none focus:border-accent` (border-only focus indicator — 3:1 non-text contrast should be confirmed per WCAG 2.4.13/1.4.11); character-creator CTA contrast under the `text-accent-contrast` dead class; toast-vs-modal policy for screen-reader/keyboard focus order.

## 10. Performance Findings

- **No theme-switch rebuilds:** switching re-applys ~70 CSS variables through a stable-deps effect; no component tree rebuild. Verified good.
- **P3 smells:** double `applyTheme` + double `applyTheme:complete` per ThemeMaker selection; whole-blob persistence writes including up to 100 custom themes on any settings mutation; ~70 `transition-all` classes transition layout-affecting properties on theme change; N Meteocon icons each subscribe to `applyTheme:complete` (acceptable).
- Startup: pre-paint bootstrap limits the unthemed window, but the React mount is gated behind a 2.5 s hydration race — for non-hardcoded themes the bootstrap script is the only theme for that whole window (P2-004).

## 11. UX Findings

- Verified good: built-in protection in the UI is complete (save-as-copy, no delete, replace blocked, IPC-side `builtInProtected`); import is atomic w.r.t. stores with field-level, redacted error toasts; preview never mutates persisted state and restores precisely on unmount; per-token validation feedback (red border, `role="alert"`, save gating).
- Improvement candidates (proportional, not defects): theme thumbnails/search/grouping; schema version visibility; duplicate/rename already exist; unsaved-draft confirmation when leaving settings; export success toast on cancel (P3-027); code-token labels localized (P3-027); searchable theme list for 43+ themes.

## 12. Import/Export Findings

| Test | Expected | Actual | Result |
|---|---|---|---|
| Valid V2 import | succeeds | parses, validates, normalizes | PASS |
| Malformed YAML | clean actionable error, atomic | throws; stores untouched | PASS |
| Missing required token | per-field error | `missing required token` per variant | PASS |
| Unknown token | deterministic | hard error (file import) / warn+ignore (legacy config path) | INCONSISTENT (risk #4) |
| Invalid/unsafe color (`url(`, `expression(`, `javascript:`, `@import`) | rejected | rejected (probe) | PASS |
| Prototype-pollution keys (`__proto__` etc.) | rejected | rejected by both validators (probe) | PASS |
| Oversized file | capped | 1 MiB parse cap; 25 MiB Electron read cap; **web uncapped** | PARTIAL (P3-027) |
| Future `schemaVersion` | rejected | rejected | PASS |
| Legacy V1 `themes:` block + flat terminal format | migrated | migrated (flat format only via file import; main skips flat files) | PASS w/ notes |
| Export→import round-trip | value-stable | **all 43 built-ins value-stable, both variants + code presets** (probe) | PASS |
| Duplicate/protected id | deterministic handling | rejected **only if `protectedIds` passed — dead at all production call sites** | GAP (P3-026) |
| Built-in id `themes` as filename | rejected | saves then silently skipped by loader | FAIL (P2-008) |
| Doc example import | succeeds | **rejected** | FAIL (P2-017) |

Export determinism: alphabetical snake_case token order, no timestamps, `builtIn` flag stripped on import — clean. Secrets: none present in theme payloads.

## 13. Persistence Findings

| Scenario | Expected | Actual | Status |
|---|---|---|---|
| Reload | preserved | sync localStorage hydration; correct pre-render | PASS |
| Restart | preserved | preserved (with P2-003 divergence caveat) | PASS w/ caveat |
| Custom theme selected | persists | persists via `customTheme` side-car sync | PASS (fragile) |
| "Custom Theme" palette entry | persists | **never persisted** | FAIL (P2-006) |
| Delete active custom theme | deterministic fallback | oldest custom → `builtin-venice` | PASS |
| Delete active **YAML** theme | deterministic fallback, no side effects | fallback works but **clobbers legacy `customTheme` slot** | FAIL (P2-007) |
| Corrupted/unknown stored id | safe fallback | resolves venice/light per appearance (probe) | PASS |
| Corrupted `appearanceMode` | safe fallback | garbage → `'system'` (the inert mode) | WEAK (P2-005) |
| Storage quota exhaustion | no data loss | CRITICAL_STORES drop-write (warn-logged) | PASS (protective) |
| YAML files | durable | atomic temp-write+rename, 0o600 | PASS |
| External non-atomic YAML edit | recoverable | transient wipe until next event (no `awaitWriteFinish`) | RISK (P3-026) |
| Cross-profile | isolated | bootstrap cache leaks previous profile's theme pre-hydration | FAIL (P3-030) |

No hydration races in the store itself (sync storage); the async input (`yamlThemes` via IPC) correctly re-triggers the App effect when it lands.

## 14. Electron Integration Findings

- **Verified good:** `themeService` is a thin, well-guarded file layer (atomic 0o600 writes, strict validation, id-charset blocks traversal — tested); IPC contract is narrow (3 channels + push), privileged-sender validated, no raw file contents or secrets cross; single BrowserWindow (broadcast loop future-proof); `show:false` + `ready-to-show` mitigate initial FOUC; renderer gets opaque id-based operations only.
- **`nativeTheme` is completely unused** — system mode is renderer-side `matchMedia` only (which is why P2-005 exists).
- **Defects:** P2-008 (id `themes`), P2-009 (copper shadow), P3-026 cluster.
- **Cosmetic:** static `backgroundColor: "#0d1117"` (`main.ts:198`) — light-theme users get a dark native flash on window reload.

## 15. Component Coverage

| Surface | Theme compliant | Hard-coded colors | Contrast issue | Notes |
|---|---|---|---|---|
| Chat messages | ✓ exemplary | 1 annotated intentional (`message-bubble.tsx:1036`) | placeholder AA | token-driven incl. reasoning/tool/error/citations |
| ChatMarkdown/code | ✓ | none | — | refractor `--syntax-*`; fenced-code header tokens; safeUrlTransform |
| KaTeX/math | ✓ | none | — | currentColor only |
| Menus/dropdowns | partial | none | hover asymmetry | ContextMenu non-destructive hover dead (P2-013); portal z via token |
| Modals | partial | none | — | double-backdrop redundancy (P3-029); z-scale ad hoc (P3-028) |
| Forms/primitives | ✓ | none | border-only focus (verify) | Input/TextArea/select token-driven; 4 surfaces lose focus border (P2-013) |
| Settings/Providers | ✗ | palette bypasses | transparent surfaces | P2-010/011/014 |
| Gallery/media | partial | amber section | transparency invisible | P2-019; toolbar danger text dead (P2-013) |
| Media inspector | ✗ | amber hardcoded | light-theme invisibility risk | P2-014 |
| Documents/workspace | partial | none | — | hover-muted dead classes (P2-013) |
| Workflows | partial | none | — | dead hover/border classes (P2-013) |
| Character creator | partial | none | CTA contrast (verify) | `text-accent-contrast` dead (P2-013) |
| Research/playground/audio/image views | partial | palette bypasses | — | dead hover/chip classes (P2-013/014) |
| Toasts | partial | none | — | brand-hover no-op; below lightbox (P3-028) |
| Wallet | ✗ | none | possible | primary button classes dead (P2-013) |
| AppMeshOverlay | ✓ | none | — | token-driven, reduced-motion/transparency safe |

Repo-wide dead-token and palette scans covered all of `src/`; surfaces marked "partial" have specific file:line evidence in §7.

## 16. Test Coverage

313 tests across `src/theme/` (10 files) + 48 across `tests/theme`, `tests/csp`, `tests/accessibility`, `electron/services/themeService.test.ts` — all pass. Against the handoff's 15 minimum regression cases: **11 covered, 2 partial, 2 gaps** —

| # | Case | Status |
|---|---|---|
| 1 default resolves | COVERED |
| 2 every built-in validates | **GAP** (no `validateThemeFamily` test; probe shows all pass) |
| 3 required tokens exist | COVERED — weakened (29-key hand list, not the canonical 36) |
| 4 switch applies CSS vars | COVERED (~24 hand-listed + call count) |
| 5 selection persists | COVERED |
| 6 restore after restart | COVERED (but the app never passes `customThemes` — P2-003) |
| 7 valid import | COVERED |
| 8 malformed import fails safely | COVERED |
| 9 export/import round-trip | COVERED |
| 10 delete-active resolves safely | COVERED (custom; the YAML side-effect P2-007 untested) |
| 11 unknown persisted id recovers | **GAP** |
| 12 system appearance changes | **GAP** (nothing exists to test — P2-005) |
| 13 custom theme persists across reload | COVERED |
| 14 import cannot inject CSS | COVERED |
| 15 all registered themes satisfy tokens | PARTIAL (built-ins hand-listed; registry-level untested) |

Also missing: verifier-level resolvability (P2-015), doc-example parse test (P2-017), 8-digit-hex contrast tests (P2-001), App-level customThemes hydration test (P2-003), export-cancel toast test (P3-027), web-transport CRUD tests (P2-016).

## 17. CI Coverage

All theme suites execute in hosted CI: `test:unit:theme` via `test:ci` (ci.yml:41); `themeService.test.ts` via `test:electron` (Ubuntu/Windows + macOS jobs); `tests/theme`+`tests/csp` via `test:contracts`; accessibility theme-focus via `test:ui:layout`; ThemeMaker component tests via the coverage job; `verify:theme-tokens` via `verify:contracts:static`. **The gap is not execution but verifier capability** (P2-015): the gates all pass while ~45 dead token references ship. Hosted CI/CodeQL for commit `8ee5ddd2` was **not** inspected this session (no publication occurred).

## 18. Documentation Findings

Canonical theme docs: `docs/ui-modernization/THEME_SCHEMA.md`, `THEME_IMPORT_EXPORT.md`, `THEME_MIGRATION.md`, `docs/design/THEME_SYSTEM.md` (all registered in DOCS_INDEX). Confirmed drift: P2-017 (rejected example; phantom algorithms), P3-031 (37-vs-36 roles, omitted formats, 29-token claim, stale resolver order, README `config/themes` claim, DOCS_INDEX 44+-vs-43, stale meteocon comment), P3-021 (undocumented dead `mode:` field). Pre-existing blocked item quoted from `docs/ROADMAP.md:28`: `THEME-OVERLAY-2026-09-25` — user-reported theme formatting/border/mesh overlays, blocked by missing reproduction evidence. Note for that investigation: `--app-mesh-opacity` is hardcoded per mode (0.08 light / 0.12 dark) at `applyTheme.ts:97` — it is not a theme token, so no custom theme can tune the mesh.

## 19. Recommended Remediation Plan

**Phase 1 — correctness (P2 root causes first)**
1. THEME-P2-015 resolvability verifier (prevents the whole cluster from regressing).
2. THEME-P2-010/011/012/013 — repoint or define the dead tokens (one coordinated pass; visual QA per surface).
3. THEME-P2-003 (App passes `customThemes`); THEME-P2-006 (persist 'custom' selection); THEME-P2-007 (membership guard).
4. THEME-P2-008 (reserve id `themes`); THEME-P2-009 (fix shipped copper.yaml + collision verifier).

**Phase 2 — accessibility**
5. THEME-P2-001 (contrast parser); THEME-P2-002 (placeholder re-tune + ratio guardrail); THEME-P2-019 (checkerboard); runtime verification of border-only focus and CTA contrast.

**Phase 3 — lifecycle**
6. THEME-P2-005 (system-mode decision + listener or removal); THEME-P2-004 (resolved-map bootstrap cache); THEME-P2-016 (web-transport parity decision).

**Phase 4 — docs & tests**
7. THEME-P2-017 + P3-031 doc corrections; THEME-P2-018 + P3-032 tests (validation invariant, registry/migration, unknown-id, doc-example).

**Phase 5 — polish (P3 backlog)**
8. P3-020…P3-030 cleanups as a single hygiene pass after Phases 1–2 land (several P3s disappear when their P2 root cause is fixed).

## 20. Validation Commands

| Command | Result |
|---|---|
| `npx tsx /tmp/themeAudit.ts` (parent probe: builtin schema, registry, contrast pairs, round-trip w/ protectedIds, security probes, fallbacks, persisted validation) | 142 order-sensitive false positives (harness artifact, corrected in follow-up probes); **0 real failures** — all 43 builtins schema-valid; url/expression/@import/proto rejected; fallbacks correct |
| `npx tsx /tmp/themeAudit2.ts` + `themeAudit3.ts` | Round-trip **value-stable** (0 token diffs); 9 self-aliases identified |
| `npx tsx /tmp/themeAudit4.ts` | normalize drops top-level `mode` (dead write confirmed) |
| `npx tsx /tmp/themeMatrix.ts` / `themeMatrix2.ts` | Placeholder AA fails 37/43 dark, 15/43 light; value round-trip ALL 43 PASS |
| `npm run test:unit:theme` | PASS (10 files, 313 tests) |
| `npx vitest run tests/theme tests/csp/inlineStyleInvariant.test.ts tests/accessibility/theme-focus.test.ts electron/services/themeService.test.ts --no-file-parallelism` | PASS (8 files, 48 tests) |
| `npm run verify:theme-tokens` | PASS (202 files) — **but see P2-015: cannot detect the dead-token cluster** |
| `npm run lint:eslint` | PASS (0 errors, 0 warnings) |
| `rg` verification of App.tsx:221, ThemeMaker.tsx:551-573, themeService.ts:124-125, copper.yaml, `--color-bg-primary` (0 defs), dist `max-w-*` rules (0), prefers-color-scheme listeners (1 read, 0 listeners) | All claims confirmed |
| **Not run:** `npm run typecheck`, full `npm test`, `npm run build`, `npm run ci`; **not performed:** manual Electron QA, headed visual QA, live OS-appearance toggle test, hosted CI/CodeQL inspection for `8ee5ddd2` | Recorded as not-run per evidence rules |

## 21. Remaining Unverified Risks

1. **Runtime visual impact** of the dead-token cluster: static analysis proves the classes emit no CSS; the exact rendered appearance of each affected surface needs a headed pass (chat bubble widths, Providers toggles, ContextMenu hover, wallet buttons, character-creator CTAs).
2. **Border-only focus indicators** (~30 inputs) — 3:1 non-text contrast unverified.
3. **Cross-mode code presets** (P3-024) — needs the design owner's intent.
4. **`'system'` mode product intent** — feature to finish or dead code to remove.
5. **Web transport** — is it a supported user surface for theme CRUD (drives P2-016 severity)?
6. **Legacy trio requirement** (P3-025) — require in docs vs drop from validation.
7. `THEME-OVERLAY-2026-09-25` remains blocked on user evidence; the mesh opacity is hardcoded per mode, not token-controllable.
8. Hosted CI for the audited commit was not inspected; all local suites above pass.

## 22. Definition of Done (handoff §89 checklist)

- Where is the authoritative theme definition? `src/theme/themeTypes.ts` + `REQUIRED_THEME_TOKEN_KEYS` (configSchema.ts:42-79) — **answered**.
- Where is the active theme stored? `settings-store` → per-profile localStorage; YAML files main-side — **answered**.
- How persisted/restored? Sync localStorage + atomic YAML; restored via `resolveInitialTheme` — **answered** (with P2-003/P2-006 gaps).
- How does it reach CSS? `applyTheme` writes ~70 vars + `colorScheme` — **answered**.
- Restoration failure? Deterministic fallback to venice/light per appearance (probe-verified) — **answered**.
- Malformed custom theme? Rejected at import; persisted garbage re-validated at hydration — **answered**.
- Active theme deleted? Deterministic fallback, except YAML-active side effect (P2-007) — **answered w/ defect**.
- Import round-trips export? Yes, value-stable for all 43 (probe) — **answered**.
- Built-ins schema-valid? Yes, all 43 (probe; unenforced by tests — P2-018) — **answered w/ gap**.
- Tokens consumed correctly / any consumed-but-undefined? ~45 dead references confirmed (P2-010…013) — **answered w/ defects**.
- Theme-dependent colors hard-coded? Stylesheets clean; 18 palette-bypass classes in TSX (P2-014) — **answered**.
- Third-party components synchronized? No Monaco; KaTeX currentColor — **answered**.
- Keyboard focus visible? Mostly; 4 surfaces lose focus border + border-only focus unverified — **answered w/ defects**.
- Light and dark usable? Both variants exist everywhere; placeholder AA fails in many variants (P2-002) — **answered w/ defect**.
- Custom themes safe? Yes — injection/pollution probes pass — **answered**.
- Unnecessary rerenders on theme change? No rebuild; double-apply per selection (P3-030) — **answered**.
- Startup flash wrong theme? Yes for 39/43 built-ins + all YAML themes (P2-004) — **answered w/ defect**.
- Docs/tests consistent with reality? No (P2-017, P3-031, P2-018) — **answered w/ defects**.

**Final standard verdict:** the theme engine is deterministic, centralized, persistent, schema-safe, import/export-safe, and resilient to malformed state. It is not yet runtime-consistent or visually coherent across every major surface (dead token cluster), and its accessibility/documentation layer needs the Phase 1–4 remediation before the system can be called fully coherent.

---

*Report produced 2026-09-25 by the Superdesign-initiated theme audit session. Six read-only workstreams + parent probes; no repository source files were modified; no commit/push performed. Scratch probes lived only under `/tmp`.*
