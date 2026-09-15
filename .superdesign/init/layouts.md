# Venice Forge — Layouts / Shell (source-grounded init)

> Generated for baseline `07ad9ee6ec6e4249f2ea2a27dc794fa148bd96e8`. Layout source is authoritative.

## Application composition (`src/App.tsx`)

The desktop shell is a three-zone composition: sidebar, main workspace, and optional inspector rail. Header sits above the workspace. The main view is selected from `views: Record<TabId, React.ComponentType>` after `normaliseTab(activeTab)`.

```tsx
return (
  <div className="relative isolate flex h-[100dvh] w-screen overflow-hidden bg-vf-shell-bg-deep">
    <a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>
    <AppMeshOverlay />
    {mobileSidebarOpen && (
      <button aria-label={tRuntime("runtimeGenerated.app.attribute.closeMenu")}
        className="md:hidden fixed inset-0 z-30 bg-overlay/80 backdrop-blur-[2px]"
        onClick={() => setMobileSidebarOpen(false)} />
    )}
    <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
    <div className="relative z-10 flex flex-col flex-1 min-w-0">
      <Header onOpenApiKey={() => setApiKeyOpen(true)} onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main id="main-content" tabIndex={-1}
          className="flex-1 min-h-0 overflow-hidden bg-vf-panel-bg rounded-none border-0 shadow-none outline-none">
          <ErrorBoundary key={normalisedActiveTab}>
            <div key={normalisedActiveTab} className="section-transition h-full"><ActiveView /></div>
          </ErrorBoundary>
        </main>
        <InspectorPane />
      </div>
    </div>
    <DiagnosticsDrawer />
    <TaskCenterDrawer />
  </div>
)
```

## Sidebar (`src/components/layout/sidebar.tsx`)

- Source: `src/components/layout/sidebar.tsx`
- Width constants: `SIDEBAR_MIN_WIDTH`, `SIDEBAR_DEFAULT_WIDTH`, `SIDEBAR_MAX_WIDTH`, `SIDEBAR_COLLAPSED_WIDTH` from `src/stores/settings-store.ts`.
- Desktop width is `--sidebar-width`; collapsed mode is an icon rail; mobile mode is a fixed drawer under `md` with a scrim.
- Navigation is derived from `TAB_REGISTRY`, `TAB_GROUP_LABELS`, and `TAB_ICONS`; do not hand-maintain a second route list.
- Project switcher, new-chat action, conversation search/history, Family Safe Mode toggle, Traffic Inspector toggle, and shortcut legend are sidebar-owned controls.

## Header (`src/components/layout/header.tsx`)

- Source: `src/components/layout/header.tsx`
- `h-14`, `bg-vf-shell-bg`, bottom border `border-vf-panel-border`.
- Left controls: mobile menu and desktop sidebar toggle.
- Center-left: active character avatar, canonical tab label/subtitle, model selector where the tab descriptor owns a selector.
- Right: Task Center, `HeaderStatusCluster`, API-key status/manage action.

## Inspector rail (`src/components/layout/inspector-pane.tsx`)

- Optional, null when `showInspector` is false.
- Source: `src/components/layout/inspector-pane.tsx`.
- Main frame uses an accessible vertical `role="separator"`, pointer drag, arrow-key resize, Enter/Space/Escape reset, and focus restore on close.
- Tabs: traffic and prompt layers. Export is redacted telemetry only.

## Responsive and overlay contracts

- `md` is the mobile boundary.
- `src/components/layout/AppMeshOverlay.tsx` is ambient only: `aria-hidden="true"`, no interaction.
- Global overlays include `ApiKeyDialog`, `FirstRunModal`, `OnboardingSplash`, `CommandPalette`, `ModalRequestHost`, `Toaster`, `DiagnosticsDrawer`, and `TaskCenterDrawer`.
- Do not introduce unrestricted navigation, renderer filesystem access, or a second shell route registry.
