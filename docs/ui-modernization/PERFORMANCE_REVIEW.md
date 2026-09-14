# Venice Forge — UI & Theme Engine Performance Review

> **Subject:** Rendering Performance, Bundle Impact & Runtime Overhead Audit  
> **Toolchain:** Tailwind CSS v4, Vite 8, React 19, Chromium / Electron 43  
> **Node Contract:** `>=22.15.0 <23.0.0` (Node 22.15.0 verified)  
> **Date:** September 14, 2026  

---

## 1. Architectural Performance Principles

Venice Forge's visual architecture prioritizes 60fps desktop interactivity, instant theme switching, low memory consumption, and zero runtime CSS-in-JS compilation overhead.

### 1.1 CSS Custom Property Cascading vs. Component Rerenders
Many web applications re-render their entire React virtual DOM tree when a theme changes by pushing theme objects through React Contexts. Venice Forge uses **CSS Custom Property Cascading**:
1. All 37 UI tokens and 33 code syntax tokens exist as CSS variables on `:root` or `.mesh-surface`.
2. `applyTheme()` writes token changes directly to `document.documentElement.style.setProperty(...)`.
3. The Chromium styling engine recalculates styles instantaneously without triggering React component unmounting, re-rendering, or hook invalidations. Component-level rerenders only occur for components explicitly subscribed to settings or theme metadata changes (such as the Theme Maker draft state).

### 1.2 Zero Inline Style Props (`VERIFY-007`)
In React applications, inline style props (`style={{ color: x, backgroundColor: y }}`) create brand new JavaScript objects on every render pass, triggering unnecessary garbage collection pressure and child component re-renders. Venice Forge strictly prohibits inline `style={...}` in JSX:
- Dynamic styling uses CSS custom properties or declarative Tailwind classes.
- Verified by `tests/csp/inlineStyleInvariant.test.ts`.

---

## 2. GPU Compositing & Backdrop Filter Optimization

Modern glass and mesh interfaces can cause GPU fill-rate exhaustion if backdrop blur layers are stacked carelessly or applied to large scrollable containers.

### 2.1 Bounded Blur Budget & Reduced Transparency
Venice Forge enforces a restrained, bounded blur budget:
- **Broad Panel Blur Removed:** Heavy 12px–16px backdrop blur was removed from standard mesh panels and card surfaces in `src/styles/components.css` to prevent GPU fill-rate degradation during scrolling.
- **Overlays & Dialogs (`.modal-backdrop-blur`, `.glass-modal`):** Capped at 4px (`--overlay-blur: 4px;`), providing clean depth separation without frame drops on integrated GPUs.
- **Reduced Transparency Fallback:** `@media (prefers-reduced-transparency: reduce)` completely disables `backdrop-filter: blur(...)` across all surfaces, substituting crisp, opaque fallback backgrounds (`bg-surface-elevated` and `bg-overlay`).

### 2.2 Ambient Mesh Overlay Optimization
The ambient background mesh overlay (`.app-mesh-overlay`) uses `pointer-events: none` and fixed positioning. It is rendered on a dedicated compositor layer without interactive hit-testing overhead, ensuring scroll performance remains smooth even with thousands of chat messages or complex node graphs.

---

## 3. Bundle Impact & Chunk Analysis

Production builds execute with Vite 8 and Rollup code-splitting:

```
✓ built in 1.35s
- index bundle: 509.34 kB (gzip: 136.42 kB)
- vendor-react: 185.09 kB (gzip: 58.56 kB)
- vendor-lucide: 16.29 kB (gzip: 5.61 kB)
- vendor-i18n: 66.28 kB (gzip: 22.26 kB)
- vendor-markdown: 172.52 kB (gzip: 52.18 kB)
- vendor-xyflow: 125.18 kB (gzip: 40.09 kB)
- vendor-documents: 498.66 kB (gzip: 125.90 kB)
```

- **Zero CSS Runtime:** Tailwind CSS v4 produces a static, minified stylesheet. No dynamic CSS parsers or runtime style injectors are included in the bundle.
- **Lazy Module Boundaries:** Heavy studio views (Document Agent, Scene Composer, Prompt Library, Video View, Image Inspector, RP Studio) are asynchronously chunked and only loaded when their respective workspace tabs are activated.

---

## 4. Memory Footprint & Event Cleanup

1. **Scroll Lock Cleanup:** Modal dialogs (`AccessibleDialog.tsx`) cleanly restore `document.body.style.overflow` upon unmount to eliminate memory leaks and locked scroll states.
2. **Focus Trap Event Listeners:** Keydown event listeners for Escape and Tab trapping are registered on the dialog container rather than window-wide where possible, and immediately removed on unmount.
3. **Sound Controller Pooling:** `uiSoundController` reuses shared audio buffers for primary and secondary click sounds, avoiding audio context recreation.
4. **Context Menu Cleanup:** Floating menus (e.g. `HistoryView` folder context menu) bind click and Escape handlers that unregister immediately upon dismissal.
