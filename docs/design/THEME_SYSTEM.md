# Venice Forge Theme System

> Scope: Complete token-based theming architecture, live theme editor, FOUC prevention, and WCAG AA contrast compliance.
> Implemented: 2026-05-28
> Last updated: 2026-06-14
> Commit: `715fa1d`

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Token Reference](#token-reference)
4. [Built-in Themes](#built-in-themes)
5. [ThemeMaker UI](#thememaker-ui)
6. [Persistence & Lifecycle](#persistence--lifecycle)
7. [Accessibility](#accessibility)
8. [Adding a New Theme](#adding-a-new-theme)
9. [File Inventory](#file-inventory)
10. [Migration Notes](#migration-notes)

---

## Overview

Venice Forge uses a **semantic token-based theme system** built on Tailwind CSS v4 CSS variables. Core surfaces, text, status, form, button, link, focus, and selection colors derive from 29 canonical semantic roles mapped to CSS custom properties. This enables:

- **Built-in themes:** Venice Parity Dark (default), Forge Graphite (dark), Forge Daylight (light), Forge Copper (dark), Forge Dracula (dark), GruvBox Dark (dark), Rosepine (dark), Forge Nord (dark), Forge Tokyo (dark), Forge Catppuccin (dark), Forge Solarized Dark (dark), Forge Solarized Light (light), Forge One Dark (dark), Forge Monokai (dark), Forge GitHub Light (light).
- **Custom themes:** Users can define every token via the in-app ThemeMaker and import/export configurations in YAML format. The starter configurations for all built-in themes are provided in the `config/themes/` directory as `.yaml` files.
- **Live preview:** Changes apply immediately without reload.
- **Persistent storage:** Canonical settings live in encrypted IndexedDB; a lightweight `localStorage` bootstrap cache prevents FOUC on startup.
- **WCAG AA compliance:** Contrast ratios are verified programmatically for all built-in themes and warned for custom themes.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Theme State (React reducer)                                │
│  ├─ selectedThemeId: string                                 │
│  ├─ appearanceMode: "dark" | "light"                        │
│  └─ customTheme: Theme | null                               │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────┐          │
│  │  resolveInitialTheme(bootstrapCache?)         │          │
│  │  → picks builtin / custom / prefers-color     │          │
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
│  │  Tailwind v4 @theme                          │          │
│  │  → maps CSS vars to utility classes          │          │
│  │    (bg-bg, text-text-primary, border-border) │          │
│  └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### Two-Layer Persistence

| Layer | Storage | Content | Purpose |
|-------|---------|---------|---------|
| **Canonical** | IndexedDB (`StorageService.saveItem("settings", …)`) | Full `AppSettings` including `selectedThemeId`, `appearanceMode`, `customTheme` | Source of truth; encrypted at rest for `"settings"` store |
| **Bootstrap** | `localStorage['vf.theme.bootstrap']` | Color tokens + metadata only (no secrets) | FOUC prevention; read by inline `<script>` in `index.html` before React mounts |

After IndexedDB hydrates, `App.tsx` reconciles the canonical settings against the bootstrap cache. If they differ, the canonical theme is re-applied and the cache is refreshed.

---

## Token Reference

There are **29 canonical semantic tokens**. Each maps to a CSS custom property (`--*`) and a Tailwind v4 utility class. The legacy `textPrimary` / `textSecondary` / `textMuted`, `accentHover`, `info`, `overlay`, and `glow` fields remain supported for existing persisted and imported themes; runtime normalization maps them into the canonical roles.

| Token | CSS Variable | Tailwind Class | Role |
|-------|-------------|----------------|------|
| `background` | `--bg` | `bg-bg` | App/workspace background |
| `surface` | `--surface` | `bg-surface` | Card/panel backgrounds |
| `surfaceElevated` | `--surface-elevated` | `bg-surface-elevated` | Elevated cards, inputs, modal backdrops |
| `surfaceMuted` | `--surface-muted` | `bg-surface-muted` | Subdued controls and selected secondary surfaces |
| `border` | `--border` | `border-border` | Dividers, input borders |
| `borderStrong` | `--border-strong` | `border-border-strong` | Hovered controls and high-emphasis dividers |
| `foreground` | `--foreground` | `text-foreground` | Headings and primary body text |
| `foregroundMuted` | `--foreground-muted` | `text-foreground-muted` | Labels and secondary text |
| `foregroundSubtle` | `--foreground-subtle` | `text-foreground-subtle` | Low-emphasis supporting text |
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
- `@fontsource/inter` is mapped to `--font-sans`.
- `@fontsource/lora` is mapped to `--font-display` and `--font-brand`.
- `@fontsource/jetbrains-mono` is mapped to `--font-mono`.
No external font requests (e.g., Google Fonts) are made, which is enforced by the Content Security Policy.

---

## Built-in Themes

All built-in themes are configured as YAML templates under the `config/themes/` directory at the root:
- `config/themes/venice.yaml`
- `config/themes/dark.yaml`
- `config/themes/light.yaml`
- `config/themes/dracula.yaml`
- `config/themes/gruvbox_dark.yaml`
- `config/themes/rosepine.yaml`
- `config/themes/nord.yaml`
- `config/themes/tokyo_night.yaml`
- `config/themes/catppuccin.yaml`
- `config/themes/solarized_dark.yaml`
- `config/themes/solarized_light.yaml`
- `config/themes/one_dark.yaml`
- `config/themes/monokai.yaml`
- `config/themes/github_light.yaml`

### Venice Parity Dark — `builtin-venice`
The default theme, matching the official Venice dark aesthetic. Deep blue-black background (`#050a0f`) with a light-blue accent.

### Forge Graphite (dark) — `builtin-dark`
Classic dark theme. Graphite base (`#0d1117`) with a solid blue accent.

### Forge Daylight (light) — `builtin-light`
Light theme companion with clean light-gray background (`#f6f8fa`) and blue accent.

### Forge Copper (dark) — `builtin-copper`
Dark graphite base with a copper accent (`#a65c20`) for warm contrast.

### Forge Dracula — `builtin-dracula`
Dracula-inspired dark theme with dark purple background (`#282a36`) and lavender accent.

### GruvBox Dark — `builtin-gruvbox-dark`
Retro-style dark theme with retro-gray background (`#282828`) and warm yellow accent (`#fabd2f`).

### Rosepine — `builtin-rosepine`
Sleek dark theme with dark pink-ish purple background (`#191724`) and rose-gold accent.

### Forge Nord — `builtin-nord`
Arctic dark theme with a polar-night background (`#2E3440`) and a frost-blue accent (`#88C0D0`).

### Forge Tokyo — `builtin-tokyo-night`
Deep purple/blue dark theme (`#1a1b26`) with a calm periwinkle accent (`#7aa2f7`).

### Forge Catppuccin — `builtin-catppuccin`
Soft pastel dark theme (`#1e1e2e`) with a warm pink accent (`#f38ba8`).

### Forge Solarized Dark — `builtin-solarized-dark`
Classic low-contrast dark theme (`#002b36`) with a muted yellow accent (`#b58900`).

### Forge Solarized Light — `builtin-solarized-light`
Light beige companion (`#fdf6e3`) with an orange accent (`#cb4b16`).

### Forge One Dark — `builtin-one-dark`
Popular code-editor dark theme (`#282c34`) with a calm blue accent (`#61afef`).

### Forge Monokai — `builtin-monokai`
Classic Monokai dark theme (`#272822`) with a bright lime accent (`#a6e22e`).

### Forge GitHub Light — `builtin-github-light`
Clean light theme (`#ffffff`) with a blue accent (`#0969da`) that mirrors GitHub's default light UI.

### Contrast Verification

Built-in themes are audited for WCAG AA compliance (4.5:1 ratio for normal text, 3:1 for large text).

All ratios exceed WCAG AA thresholds (4.5:1 for normal text, 3:1 for large text).

---

## ThemeMaker UI

Located in **Settings → Appearance → Theme Maker** (`src/components/ThemeMaker.tsx`).

### Features
- **Theme selector:** Switch between all built-in themes or Custom.
- **Token editor:** Each token has a synced native color picker and hex text input.
- **Hex validation:** Regex `/^#([0-9a-f]{3}|[0-9a-f]{6})$/i`; invalid input falls back to `#000000`.
- **Live preview:** `applyTheme(draftTheme)` updates the entire app in real time as you edit.
- **Contrast warnings:** Checks primary/muted text, accent, input, danger, warning, and success foreground/background pairs against WCAG AA. Warnings render in an `aria-live="polite"` region.
- **Preview card:** A mini app mock-up (`ThemePreview.tsx`) showing background, sidebar, active tab, button, input, and alert tokens.

### Controls
- **Save custom theme:** Persists to canonical IndexedDB settings + refreshes bootstrap cache.
- **Export theme:** Saves the current custom theme as a standalone `.yaml` file conforming to the `theme.yaml` schema using native OS dialogs.
- **Import theme:** Loads a previously exported `.yaml` theme file or any legacy `accent/background/details/foreground/terminal_colors` template, validating its schema, inferring light/dark mode from the background luminance, and applying it.
- **Reset custom theme:** Reverts editor to last saved custom theme.
- **Restore defaults:** Switches to Forge Graphite and clears the custom theme.

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

---

## File Inventory

### New Files

| File | Purpose |
|------|---------|
| `src/theme/themeTypes.ts` | Type contracts (`ThemeMode`, `ThemeTokens`, `Theme`, `ThemeState`) |
| `src/theme/themes.ts` | Built-in palette definitions |
| `src/theme/applyTheme.ts` | Maps tokens to CSS variables + resolves initial theme |
| `src/theme/contrast.ts` | WCAG luminance and contrast ratio utilities |
| `src/theme/fallbacks.ts` | Shared fallback constant (`#000000`) for validation |
| `src/theme/index.ts` | Barrel export |
| `src/components/ThemeMaker.tsx` | Theme editor UI |
| `src/components/ThemePreview.tsx` | Mini preview card |

### Modified Files (Theming Impact)

| File | Change |
|------|--------|
| `src/types/app.ts` | Extended `AppSettings` with theme fields |
| `src/state/appReducer.ts` | Added theme fields to `initialState.settings` and `SET_SETTINGS` whitelist |
| `src/styles/theme.css` | Expanded `:root` vars, `@theme` semantic colors, `.btn` system, `prefers-reduced-motion` |
| `index.html` | Inline FOUC-prevention bootstrap script |
| `src/App.tsx` | Theme hydration/reconciliation effects; reskinned shell |
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
| `src/components/chat/ChatView.tsx` | Reskinned chat UI (replaces historical `src/modules/ChatModule.tsx`) |
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
- **Test contrast:** If you change a built-in palette, run the contrast checks. The minimum acceptable ratio is 4.5:1 for text-on-background pairs.

### For Users Upgrading from Pre-Theme Versions

- On first launch after upgrade, the app detects no theme settings and defaults to **Forge Graphite (dark)**.
- Existing settings (API key, model defaults, etc.) are preserved.
- The old `theme` string field (if present) is migrated gracefully; the new fields `selectedThemeId`, `appearanceMode`, and `customTheme` take precedence.

---

## Further Reading

- [`docs/ABOUT.md`](../ABOUT.md) — Architecture and goals
- [`docs/FAQ.md`](../FAQ.md) — Frequently asked questions (includes theme Q&A)
- [`CHANGELOG.md`](../audits/CHANGELOG.md) — Version history
- [`src/theme/`](../../src/theme/) — Source code
