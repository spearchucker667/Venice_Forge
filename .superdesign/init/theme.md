# Venice Forge — Theme System

## Architecture

- **Theme Family v2**: one identity = `ThemeFamily { schemaVersion: 2, variants: { light, dark } }`; each variant = `{ tokens: ThemeTokens, code: CodeThemeConfig }`.
- **43 built-in families** as TypeScript token definitions in `src/theme/builtins/` (aggregated in `builtins/index.ts`). Default = `BUILTIN_VENICE`.
- **Runtime application**: `src/theme/applyTheme.ts` writes ~90 CSS custom properties onto `document.documentElement.style` (`--bg`, `--surface`, `--surface-elevated`, `--surface-muted`, `--border`, `--border-strong`, `--accent`, `--accent-hover`, `--accent-fg`, `--foreground`, `--foreground-muted`, `--success/--warning/--danger/--info`, `--glow`, `--overlay`, `--code-*`, `--syntax-*`, `--app-mesh-opacity`, `--app-font-scale`). Sets `data-theme-mode` + `color-scheme`.
- **Tailwind v4 (CSS-first, no JS config)**: `src/styles/theme.css` `@theme` block maps Tailwind color utilities to the runtime CSS vars. Geometry shared across all themes: `--radius-control: 8px`, `--radius-panel: 12px`, `--radius-dialog: 16px`; motion 75/140/220/350 ms; shadow scale `--shadow-subtle → --shadow-overlay`.
- **Custom themes & YAML import/export**: `src/theme/yaml/*`, `electron/services/themeService.ts`, Theme Maker UI (`src/components/ThemeMaker.tsx`). Resolution: YAML → legacy custom → built-in → default.
- **FOUC bootstrap**: `public/bootstrap-theme.js` + `localStorage['vf.theme.bootstrap']`.
- **Syntax/code themes**: 8 code-surface + 25 syntax tokens (`--code-*`, `--syntax-*`), consumed by Refractor in `.prose-venice`.
- **Verifier**: no hardcoded colors without `THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR` marker; `npm run verify:theme-tokens`.

## Current default (Venice Parity Dark)

Blue-tinted graphite: `--bg #050a0f`, `--surface #080f15`, `--surface-elevated #111922`, `--border #1b2632`, accent `#63b3ed` (blue). Redesign target: graphite-neutral near-black (`#050505–#212025`) with restrained crimson accent (`#EF555F` family) for the default dark variant only — all other families keep their own hues.

## Redesign constraint

NEVER bypass the token system. New material language (shell/panel/glow tokens) must be **derived CSS variables** in `src/styles/theme.css` using `color-mix()` from the semantic tokens above, so every theme family (incl. custom/YAML) inherits the new geometry/material with its own hue.
