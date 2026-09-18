# Venice Forge — Extractable Components (source-grounded init)

> Extract only when a pattern has at least two substantial consumers and its behavior can remain within the existing theme, i18n, accessibility, safety, persistence, and bridge contracts.

## Required extraction record schema

Every candidate must record:

| Field | Meaning |
|---|---|
| **name** | Stable component name/export |
| **source path** | Current implementation or intended canonical home |
| **category** | shell, panel, form, status, list, media, overlay, or editor |
| **description** | Visible/behavioral responsibility |
| **state/navigation props** | State, callbacks, route/tab, and ownership inputs |
| **hardcoded elements** | Any intentional fixed copy/color/geometry that must remain tokenized or localized |

## Current canonical candidates

| Name | Source path | Category | Description | State/navigation props | Hardcoded elements |
|---|---|---|---|---|---|
| `ShellPanel` | `src/components/ui/primitives.tsx` | shell/panel | Framed raised or inset workspace panel | `inset` | none; consumes `--vf-*` classes |
| `PanelHeader` | `src/components/ui/primitives.tsx` | panel | Compact title/action row | `title`, `actions` | none; title is caller-localized |
| `UtilityRailSection` | `src/components/ui/primitives.tsx` | shell/status | Utility rail section with compact header | `title`, `actions` | none |
| `DenseListRow` | `src/components/ui/primitives.tsx` | list | Selected/hoverable compact row | `selected`, `leading`, `label`, `trailing` | none |
| `AccentProgress` | `src/components/ui/primitives.tsx` | status | Accessible accent progress bar | `value`, `label` | none; width uses CSP-safe CSS property |
| `IconButton` | `src/components/ui/primitives.tsx` | form/action | Shared icon action semantics | `icon`, `ariaLabel`, `tone`, `size`, `filled`, `asPlainButton` | no fixed visible copy |
| `Card` | `src/components/ui/primitives.tsx` | panel | Semantic elevation surface | `elevation`, `tone`, `padded` | none |
| `EmptyState` | `src/components/ui/primitives.tsx` | status | Headline/helper/action empty state | `eyebrow`, `headline`, `helper`, `illustration`, `action` | visible text supplied by caller and must be localized |
| `AccessibleDialog` | `src/components/ui/AccessibleDialog.tsx` | overlay | Focus trap, Escape, restore | `title`, `description`, `children`, `onClose`, `initialFocusRef`, `headerAction`, `panelRef`, `panelClassName`, `closeOnBackdrop`, `zIndexClassName` | none |
| `Toolbar` | `src/components/ui/primitives.tsx` | action | Shared action grouping | `size`, `bare`, `align`, `asToolbar` | none |

## Do not extract blindly

- Do not create a parallel theme/token system; all visual values resolve through `src/styles/theme.css` and `src/styles/components.css`.
- Do not move security-sensitive document/workspace or IPC authorization into renderer components.
- Do not turn global tab navigation into a generic component that bypasses `src/config/tabs.ts`.
- Do not persist media data URLs or raw credentials through a reusable UI state layer.
