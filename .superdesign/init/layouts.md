# Venice Forge — Layouts / Shell

## Desktop shell (src/App.tsx)

Three-zone instrument layout already in place; redesign retunes rather than rebuilds:

```
┌────────────────────────────────────────────────────────────┐
│ Header — h-14, mesh-surface, soft-separator-y              │
├──────────────┬──────────────────────────────┬──────────────┤
│ Sidebar      │ main#main-content            │ InspectorPane│
│ (resizable)  │ .mesh-panel, lazy view       │ (right rail, │
│ 220–480px    │                              │ when open)   │
│ collapsed 60 │                              │              │
└──────────────┴──────────────────────────────┴──────────────┘
AppMeshOverlay — fixed, aria-hidden, pointer-events:none (ambient layer)
```

## Sidebar (`src/components/layout/sidebar.tsx`)

- Resizable via pointer + keyboard separator; constants `src/stores/settings-store.ts:27-30` (`SIDEBAR_MIN 220`, `DEFAULT 256`, `MAX 480`, `COLLAPSED 60`); width via `--sidebar-width` CSS var.
- Collapsed mode = 60px icon rail with tooltips (`sidebarOpen=false`).
- Mobile (< md): fixed `w-72` drawer + backdrop scrim in App.
- Content: logo/wordmark → project switcher → nav groups (Conversation / Generate / Build / System, order from `src/config/tabs.ts`) → chat history + search (chat tab) → Traffic Inspector & Family Safe switches → shortcut legend.
- Icons: Meteocon icon system; character avatars preserved.

## Header (`src/components/layout/header.tsx`)

h-14, `mesh-surface mesh-header soft-separator-y`. Left: mobile hamburger, sidebar toggle, tab title/subtitle, model selector (hidden when `modelSelectorOwner: 'view'`). Right: Task Center toggle + count badge, `HeaderStatusCluster`, API-key status button (`StatusDot`). Labels collapse below xl/sm breakpoints.

## Right utility rail

`src/components/layout/inspector-pane.tsx` renders null unless `showInspector`; drag-resizable width (`inspectorWidth` + drag override); internal 180px column. Siblings with same visual role: `status/DiagnosticsDrawer.tsx`, `status/TaskCenterDrawer.tsx` (full-height drawers).

## View layouts by family

- **Chat**: full-height column — transcript scroll + composer (`vf-composer`), HistoryView as master list.
- **Generate**: mostly three-pane (controls | canvas/preview | options/history) or toolbar+grid (Media Studio gallery).
- **Build**: master/detail editors — RP Studio (rails + central editor), Documents (tree | editor | agent rail), Scene Composer (layers | canvas | properties), Workflows (graph canvas + inspector).
- **System**: Settings = narrow nav rail + config pane (+ Theme Maker live preview); Status = summary strip + diagnostic panels + cards.

## Responsive contracts (test-asserted)

sidebar.test.tsx / header.test.tsx assert widths, collapse, drawer behavior — must not regress. Breakpoint `md` is the mobile boundary.
