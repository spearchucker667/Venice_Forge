# Venice Forge — Design System Specification

> **Version:** 3.0  
> **Status:** Canonical Living Specification  
> **Target Toolchain:** Tailwind CSS v4, React 19, Electron Desktop & Web  
> **Date:** September 14, 2026  

---

## 1. Foundations & Visual Philosophy

Venice Forge's visual system balances high information density for advanced power users with calm, distraction-free visual ergonomics.

### Core Principles

1. **Theme Sovereignty:** The interface never relies on hardcoded color values. Every visual surface, border, text tier, and interactive state derives from semantic CSS custom properties resolved dynamically at runtime by the Theme Engine.
2. **Layered Elevation Depth:** Depth is established through subtle alpha translucency, blur filters, and tone-aware border soft-separators rather than harsh dark drop shadows.
3. **Ergonomic Typography:** Dedicated reading columns and calibrated type scales prevent line-length eye fatigue in extended multi-turn chat sessions and long-form document reviews.
4. **Strict CSP & Accessibility:** Zero inline styles in JSX (`style={...}` banned by VERIFY-007). Full keyboard navigation, explicit focus indicators, and WCAG 2.1 AA minimum contrast ratios (4.5:1 for body copy, 3:1 for large display text and UI components).

---

## 2. Spacing Scale & Container Widths

Venice Forge uses a strict 4px (0.25rem) base grid for all padding, margins, gaps, and component dimensions.

| Token | Dimension (px) | REM | Primary Use |
| :--- | :--- | :--- | :--- |
| `0.5` | 2px | 0.125rem | Border widths, micro status dot offsets |
| `1` | 4px | 0.25rem | Icon-to-text spacing, compact badge paddings |
| `1.5` | 6px | 0.375rem | Small button padding, chip vertical spacing |
| `2` | 8px | 0.5rem | Standard compact padding, gap between action buttons |
| `2.5` | 10px | 0.625rem | Form label bottom margin, table cell padding |
| `3` | 12px | 0.75rem | Standard input field padding, modal header gap |
| `4` | 16px | 1.0rem | Standard card internal padding, panel spacing |
| `5` | 20px | 1.25rem | Workspace sidebar header padding |
| `6` | 24px | 1.5rem | Dialog internal container padding |
| `8` | 32px | 2.0rem | Empty state margins, major section separators |

### Container Reading Columns

```css
/* Container width tokens defined in src/styles/theme.css */
--width-narrow: 30rem;    /* 480px: Modals, settings popovers, side drawers */
--width-reading: 40rem;   /* 640px: Optimal single-column reading line length */
--width-comfort: 47.5rem; /* 760px: Primary conversational chat message bubble limit */
--width-wide: 60rem;      /* 960px: Multi-column galleries, split studio layouts */
```

---

## 3. Typography Scale & Hierarchy

Typography is mapped to standardized `.vf-*` composite classes ensuring consistent line-heights, weights, and letter-spacings across platforms:

```css
.vf-display {
  font-size: var(--text-display); /* 1.625rem / 26px */
  line-height: 1.18;
  font-weight: 600;
  letter-spacing: -0.012em;
}

.vf-h1 {
  font-size: var(--text-h1);      /* 1.375rem / 22px */
  line-height: 1.22;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.vf-h2 {
  font-size: var(--text-h2);      /* 1.125rem / 18px */
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.006em;
}

.vf-body {
  font-size: var(--text-body);    /* 0.9375rem / 15px */
  line-height: 1.55;
  font-weight: 400;
}

.vf-meta {
  font-size: var(--text-meta);    /* 0.8125rem / 13px */
  line-height: 1.45;
  font-weight: 500;
}

.vf-tag {
  font-size: var(--text-tag);     /* 0.6875rem / 11px */
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
```

---

## 4. Surface Elevation & Layering Architecture

Venice Forge defines 5 surface elevation layers to establish visual hierarchy in dense desktop environments:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 0: App Background (--bg)                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Layer 1: Workspace Panel Canvas (--surface)            │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │ Layer 2: Card / Input / Message (--surface-elevated) │ │
│  │  │  ┌──────────────────────────────────────────────┐ │ │ │
│  │  │  │ Layer 3: Dialog / Inspector (--surface-elevated-2) │ │
│  │  │  └──────────────────────────────────────────────┘ │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
  Backdrop / Scrim Layer: (--surface-overlay)
```

### Surface Token Utilities

- `.mesh-surface`: Ambient mesh background with radial accent highlight and subtle 12px backdrop blur.
- `.mesh-card`: Elevated card container with subtle accent light gradient and soft borders.
- `.glass-subtle`: 72% surface opacity with 8px backdrop blur for toolbars and chips.
- `.glass-panel`: 82% elevated surface opacity with 16px backdrop blur for floating side panels.
- `.glass-modal`: 92% elevated-2 surface opacity with 20px backdrop blur for centered modal dialogs.
- `.soft-separator-x` / `.soft-separator-y`: Border gradients with soft opacity fades preventing harsh geometric lines.

---

## 5. Standard UI Primitives Catalog

### 5.1 Buttons

| Component | Variant | Purpose | Visual Signature |
| :--- | :--- | :--- | :--- |
| `PrimaryButton` | Primary CTA | Form submits, modal confirmations | Solid `--button-primary-bg`, text `--button-primary-fg`, subtle shadow |
| `SecondaryButton` | Secondary | Filter actions, secondary navigation | Border `--border`, surface `--button-secondary-bg`, hover `--surface-muted` |
| `GhostButton` | Ghost | Discard, shuffle, neutral actions | Transparent background, text `--button-secondary-fg`, hover `--surface-muted` |
| `DangerButton` | Danger | Destructive actions, delete, unbind | Border `--danger/40`, background `--danger/10`, text `--danger`, hover `--danger/20` |
| `IconButton` | Icon-only | Message bubble actions, close controls | Sized 28px/36px/40px with tooltip and explicit `aria-label` |

### 5.2 Form Inputs (`Input`)

```tsx
import { Input } from "../ui/primitives";
import { Search } from "lucide-react";

<Input
  inputSize="md"
  tone="neutral"
  placeholder="Search models..."
  leading={<Search className="w-4 h-4" />}
  aria-label="Search models"
  value={query}
  onChange={(e) => setQuery(e.target.value)}
/>
```

- **States:** Default, Hover, Focused (`outline: 2px solid var(--focus-ring)`), Disabled, Error (`tone="danger"`).
- **Adornments:** Leading icon/prefix and trailing icon/clear button support with zero layout shift.

### 5.3 Badges & Status Indicators

- **`Badge`:** Renders semantic categories with uppercase tracking. Tones: `success`, `warning`, `danger`, `accent`, `neutral`.
- **`StatusDot`:** Micro 6px circular indicator with optional pulsing animation (`animate-pulse-dot`) for background tasks, network connectivity, and streaming state.
- **`Pill`:** Rounded full-bleed category label used for model tags, media types, and token counters.

---

## 6. Motion & Animation System

All motion transitions respect user system preferences: when `prefers-reduced-motion: reduce` is active, all animation and transition durations collapse to `0.01ms`.

### Timing & Curve Scale

- `--motion-instant` (75ms): Button active press states, checkbox toggles.
- `--motion-fast` (140ms): Hover transitions, color fades, popover openings.
- `--motion-medium` (220ms): Panel slides, tab switches, dialog appearance.
- `--motion-slow` (350ms): Major workspace transitions, full-screen mode switches.
- `--motion-ease`: Standard cubic-bezier `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- `--easing-enter`: Entrance deceleration curve `cubic-bezier(0, 0, 0.2, 1)`.
- `--easing-exit`: Exit acceleration curve `cubic-bezier(0.4, 0, 1, 1)`.

---

## 7. Accessibility Contract & Quality Gates

1. **Color Contrast:** All theme variants enforce WCAG AA contrast (≥ 4.5:1 for body copy against its immediate surface; ≥ 3.0:1 for large display headers and icons).
2. **Keyboard Navigation:** Every interactive element has visible `:focus-visible` styling (`outline: 2px solid var(--focus-ring); outline-offset: 2px;`). Unfocused elements have no outline artifacts.
3. **Aria Contracts:** Modals trap focus with `useFocusTrap`, declare `aria-modal="true"`, link titles via `aria-labelledby`, and restore focus to trigger buttons upon closing.
