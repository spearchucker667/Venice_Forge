# Venice Forge — Visual QA & Design System Verification Protocol

> **Document:** Comprehensive Visual Quality Assurance Protocol  
> **Applicable Surfaces:** All 22 Canonical Workspaces, Modals & Built-in Themes  
> **Baseline:** `db028726` on local `main`  
> **Node Contract:** `>=22.15.0 <23.0.0`  
> **Date:** September 14, 2026  

---

## 1. Overview & Verification Protocol

This document outlines the visual QA verification protocol for Venice Forge UI. It distinguishes between:
1. **Automated Static & Unit Verification:** Theme token invariants, strict CSP rules, responsive style contracts, and unit/behavior test suites.
2. **Runtime Visual Inspection:** Automated headless snapshot capture (`npm run capture:release-qa-snapshots`) and interactive dev server inspection (`npm run dev:web` / `npm run dev:electron`).

---

## 2. Built-in Theme Families Matrix

All 44+ built-in theme families support authored **Dark Mode** and **Light Mode** variants with deterministic token mapping.

| Theme Family | Accent Tone | Dark Canvas | Light Canvas | Automated Contract | Runtime Check |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **Venice (Default)** | Venice Teal (`#6ee7d3`) | `#0a0a0c` | `#fbfbfd` | PASS | PASS |
| **Nord** | Frost Cyan (`#88c0d0`) | `#2e3440` | `#eceff4` | PASS | PASS |
| **Tokyo Night** | Neon Cyan (`#7dcfff`) | `#1a1b26` | `#e1e2e7` | PASS | PASS |
| **Catppuccin** | Flamingo Pink (`#f2cdcd`)| `#1e1e2e` | `#eff1f5` | PASS | PASS |
| **Solarized** | Cyan / Blue (`#2aa198`) | `#002b36` | `#fdf6e3` | PASS | PASS |
| **One Dark** | Soft Blue (`#61afef`) | `#282c34` | `#fafafa` | PASS | PASS |
| **Monokai** | Bright Yellow (`#e6db74`)| `#272822` | `#f8f8f2` | PASS | PASS |
| **GitHub Light** | Primer Blue (`#0969da`) | `#0d1117` | `#ffffff` | PASS | PASS |
| **Obsidian Bloom** | Violet Glow (`#c084fc`) | `#0c0a14` | `#faf7fd` | PASS | PASS |
| **Harbor Fog** | Slate Blue (`#7dd3fc`) | `#0f172a` | `#f8fafc` | PASS | PASS |
| **Circuit Mint** | Emerald Mint (`#34d399`)| `#061a14` | `#f0fdf4` | PASS | PASS |
| **Amber Archive** | Warm Gold (`#fbbf24`) | `#1c1917` | `#fffbeb` | PASS | PASS |
| **Neon Dusk** | Magenta Glow (`#f43f5e`)| `#180816` | `#fdf2f8` | PASS | PASS |

*Note: All 44+ families pass automated token completeness, valid hex/color strings, contrast checks, and bidirectional YAML serialization tests (`serialize.test.ts`, `validate.test.ts`).*

---

## 3. Surface & Workspace Audit Checklist

### 3.1 Chat & Conversation Surfaces
- [x] Message bubbles use `.surface-elevated-2` with clean soft borders.
- [x] Assistant bubbles distinguish cleanly from user message bubbles.
- [x] Hover action bars (`vf-action-bar`) surface smoothly on pointer enter.
- [x] Code blocks render Refractor syntax tokens correctly using theme-derived variables.
- [x] History folder context menu clamped within viewport bounds and dismissible via Escape.

### 3.2 Media & Generation Studios
- [x] Generation container layout (`generation-view.tsx`) provides responsive min-height and border dividers.
- [x] Video model selector displays dynamic quote pricing without `(Price unavailable)` errors.
- [x] Favorite badges render semantic danger/rose tokens (`text-danger`, `border-danger/40`).
- [x] Media Inspector and detail dialogs use semantic tokens rather than fixed Tailwind palettes.

### 3.3 Compact Workspace Viewport Adaptations
To avoid fixed non-shrinking horizontal sidebar panes clipping content on narrow or low-resolution screens:
- [x] **Scene Composer (`SceneComposerView.tsx`):** Container stacks (`flex-col md:flex-row`) with list pane capped at `max-h-[35vh]` on mobile before scrolling.
- [x] **Image Inspector (`ImageInspectorView.tsx`):** Responsive layout stacks sessions pane above active image analysis on mobile viewports.
- [x] **Prompt Library (`PromptLibraryView.tsx`):** Replaced static width with responsive horizontal stacking on narrow viewports.
- [x] **Character Chats (`CharacterChatsView.tsx`):** Uses responsive flex direction and vertical list containment on narrow screens.
- [x] **Playground (`playground-view.tsx`):** Stacks chat prompt area and node workflow graph canvas on viewports below `lg` breakpoint.

### 3.4 Character Creator & RP Studio
- [x] Process panel displays status events with semantic `success`, `warning`, `danger` badges.
- [x] Delete and discard actions use danger theme tokens instead of raw fixed palette classes.
- [x] RP Studio hydration banner migrated to semantic warning tokens (`text-warning bg-warning/10 border-warning/25`).

### 3.5 Settings & Theme Maker
- [x] Theme picker lists built-in, YAML, and custom themes in sorted order.
- [x] Reset Token action (`↺`) appears on each customized token item.
- [x] Reset Section action restores entire category groups back to base theme defaults.
- [x] Duplicate Theme button clones the current theme into a new editable record with unique ID.
- [x] Contrast ratio warnings report all pairs failing WCAG 2.1 AA (4.5:1).

---

## 4. Responsive Breakpoints & Ergonomic Testing

### Breakpoint Strategy
- **Compact / Mobile (< 768px):** Navigation sidebar collapses into drawer. Drawers use `invisible pointer-events-none` when closed so offscreen buttons cannot be focused. Workspaces stack form controls vertically above output canvases.
- **Medium (768px - 1024px):** Fixed-width icon rail for navigation. Split studio layouts display side-by-side where minimum widths are met.
- **Desktop (1024px - 1440px):** Full navigation sidebar with drag-resizable width handle. Multi-column media galleries.
- **Ultrawide (> 1440px):** Reading column limits enforce comfortable maximum line lengths (`max-w-reading`, `max-w-comfort`).

### Testing Harness Guidance
- **Automated Snapshots:** Run `npm run capture:release-qa-snapshots` to execute headless Chromium page captures against mocked local endpoints.
- **Interactive Verification:** Run `npm run dev:web` to launch Vite at `http://localhost:5173` for cross-browser responsive testing.
