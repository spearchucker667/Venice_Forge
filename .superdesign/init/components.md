# Venice Forge — Components

## Canonical primitive set (`src/components/ui/primitives.tsx`, "VF Design System 2026-09-13")

Tailwind classes over semantic CSS tokens; `cn()` = filter/join (no tailwind-merge).

- `IconButton` — tones: neutral/accent/success/warning/danger/info; sizes sm/md/lg; target sizes test-covered.
- `Pill`, `Toolbar`, `Card`, `EmptyState`, `Input` (forwardRef).

## Legacy/shared set (`src/components/ui/shared.tsx`)

`Label`, `TextArea`, `PrimaryButton`, `GhostButton`, `SecondaryButton`, `DangerButton`, `PillGroup`, `ErrorText`, `EmptyState` (dupe of primitives), `Card` (dupe), `SectionHeading`, `Badge`, `StatusDot`, `ExamplePrompts`. **Redesign note: primitives.tsx is canonical; migrate shared.tsx consumers and remove duplicates.**

## Select (`src/components/ui/select.tsx`)

Single custom `Select`: portal dropdown, searchable, keyboard nav, collision flip, `aria-expanded`/`aria-controls`.

## Overlays & feedback

- `AccessibleDialog` (focus trap, Escape, label), `ContextMenu` (portal), `modal-requests` (askText/askDecision), `ConfirmModal`, `toaster` + `notifications/ToastProvider` (semantic tones), `spinner`, `generation-view` + `generation/*` (GenerationLoadingIndicator, animation registry/preloader).
- `ErrorBoundary` / `ui/error-boundary`.

## Brand & icons

- `ui/logo.tsx`: `VeniceLogo` / `VeniceWordmark` (mask-image based). NEVER replace with placeholders.
- `ui/Meteocon.tsx`: icon system (CSP-safe SVG); `meteoconSvgTransformer.ts`.
- `Chip.tsx`, `Field.tsx`, `ModelSelect.tsx`, `media/ResolvedMediaImg.tsx`, `media/ManagedVideoPlayer.tsx`.

## Layout components

`layout/sidebar.tsx`, `layout/header.tsx`, `layout/inspector-pane.tsx`, `layout/AppMeshOverlay.tsx` (8-line ambient layer div), `layout/api-key-dialog.tsx`, `layout/memory-panel.tsx`, `status/HeaderStatusCluster.tsx`, `status/StatusIndicator.tsx`.

## CSS class layers

`src/styles/theme.css` (Tailwind v4 `@theme`, type scale `.vf-display…vf-tag`, `.prose-venice`, scrollbars, focus ring, keyframes, reduced-motion), `src/styles/components.css` (`.btn` system, `.mesh-*` surfaces, `.glass-*`, `.modal-*`, `.vf-action-*`, `.vf-empty-state*`, `.vf-composer`, `.border-soft/faint`), `src/styles/accessibility.css`.

## Redesign targets for shared primitives (new, derived-token based)

`ShellPanel`, `PanelHeader`, `PanelSection`, `InsetCanvas`, `UtilityRail`/`UtilityRailSection`, `StatusRow`, `MetricStrip`, `DenseListRow`, `InspectorCard`, `AccentProgress`, `DataGridSurface` — add only where ≥2 substantial surfaces consume them.
