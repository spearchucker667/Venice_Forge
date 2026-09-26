# Venice Forge Theme System

> Scope: Complete token-based theming architecture, live theme editor, FOUC prevention, WCAG AA contrast compliance, and theme-aware syntax highlighting for Markdown code blocks.
> Implemented: 2026-05-28
> Last updated: 2026-09-01
> Commit: see current `git log --oneline -1 docs/design/THEME_SYSTEM.md`

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Token Reference](#token-reference)
4. [Theme Catalog](#theme-catalog)
5. [ThemeMaker UI](#thememaker-ui)
6. [Persistence & Lifecycle](#persistence--lifecycle)
7. [Accessibility](#accessibility)
8. [Adding a New Theme](#adding-a-new-theme)
9. [File Inventory](#file-inventory)
10. [Migration Notes](#migration-notes)

---

## Overview

Venice Forge uses a **semantic token-based theme system** built on Tailwind CSS v4 CSS variables. Core surfaces, text, status, form, button, link, focus, and selection colors derive from 36 canonical semantic roles mapped to CSS custom properties. In addition, every theme variant carries a dedicated **code/syntax palette** with 33 canonical roles for fenced code blocks and inline code. This enables:

- **Built-in themes:** 43 hardcoded theme families including Venice (default), Dark, Light, Copper, Dracula, Gruvbox Dark, Rose Pine, Nord, Tokyo Night, Catppuccin, Solarized, One Dark, Monokai, GitHub Light, and Venice Forge-specific families such as Obsidian Ember, Midnight Cobalt, Terminal Forest, Porcelain Sky, Sandstone, Obsidian Bloom, Harbor Fog, Circuit Mint, Amber Archive, Neon Dusk, Cotton Candy Console, Sweet Nightmare, Dual Persona, Polaroid Board, and others. Every family ships complete light and dark variants, each with a dedicated code-syntax preset.
- **YAML-backed themes:** 44 starter YAML templates ship under `config/themes/` (one for each of the 43 built-in themes plus `example.theme.yaml`). User themes can also be loaded from `.config/themes.local.yaml` (dev) or `themes.yaml` (userData) at runtime and are validated by the same schema as built-in themes.
- **Custom themes:** Users can define every token via the in-app ThemeMaker and import/export configurations in YAML format. The starter configurations for all built-in themes are provided in the `config/themes/` directory as `.yaml` files.
- **Live preview:** Changes apply immediately without reload.
- **Persistent storage:** Canonical settings live in encrypted IndexedDB; a lightweight `localStorage` bootstrap cache prevents FOUC on startup.
- **WCAG AA compliance:** Contrast ratios are verified programmatically for all built-in themes and warned for custom themes.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Theme State (Zustand stores)                               │
│  ├─ selectedThemeId: string                                 │
│  ├─ appearanceMode: "dark" | "light"                        │
│  └─ customTheme: Theme | null                               │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  resolveInitialTheme(bootstrap, yamlThemes?)  │          │
│  │  → YAML theme → custom → built-in → fallback  │          │
│  └──────────────────────────────────────────────┘          │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  applyTheme(theme)                            │          │
│  │  → writes CSS variables to :root              │          │
│  │  → sets data-theme-mode on <html>             │          │
│  └──────────────────────────────────────────────┘          │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  Tailwind v4 @theme                            │          │
│  │  → maps CSS vars to utility classes            │          │
│  └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘

YAML Theme Loading (desktop only):
┌─────────────────────────────────────────────────────────────┐
│  .config/themes.local.yaml  (dev)                             │
│  or userData/.config/themes.yaml (packaged)                   │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  configService.loadMergedThemes()             │          │
│  │  → yaml.parse → validateThemesFile()          │          │
│  │  → snake_case → camelCase normalization       │          │
│  └──────────────────────────────────────────────┘          │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  config-store.ts                               │          │
│  │  → yamlThemeToTheme() → Theme objects         │          │
│  │  → cached in useConfigStore.yamlThemes        │          │
│  └──────────────────────────────────────────────┘          │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  ThemeMaker.tsx                                │          │
│  │  → merged into theme selector buttons         │          │
│  │  App.tsx / useThemeLifecycle                   │          │
│  │  → resolve by id from yamlThemes cache        │          │
│  └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### YAML Theme Resolution Order

When a user selects a theme by id, `resolveInitialTheme()` (`src/theme/applyTheme.ts`) probes in this order:

1. **YAML theme:** If `useConfigStore.yamlThemes[id]` exists, use it. This lets YAML themes override built-in themes by matching id.
2. **Custom theme (`custom` id):** If `selectedThemeId === 'custom'` and a `customTheme` object is stored, use it.
3. **Custom theme from `customThemes`:** A user-saved custom theme whose id matches the selection.
4. **Custom theme by id:** A stored `customTheme` whose own id matches the selection.
5. **Registry lookup:** `themeRegistry.get()` resolves the id (after legacy-id migration, e.g. `builtin-light` → `light`) against the registry, where precedence is **YAML > custom > built-in**.
6. **Fallback:** Use the `light` family when the effective mode is light, otherwise `BUILTIN_VENICE` (Venice Parity Dark, the default family).

Steps 2–4 lift the persisted single-mode `Theme` into a V2 family by copying the same tokens into both variants (see `legacyThemeToFamily`), so legacy custom themes keep their authored look in either appearance mode.

### Two-Layer Persistence

| Layer | Storage | Content | Purpose |
|-------|---------|---------|---------|
| **Canonical** | IndexedDB (`StorageService.saveItem("settings", …)`) | Full `AppSettings` including `selectedThemeId`, `appearanceMode`, `customTheme` | Source of truth; encrypted at rest for `"settings"` store |
| **Bootstrap** | `localStorage['vf.theme.bootstrap']` | Color tokens + metadata only (no secrets) | FOUC prevention; read by inline `<script>` in `index.html` before React mounts |

After IndexedDB hydrates, `App.tsx` reconciles the canonical settings against the bootstrap cache. If they differ, the canonical theme is re-applied and the cache is refreshed.

### YAML Theme Discovery

On desktop startup, `main.tsx` calls `refreshConfig()` before the React tree mounts. This:

1. Loads the sanitized config payload via `desktopConfig.get()`.
2. Calls `desktopConfig.loadMergedThemes()` to parse the active `themes.yaml`.
3. Validates each entry with `validateThemesFile()` (schema version 1, all 36 required tokens, safe color values).
4. Converts valid entries to `Theme` objects via `yamlThemeToTheme()` (snake_case → camelCase normalization).
5. Stores them in `useConfigStore.yamlThemes` so the UI and theme resolver can access them without re-parsing.

On `config:reload`, the same flow re-runs and updates the cache.

Invalid YAML entries are skipped with a `ConfigWarning` (surfaced in Settings → Local Config). Malformed parse errors do not crash the app; the theme picker falls back to built-in themes only.

---

## Token Reference

There are **36 canonical semantic tokens**. Each maps to a CSS custom property (`--*`) and a Tailwind v4 utility class. The legacy `textPrimary` / `textSecondary` / `textMuted` trio remains part of the required 36-key contract: when the `foreground` / `foregroundMuted` / `foregroundSubtle` roles are absent, runtime normalization (`completeThemeTokens()`) derives them from the trio.

| Token | CSS Variable | Tailwind Class | Role |
|-------|-------------|----------------|------|
| `background` | `--bg` | `bg-bg` | App/workspace background |
| `surface` | `--surface` | `bg-surface` | Card/panel backgrounds |
| `surfaceElevated` | `--surface-elevated` | `bg-surface-elevated` | Elevated cards, inputs, modal backdrops |
| `surfaceMuted` | `--surface-muted` | `bg-surface-muted` | Subdued controls and selected secondary surfaces |
| `overlay` | `--overlay` | `bg-overlay` | Modal scrims, dropdown backdrops |
| `glow` | `--glow` | `bg-glow` | Accent ambient glow, active indicator luminescence |
| `border` | `--border` | `border-border` | Dividers, input borders |
| `borderStrong` | `--border-strong` | `border-border-strong` | Hovered controls and high-emphasis dividers |
| `foreground` | `--foreground` | `text-foreground` | Headings and primary body text |
| `foregroundMuted` | `--foreground-muted` | `text-foreground-muted` | Labels and secondary text |
| `foregroundSubtle` | `--foreground-subtle` | `text-foreground-subtle` | Low-emphasis supporting text |
| `textPrimary` | `--text-primary` | `text-text-primary` | Legacy primary text role; derivation source for `foreground` |
| `textSecondary` | `--text-secondary` | `text-text-secondary` | Legacy secondary text role; derivation source for `foregroundMuted` |
| `textMuted` | `--text-muted` | `text-text-muted` | Legacy muted text role; derivation source for `foregroundSubtle` |
| `accent` | `--accent` | `bg-accent`, `text-accent`, `border-accent` | Primary action color |
| `accentHover` | `--accent-hover` | `hover:bg-accent-hover` | Accent hover state |
| `accentForeground` | `--accent-fg` | `text-accent-fg` | Text on accent backgrounds (buttons, badges) |
| `success` | `--success` | `text-success`, `border-success` | Positive status, success toasts |
| `successForeground` | `--success-fg` | `text-success-fg` | Text/icons on success backgrounds |
| `warning` | `--warning` | `text-warning`, `border-warning` | Cautions, warnings |
| `warningForeground` | `--warning-fg` | `text-warning-fg` | Text/icons on warning backgrounds |
| `danger` | `--danger` | `text-danger`, `border-danger` | Errors, destructive actions |
| `dangerForeground` | `--danger-fg` | `text-danger-fg` | Text/icons on danger backgrounds |
| `inputBackground` / `inputForeground` | `--input-bg` / `--input-fg` | `bg-input-bg` / `text-input-fg` | Form controls |
| `placeholder` / `disabledForeground` | `--placeholder` / `--disabled-fg` | `text-placeholder` / `text-disabled-fg` | Placeholder and disabled states |
| `buttonPrimaryBackground` / `buttonPrimaryForeground` | `--button-primary-bg` / `--button-primary-fg` | `bg-button-primary-bg` / `text-button-primary-fg` | Primary actions |
| `buttonSecondaryBackground` / `buttonSecondaryForeground` | `--button-secondary-bg` / `--button-secondary-fg` | `bg-button-secondary-bg` / `text-button-secondary-fg` | Secondary actions |
| `link` | `--link` | `text-link` | Links and link-style actions |
| `focusRing` | `--focus-ring` | `focus-visible:ring-focus-ring` | Keyboard focus outline |
| `selectionBackground` / `selectionForeground` | `--selection-bg` / `--selection-fg` | `bg-selection-bg` / `text-selection-fg` | Selected text |

### Raw Hex Rule

Raw hex values are intentionally **scoped** to:
- `src/theme/themes.ts` — built-in palette definitions
- `src/styles/theme.css` — brand palette, button gradients, scrollbar rgba
- `src/components/ThemeMaker.tsx` — input fallback `#000000`
- Test fixtures

All component and module bodies consume **CSS variables / Tailwind semantic tokens** only.

### Typography
Typography is managed locally to ensure privacy and offline capability.
- `MesloLGM Nerd Font` is mapped to `--font-sans`.
- `MesloLGS Nerd Font Mono` is mapped to `--font-mono`.
No external font requests (e.g., Google Fonts) are made, which is enforced by the Content Security Policy.

### Code & Syntax Tokens

In addition to the 29 UI tokens, every theme variant now defines 33 **code/syntax tokens** exposed as CSS custom properties:

**Code surfaces (8 tokens):**

| Token | CSS Variable | Usage |
|---|---|---|
| `background` | `--code-bg` | Fenced code block background |
| `foreground` | `--code-fg` | Fenced code block text |
| `border` | `--code-border` | Code block border |
| `headerBackground` | `--code-header-bg` | Language label/copy header background |
| `headerForeground` | `--code-header-fg` | Language label/copy header text |
| `inlineBackground` | `--code-inline-bg` | Inline `<code>` background |
| `inlineForeground` | `--code-inline-fg` | Inline `<code>` text |
| `selectionBackground` | `--code-selection-bg` | Selected code text background |

**Syntax tokens (25 tokens):**

| Token | CSS Variable | Example code elements |
|---|---|---|
| `comment` | `--syntax-comment` | Comments, prolog, doctype, CDATA |
| `punctuation` | `--syntax-punctuation` | Brackets, commas, delimiters |
| `property` | `--syntax-property` | Object properties |
| `tag` | `--syntax-tag` | HTML/XML tags |
| `boolean` | `--syntax-boolean` | `true` / `false` |
| `number` | `--syntax-number` | Numeric literals |
| `constant` | `--syntax-constant` | Constants |
| `symbol` | `--syntax-symbol` | Symbols |
| `deleted` | `--syntax-deleted` | Diff deletions |
| `selector` | `--syntax-selector` | CSS selectors |
| `attribute` | `--syntax-attribute` | Attribute names/values |
| `string` | `--syntax-string` | Strings, attr-values |
| `character` | `--syntax-character` | Character escapes |
| `builtin` | `--syntax-builtin` | Built-in identifiers |
| `inserted` | `--syntax-inserted` | Diff insertions |
| `operator` | `--syntax-operator` | Operators |
| `entity` | `--syntax-entity` | Entities |
| `url` | `--syntax-url` | URLs |
| `atRule` | `--syntax-atrule` | CSS at-rules |
| `keyword` | `--syntax-keyword` | Keywords |
| `function` | `--syntax-function` | Function names |
| `className` | `--syntax-class-name` | Class/type names |
| `regex` | `--syntax-regex` | Regular expressions |
| `important` | `--syntax-important` | `!important` |
| `variable` | `--syntax-variable` | Variables |

No component or stylesheet hardcodes a syntax color; every token resolves through `applyTheme()` to a CSS variable, so switching themes recolors already-rendered code immediately without re-tokenization.

---

## Theme Catalog

Venice Forge supports three categories of themes:

1. **Built-in themes** — hardcoded in `src/theme/themes.ts`, always available.
2. **YAML-backed themes** — loaded at runtime from `.config/themes.local.yaml` (dev) or `userData/.config/themes.yaml` (packaged), discovered on startup and cached in `config-store`.
3. **Custom themes** — created by the user in the ThemeMaker UI, persisted as full `Theme` objects in IndexedDB.

### Built-in Themes (Hardcoded)

The following 43 themes are compiled into the renderer bundle and available even when no YAML config is present:

**Full catalog:**

- `builtin-venice` — Default Venice dark aesthetic
- `builtin-dark` — Classic graphite dark
- `builtin-light` — Clean light-gray light
- `builtin-obsidian-ember` — Deep charcoal with glowing ember accent
- `builtin-midnight-cobalt` — Midnight navy with electric cobalt accent
- `builtin-terminal-forest` — Terminal green dark matrix
- `builtin-porcelain-sky` — Crisp porcelain white with bright sky blue accent
- `builtin-sandstone` — Warm sandstone with earthy terracotta accent
- `builtin-obsidian-bloom` — Obsidian Bloom (dark)
- `builtin-harbor-fog` — Harbor Fog (light)
- `builtin-circuit-mint` — Circuit Mint (dark)
- `builtin-amber-archive` — Amber Archive (light)
- `builtin-neon-dusk` — Neon Dusk (dark)
- `builtin-aurora-boreal` — Deep space black with vibrant mint-green aurora accent
- `builtin-sakura-terminal` — Warm cream with soft pink cherry-blossom accent
- `builtin-basalt-noir` — Charcoal-black basalt with bold rose-red accent
- `builtin-solar-ash` — Warm desert sand with burnt-orange sunburst accent
- `builtin-cyber-orchid` — Midnight electric-blue with vivid magenta orchid accent
- `builtin-arctic-glass` — Crisp ice-blue glass with cool cyan accent
- `builtin-desert-copperfield` — Warm terracotta with rich copper-orange accent
- `builtin-toxic-limewire` — Pitch black with neon-lime toxic accent (high contrast)
- `builtin-midnight-velvet` — Deep midnight blue with soft lavender velvet accent
- `builtin-porcelain-daybreak` — Clean porcelain white with warm amber daybreak accent
- `builtin-synthwave-harbor` — Dark neon harbor with hot-pink synthwave accent
- `builtin-moss-circuit` — Deep forest green with bright lime-green circuit accent
- `builtin-ember-monastery` — Dark stone with warm burnt-orange ember accent
- `builtin-glacial-ink` — Near-black with sharp cyan glacial accent (high contrast)
- `builtin-ultraviolet-rain` — Dark violet with electric purple ultraviolet accent
- `builtin-copper` — Warm copper-accent dark
- `builtin-dracula` — Dracula-inspired dark purple
- `builtin-gruvbox-dark` — Retro warm-yellow dark
- `builtin-rosepine` — Rose-gold accent dark
- `builtin-nord` — Arctic frost-blue dark
- `builtin-tokyo-night` — Deep purple periwinkle dark
- `builtin-catppuccin` — Soft pastel pink dark
- `builtin-solarized` (`builtin-solarized-dark` / `builtin-solarized-light`) — Low-contrast yellow dark / beige light
- `builtin-one-dark` — Calm blue code-editor dark
- `builtin-monokai` — Bright lime dark
- `builtin-github-light` — Clean light theme mirroring GitHub's default light UI
- `builtin-cotton-candy-console` — Playful cotton candy aqua/pink light
- `builtin-sweet-nightmare` — Deep plum near-black with bubblegum pink dark
- `builtin-dual-persona` — Aqua/pink dual-tone light
- `builtin-polaroid-board` — Warm cork board with powder aqua accent light

### YAML-Backed Themes (Runtime-Loaded)

`config/themes/` ships 44 starter YAML templates — one for every of the 43 built-in themes above plus `example.theme.yaml`. Users can also define additional themes in `.config/themes.local.yaml` (dev) or `userData/.config/themes.yaml` (packaged). On startup, `configService.loadMergedThemes()` parses the file, validates each entry (schema version 1, all 36 required tokens, safe color values), converts snake_case keys to camelCase via `yamlThemeToTheme()`, and caches the resulting `Theme` objects in `useConfigStore.yamlThemes`. They appear in the ThemeMaker selector alongside built-in themes and can be selected just like built-in themes.

### Contrast Verification

All built-in themes are audited against an expanded WCAG AA contrast matrix enforced by the regression guard in `src/theme/contrast.test.ts`:

- `foreground` / `background` ≥ 4.5:1
- `foreground` / `surface` ≥ 4.5:1
- `foreground` / `surfaceElevated` ≥ 4.5:1
- `accentForeground` / `accent` ≥ 4.5:1
- `buttonPrimaryForeground` / `buttonPrimaryBackground` ≥ 4.5:1
- `buttonSecondaryForeground` / `buttonSecondaryBackground` ≥ 4.5:1
- `dangerForeground` / `danger` ≥ 4.5:1
- `warningForeground` / `warning` ≥ 4.5:1
- `successForeground` / `success` ≥ 4.5:1
- `selectionForeground` / `selectionBackground` ≥ 4.5:1
- `focusRing` / `background` ≥ 3.0:1
- `disabledForeground` / `background` ≥ 3.0:1
- `foregroundSubtle` / `background` ≥ 3.0:1

---

## ThemeMaker UI

Located in **Settings → Appearance → Theme Maker** (`src/components/ThemeMaker.tsx`).

### Features
- **Theme selector:** Switch between all built-in theme families or Custom.
- **Token editor:** Each UI token has a synced native color picker and hex text input.
- **Code & Syntax editor:** A dedicated section edits the active variant's code palette.
  - **Syntax preset selector:** Choose from bundled presets (Venice, Dracula, Gruvbox Dark, Rose Pine, Nord, Tokyo Night, Catppuccin, Solarized, One Dark, Monokai, GitHub Light, Automatic/Derived, and family-specific presets). Selecting a preset replaces the underlying code tokens; subsequent individual edits override the preset value while keeping the preset metadata.
  - **Code surface controls:** Background, foreground, border, header background/foreground, inline background/foreground, and selection background.
  - **Syntax token controls:** All 25 syntax roles exposed as color inputs.
  - **Light/dark isolation:** Editing the dark variant never mutates the light variant and vice versa.
- **Hex validation:** Regex `/^#([0-9a-f]{3}|[0-9a-f]{6})$/i`; invalid input falls back to `#000000`.
- **Live preview:** `applyTheme(draftTheme)` updates the entire app in real time as you edit, including the live syntax preview.
- **Contrast warnings:** Checks UI token pairs and code-surface pairs (`foreground`/`background`, `inlineForeground`/`inlineBackground`, `headerForeground`/`headerBackground`) against WCAG AA. Built-in themes must pass; custom themes warn rather than rewrite. Warnings render in an `aria-live="polite"` region.
- **Preview card:** A mini app mock-up (`ThemePreview.tsx`) showing background, sidebar, active tab, button, input, alert tokens, and a syntax-highlighted TypeScript sample.

### Controls
- **Save custom theme:** Persists to canonical IndexedDB settings + refreshes bootstrap cache, including the full `code` config for the selected variant.
- **Export theme:** Saves the current custom theme as a standalone `.yaml` file conforming to Theme Engine V2 (`schemaVersion: 2`) with complete `variants.<mode>.code` blocks.
- **Import theme:** Loads a previously exported `.yaml` theme file or legacy single-mode `Theme`, validates the schema, and applies it. Missing `code` configuration is derived deterministically from UI tokens.
- **Reset custom theme:** Reverts editor to last saved custom theme, including code data.
- **Restore defaults:** Switches to the Venice built-in family and clears the custom theme.

---

## Persistence & Lifecycle

### Startup (FOUC Prevention)

1. Browser parses `index.html`.
2. Inline `<script>` runs before paint:
   - Reads `localStorage.getItem('vf.theme.bootstrap')`.
   - If valid, applies CSS variables directly to `:root`.
   - If missing/invalid, falls back to Forge Graphite (dark) or Forge Daylight (light) based on `prefers-color-scheme`.
3. React mounts; `App.tsx` bootstraps.

### Hydration

1. `App.tsx` opens IndexedDB via `StorageService.openDB()`.
2. Fetches settings with `getItemsWithMeta("settings")`.
3. Finds record `id === "app-settings"`.
4. Dispatches `SET_SETTINGS` with stored settings (including theme fields).
5. Post-dispatch `useEffect` reads `state.settings.selectedThemeId`, `appearanceMode`, `customTheme` → calls `applyTheme()`.

### Reconciliation

A separate `useEffect` in `App.tsx` compares canonical settings to the bootstrap cache. If drifted:
- Re-applies the canonical theme.
- Re-writes `localStorage['vf.theme.bootstrap']` with a colors-only snapshot.

### Save

A debounced (500 ms) `useEffect` on `state.settings` changes calls:
```ts
StorageService.saveItem("settings", {
  id: "app-settings",
  value: state.settings,
  timestamp: Date.now(),
});
```

---

## Accessibility

- **Keyboard focus:** All interactives use `focus-visible:ring-2 focus-visible:ring-focus-ring` with `--focus-ring` token.
- **Reduced motion:** `src/styles/accessibility.css` includes `@media (prefers-reduced-motion: reduce)` rules.
- **Aria-live:** Existing `aria-live="polite"` regions (offline banner, status block, toast host, chat module, batch module, image generation form) were preserved. ThemeMaker adds an additional `aria-live="polite"` region for contrast warnings.
- **Color independence:** UI does not rely on color alone; status chips combine color tokens with border and background patterns.

---

## Adding a New Theme

### Option A: Built-in Theme

1. Open `src/theme/themes.ts`.
2. Add a new `Theme` object:
   ```ts
   export const BUILTIN_OCEAN: Theme = {
     id: "builtin-ocean",
     name: "Forge Ocean",
     mode: "dark",
     tokens: { /* 17 tokens */ },
   };
   ```
3. Export it from `src/theme/index.ts`.
4. Add it to the theme list in `ThemeMaker.tsx`.
5. Update the fallback map in `index.html` bootstrap script (reads from `localStorage['vf.theme.bootstrap']`).
6. Run contrast verification: `npx tsx -e "import {contrastRatio} from './src/theme/contrast'; console.log(contrastRatio('#fff', '#0a0a0a'));"`.
7. Update this document.

### Option B: Custom Theme at Runtime

Users create custom themes via the ThemeMaker UI. No code changes required.

### Option C: YAML-Backed Theme (Recommended for Distribution)

1. Open `.config/themes.local.yaml` (dev) or `userData/.config/themes.yaml` (packaged).
2. Add a new entry under `themes:`:
   ```yaml
   themes:
     ocean-breeze:
       display_name: "Ocean Breeze"
       mode: dark
       tokens:
         bg: "#0a1628"
         bg_surface: "#112240"
         # ... all 36 required tokens
   ```
3. Save the file.
4. In the app, go to **Settings → Local Config → Reload** (or restart the app).
5. The theme appears automatically in the ThemeMaker selector under the YAML Themes section.
6. No code changes, no rebuild, no re-release required.

> **Note:** YAML theme IDs must be unique. If a YAML theme ID matches a built-in theme ID, the YAML version takes precedence at runtime. Invalid entries are skipped with a warning in Settings → Local Config.

---

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `src/theme/themeTypes.ts` | Type contracts (`ThemeMode`, `ThemeTokens`, `Theme`, `ThemeFamily`, `ResolvedTheme`, `CodeThemeTokens`, `CodeThemeConfig`) |
| `src/theme/codeSyntaxTypes.ts` | Re-export barrel for code/syntax types |
| `src/theme/codeSyntaxPresets.ts` | Bundled code-syntax presets (light/dark pairs for 43+ preset identities) |
| `src/theme/codeSyntax.ts` | Preset resolution, automatic derivation from UI tokens, and `completeCodeThemeConfig` |
| `src/theme/themes.ts` | Built-in palette barrel (back-compat) |
| `src/theme/builtins/index.ts` | Built-in theme family registry and `BUILTIN_THEME_FAMILIES` array |
| `src/theme/builtins/*.ts` | Per-family light/dark palette definitions, each including a `code` config |
| `src/theme/applyTheme.ts` | Maps UI and code tokens to CSS variables; resolves initial theme |
| `src/theme/contrast.ts` | WCAG luminance and contrast ratio utilities |
| `src/theme/fallbacks.ts` | Shared fallback constant (`#000000`) for validation |
| `src/theme/index.ts` | Barrel export |
| `src/theme/yamlTheme.ts` | Converts validated YAML theme entries to `ThemeFamily` objects (snake_case → camelCase normalization) |
| `src/theme/yaml/validate.ts` | Strict Theme Engine V2 YAML validator, including `code` shape validation |
| `src/theme/yaml/normalize.ts` | Normalizes partial V2 families to complete `ThemeFamily` objects |
| `src/theme/yaml/serialize.ts` | Deterministic V2 YAML serializer, including complete `code` blocks |
| `src/theme/yaml/parse.ts` | V2 YAML parser |
| `src/stores/config-store.ts` | Zustand store holding `yamlThemes` cache; loads themes on startup via `desktopConfig.loadMergedThemes()` |
| `src/stores/settings-store.ts` | Custom theme persistence; preserves `code` config through single-mode `Theme` round trips |
| `src/components/ThemeMaker.tsx` | Theme editor UI with Code & Syntax section |
| `src/components/ThemePreview.tsx` | Mini preview card with live syntax sample |
| `src/components/chat/ChatMarkdown.tsx` | Markdown renderer with fenced-code highlighting and copy-code |
| `src/components/chat/codeHighlighting.tsx` | Refractor integration, alias map, HAST-to-React renderer, and performance guard |
| `.config/themes.local.yaml` | Dev environment YAML theme definitions |
| `.config/themes.example.yaml` | Tracked example YAML theme file (shipped with repo) |

### Modified Files (Theming Impact)

| File | Change |
|------|--------|
| `src/types/app.ts` | Extended `AppSettings` with theme fields |
| `src/state/appReducer.ts` | Added theme fields to `initialState.settings` and `SET_SETTINGS` whitelist |
| `src/styles/theme.css` | Expanded `:root` vars, `@theme` semantic colors, code-surface/syntax CSS variables, `.btn` system, `prefers-reduced-motion` |
| `index.html` | Inline FOUC-prevention bootstrap script |
| `src/App.tsx` | Theme hydration/reconciliation effects; bootstrap cache includes code-surface tokens; reskinned shell |
| `src/stores/settings-store.ts` | Persists custom themes with full `code` config; migrates legacy themes without code data |
| `src/components/TabButton.tsx` | Token-based active/inactive states |
| `src/components/Chip.tsx` | Token-based status chips |
| `src/components/ToastHost.tsx` | Token-based toast variants |
| `src/components/StatusBlock.tsx` | Token-based status indicators |
| `src/components/ErrorBoundary.tsx` | Token-based error UI |
| `src/components/ConfirmModal.tsx` | Token-based modal |
| `src/components/Field.tsx` | Token-based form field |
| `src/components/CollapsibleSection.tsx` | Token-based collapsible |
| `src/components/ModelSelect.tsx` | Token-based dropdown |
| `src/components/DiagnosticsPreview.tsx` | Token-based preview |
| `src/components/ImageGenerationPreview.tsx` | Token-based preview |
| `src/components/ImageActionModal.tsx` | Token-based modal |
| `src/components/SettingsView.tsx` | Integrated ThemeMaker; reskinned settings UI (replaces historical `src/modules/SettingsModule.tsx`) |
| `src/components/ThemeMaker.tsx` | Added Code & Syntax editor with preset selector, code-surface controls, syntax-token controls, light/dark isolation, and contrast warnings |
| `src/components/ThemePreview.tsx` | Added live syntax-highlighted TypeScript sample and code-contrast warnings |
| `src/components/chat/ChatView.tsx` | Reskinned chat UI (replaces historical `src/modules/ChatModule.tsx`) |
| `src/components/chat/ChatMarkdown.tsx` | Markdown renderer with theme-aware fenced-code highlighting, language label, copy button, and preserved sanitation |
| `src/components/chat/codeHighlighting.tsx` | Refractor grammar registration, alias map, safe HAST-to-React renderer, and complexity fallback |
| `src/components/SearchScrapeView.tsx` | Reskinned research UI (replaces historical `src/modules/SearchScrapeModule.tsx`) |
| `src/components/gallery/gallery-view.tsx` | Reskinned Media Studio UI (formerly "Library"; canonical tab id is `media`, see `src/config/tabs.ts`) |
| `src/components/image/ImageView.tsx` | Reskinned image UI (replaces historical `src/modules/ImageModule.tsx`) |
| `src/components/StatusView.tsx` | Reskinned status UI (replaces historical `src/modules/DiagnosticsModule.tsx`; tab id is `status`) |

> **Note (2026-06-06):** The `src/modules/*Module.tsx` files listed in
> earlier revisions of this table no longer exist. The components were
> renamed and reorganised into `src/components/{...}View.tsx` and the
> `src/components/{chat,image,audio,...}/` subdirectories during the
> 2026-06-04–05 module refactor. The "Models" tab was removed (model
> selection now lives inside each studio) and "Batch" was removed in the
> same pass. The current canonical tab registry is `src/config/tabs.ts`.

---

## Migration Notes

### For Contributors

- **No `tailwind.config`:** Tailwind v4 is CSS-first. Add new semantic colors to the `@theme` block in `src/styles/theme.css`, not a JS config.
- **No raw hex in components:** If you need a new color, add it as a token. If it is one-off, justify it in the PR. The existing exceptions are intentional and scoped.
- **No hardcoded syntax colors:** Code/syntax colors must come from `--code-*` and `--syntax-*` CSS variables. Do not add literal `#hex` values to `src/components/chat` or `src/styles` for syntax highlighting.
- **Test contrast:** If you change a built-in palette, run the contrast checks. The minimum acceptable ratio is 4.5:1 for text-on-background pairs and 3.0:1 for UI borders/focus rings. Code-surface pairs (`code.foreground`/`code.background`, `inlineForeground`/`inlineBackground`, `headerForeground`/`headerBackground`) must also meet 4.5:1.

### For Users Upgrading from Pre-Theme Versions

- On first launch after upgrade, the app detects no theme settings and defaults to **Venice (dark)**.
- Existing settings (API key, model defaults, etc.) are preserved.
- The old `theme` string field (if present) is migrated gracefully; the new fields `selectedThemeId`, `appearanceMode`, and `customTheme` take precedence.
- **Legacy themes without code configuration:** Single-mode `Theme` records and old V2 `ThemeFamily` YAML files that omit `variants.<mode>.code` continue to load. The app derives a readable code palette from the existing UI tokens using the `automatic` preset. No user theme is lost or corrupted.

---

## Further Reading

- [`docs/ABOUT.md`](../ABOUT.md) — Architecture and goals
- [`docs/FAQ.md`](../FAQ.md) — Frequently asked questions (includes theme Q&A)
- [`summary_of_work.md`](../summary_of_work.md) — Current development and validation history
- [`src/theme/`](../../src/theme/) — Source code
