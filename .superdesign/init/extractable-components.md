# Venice Forge — Extractable Components (redesign candidates)

Reusable primitives that at least two substantial surfaces need. Canonical home after redesign: `src/components/ui/primitives.tsx` + `src/styles/components.css` (derived-token classes). Names illustrative.

## New (reference material language)
| Component | Consumers | Notes |
|---|---|---|
| `ShellPanel` | App main, Settings, Status, Chat, drawers | 1px border, low radius (6–10px), raised graphite, subtle top inner highlight |
| `PanelHeader` | every pane, drawers, Theme Maker | compact title row, optional actions, micro-label style |
| `PanelSection` | Settings groups, Status cards, Privacy | divider-based hierarchy, not card-per-row |
| `InsetCanvas` | Chat transcript, image/video preview, workflow graph, playground editor, code surfaces | darker inset bg, faint grid option |
| `UtilityRail` / `UtilityRailSection` | InspectorPane, DiagnosticsDrawer, TaskCenterDrawer, Documents agent rail | compact stacked technical cards |
| `DenseListRow` | History, Media grid rows, Task Center, prompt library | strong selected state, hover actions |
| `StatusRow` / `MetricStrip` | Status, Privacy dashboard, HeaderStatusCluster | label + value + compact indicator |
| `AccentProgress` | generation progress, task progress, checklist items | accent-derived, restrained glow |
| `DataGridSurface` | Status charts, Inspector timing, token/context meters | faint grid, muted ticks, accent current trace |

## Existing to consolidate
- `Card`/`EmptyState` duplicated in `ui/shared.tsx` and `ui/primitives.tsx` → keep primitives, migrate consumers, delete dupes.
- `.mesh-*` / `.glass-*` classes (components.css) → re-anchor onto derived `--vf-*` shell tokens; retire visual variants that fight the new material contract.
- `StatusDot`, `Badge`, `Pill` → single status-badge system with semantic tones (success/warning/danger/info/neutral/accent).
