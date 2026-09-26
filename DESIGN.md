---
name: Venice Forge
colors:
  surface: '#0d0d10'
  surface-dim: '#08080a'
  surface-bright: '#202026'
  surface-container-lowest: '#050505'
  surface-container-low: '#08080a'
  surface-container: '#0d0d10'
  surface-container-high: '#16161a'
  surface-container-highest: '#26262c'
  on-surface: '#dedcdf'
  on-surface-variant: '#8c8892'
  inverse-surface: '#dedcdf'
  inverse-on-surface: '#050505'
  outline: '#26262c'
  outline-variant: '#5c5c64'
  surface-tint: '#ef555f'
  primary: '#ef555f'
  on-primary: '#050505'
  primary-container: '#743940'
  on-primary-container: '#ffdada'
  inverse-primary: '#b22837'
  secondary: '#6ee7d3'
  on-secondary: '#003730'
  secondary-container: '#0ba391'
  on-secondary-container: '#00302a'
  tertiary: '#7da7ff'
  on-tertiary: '#002e6b'
  tertiary-container: '#658fe5'
  on-tertiary-container: '#00275e'
  error: '#ef4444'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  background: '#050505'
  on-background: '#dedcdf'
  surface-variant: '#16161a'
  vf-shell-bg: '#050505'
  vf-panel-bg: '#0d0d10'
  vf-panel-bg-inset: '#08080a'
  vf-panel-bg-raised: '#16161a'
  vf-panel-border: '#26262c'
  vf-panel-border-hot: '#743940'
  vf-panel-border-strong: '#5c5c64'
  vf-grid-line: '#26262c8c'
  vf-accent-glow: 'rgba(239, 85, 95, 0.12)'
  foreground-primary: '#dedcdf'
  foreground-muted: '#8c8892'
  foreground-subtle: '#7f7a86'
  status-success: '#6fbf73'
  status-warning: '#d6a84f'
  status-danger: '#ef4444'
typography:
  headline-hero:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 31px
    letterSpacing: -0.012em
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 27px
    letterSpacing: -0.010em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.006em
  body-default:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: '0'
  body-meta:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: '0'
  label-tag:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-body:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  code-meta:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.5rem
  margin: 1rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

# Venice Forge — Graphite Cockpit Flat Instrumentation Design System

## 1. Visual Ethos & Philosophy
Venice Forge is engineered as a local-first mission-critical AI workstation and telemetry cockpit. It balances high informational density with extreme visual restraint, rejecting soft drop shadows, arbitrary gradients, and decorative bloat.

## 2. Elevation & Surface Hierarchy
Depth is rendered through stepped luminance tiers across a neutral graphite scale:
- **Canvas Sub-Floor (`#050505`):** Root application canvas with zero glare.
- **Recessed Wells (`#08080A`):** Sunken containers for code blocks, prompt debug trees, and timeline runners.
- **Primary Workspaces (`#0D0D10`):** Working surfaces for sidebar, main workspace, and docked inspectors.
- **Elevated Controls (`#16161A`):** Interactive buttons, cards, segmented controls, and inputs.
- **Structural Hairlines (`1px solid #26262C`):** Razor-sharp perimeter boundaries separating adjoining bays.
- **Active Hot Execution (`1px solid #743940`):** Crimson-tinted borders indicating active execution, focus, and streaming output.

## 3. Color as State Vectoring
- **Primary Crimson (`#EF555F`):** Execution triggers, active navigation rails, primary CTAs, and focus outlines.
- **Telemetry Cyan (`#6EE7D3`):** Multimodal capabilities (`[VISION]`, `[UPSCALE]`, `[VIDEO]`, `[TTS]`), token counters, and verified parameters.
- **Tertiary Blue (`#7DA7FF`):** Lineage trees, docs links, and external references.
- **Status Quadrants:** Success (`#6FBF73`), Warning (`#D6A84F`), Danger/Safety (`#EF4444`).

## 4. Typography
- **Inter:** Drives general UI orchestration, top-level headings, action labels, assistant responses, and readable copy.
- **JetBrains Mono:** Drives computational telemetry, prompt assembly traces, token rates, latency readouts, JSON payloads, and generation seeds.
- **Micro-Tracking:** All 11px uppercase section chips, badges, and headers carry `tracking-wider` (+0.04em) for instant optical scanning.

## 5. Three-Zone Cockpit Topology
1. **Zone 1: Global Navigation Rail (Left):** 60px fixed micro-icon rail in collapsed mode; 240px expanded mode with category dividers (`CONVERSATION`, `GENERATE`, `BUILD`, `SYSTEM`).
2. **Zone 2: Central Workbench Canvas (Center):** Reading column (640px / 40rem), parametric bay (760px), and fluid canvas (100% for node graphs and media galleries).
3. **Zone 3: Contextual Telemetry Rail (Right):** Docked 320px–360px inspector housing prompt debuggers, parameter sliders, and active task centers.
