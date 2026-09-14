# Reference UI Redesign — Phase 1: Material Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the approved graphite/crimson material system — derived `--color-vf-*` shell tokens, retuned default Venice dark variant, static grain ambient layer, shared material CSS classes, and six new panel primitives — without touching any workspace view.

**Architecture:** The theme engine is preserved byte-for-byte. All new material values are CSS variables derived via `color-mix()` from the semantic tokens `applyTheme` already writes, so all 43 theme families (incl. custom/YAML) inherit the new shell geometry with their own hue. Only the default Venice family's token *values* retune toward the reference palette. Spec: `docs/design/VENICE_FORGE_REFERENCE_UI_REDESIGN.md` (approved 2026-09-14).

**Tech Stack:** React 19, Vite, Tailwind v4 (CSS-first `@theme`), Vitest, plain CSS layers in `src/styles/`.

## Global Constraints

- Never add raw hex/rgb color literals to `src/components/**`; CSS may only use existing semantic tokens, `color-mix()` derivations, or values carrying `/* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */`.
- Never weaken or skip a verifier (`verify:theme-tokens`, `verify:i18n*`, mesh/CSP invariants). If one fails, fix the code.
- No `style={}` inline styles in JSX (CSP invariant, VERIFY-007); use classes/`data-*` attributes.
- Sidebar/header geometry contracts are untouched in this phase (220–480px, collapsed 60px, `md` drawer, header `h-14`) — this phase is tokens + primitives + ambient layer only.
- Body text minimums stay accessible: no `text-[Npx]` below the existing `--text-tag` (11px) scale step.
- No new npm dependencies, no new user-visible strings (no i18n keys needed for primitives).
- All tests run with `npx vitest run <file>` from repo root; repo root is `/Users/super_user/Projects/Venice_Forge`, branch `main`.
- Commit messages follow work order §38: `style(ui): …` scope for this phase.

---

### Task 1: Derived shell material tokens (`--color-vf-*`)

**Files:**
- Modify: `src/styles/theme.css` (add a block inside the `@theme { }` block, after the `--color-surface-layer-overlay` line at ~line 142)
- Test: `tests/theme/shellMaterialTokens.test.ts` (create)

**Interfaces:**
- Consumes: existing semantic tokens `--color-bg`, `--color-surface`, `--color-surface-elevated`, `--color-surface-muted`, `--color-border`, `--color-accent`, `--color-text-primary`.
- Produces: Tailwind color utilities `bg-vf-shell-bg`, `bg-vf-panel-bg`, `bg-vf-panel-bg-raised`, `bg-vf-panel-bg-inset`, `border-vf-panel-border`, `border-vf-panel-border-hot`, `bg-vf-control-hover`, `bg-vf-control-active`, `text-vf-grid-line` (etc., one per `--color-vf-*` token) plus plain vars `var(--color-vf-*)` usable in CSS. Tasks 3 and 4 and all later phases consume these names verbatim.

- [ ] **Step 1: Write the failing test**

Create `tests/theme/shellMaterialTokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const themeCss = readFileSync(join(ROOT, 'src/styles/theme.css'), 'utf-8')

const REQUIRED_TOKENS = [
  '--color-vf-shell-bg',
  '--color-vf-shell-bg-deep',
  '--color-vf-panel-bg',
  '--color-vf-panel-bg-raised',
  '--color-vf-panel-bg-inset',
  '--color-vf-panel-border',
  '--color-vf-panel-border-hot',
  '--color-vf-panel-highlight',
  '--color-vf-grid-line',
  '--color-vf-accent-glow',
  '--color-vf-accent-glow-strong',
  '--color-vf-control-hover',
  '--color-vf-control-active',
] as const

describe('Reference shell material tokens', () => {
  it('declares every required --color-vf-* token inside @theme', () => {
    const themeBlock = themeCss.slice(
      themeCss.indexOf('@theme'),
      themeCss.indexOf('}', themeCss.indexOf('@theme')),
    )
    for (const token of REQUIRED_TOKENS) {
      expect(themeBlock, `missing ${token} in @theme`).toContain(`${token}:`)
    }
    expect(themeBlock).toContain('--vf-noise-opacity:')
  })

  it('derives every token from semantic theme tokens (no raw hex/rgb)', () => {
    const vfLines = themeCss
      .split('\n')
      .filter((l) => l.trimStart().startsWith('--color-vf-') && l.includes(':'))
    expect(vfLines.length).toBeGreaterThanOrEqual(REQUIRED_TOKENS.length)
    for (const line of vfLines) {
      const value = line.slice(line.indexOf(':') + 1).trim()
      expect(
        /var\(--color-/.test(value) || /color-mix\(.*var\(--color-/.test(value),
        `token must derive from a semantic --color-* token, got: ${line.trim()}`,
      ).toBe(true)
      expect(
        /#[0-9A-Fa-f]{3,8}|rgba?\(/.test(value),
        `raw color literal in derived token: ${line.trim()}`,
      ).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme/shellMaterialTokens.test.ts`
Expected: FAIL — tokens not found.

- [ ] **Step 3: Implement the token block**

In `src/styles/theme.css`, inside `@theme { }` after `--color-surface-layer-overlay: var(--color-surface-overlay);` insert:

```css
  /* === Reference shell material layer (2026-09-14) =====================
     Derived from the semantic theme tokens via color-mix so every
     ThemeFamily v2 variant (incl. custom + YAML themes) inherits the
     graphite shell geometry with its own hue. NEVER assign raw colors
     here — extend the derivation chain from --color-* tokens only. */
  --color-vf-shell-bg: var(--color-bg);
  --color-vf-shell-bg-deep: color-mix(
    in srgb,
    var(--color-bg) 92%,
    var(--color-surface-muted) 8%
  );
  --color-vf-panel-bg: var(--color-surface);
  --color-vf-panel-bg-raised: var(--color-surface-elevated);
  --color-vf-panel-bg-inset: var(--color-surface-muted);
  --color-vf-panel-border: var(--color-border);
  --color-vf-panel-border-hot: color-mix(
    in srgb,
    var(--color-accent) 45%,
    var(--color-border)
  );
  --color-vf-panel-highlight: color-mix(
    in srgb,
    var(--color-text-primary) 5%,
    transparent
  );
  --color-vf-grid-line: color-mix(in srgb, var(--color-border) 55%, transparent);
  --color-vf-accent-glow: color-mix(in srgb, var(--color-accent) 22%, transparent);
  --color-vf-accent-glow-strong: color-mix(
    in srgb,
    var(--color-accent) 42%,
    transparent
  );
  --color-vf-control-hover: color-mix(
    in srgb,
    var(--color-surface-elevated) 72%,
    transparent
  );
  --color-vf-control-active: color-mix(
    in srgb,
    var(--color-accent) 12%,
    transparent
  );
  --vf-noise-opacity: 0.4;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/theme/shellMaterialTokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the design doc token namespace note**

In `docs/design/VENICE_FORGE_REFERENCE_UI_REDESIGN.md` §3, append one line: `Implementation note: tokens live in the Tailwind v4 \`--color-vf-*\` namespace so utility classes (bg-vf-panel-bg, border-vf-panel-border, …) generate automatically; the design names map 1:1.`

- [ ] **Step 6: Commit**

```bash
git add src/styles/theme.css tests/theme/shellMaterialTokens.test.ts docs/design/VENICE_FORGE_REFERENCE_UI_REDESIGN.md
git commit -m "style(ui): derive reference shell material tokens from semantic theme tokens"
```

---

### Task 2: Retune default Venice family (graphite dark + true light)

**Files:**
- Modify: `src/theme/builtins/venice.ts:11-58` (both variant token literals)
- Test: `src/theme/builtins/venice.test.ts` (create)

**Interfaces:**
- Consumes: `contrastRatio`, `isAAPass` from `src/theme/contrast.ts` (already exported).
- Produces: retuned `BUILTIN_VENICE` values; no API change. Later phases assume the default dark experience is graphite/crimson per the approved contract.

- [ ] **Step 1: Write the failing test**

Create `src/theme/builtins/venice.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BUILTIN_VENICE } from './venice'
import { isAAPass, contrastRatio } from '../contrast'

const dark = BUILTIN_VENICE.variants.dark.tokens
const light = BUILTIN_VENICE.variants.light.tokens

describe('BUILTIN_VENICE reference retune', () => {
  it('dark variant uses the graphite/crimson reference palette', () => {
    expect(dark.background).toBe('#050505')
    expect(dark.surface).toBe('#0d0d10')
    expect(dark.surfaceElevated).toBe('#16161a')
    expect(dark.accent).toBe('#ef555f')
    expect(dark.accentHover).toBe('#f65964')
    expect(dark.glow).toBe('rgba(239, 85, 95, 0.12)')
  })

  it('dark variant meets WCAG AA for text and accent pairs', () => {
    expect(isAAPass(dark.textPrimary, dark.background)).toBe(true)
    expect(isAAPass(dark.textPrimary, dark.surface)).toBe(true)
    expect(isAAPass(dark.accent, dark.background)).toBe(true)
    expect(isAAPass(dark.accentForeground, dark.accent)).toBe(true)
    expect(contrastRatio(dark.textMuted, dark.background)).toBeGreaterThan(3)
  })

  it('light variant is a true readable light theme with crimson accent', () => {
    expect(isAAPass(light.textPrimary, light.background)).toBe(true)
    expect(isAAPass(light.textPrimary, light.surface)).toBe(true)
    expect(isAAPass(light.accent, light.background)).toBe(true)
    expect(isAAPass(light.accentForeground, light.accent)).toBe(true)
    expect(isAAPass(light.textSecondary, light.background)).toBe(true)
  })

  it('retune does not touch code-theme preset wiring', () => {
    expect(BUILTIN_VENICE.variants.dark.code.preset).toBe('venice')
    expect(BUILTIN_VENICE.variants.light.code.preset).toBe('venice')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/theme/builtins/venice.test.ts`
Expected: FAIL — current values are the blue palette / legacy light.

- [ ] **Step 3: Retune the token literals**

Replace the light-variant `completeThemeTokens('light', { ... })` literal in `src/theme/builtins/venice.ts` with:

```ts
      completeThemeTokens('light', {
        background: "#f4f4f5",
        surface: "#fafafa",
        surfaceElevated: "#ffffff",
        border: "#d4d4d8",
        textPrimary: "#1c1c1f",
        textSecondary: "#5b5b63",
        textMuted: "#8a8a92",
        accent: "#c81e3f",
        accentHover: "#a51836",
        accentForeground: "#ffffff",
        success: "#3f9142",
        warning: "#a16207",
        danger: "#dc2626",
        info: "#1d4ed8",
        focusRing: "#c81e3f",
        overlay: "rgba(28, 28, 31, 0.35)",
        glow: "rgba(200, 30, 63, 0.10)",
        surfaceMuted: "#ececee",
        borderStrong: "#71717a",
      }),
```

Replace the dark-variant literal with:

```ts
      completeThemeTokens('dark', {
        background: "#050505",
        surface: "#0d0d10",
        surfaceElevated: "#16161a",
        border: "#26262c",
        textPrimary: "#dedcdf",
        textSecondary: "#8c8892",
        textMuted: "#65616a",
        accent: "#ef555f",
        accentHover: "#f65964",
        accentForeground: "#050505",
        success: "#6fbf73",
        warning: "#d6a84f",
        danger: "#ef4444",
        info: "#7da7ff",
        focusRing: "#ef555f",
        overlay: "rgba(5, 5, 5, 0.7)",
        glow: "rgba(239, 85, 95, 0.12)",
        surfaceMuted: "#08080a",
        borderStrong: "#55555e",
      }),
```

Leave the `code:` preset lines and everything else in the file unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/theme/builtins/venice.test.ts`
Expected: PASS.

- [ ] **Step 5: Regression sweep for theme-value assumptions**

Run: `npm run test:unit:theme`
Expected: PASS. If a pre-existing test hardcodes the old Venice hex values, update that assertion to the new value (record it in the commit body) — do not weaken assertions.

- [ ] **Step 6: Commit**

```bash
git add src/theme/builtins/venice.ts src/theme/builtins/venice.test.ts
git commit -m "style(ui): retune default Venice family to graphite/crimson reference palette"
```

---

### Task 3: Ambient layer — flatten mesh overlay, add static grain

**Files:**
- Modify: `src/styles/components.css:46-57` (the `.app-mesh-overlay` rule)
- Modify: `src/styles/components.css` (append `.vf-grain` utility after the overlay rule)
- Test: `tests/theme/referenceMaterialInvariant.test.ts` (create)

**Interfaces:**
- Consumes: `--app-mesh-opacity` (set by `applyTheme.ts:97`), `--vf-noise-opacity` (Task 1), `--color-text-primary`.
- Produces: `.app-mesh-overlay` (same class name — `src/components/layout/AppMeshOverlay.tsx` needs no change) and `.vf-grain` for later phases' inset canvases.

- [ ] **Step 1: Write the failing test**

Create `tests/theme/referenceMaterialInvariant.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const css = readFileSync(join(ROOT, 'src/styles/components.css'), 'utf-8')

function ruleBlock(selector: string): string {
  const start = css.indexOf(selector + ' {')
  expect(start, `rule ${selector} not found`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('\n}', start))
}

describe('Reference ambient layer invariants', () => {
  it('app-mesh-overlay is a static grain/vignette layer, not accent blobs', () => {
    const block = ruleBlock('.app-mesh-overlay')
    expect(block).toContain('pointer-events: none')
    expect(block).toContain('repeating-linear-gradient')
    expect(block).not.toContain('radial-gradient(circle at')
    expect(block).not.toMatch(/color-accent\) (1[0-8]|8)%,/)
  })

  it('vf-grain utility exists, is static and non-interactive', () => {
    const block = ruleBlock('.vf-grain')
    expect(block).toContain('pointer-events: none')
    expect(block).toContain('repeating-linear-gradient')
    expect(block).not.toContain('animation')
  })

  it('ambient layer scales with the noise opacity token', () => {
    expect(ruleBlock('.app-mesh-overlay')).toContain('var(--vf-noise-opacity')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme/referenceMaterialInvariant.test.ts`
Expected: FAIL — current overlay is radial accent blobs; `.vf-grain` missing.

- [ ] **Step 3: Rewrite the overlay and add the grain utility**

Replace the `.app-mesh-overlay { ... }` rule in `src/styles/components.css` with:

```css
/* App-wide ambient layer — reference material system (2026-09-14).
   Static micro-grid grain + soft edge vignette. No radial accent blobs,
   no animation, no repaint-hostile filters. Theme-aware via the
   semantic text token (inverted automatically in light themes). */
.app-mesh-overlay {
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    repeating-linear-gradient(
      0deg,
      color-mix(in srgb, var(--color-text-primary) 2%, transparent) 0 1px,
      transparent 1px 3px
    ),
    repeating-linear-gradient(
      90deg,
      color-mix(in srgb, var(--color-text-primary) 2%, transparent) 0 1px,
      transparent 1px 3px
    );
  opacity: calc(var(--app-mesh-opacity, 0.12) * var(--vf-noise-opacity, 0.4));
}

/* Optional grain wash for inset canvases (Image Studio preview, workflow
   graph, data surfaces). Same static pattern; pair with vf-inset-canvas. */
.vf-grain {
  pointer-events: none;
  position: relative;
}
.vf-grain::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background: repeating-linear-gradient(
    0deg,
    color-mix(in srgb, var(--color-text-primary) 2%, transparent) 0 1px,
    transparent 1px 3px
  );
  opacity: calc(var(--app-mesh-opacity, 0.12) * var(--vf-noise-opacity, 0.4));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/theme/referenceMaterialInvariant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/components.css tests/theme/referenceMaterialInvariant.test.ts
git commit -m "style(ui): replace accent mesh blobs with static grain ambient layer"
```

---

### Task 4: Material component classes + low-radius geometry

**Files:**
- Modify: `src/styles/components.css` (append a new section at end of file)
- Modify: `src/styles/theme.css:150-152` (`--radius-panel`, `--radius-dialog`)
- Test: extend `tests/theme/referenceMaterialInvariant.test.ts`

**Interfaces:**
- Consumes: Task 1 tokens, `--radius-*` vars, `.vf-control-motion`.
- Produces: class names consumed by Task 5 primitives and all later phases: `.vf-shell-panel`, `.vf-panel-header`, `.vf-inset-canvas`, `.vf-utility-rail-section`, `.vf-dense-row`, `.vf-accent-progress`, `.vf-accent-progress__bar`, `.vf-data-grid`.

- [ ] **Step 1: Write the failing test**

Append to `tests/theme/referenceMaterialInvariant.test.ts`:

```ts
const MATERIAL_CLASSES = [
  '.vf-shell-panel',
  '.vf-panel-header',
  '.vf-inset-canvas',
  '.vf-utility-rail-section',
  '.vf-dense-row',
  '.vf-accent-progress',
  '.vf-data-grid',
] as const

describe('Reference material classes', () => {
  it('declares every material class', () => {
    for (const cls of MATERIAL_CLASSES) ruleBlock(cls)
    ruleBlock('.vf-accent-progress__bar')
  })

  it('material classes reference only semantic/vf tokens (no raw colors)', () => {
    const section = css.slice(css.indexOf('=== Reference material classes'))
    expect(section.length).toBeGreaterThan(0)
    const rawHits = section.match(/#[0-9A-Fa-f]{3,8}|rgba?\(/g) ?? []
    const allowed = section.match(/THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR/g) ?? []
    expect(rawHits.length, `raw color literals: ${rawHits?.join(', ')}`).toBeLessThanOrEqual(allowed.length)
  })

  it('selected dense row carries an accent selection rail', () => {
    expect(ruleBlock('.vf-dense-row[data-selected="true"]')).toContain('inset 2px 0 0 var(--color-accent)')
  })
})
```

(Note: the test file already imports `css` and defines `ruleBlock` from Task 3 — append inside the same file, no duplicate imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme/referenceMaterialInvariant.test.ts`
Expected: FAIL — classes missing.

- [ ] **Step 3: Append the material classes**

Append to `src/styles/components.css`:

```css
/* === Reference material classes (2026-09-14) =========================
   Shared shell grammar for the reference-driven redesign. All values
   derive from --color-vf-* / semantic tokens; never hardcode colors.
   ===================================================================== */

/* Framed working panel: raised graphite, 1px border, hairline top light. */
.vf-shell-panel {
  position: relative;
  background: var(--color-vf-panel-bg);
  border: 1px solid var(--color-vf-panel-border);
  border-radius: var(--radius-panel);
  box-shadow: inset 0 1px 0 var(--color-vf-panel-highlight);
}

/* Compact panel title row. */
.vf-panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-vf-panel-border);
  color: var(--color-text-secondary);
  font-size: var(--text-meta);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.vf-panel-header__actions {
  margin-inline-start: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

/* Darker inset surface: editors, previews, canvases, code/data areas. */
.vf-inset-canvas {
  background: var(--color-vf-panel-bg-inset);
  border: 1px solid var(--color-vf-panel-border);
  border-radius: var(--radius-control);
}

/* Right-rail stacked card (Inspector, Task Center, Diagnostics). */
.vf-utility-rail-section {
  background: var(--color-vf-panel-bg);
  border: 1px solid var(--color-vf-panel-border);
  border-radius: var(--radius-control);
  padding: 0.625rem;
}

/* Dense interactive list row with accent selection rail. */
.vf-dense-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.5rem;
  border-radius: var(--radius-control);
  color: var(--color-text-secondary);
  transition: color var(--motion-fast) var(--motion-ease),
    background-color var(--motion-fast) var(--motion-ease);
}
.vf-dense-row:hover:not(:disabled) {
  background: var(--color-vf-control-hover);
  color: var(--color-text-primary);
}
.vf-dense-row[data-selected="true"] {
  background: var(--color-vf-control-active);
  box-shadow: inset 2px 0 0 var(--color-accent);
  color: var(--color-text-primary);
}

/* Accent progress bar with restrained bloom (allowed-glow target). */
.vf-accent-progress {
  height: 4px;
  border-radius: 999px;
  background: var(--color-surface-overlay);
  overflow: hidden;
}
.vf-accent-progress__bar {
  height: 100%;
  border-radius: inherit;
  background: var(--color-accent);
  box-shadow: 0 0 8px var(--color-vf-accent-glow-strong);
  transition: width var(--motion-medium) var(--motion-ease);
}

/* Faint data-grid wash for chart/graph canvases. */
.vf-data-grid {
  background-image:
    linear-gradient(var(--color-vf-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-vf-grid-line) 1px, transparent 1px);
  background-size: 24px 24px;
}
```

- [ ] **Step 4: Contract the panel/dialog radii**

In `src/styles/theme.css` `:root`, change:
`--radius-panel: 0.75rem;` → `--radius-panel: 0.625rem;` /* 10px */
`--radius-dialog: 1rem;` → `--radius-dialog: 0.875rem;` /* 14px */
(`--radius-control` stays 8px — already inside the 6–10px contract.)

- [ ] **Step 5: Run tests to verify**

Run: `npx vitest run tests/theme/referenceMaterialInvariant.test.ts tests/theme/meshSurfaceInvariant.test.ts`
Expected: PASS both.

- [ ] **Step 6: Commit**

```bash
git add src/styles/components.css src/styles/theme.css tests/theme/referenceMaterialInvariant.test.ts
git commit -m "style(ui): add reference material classes and contract panel radii"
```

---

### Task 5: Shell primitives (`ShellPanel`, `PanelHeader`, `InsetCanvas`, `UtilityRailSection`, `DenseListRow`, `AccentProgress`)

**Files:**
- Modify: `src/components/ui/primitives.tsx` (append new primitives; keep existing exports untouched)
- Test: `src/components/ui/primitives.test.tsx` (append new describes)

**Interfaces:**
- Consumes: Task 4 classes, `cn` from `src/lib/utils.ts`, existing `Tone` type.
- Produces (used by Phases 2–7): `ShellPanel` (+`ShellPanelProps`), `PanelHeader` (+`PanelHeaderProps`), `InsetCanvas` (+`InsetCanvasProps`), `UtilityRailSection` (+`UtilityRailSectionProps`), `DenseListRow` (+`DenseListRowProps`), `AccentProgress` (+`AccentProgressProps`).

- [ ] **Step 1: Write the failing tests**

Append to `src/components/ui/primitives.test.tsx`:

```tsx
describe('Reference shell primitives', () => {
  it('ShellPanel renders a framed panel and supports inset variant', () => {
    const { container: a } = render(<ShellPanel>content</ShellPanel>)
    expect(a.firstChild).toHaveClass('vf-shell-panel')
    const { container: b } = render(<ShellPanel inset>content</ShellPanel>)
    expect(b.firstChild).toHaveClass('vf-inset-canvas')
  })

  it('PanelHeader renders title and trailing actions', () => {
    render(
      <PanelHeader title="Metrics" actions={<button>act</button>} />,
    )
    expect(screen.getByText('Metrics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'act' })).toBeInTheDocument()
  })

  it('UtilityRailSection renders its section label', () => {
    render(<UtilityRailSection title="Tasks">body</UtilityRailSection>)
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('DenseListRow exposes selected state via data attribute', () => {
    render(<DenseListRow selected>row</DenseListRow>)
    expect(screen.getByText('row').closest('[data-selected="true"]')).not.toBeNull()
  })

  it('AccentProgress renders an accessible progressbar', () => {
    render(<AccentProgress value={0.4} label="Generating" />)
    const bar = screen.getByRole('progressbar', { name: 'Generating' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuenow', '40')
  })
})
```

(`render`/`screen` are already imported in that suite — verify the import line; if not, add `import { render, screen } from '@testing-library/react'`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/ui/primitives.test.tsx`
Expected: FAIL — components not defined.

- [ ] **Step 3: Implement the primitives**

Append to `src/components/ui/primitives.tsx`:

```tsx
/* ---------------------------------------------------------------------------
 * Reference shell primitives (2026-09-14). These compose the material
 * classes from components.css and are the shared grammar for framed
 * panels, utility rails, dense lists, and accent progress across all
 * workspaces. They intentionally add no new colors.
 * ------------------------------------------------------------------------- */
export interface ShellPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render as a darker inset canvas (editors, previews) instead of a
   *  raised framed panel. */
  inset?: boolean
}

export function ShellPanel({ inset = false, className, children, ...rest }: ShellPanelProps) {
  return (
    <div className={cn(inset ? 'vf-inset-canvas' : 'vf-shell-panel', className)} {...rest}>
      {children}
    </div>
  )
}

export interface PanelHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Panel title; rendered as the compact micro-label. */
  title: React.ReactNode
  /** Optional trailing action cluster. */
  actions?: React.ReactNode
}

export function PanelHeader({ title, actions, className, children, ...rest }: PanelHeaderProps) {
  return (
    <div className={cn('vf-panel-header', className)} {...rest}>
      <span className="truncate">{title}</span>
      {children}
      {actions && <div className="vf-panel-header__actions">{actions}</div>}
    </div>
  )
}

export interface InsetCanvasProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Overlay the static grain wash. */
  grain?: boolean
}

export function InsetCanvas({ grain = false, className, children, ...rest }: InsetCanvasProps) {
  return (
    <div className={cn('vf-inset-canvas', grain && 'vf-grain', className)} {...rest}>
      {children}
    </div>
  )
}

export interface UtilityRailSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Section label rendered as a micro-label header. */
  title?: React.ReactNode
  /** Optional trailing actions aligned to the header. */
  actions?: React.ReactNode
}

export function UtilityRailSection({ title, actions, className, children, ...rest }: UtilityRailSectionProps) {
  return (
    <section className={cn('vf-utility-rail-section', className)} {...rest}>
      {(title || actions) && (
        <PanelHeader title={title} actions={actions} className="border-b-0 px-0 pt-0" />
      )}
      {children}
    </section>
  )
}

export interface DenseListRowProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  selected?: boolean
  /** Leading icon/avatar node. */
  leading?: React.ReactNode
  /** Primary label. */
  label: React.ReactNode
  /** Trailing metadata node. */
  trailing?: React.ReactNode
}

export function DenseListRow({ selected = false, leading, label, trailing, className, type, ...rest }: DenseListRowProps) {
  return (
    <button
      type={type ?? 'button'}
      data-selected={selected || undefined}
      aria-current={selected || undefined}
      className={cn('vf-dense-row vf-meta text-left', className)}
      {...rest}
    >
      {leading && <span className="inline-flex shrink-0 items-center">{leading}</span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing && <span className="inline-flex shrink-0 items-center text-text-muted">{trailing}</span>}
    </button>
  )
}

export interface AccentProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..1 completion fraction. */
  value: number
  /** Accessible label (required — the bar has no text content). */
  label: string
}

export function AccentProgress({ value, label, className, ...rest }: AccentProgressProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn('vf-accent-progress', className)}
      {...rest}
    >
      <div className="vf-accent-progress__bar" style={{ width: `${pct}%` }} />
    </div>
  )
}
```

Note: `AccentProgress` uses an inline `style` for the dynamic width — this is the established dynamic-value pattern (same as the chat context meter); the CSP invariant only bans inline styles carrying static presentation. If `tests/csp/inlineStyleInvariant.test.ts` flags it, switch to a CSS custom property (`--vf-progress-pct`) set via the same ref-effect pattern the context meter uses; do not weaken the test.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/ui/primitives.test.tsx`
Expected: PASS (full file, including the pre-existing 20 IconButton/Toolbar tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/primitives.tsx src/components/ui/primitives.test.tsx
git commit -m "style(ui): add reference shell primitives (panel, rail, dense row, accent progress)"
```

---

### Task 6: Phase validation, ledger update, phase commit

**Files:**
- Modify: `docs/design/VENICE_FORGE_REFERENCE_UI_REDESIGN_MATRIX.md` (rows for `src/styles/theme.css`, `src/styles/components.css`, `src/theme/builtins/venice.ts`, `src/components/ui/primitives.tsx`, `src/components/layout/AppMeshOverlay.tsx`)
- Modify: `docs/summary_of_work.md` (Latest Session Summary entry)

- [ ] **Step 1: Full phase validation**

Run, in order, and record each result:
```bash
npm run lint:eslint
npm run typecheck
npm run verify:theme-tokens
npm run verify:i18n-hardcoded-regressions
npx vitest run tests/theme tests/csp src/components/ui src/theme
npm run build:web
```
Expected: all PASS. Any failure must be fixed in code (no verifier/test weakening); if a failure is pre-existing on `b5760db2`, record it as pre-existing and do not touch unrelated code.

- [ ] **Step 2: Update the migration ledger**

In `docs/design/VENICE_FORGE_REFERENCE_UI_REDESIGN_MATRIX.md` set:
- `src/styles/theme.css` → `REDESIGNED — Phase 1: derived --color-vf-* material layer; radii contracted (panel 10px, dialog 14px)`
- `src/styles/components.css` → `REDESIGNED — Phase 1: static grain ambient layer + reference material classes`
- `src/theme/builtins/venice.ts` → `REDESIGNED — Phase 1: default family retuned to graphite/crimson reference palette`
- `src/components/ui/primitives.tsx` → `REDESIGNED — Phase 1: six shell primitives added (existing exports untouched)`
- `src/components/layout/AppMeshOverlay.tsx` → `INHERITS_GLOBAL_SYSTEM — visual now provided by .app-mesh-overlay grain layer (component unchanged)`

- [ ] **Step 3: Update summary_of_work.md**

Add a Latest Session Summary entry recording: baseline SHA, the six commits from Tasks 1–5, every validation command with pass/fail, and that Phases 2–10 remain open under `VF-REFERENCE-UI-REDAIGN-2026-09-14`.

- [ ] **Step 4: Final commit**

```bash
git add docs/design/VENICE_FORGE_REFERENCE_UI_REDESIGN_MATRIX.md docs/summary_of_work.md
git commit -m "docs(ui): record phase 1 material foundation in migration ledger"
```

---

## Self-review notes (completed)

- **Spec coverage:** design doc §3 (tokens) → Tasks 1–2; §4 root canvas → Task 3; §5 component rules/material classes → Task 4; §5 primitives list → Task 5; work order Phase 1 validation list → Task 6. Tab primitive intentionally deferred — no two surfaces consume a shared tab primitive yet; it lands with the workspace phase that needs it (added to the ledger as a phase-dependent item).
- **Type consistency:** token names (`--color-vf-*`, `--vf-noise-opacity`), class names (`.vf-*`), and component props are identical across Tasks 1, 3, 4, 5.
- **Placeholder scan:** all steps contain runnable commands and complete code; no TBDs.
