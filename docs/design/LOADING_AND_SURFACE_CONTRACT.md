# Loading and Surface Contract

This contract distinguishes semantic work states from structural and interactive boundaries. It intentionally does not require one animation or one border treatment everywhere.

## Loading states

- Long-running generation, provider execution, research synthesis, and background jobs use `GenerationLoadingIndicator` with the matching semantic state and an accessible text label.
- Short metadata hydration, list refresh, model discovery, and local persistence use compact progress text, skeletons, or CSS spinners. These controls must expose an accessible name or adjacent status text.
- Destructive confirmation, security decisions, and terminal errors use static semantic indicators, never cycling decorative animation.
- Every motion treatment must honor `prefers-reduced-motion`; the generation registry provides static fallbacks and CSS motion must be disabled by the reduced-motion theme contract.

## Surfaces and boundaries

- Structural shell/page/panel separation uses `mesh-surface`, `mesh-surface-elevated`, `soft-separator-x`, or `soft-separator-y` where the hierarchy benefits from it.
- Inputs, buttons, cards with actions, and other interactive controls retain visible solid borders with theme-token contrast. Mesh styling must not erase affordance.
- Selected, focus, warning, and error states use semantic token outlines/rings in addition to color where necessary.
- Dense tables and metadata grids may retain restrained solid separators for scanability.

Dark, light, and high-contrast themes plus 100%, 200%, and 400% zoom remain headed release QA. Automated token, contrast, and reduced-motion tests are necessary but do not replace that matrix.
