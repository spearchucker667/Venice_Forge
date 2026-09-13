# Chat & Design System Refresh — 2026-09-13

> **Status:** Design direction awaiting user confirmation.
> **Scope:** Chat surface as the showcase, with the design system layer strengthened to support all 20 tabs.
> **Audience:** Engineering. Implementation follows this direction in a single session.

---

## 1. Where we are

Venice Forge already runs a mature design system. It is **not** a blank canvas.

- **Theme engine v2** (`src/theme/`): 45+ families, 29 canonical semantic roles, WCAG AA contrast enforcement, light + dark variants, `applyTheme()` writes CSS custom properties on `:root`. Hard constraint: do not break compatibility with any existing theme.
- **Tailwind v4 `@theme` contract** (`src/styles/theme.css`): Maps CSS vars → Tailwind color tokens. Provides `bg-surface`, `text-text-primary`, `border-border`, `bg-accent`, `bg-danger`, `bg-success`, `bg-warning`, etc.
- **Motion system**: `--motion-fast` (140ms), `--motion-medium` (220ms), `--motion-ease`. Global `prefers-reduced-motion` respected.
- **Mesh aesthetic**: `mesh-surface`, `mesh-card`, `mesh-input`, `mesh-sidebar`, `mesh-header`, `mesh-panel`, `app-mesh-overlay`. Subtle gradients + backdrop-blur. Distinctive but inconsistently applied.
- **Font system**: `@theme` currently sets `MesloLGM Nerd Font` (sans) and `MesloLGS Nerd Font Mono`. The packages `@fontsource/inter`, `@fontsource/jetbrains-mono`, `@fontsource/lora` are already installed but **unused**.
- **Hard contracts** (AGENTS.md, VERIFY-007/010/041): No inline `style={...}`, no hardcoded hex in components, all styling via tokens or Tailwind theme classes.

What needs work is **discipline and legibility**, not replacement.

---

## 2. What's wrong (concrete, in the code)

These are observed in the working tree at HEAD `d955559c`:

1. **Arbitrary text sizes everywhere.** `text-[12px]`, `text-[13px]`, `text-[15px]`, `text-[16px]`, `text-[20px]` appear across `chat-input.tsx`, `message-bubble.tsx`, `chat-view.tsx`, `venice-params.tsx`. There is no canonical type scale.
2. **Ad-hoc palette colors leak past the token system.** `chat-input.tsx` memory indicator uses `bg-emerald-400` and `bg-amber-400` directly, bypassing semantic tokens.
3. **Inline SVGs duplicated for icons.** Action buttons in `message-bubble.tsx` (copy, edit, fork, regenerate, delete, scene-create, etc.) inline ~15 raw `<svg>` elements. `header.tsx` has a hand-rolled hamburger. Most can collapse to `lucide-react`, which is already a dependency.
4. **Three different "max content widths."** `chat-input.tsx` uses `max-w-[860px]`, `message-bubble.tsx` uses `max-w-[78%]`, others use `max-w-[240px]`. No declared reading column or container width.
5. **Border opacity soup.** `border-border/30`, `border-border/40`, `border-border/50` repeat across files. Should resolve to a semantic border-soft / border-faint.
6. **No shared icon-action button primitive.** The `MessageBubble` action bar is bespoke, repeated logic per file.
7. **Mesh classes used inconsistently.** `mesh-input` is used; `mesh-card` exists but most cards don't use it; the `empty state` blocks in `chat-view.tsx` skip the mesh system entirely.
8. **Installed fonts unused.** Inter / JetBrains Mono / Lora packages are in `package.json` but not wired into `@theme`. The current `MesloLGM` choice is reasonable but the installed, well-hinted Inter is the better body type for a productivity UI.

---

## 3. Direction: "Quietly confident"

**Thesis.** Refine the existing system into something more deliberate, more legible, and more cohesive — without disturbing 45-theme compatibility, the existing API surface, the i18n catalog, or the strict CSP. Don't replace; refine.

**Five pillars.**

### Pillar 1 — Type system that breathes

Wire **Inter** as the canonical UI face (already installed, well-hinted, designed for screens). Keep **JetBrains Mono** for code surfaces. Drop Lora unless a serif heading is explicitly needed.

Establish a canonical type scale as CSS variables on `:root`:

```css
--text-display: 1.625rem;   /* 26px — page-level hero / empty-state */
--text-h1:      1.375rem;   /* 22px */
--text-h2:      1.125rem;   /* 18px */
--text-body:    0.9375rem;  /* 15px — default */
--text-sm:      0.8125rem;  /* 13px — meta, captions */
--text-xs:      0.6875rem;  /* 11px — only for tags/pills, tracked +0.04em */
```

Expose via Tailwind v4 `@theme` so `text-display`, `text-h1`, … work as utility classes. **Kill every `text-[Npx]` arbitrary value** in the touched files in favor of these.

### Pillar 2 — Spacing rhythm from a 4-unit grid

Adopt the **4-unit grid** consistently. The codebase already lives close to it; codify it:

- Container widths: `--width-narrow: 30rem` (480), `--width-reading: 40rem` (640), `--width-comfort: 47.5rem` (760), `--width-wide: 60rem` (960).
- Replace `max-w-[78%]`, `max-w-[860px]`, `max-w-[240px]` with these.

### Pillar 3 — Color discipline through semantic roles

Add the **missing semantic surface aliases** to the theme engine (success/warning/danger with built-in contrast pairs). This means:

```ts
// New semantic roles, all derived from existing primary tokens:
successBackground, successForeground       // already exists
warningBackground, warningForeground       // already exists
dangerBackground,  dangerForeground        // already exists
accentBackground,  accentForeground        // already exists (button-primary-bg/fg)
mutedBackground,   mutedForeground         // for chip / pill surfaces
overlayScrim                               // already exists as overlay
```

Resolve the **two ad-hoc leaks** (`bg-emerald-400`, `bg-amber-400`) to `bg-success/40` and `bg-warning/40`. Keep the mesh aesthetic for ambient depth — it's distinctive, not noise.

### Pillar 4 — Component primitive library

Extract repeated patterns into shared primitives under `src/components/ui/`. New files (each with a colocated unit test where there's logic):

- `IconButton.tsx` — single icon button, variants: `primary | secondary | ghost | danger`, sizes: `sm | md`. Replaces ~25 raw icon-button instances.
- `Pill.tsx` — chip / pill / status badge with semantic tones (success / warning / danger / info / accent / muted / neutral). Replaces `Chip.tsx` (which is already close to this — fold in).
- `Toolbar.tsx` — horizontal action group with shared spacing/borders. Replaces the bespoke action bars in `message-bubble.tsx`.
- `EmptyState.tsx` — illustration + headline + helper + optional CTA. Used by the empty-chat view and elsewhere.
- `Card.tsx` / `ElevatedCard.tsx` — consolidate mesh-card variants.
- `StatusDot.tsx` — already exists in `shared.tsx`; promote and standardize tones.

### Pillar 5 — Hierarchy through restraint

- Replace dense borders with **selective elevation**. The chat composer currently has both a border and a heavy `shadow-lg`; reduce to a single soft shadow plus a subtle border at rest, accent-tinted border on focus.
- **Let typography carry hierarchy**, not color. The empty chat view currently uses three different border styles + a gradient + an illustration. Use the type scale + spacing rhythm instead.
- Reduce action-bar visual noise: the message-bubble action bar should be a single subtle row that surfaces on hover/focus, not seven buttons in a stack.

---

## 4. What this refresh will and won't touch

**Will touch:**
- `src/styles/theme.css` — type scale, container widths, semantic surface aliases (theme-engine extension).
- `src/styles/components.css` — refined `mesh-*` variants, new `surface-elevated-2`, refined focus, refined action-bar styles.
- `src/components/ui/` — new primitives + refinements to existing ones.
- `src/components/chat/` — `chat-view.tsx`, `chat-input.tsx`, `message-bubble.tsx`, `ChatMarkdown.tsx`, `venice-params.tsx`. **Functional structure preserved.** No store changes. No new IPC. No new dependencies.
- `src/components/layout/sidebar.tsx`, `header.tsx` — shell cohesion.
- `src/theme/builtins/light.ts`, `dark.ts` — add the new semantic surface aliases (defaults derived from existing tokens).

**Won't touch (this pass):**
- 18 other top-level tabs. They keep their existing styling; the system improvements will benefit them as they get touched in future sessions.
- The 43 other theme families. They will continue to apply because the new aliases fall back to existing tokens when authors omit them.
- i18n catalogs. No new visible strings in this pass.
- Electron main process, IPC, persistence. Out of scope.
- CSP / network boundaries. No change.

---

## 5. Validation plan

After implementation:

1. `npm run lint:eslint` — must stay 0/0.
2. `npm run typecheck` — must stay clean across all three tsconfigs.
3. `npm run test:ui:chat` — must stay green; add a test for each new primitive.
4. `npm run verify:theme-tokens` — confirms all consumers resolve via tokens; no new hex leaks.
5. `npm run verify:contracts` — full contract pass.
6. Visual check against Forge Daylight (light) and Forge Graphite (dark).
7. Cross-theme check against at least **Venice**, **Dracula**, **Catppuccin**, **Nord** to confirm the new aliases degrade gracefully.

---

## 6. Risks and non-goals

- **Risk: regression in existing theme families.** Mitigation: new aliases all derive from existing tokens via `completeThemeTokens()`. If a theme doesn't override, the derived value is identical to today's behavior.
- **Risk: arbitrary-value audit misses something.** Mitigation: `verify:theme-tokens` + a small new check for `text-[Npx]`, `bg-emerald-*`, `bg-amber-*` in the touched files only.
- **Non-goal: replacing the mesh aesthetic.** It is a defining feature of the brand; we're refining its application, not removing it.
- **Non-goal: a full 20-tab redesign.** That's a multi-session program. This session strengthens the system and proves it on the chat surface.

---

## 7. Confirmed decisions (2026-09-13)

The implementation is bounded by these user-confirmed decisions:

1. **Body face**: **Keep `MesloLGM Nerd Font`** (current, distinctive). Do not switch to Inter. The unused `@fontsource/inter`, `@fontsource/jetbrains-mono`, `@fontsource/lora` packages remain dormant.
2. **Composer elevation**: soft-shadow at rest + focus-tinted border. No "floating" heavy shadow.
3. **Icon library**: **Keep inline SVGs** in chat bubble. Refinement target is *consistency* (uniform stroke width 1.75, uniform sizes 14/16/18, consistent corner radius on action buttons), not library migration.
4. **Scope**: **System + chat + shell** only in this session. Other 18 tabs keep their current styling; the system improvements (type scale, container widths, semantic surface aliases, primitives) benefit them when later sessions touch them.
