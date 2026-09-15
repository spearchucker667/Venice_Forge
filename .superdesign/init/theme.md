# Venice Forge — Theme System (source-grounded init)

> **Authorities:** `src/theme/themeTypes.ts`, `src/theme/builtins/index.ts`, `src/theme/builtins/venice.ts`, `src/theme/resolver.ts`, `src/theme/applyTheme.ts`, `src/styles/theme.css`.

## Architecture

- `ThemeFamily` schema version 2 contains one family identity with `variants.light` and `variants.dark`.
- `src/theme/builtins/index.ts` registers the built-in family list and `BUILTIN_CANONICAL_MODES`; `BUILTIN_VENICE` is the default family.
- `resolveTheme()` selects the effective mode and completes semantic tokens; `applyTheme()` writes runtime CSS variables and pins `color-scheme`.
- YAML/custom persistence uses `src/theme/yaml/`, Electron theme services, and Theme Maker. Do not add renderer secret/file access.
- Tailwind v4 utilities map to CSS variables in `src/styles/theme.css`; UI components must not hardcode palette values.

## Current Venice fingerprints

`src/theme/builtins/venice.ts` current default direction:

- dark background: `#050505`
- dark accent: `#ef555f`
- dark accent hover: `#f65964`
- light accent: `#c81e3f`
- dark surface: `#0d0d10` / raised `#16161a`

The old blue/cyan values are not current authority and must not be regenerated into design artifacts.

## Raw CSS/token source (`src/styles/theme.css`)

```css
@theme {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --color-text-primary: var(--text-primary);
  --color-vf-shell-bg: var(--color-bg);
  --color-vf-shell-bg-deep: color-mix(in srgb, var(--color-bg) 92%, var(--color-surface-muted) 8%);
  --color-vf-panel-bg: var(--color-surface);
  --color-vf-panel-bg-raised: var(--color-surface-elevated);
  --color-vf-panel-bg-inset: var(--color-surface-muted);
  --color-vf-panel-border: var(--color-border);
  --color-vf-panel-border-hot: color-mix(in srgb, var(--color-accent) 45%, var(--color-border));
  --color-vf-accent-glow: color-mix(in srgb, var(--color-accent) 22%, transparent);
  --color-vf-accent-glow-strong: color-mix(in srgb, var(--color-accent) 42%, transparent);
  --color-vf-accent-glow-subtle: color-mix(in srgb, var(--color-accent) 12%, transparent);
  --color-vf-control-hover: color-mix(in srgb, var(--color-text-primary) 8%, transparent);
}

:root {
  --radius-control: 0.5rem;
  --radius-panel: 0.625rem;
  --radius-dialog: 0.875rem;
}
```

## Runtime application source (`src/theme/applyTheme.ts`)

```ts
Object.entries(map).forEach(([key, value]) => root.style.setProperty(key, value));
root.dataset.themeMode = theme.mode;
root.style.colorScheme = theme.mode;
```

## Design constraints

- Derive new material tokens from semantic variables with `color-mix()`; do not create palette-specific component literals.
- Keep token names unique in a scope; `--color-border-soft` and `--color-border-faint` each have one semantic definition.
- Preserve contrast, reduced motion, forced colors, RTL, and custom/YAML theme inheritance.
