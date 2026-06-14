/**
 * App-wide ambient mesh overlay.
 *
 * Renders behind all app content, is non-interactive, and adapts to the active
 * theme via CSS variables. The opacity is scaled down for light themes so the
 * effect stays subtle and never harms text contrast.
 */
export function AppMeshOverlay(): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="app-mesh-overlay"
      data-testid="app-mesh-overlay"
    />
  )
}
