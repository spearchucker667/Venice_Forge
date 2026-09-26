# Venice Forge Graphite Cockpit UI Re-envisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Venice Forge's entire interface into an aerospace-grade Graphite Cockpit Flat Instrumentation workstation with a rigid 3-zone layout, stepped graphite elevation, surgical crimson/cyan state indicators, and dual Inter/JetBrains Mono typography while guaranteeing 100% feature parity across all 15 canonical tabs and synchronizing with Stitch MCP.

**Architecture:** Build upon the verified `BUILTIN_VENICE` dark theme token contract, mapping stepped surfaces (`#050505` to `#16161A`) and hairline boundaries (`#26262C` / `#743940`) into CSS custom properties and Tailwind v4 theme variables. Refactor the application shell into a persistent 3-zone layout (60px/240px nav rail, adaptive workbench canvas, docked 320px–360px inspector) and synchronize design system metadata with Google Labs' Stitch MCP.

**Tech Stack:** React 19, TypeScript 5, Tailwind CSS v4, Zustand 5, Electron 34, Vitest, Google Labs Stitch MCP.

**Spec:** [`docs/superpowers/specs/2026-09-26-graphite-cockpit-ui-design.md`](file:///Users/super_user/Projects/Venice_Forge/docs/superpowers/specs/2026-09-26-graphite-cockpit-ui-design.md)

---

## Global Constraints

- **Repository Root:** `/Users/super_user/Projects/Venice_Forge`
- **Active Branch:** `feature/graphite-cockpit-redesign` (exclusive feature branch as authorized by user)
- **Node Contract:** `>=22.15.0 <23.0.0`, npm `>=10`
- **Zero Feature Regressions:** All 15 canonical tabs, 4 legacy aliases, 22+ Zustand stores, and dual Electron IPC / Express proxy transports must remain 100% operational.
- **No Hardcoded Hex In Components:** All styling must consume semantic design tokens (`var(--bg)`, `var(--surface)`, `var(--surface-elevated)`, `var(--border)`, `var(--border-hot)`, `var(--accent)`) or Tailwind token utilities.
- **Line Length Budget:** Conversational transcripts and text prose containers are strictly constrained to `max-w-[40rem]` (640px).

---

## Review Focus

1. **Theme Switch Invariance:** Switching themes in Settings must cleanly re-render without leaving orphaned hardcoded graphite values or breaking contrast.
2. **Dual-Mode Rail Responsiveness:** Toggling between 60px micro-rail and 240px expanded navigation must preserve active scroll position and not displace the central workbench.
3. **Prompt Inspector Trace Determinism:** The right inspector's prompt debug drawer must show the live assembled system prompt without leaking raw credentials or auth headers.
4. **Docked Execution Dock Keystroke Handling:** `Cmd/Ctrl + Enter` in the execution dock must submit queries reliably without conflicting with IME composition or global hotkeys.
5. **Stitch MCP Sync Integrity:** Synchronizing `DESIGN.md` to project `12225516409245957947` must succeed with valid base64 UTF-8 payloads and preserve existing screens.

---

### Task 1: Core Design Tokens & Theme Engine Alignment

**Files:**
- Modify: `src/theme/themeTypes.ts:1-120`
- Modify: `src/theme/builtins/venice.ts:30-63`
- Modify: `src/styles/theme.css:10-70`
- Test: `src/theme/themes.validation.test.ts`
- Test: `src/theme/applyTheme.test.ts`

**Interfaces:**
- Consumes: `ThemeTokens`, `completeThemeTokens` from `src/theme/themeTypes.ts`
- Produces: CSS variables `--border-hot`, `--color-border-hot`, `--color-telemetry-cyan`, `--color-shell-bg`, `--font-mono` mapped in Tailwind v4 `@theme` block.

- [ ] **Step 1: Write failing test verifying cockpit tokens in theme resolver**

In `src/theme/applyTheme.test.ts`, add test for border-hot and telemetry tokens:
```ts
it('resolves graphite cockpit tokens including borderHot and telemetryCyan', () => {
  const vars = buildThemeVariableMap(BUILTIN_VENICE.variants.dark.tokens);
  expect(vars['--border-hot']).toBe('#743940');
  expect(vars['--telemetry-cyan']).toBe('#6ee7d3');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/theme/applyTheme.test.ts`
Expected: FAIL (`--border-hot` not found in variable map).

- [ ] **Step 3: Update `src/theme/themeTypes.ts`, `builtins/venice.ts`, and `applyTheme.ts`**

Add `borderHot?: string; telemetryCyan?: string;` to `ThemeTokens` with fallback resolution, and map them in `buildThemeVariableMap`:
```ts
'--border-hot': tokens.borderHot ?? (tokens.mode === 'dark' ? '#743940' : '#d9777f'),
'--telemetry-cyan': tokens.telemetryCyan ?? '#6ee7d3',
```

In `src/styles/theme.css`, add to `@theme`:
```css
  --color-border-hot: var(--border-hot, #743940);
  --color-telemetry-cyan: var(--telemetry-cyan, #6ee7d3);
```

- [ ] **Step 4: Run theme tests to verify they pass**

Run: `npx vitest run src/theme/applyTheme.test.ts src/theme/themes.validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/theme/ src/styles/theme.css
git commit -m "feat(theme): register graphite cockpit tokens and CSS custom properties"
```

---

### Task 2: Cockpit Layout Shell & Telemetry Header/Sidebar

**Files:**
- Modify: `src/components/layout/sidebar.tsx:1-250`
- Modify: `src/components/layout/header.tsx:1-200`
- Modify: `src/components/layout/inspector-pane.tsx:1-200`
- Modify: `src/App.tsx:120-220`
- Test: `tests/ui/cockpit-layout.test.tsx` (new test)

**Interfaces:**
- Consumes: `useSettingsStore` (`activeTab`, `isSidebarCollapsed`), `useChatStore` (`activeConversationModel`), `useTaskUIStore` (`isInspectorOpen`)
- Produces: 3-zone persistent layout with 60px/240px nav rail, header telemetry cluster, and docked 320px–360px inspector.

- [ ] **Step 1: Write UI integration test for 3-zone cockpit shell**

Create `tests/ui/cockpit-layout.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../../src/components/layout/header';

describe('Header Telemetry Ribbon', () => {
  it('renders model status and latency telemetry cluster', () => {
    render(<Header onOpenApiKey={vi.fn()} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it passes/fails**

Run: `npx vitest run tests/ui/cockpit-layout.test.tsx`

- [ ] **Step 3: Update `sidebar.tsx`, `header.tsx`, and `App.tsx`**

1. In `sidebar.tsx`: enforce `w-[60px]` when collapsed with 2px crimson active indicator; `w-[240px]` when expanded with categorized group headers (`CONVERSATION`, `GENERATE`, `BUILD`, `SYSTEM`) styled in `text-[11px] tracking-wider font-semibold uppercase text-text-muted`.
2. In `header.tsx`: augment header with real-time telemetry badge:
   - Model pill with capability tags (`[VISION]`, `[FUNCTION_CALLING]`).
   - Ping/Latency indicator (`<HeaderStatusCluster />`).
   - Active task counter button with glowing pip when active.
3. In `App.tsx`: wrap main workspace in 3-zone container:
   - Zone 1: `<Sidebar />`
   - Zone 2: `<main className="flex-1 flex flex-col min-w-0 bg-bg overflow-hidden relative">`
   - Zone 3: `<InspectorPane />` as docked right utility rail.

- [ ] **Step 4: Run UI tests and layout tests**

Run: `npm run test:ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/ src/App.tsx tests/ui/
git commit -m "feat(layout): implement three-zone graphite cockpit shell and telemetry header"
```

---

### Task 3: Stitch MCP Project & Design System Synchronization

**Files:**
- Create: `DESIGN.md` in repository root (matching spec tokens & rules)
- Test/Script: `scripts/sync-stitch-design-system.ts`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-09-26-graphite-cockpit-ui-design.md`
- Produces: Live Stitch design system update to project `12225516409245957947`.

- [ ] **Step 1: Create repository `DESIGN.md`**

Write canonical `DESIGN.md` with YAML frontmatter defining:
- Colors: `surface: #0d0d10`, `background: #050505`, `primary: #ef555f`, `secondary: #6ee7d3`, `border: #26262c`, `border-hot: #743940`.
- Typography: `Inter` (body, headings), `JetBrains Mono` (code, telemetry).
- Shapes: `roundness: ROUND_FOUR` (6px–8px radius).

- [ ] **Step 2: Upload `DESIGN.md` to Stitch MCP project**

Execute tool call `upload_design_md` on project `12225516409245957947` with base64-encoded `DESIGN.md` content, followed by `create_design_system_from_design_md`.

- [ ] **Step 3: Verify Stitch project state**

Call `get_project` on `projects/12225516409245957947` to confirm the design system is synced and active.

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md
git commit -m "docs(design): update canonical DESIGN.md for Stitch MCP synchronization"
```

---

### Task 4: Standard Chat & Character RP Cockpit Views Refactor

**Files:**
- Modify: `src/components/chat/StandardChatView.tsx:1-350`
- Modify: `src/components/chat/CharacterChatsView.tsx:1-300`
- Modify: `src/components/chat/ChatMessage.tsx:1-250`
- Test: `tests/ui/chat-cockpit.test.tsx` (new test)

**Interfaces:**
- Consumes: `useChatStore` (`messages`, `sendMessage`, `isStreaming`)
- Produces: 640px reading column transcript container, docked bottom execution console with JetBrains Mono token counter and single-keystroke action triggers.

- [ ] **Step 1: Write test for chat container constraints**

Create `tests/ui/chat-cockpit.test.tsx` verifying transcript container adheres to `max-w-[40rem]` (640px) reading budget.

- [ ] **Step 2: Run test to verify it fails/passes**

Run: `npx vitest run tests/ui/chat-cockpit.test.tsx`

- [ ] **Step 3: Refactor `StandardChatView.tsx` & `ChatMessage.tsx`**

1. Set chat message transcript width to `max-w-[40rem] mx-auto w-full`.
2. Style assistant messages with `bg-surface-elevated/40 border border-border/60 rounded-lg p-4`.
3. Style user messages with recessed clean styling `bg-surface-muted/50 border border-border/40 rounded-lg p-4`.
4. Style the bottom input box as a docked execution bay:
   - Inset `#16161A` background with `1px #26262C` border.
   - Hot execution border `#743940` on focus.
   - Monospace token estimation pill (`JetBrains Mono`, 11px).
   - Solid Venice Crimson CTA button (`bg-accent text-accent-fg hover:bg-accent-hover rounded-md`).

- [ ] **Step 4: Run chat tests to verify pass**

Run: `npm run test:ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ tests/ui/
git commit -m "feat(chat): adapt StandardChatView and CharacterChatsView to cockpit reading columns"
```

---

### Task 5: Media Studio & Workflow Node Canvas Cockpit Refactor

**Files:**
- Modify: `src/components/image/image-page.tsx:1-300`
- Modify: `src/components/media/MediaStudioView.tsx:1-300`
- Modify: `src/components/workflows/WorkflowTemplatesView.tsx:1-250`
- Test: `tests/ui/media-cockpit.test.tsx`

**Interfaces:**
- Consumes: `useMediaStudioStore`, `useWorkflowStore`
- Produces: Full-width fluid canvas, stepped graphite media cards with 256px wells, reveal-on-hover toolbars, and stepped workflow node tiles.

- [ ] **Step 1: Write test verifying media studio card styling**

Add test checking media card container classes include `bg-surface border border-border rounded-lg`.

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/ui/media-cockpit.test.tsx`

- [ ] **Step 3: Update `image-page.tsx`, `MediaStudioView.tsx`, and `WorkflowTemplatesView.tsx`**

1. Fluid container layout (`w-full h-full px-6 py-4`).
2. Media cards: stepped graphite card container (`bg-surface-elevated/60 border border-border rounded-lg overflow-hidden transition-colors hover:border-border-strong`).
3. Workflow nodes: stepped headers with color-coded socket connectors (`text-telemetry-cyan` for media inputs, `text-accent` for execution flow).

- [ ] **Step 4: Run media tests**

Run: `npm run test:ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/image/ src/components/media/ src/components/workflows/ tests/ui/
git commit -m "feat(media,workflows): refactor Media Studio and Workflow Canvas to fluid cockpit grid"
```

---

### Task 6: System Drawers & Diagnostics Adaptation

**Files:**
- Modify: `src/components/status/TaskCenterDrawer.tsx:1-200`
- Modify: `src/components/status/DiagnosticsDrawer.tsx:1-200`
- Modify: `src/components/settings/SettingsView.tsx:1-300`
- Test: `tests/ui/drawers-cockpit.test.tsx`

**Interfaces:**
- Consumes: `useBackgroundTaskStore`, `useInspectorStore`, `useSettingsStore`
- Produces: Sunken `#08080A` monospace telemetry logs, deterministic prompt assembly trace display, and high-density settings panels.

- [ ] **Step 1: Write test for TaskCenterDrawer and DiagnosticsDrawer**

Verify drawers mount with `bg-surface border-l border-border` docked structure.

- [ ] **Step 2: Update `TaskCenterDrawer.tsx` & `DiagnosticsDrawer.tsx`**

1. Apply `bg-surface border-l border-border w-[360px]` docked layout.
2. Code logs and telemetry traces use `bg-surface-muted border border-border font-mono text-[12px]`.
3. Capability pills use `text-telemetry-cyan border border-telemetry-cyan/30 rounded-full px-2 py-0.5 text-[11px]`.

- [ ] **Step 3: Run status/diagnostics tests**

Run: `npx vitest run tests/ui/drawers-cockpit.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/status/ src/components/settings/ tests/ui/
git commit -m "feat(status,settings): adapt drawers and diagnostics to high-density telemetry format"
```

---

### Task 7: Comprehensive Verification & Visual Acceptance Suite

**Files:**
- Entire repository
- Update: `docs/summary_of_work.md`

- [ ] **Step 1: Run linter and typecheck**

Run: `npm run lint:eslint && npm run typecheck`
Expected: Zero lint or TypeScript errors.

- [ ] **Step 2: Run unit and contract test suites**

Run: `npm run test:unit && npm run test:contracts`
Expected: All suites PASS.

- [ ] **Step 3: Run safety guard and markdown link verifiers**

Run: `npm run verify:safety-guard && npm run verify:markdown-links`
Expected: Zero violations.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: Clean build with zero asset or bundle errors.

- [ ] **Step 5: Update session handoff document**

Update `docs/summary_of_work.md` with:
- Summary of Graphite Cockpit UI re-envisioning on branch `feature/graphite-cockpit-redesign`.
- Validation matrix reflecting actual test results.
- Open TODO ledger update.

- [ ] **Step 6: Commit**

```bash
git add docs/summary_of_work.md
git commit -m "docs(handoff): record Graphite Cockpit UI re-envisioning session handoff"
```
