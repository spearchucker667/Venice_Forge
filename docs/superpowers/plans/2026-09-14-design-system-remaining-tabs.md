# Design-System Primitive Rollout Across Remaining Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not dispatch subagents unless the user separately authorizes delegation.

**Goal:** Replace duplicated button, badge, toolbar, card, and empty-state markup in Media Studio, Prompt Library, Scene Composer, and Workflow Templates with the September 13 shared primitives while preserving behavior, localization, and accessibility.

**Architecture:** Keep the existing stores, event handlers, list semantics, and layouts. Strengthen the primitive accessibility contract first, then migrate each tab independently by composing `IconButton`, `Pill`, `Toolbar`, `Card`, and `EmptyState` with narrow caller classes; interactive listbox options stay native buttons.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS 4 semantic tokens, react-i18next, Testing Library, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-14-design-system-remaining-tabs-design.md`

## Global Constraints

- Work only on local `main`; preserve the user-owned audit/release/legal documentation relocation.
- Use Node `>=22.15.0 <23.0.0` and npm `>=10.0.0`; prepend `/opt/homebrew/opt/node@22/bin` for this session.
- Do not modify chat refresh components or reimplement the September 13 baseline.
- Do not add hardcoded English, palette-specific colors, inline `style`, or new persistence/transport behavior.
- Preserve existing handlers, test IDs, `aria-pressed`, disabled states, listbox/option semantics, and focus order.
- Do not commit or push.

---

### Task 1: Strengthen Primitive Keyboard and Toolbar Contracts

**Files:**
- Modify: `src/components/ui/primitives.tsx`
- Test: `src/components/ui/primitives.test.tsx`

**Interfaces:**
- Consumes: existing `IconButtonProps` and `ToolbarProps`.
- Produces: `IconButton` with native-like Enter/Space activation when `asPlainButton` is true; unchanged exported prop types.

- [ ] **Step 1: Add failing keyboard tests**

Add tests that focus an `asPlainButton` control, send `{Enter}` and one space, and assert one click for each key. Add a disabled case that asserts neither key activates the control.

```tsx
it('keyboard-activates asPlainButton with Enter and Space', async () => {
  const user = userEvent.setup()
  const onClick = vi.fn()
  render(<IconButton ariaLabel="Compose" icon={<span />} asPlainButton onClick={onClick} />)
  const button = screen.getByRole('button', { name: 'Compose' })
  button.focus()
  await user.keyboard('{Enter}')
  await user.keyboard(' ')
  expect(onClick).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Verify the new test fails**

Run: `npx vitest run src/components/ui/primitives.test.tsx --no-file-parallelism`

Expected: the keyboard activation assertion fails because the current `div role="button"` has no key handler.

- [ ] **Step 3: Implement native-like activation**

In the `asPlainButton` branch, compose the caller's `onKeyDown` with an internal handler. Ignore activation when `rest.disabled` is true, call `preventDefault()` for Enter/Space, and invoke the caller's `onClick` with the current target. Add `aria-disabled` and remove the element from activation behavior while retaining the existing focus contract for enabled controls.

- [ ] **Step 4: Verify the primitive suite passes**

Run: `npx vitest run src/components/ui/primitives.test.tsx --no-file-parallelism`

Expected: all primitive tests pass, including exactly-once Enter/Space activation and disabled non-activation.

### Task 2: Migrate Media Studio Action and Empty-State Surfaces

**Files:**
- Modify: `src/components/gallery/media-toolbar.tsx`
- Modify: `src/components/gallery/gallery-view.tsx`
- Test: `src/components/gallery/gallery-view.test.tsx`

**Interfaces:**
- Consumes: `IconButton`, `Pill`, `Toolbar`, and `EmptyState` from `../ui/primitives` or `../ui/primitives` relative to each file.
- Produces: labelled Media Studio action groups and the existing `prompt-library`-independent media empty-state behavior.

- [ ] **Step 1: Add failing accessibility assertions**

Extend the gallery test setup to assert that multi-select mode exposes a toolbar named by the existing localized Media Studio action text, the clear-search control is an accessible button, and an empty media collection renders the existing no-matching-media headline through `data-testid="media-studio-empty"`.

- [ ] **Step 2: Verify the Media Studio assertions fail**

Run: `npx vitest run src/components/gallery/gallery-view.test.tsx --no-file-parallelism`

Expected: the named toolbar and new empty-state test ID are absent in the current bespoke markup.

- [ ] **Step 3: Migrate `media-toolbar.tsx`**

Import `IconButton`, `Pill`, and `Toolbar`. Convert only the icon-only clear-search button to `IconButton size="sm"`, retaining its localized label and absolute positioning. Use `Toolbar` for the top control strip and bulk action strip, with localized `aria-label` values and `data-testid="bulk-action-toolbar"`. Use `Pill` for the total item count and selected-count summary. Keep `PillGroup` for selectable media filters and keep text actions as their existing semantic buttons/GhostButton.

- [ ] **Step 4: Migrate the full-pane gallery placeholder**

Import the design-system `EmptyState` in `gallery-view.tsx`. Replace the nested centered `<div>` placeholder with:

```tsx
<EmptyState
  data-testid="media-studio-empty"
  headline={<Trans i18nKey="common:surface.componentsGalleryGalleryView.description.noMatchingMedia" />}
  helper={items.length === 0 ? emptyLibraryText : filteredHelpText}
  className="h-full"
/>
```

Derive `emptyLibraryText` and `filteredHelpText` from the same current `tRuntime` keys; do not change loading or load-more behavior.

- [ ] **Step 5: Run Media Studio tests**

Run: `npm run test:ui:media:gallery`

Expected: the full gallery suite passes with selection, export, regeneration, Save As, and dialog flows unchanged.

### Task 3: Migrate Prompt Library Status, Toolbar, Card, and Empty States

**Files:**
- Modify: `src/components/prompts/PromptLibraryView.tsx`
- Test: `src/components/prompts/PromptLibraryView.test.tsx`

**Interfaces:**
- Consumes: `Pill`, `Toolbar`, `Card`, and `EmptyState` from `../ui/primitives`.
- Produces: the same prompt CRUD/editor behavior with shared visual structure.

- [ ] **Step 1: Add failing semantic tests**

Add assertions that the list filter actions are within a named toolbar, the empty list retains `data-testid="prompt-library-empty"`, the empty detail pane retains `data-testid="prompt-library-empty-detail"`, and a prompt kind/tag renders inside the primitive's `data-tone` contract.

- [ ] **Step 2: Verify the Prompt Library assertions fail**

Run: `npx vitest run src/components/prompts/PromptLibraryView.test.tsx --no-file-parallelism`

Expected: the toolbar role and primitive tone attributes are absent.

- [ ] **Step 3: Migrate Prompt Library structure**

Import the four primitives. Wrap the existing scope/sort/favorite/archive controls in `Toolbar bare` with a localized accessible label. Replace prompt kind and tag badge spans with `Pill`, using neutral for kind/scope and accent for tags. Replace the list and detail placeholders with `EmptyState`, preserving both existing test IDs and translation keys. Convert non-interactive history/version surface wrappers to `Card elevation="flat" padded={false}` only where doing so does not change a list item or button role.

- [ ] **Step 4: Preserve destructive and interactive semantics**

Replace `border-red-*`/`text-red-*` classes encountered in the migrated action group with `border-danger/*` and `text-danger`. Do not convert listbox option buttons, delete confirmation inputs, or text-labelled action buttons into `IconButton`.

- [ ] **Step 5: Run Prompt Library tests**

Run: `npx vitest run src/components/prompts/PromptLibraryView.test.tsx --no-file-parallelism`

Expected: all prompt create, filter, save, archive, favorite, delete, selection-recovery, and new accessibility tests pass.

### Task 4: Migrate Scene Composer Status, Toolbar, Card, and Empty States

**Files:**
- Modify: `src/components/scenes/SceneComposerView.tsx`
- Test: `src/components/scenes/SceneComposerView.test.tsx`

**Interfaces:**
- Consumes: `Pill`, `Toolbar`, `Card`, and `EmptyState` from `../ui/primitives`.
- Produces: unchanged scene filtering, versioning, reference planning, and Image Studio handoff behavior.

- [ ] **Step 1: Add failing accessibility assertions**

Extend existing empty-state and filter tests to assert a named toolbar, both `scene-composer-empty` and `scene-composer-empty-detail`, and semantic pressed state for favorites/archive controls.

- [ ] **Step 2: Verify the Scene Composer assertions fail**

Run: `npx vitest run src/components/scenes/SceneComposerView.test.tsx --no-file-parallelism`

Expected: the named toolbar and primitive empty-state structure are absent.

- [ ] **Step 3: Migrate Scene Composer structure**

Import the four primitives. Wrap scope/sort/favorites/archive controls in `Toolbar bare` with a localized label. Convert output-count and scope/version/component metadata badges to neutral or accent `Pill` where they are categorical status rather than prose. Replace full list/detail placeholders with `EmptyState`, preserving test IDs and existing runtime translation keys. Convert the non-interactive reference preview panel and suitable history/version surface wrappers to `Card elevation="flat"` while keeping nested buttons and lists intact.

- [ ] **Step 4: Normalize migrated destructive styling**

Replace red palette classes in the migrated delete controls with semantic danger tokens without changing the typed-confirmation gate or button labels.

- [ ] **Step 5: Run Scene Composer tests**

Run: `npx vitest run src/components/scenes/SceneComposerView.test.tsx --no-file-parallelism`

Expected: all scene CRUD, filter, version, reference, clipboard, archive, and handoff tests pass.

### Task 5: Migrate Workflow Template Toolbars, Cards, Pills, and Empty States

**Files:**
- Modify: `src/components/workflows/WorkflowTemplatesView.tsx`
- Test: `src/components/workflows/WorkflowTemplatesView.test.tsx`

**Interfaces:**
- Consumes: `Pill`, `Toolbar`, `Card`, and `EmptyState` from `../ui/primitives`.
- Produces: unchanged workflow import/create/edit/compile/run behavior with semantic token styling.

- [ ] **Step 1: Add failing component/integration assertions**

Add tests that the header actions and selected-workflow actions are named toolbars, the initial placeholder keeps `data-testid="empty-state"`, the active favorite status uses a warning-tone primitive, and add/remove step interactions remain operational.

- [ ] **Step 2: Verify the Workflow Templates assertions fail**

Run: `npx vitest run src/components/workflows/WorkflowTemplatesView.test.tsx --no-file-parallelism`

Expected: toolbar roles and semantic tone attributes are absent.

- [ ] **Step 3: Migrate workflow structure**

Import the four primitives. Wrap import/new and favorite/export/archive/delete actions in separately labelled `Toolbar bare` groups. Replace the full detail placeholder with `EmptyState`, preserving `data-testid="empty-state"`. Use `Pill tone="warning"` for favorite status and neutral/accent pills for scope/version status where the content is a badge. Convert workflow step, compile preview, and run-plan preview containers to `Card elevation="flat"` while retaining their current test IDs.

- [ ] **Step 4: Replace palette-specific classes**

Replace `yellow-*`, `red-*`, and `blue-*` classes touched by the migration with semantic warning, danger, and accent tokens. Preserve button labels, callbacks, disabled state, and current layout.

- [ ] **Step 5: Run Workflow Templates tests**

Run: `npm run test:workflow:ui`

Expected: all workflow create, step edit/remove, compile, run-plan, and Image Studio handoff tests pass.

### Task 6: Cross-Surface Validation and Honest Handoff

**Files:**
- Modify: `docs/summary_of_work.md`
- Modify: `docs/ROADMAP.md`
- Already modified: `docs/DOCS_INDEX.md`

**Interfaces:**
- Consumes: the completed source/test changes from Tasks 1-5.
- Produces: factual local validation evidence and current remaining-work status; no publication state.

- [ ] **Step 1: Run focused combined tests**

Run:

```bash
npx vitest run \
  src/components/ui/primitives.test.tsx \
  src/components/gallery/gallery-view.test.tsx \
  src/components/prompts/PromptLibraryView.test.tsx \
  src/components/scenes/SceneComposerView.test.tsx \
  src/components/workflows/WorkflowTemplatesView.test.tsx \
  --no-file-parallelism
```

Expected: all selected files pass.

- [ ] **Step 2: Run theme and localization validation**

Run each command separately and record its actual result:

```bash
npx vitest run tests/csp/inlineStyleInvariant.test.ts tests/theme/meshSurfaceInvariant.test.ts --no-file-parallelism
npm run verify:theme-tokens
npm run verify:i18n
npm run verify:i18n-hardcoded-regressions
```

- [ ] **Step 3: Run relevant UI validation**

Run:

```bash
npm run test:ui:media:gallery
npm run test:workflow:ui
```

Prompt Library and Scene Composer have no dedicated package aliases, so their full files are covered by Step 1.

- [ ] **Step 4: Run static and build validation**

Run each command separately:

```bash
npm run typecheck
npm run lint:eslint
npm run build:web
```

- [ ] **Step 5: Attempt rendered QA without disturbing concurrent work**

Check for an existing development server before starting one. If no safe rendered session is available, record manual QA as not run. If available, validate: Media Studio opens and filters; Prompt Library opens and creates/selects; Scene Composer opens and toggles filters; Workflow Templates opens and creates/selects. Record URL, viewport, console health, and interactions actually observed.

- [ ] **Step 6: Update the mandatory handoff**

Update `docs/summary_of_work.md` Latest Session Summary, append a dated Session History entry, and add only commands actually executed to the Validation Matrix. Update `docs/ROADMAP.md` to mark the four-tab rollout locally complete only if the implementation and relevant validations pass; retain unverified cross-theme/manual/hosted acceptance as open.

- [ ] **Step 7: Review the final worktree without committing**

Run:

```bash
git status --short
git diff --check
git diff -- src/components src/i18n docs/DOCS_INDEX.md docs/ROADMAP.md docs/summary_of_work.md docs/superpowers
```

Confirm the audit relocation remains user-owned and untouched. Do not stage, commit, or push.
