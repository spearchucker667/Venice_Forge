# Design-System Primitive Rollout Across Remaining Tabs

**Status:** Approved design; implementation pending
**Date:** 2026-09-14
**Baseline:** local `main` at `f74d9c7f`; the completed September 13 chat refresh is a reference implementation, not part of this migration

## Objective

Extend the September 13 `IconButton`, `Pill`, `Toolbar`, `Card`, and `EmptyState` primitives across the highest-value remaining application tabs without changing feature behavior, persistence, transport boundaries, or localized user-visible meaning.

## Scope

The first rollout covers four related library/editor surfaces with the highest concentration of duplicated local patterns:

1. Media Studio: `src/components/gallery/media-toolbar.tsx` and `src/components/gallery/gallery-view.tsx`.
2. Prompt Library: `src/components/prompts/PromptLibraryView.tsx`.
3. Scene Composer: `src/components/scenes/SceneComposerView.tsx`.
4. Workflow Templates: `src/components/workflows/WorkflowTemplatesView.tsx`.

The rollout excludes chat components, specialist dialogs, large character editors, settings panels, and unrelated shell work. Interactive list rows remain native buttons rather than being converted into non-semantic card wrappers.

## Component Strategy

### IconButton

- Replace icon-only raw buttons where the existing control already has or can reuse a localized accessible name.
- Preserve handlers, disabled state, pressed state, focus order, test IDs, and button type.
- Repair `asPlainButton` so Enter and Space activate it with native-button-like semantics, without changing callers that render a real button.

### Toolbar

- Replace duplicated action-strip containers with `Toolbar` where the children form a coherent action group.
- Give every migrated toolbar a localized accessible label.
- Preserve responsive wrapping and existing layout constraints through narrow caller classes.

### Pill

- Replace status and count badges, but not selectable filter groups or full text buttons.
- Use semantic tones (`neutral`, `accent`, `success`, `warning`, `danger`) instead of palette-specific color classes.

### Card

- Replace non-interactive card-like surface containers whose elevation and border treatment match the primitive contract.
- Do not wrap or replace interactive listbox options in ways that change their roles or keyboard behavior.

### EmptyState

- Replace full-pane or substantial library placeholders with the richer primitive.
- Reuse existing translation keys and distinguish an empty library from an empty filtered result where the current UI already does so.
- Retain existing test IDs required by integration tests.

## Theme and Localization

- Use the existing semantic surface, border, text, accent, warning, and danger tokens.
- Remove palette-specific classes encountered in the migrated structures, such as yellow favorite styling, when a semantic token expresses the same state.
- Do not add hardcoded English. Existing translation keys remain authoritative; any new accessible label must be added to the source catalog and synchronized through the repository's i18n workflow.
- Do not change application data, API payloads, stores, routing, or persistence.

## Accessibility and Behavioral Contracts

- Icon-only controls have accessible names.
- Toolbars expose `role="toolbar"` and an accessible label.
- Toggle controls retain `aria-pressed`.
- Disabled controls remain non-activatable.
- `IconButton.asPlainButton` responds once to Enter and once to Space and does not activate while disabled.
- Listbox/list-option roles, selection state, file-input labels, and focus-visible treatment remain intact.

## Testing

- Extend `src/components/ui/primitives.test.tsx` for keyboard activation and disabled behavior.
- Extend the existing Media Studio, Prompt Library, Scene Composer, and Workflow Templates tests with focused assertions for accessible names, toolbar roles, empty states, toggles, and preserved interactions.
- Prefer behavior and accessibility assertions over implementation-only class snapshots.

## Validation

Run under the repository-compatible Node 22 installation:

1. Focused Vitest suites for primitives and the four migrated surfaces.
2. Theme/CSP invariant tests relevant to rendered class usage.
3. `npm run verify:theme-tokens`.
4. `npm run verify:i18n`.
5. `npm run verify:i18n-hardcoded-regressions`.
6. The current UI test script from `package.json`.
7. `npm run typecheck`.
8. `npm run lint:eslint`.
9. `npm run build:web`.

Manual rendered QA will be attempted if the application can be started without disturbing concurrent work. Any unrun or blocked validation will be recorded explicitly.

## Worktree and Handoff Safety

- Preserve the existing user-owned audit/release/legal documentation relocation.
- Inspect every target file for pre-existing edits before changing it.
- Do not commit or push.
- Update `docs/summary_of_work.md` and `docs/ROADMAP.md` with the actual implementation and validation results. Update `docs/DOCS_INDEX.md` only for the retained design and any documentation path changes made by this task.

## Definition of Done

- The four scoped tabs use the shared primitives for suitable duplicated patterns.
- Existing behavior, localization, and semantic roles are preserved.
- Focused accessibility and integration tests cover the migrated behavior.
- Relevant theme, i18n, UI, type, lint, and build validations have factual recorded outcomes.
- Required handoff documentation is updated.
- No task changes are committed or pushed.
