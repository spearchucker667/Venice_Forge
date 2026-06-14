# Design: Add Five Built-in Themes

**Date:** 2026-06-14  
**Scope:** Expand the built-in theme collection with five popular, contrast-tested palettes, each paired with a YAML template under `config/themes/`.

---

## Goal

Give users more out-of-the-box visual choices by adding five built-in dark/light themes that conform to the existing 29-token semantic theme contract. Every new theme must ship with a matching YAML template so users can use it as a starting point for custom edits.

---

## Themes to Add

| ID | Display Name | Mode | Accent | Base Background | Inspiration |
|----|--------------|------|--------|-----------------|-------------|
| `builtin-nord` | Forge Nord | dark | `#88C0D0` | `#2E3440` | Nord color palette |
| `builtin-tokyo-night` | Forge Tokyo | dark | `#7aa2f7` | `#1a1b26` | Tokyo Night |
| `builtin-catppuccin` | Forge Catppuccin | dark | `#f38ba8` | `#1e1e2e` | Catppuccin Mocha |
| `builtin-solarized-dark` | Forge Solarized Dark | dark | `#b58900` | `#002b36` | Solarized Dark |
| `builtin-solarized-light` | Forge Solarized Light | light | `#cb4b16` | `#fdf6e3` | Solarized Light |

---

## Implementation Plan

1. **Add palette objects in `src/theme/themes.ts`**
   - Define `BUILTIN_NORD`, `BUILTIN_TOKYO_NIGHT`, `BUILTIN_CATPPUCCIN`, `BUILTIN_SOLARIZED_DARK`, `BUILTIN_SOLARIZED_LIGHT`.
   - Each uses `completeThemeTokens(mode, { ... })` with all 17+ token values filled.
   - Append the new objects to `BUILTIN_THEMES`.

2. **Export from `src/theme/index.ts`**
   - Re-export the five new constants so other modules can import them.

3. **Register in `src/components/ThemeMaker.tsx`**
   - Import the new constants.
   - Add entries to the `builtInMap` Record so the settings dropdown lists them.

4. **Add YAML templates in `config/themes/`**
   - Create `nord.yaml`, `tokyo_night.yaml`, `catppuccin.yaml`, `solarized_dark.yaml`, `solarized_light.yaml`.
   - Follow the existing legacy format: `accent`, `background`, `details`, `foreground`, `terminal_colors` (normal + bright).

5. **Update `docs/design/THEME_SYSTEM.md`**
   - Add the five new themes to the built-in list.
   - Add one-line descriptions.

6. **Update `docs/summary_of_work.md`**
   - Record the session per AGENTS.md.

---

## Contrast & Validation

- All token values must satisfy the 29-token contract in `src/theme/themeTypes.ts`.
- WCAG AA ratios must be verified for:
  - `textPrimary` on `background`
  - `textSecondary` on `background`
  - `accentForeground` on `accent`
- Run `npx vitest run src/theme/contrast.test.ts` after implementation.

## Testing

- `npm run typecheck` (renderer + electron)
- `npm run lint:eslint`
- `npx vitest run src/theme/contrast.test.ts src/components/ThemeMaker.test.ts`
- `npm run verify:theme-tokens`

---

## Out of Scope

- No new runtime theme-loading logic.
- No changes to the ThemeMaker UI behavior beyond adding map entries.
- No new dependency or font changes.
