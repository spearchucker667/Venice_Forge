# Venice Forge UI Re-envisioning — Graphite Cockpit Flat Instrumentation Design Specification

> **Date:** 2026-09-26  
> **Status:** APPROVED (Brainstorming Phase)  
> **Branch:** `feature/graphite-cockpit-redesign`  
> **Authority:** Architectural Design Document  
> **Stitch MCP Project:** `projects/12225516409245957947` ("Venice Forge Design System")  

---

## 1. Executive Summary & Intent

This specification defines the complete UI/UX re-envisioning of **Venice Forge**, transforming the application from standard web SaaS containers into a tactile, aerospace-grade **Graphite Cockpit Flat Instrumentation** workstation.

The re-envisioning leverages Google Labs' **Stitch MCP** (`https://stitch.withgoogle.com/docs/skills/reference/` and `google-labs-code/stitch-skills`) to harmonize design systems, visual tokens, and screen prototypes with the checked-out codebase.

### Primary Design Objectives
1. **Stepped Graphite Flat Instrumentation:** Replace generic floating cards and fuzzy drop-shadows with stepped value layering across an ultra-dark graphite spectrum (`#050505` to `#16161A`) bounded by razor-sharp `1px` hairlines (`#26262C`).
2. **Color as State Vectoring:** Use color strictly to convey computation, execution state, and telemetry—never as decorative filler. Venice Crimson (`#EF555F`) triggers execution; Venice Cyan (`#6EE7D3`) signals generative capabilities and token metrics.
3. **Dual-Engine Typography:** Combine `Inter` (high-readability UI and conversation streams) with `JetBrains Mono` (computational telemetry, prompt assembly traces, seed values, and token meters).
4. **Three-Zone Cockpit Topology:** Unify all views within a rigid 3-zone layout: Collapsible Global Nav Rail (Zone 1), Adaptive Workbench Canvas (Zone 2), and Docked Contextual Inspector & Telemetry Rail (Zone 3).
5. **Absolute Feature Preservation:** Maintain 100% feature parity with zero deletion or truncation of any existing capability, tab, store, or service.

---

## 2. Strict Feature Preservation Guarantee

The re-envisioning updates presentation, layout geometry, and token styling. It does **not** alter business logic, data structures, or feature availability.

### 2.1 Preserved Canonical Tabs
All 15 canonical tabs defined in `src/config/tabs.ts` and rendered in `src/App.tsx` are fully retained:
1. `chat` (Standard Chat View)
2. `character-chats` (Character-specific conversation threads)
3. `history` (Session archives, search, and transcript recovery)
4. `image` (Text-to-Image and Image-to-Image Studio)
5. `media` (Media Studio Library, batch actions, and metadata inspector)
6. `image-inspector` (High-resolution pixel analysis and prompt extraction)
7. `prompts` (Prompt Library, snippets, template variables)
8. `scenes` (Scene Generator & multi-character orchestrator)
9. `audio` (Text-to-Speech & voice cloning)
10. `music` (Music generation & loop synthesis)
11. `video` (Text-to-Video and Image-to-Video queue poller)
12. `embeddings` (Vector embeddings & semantic search)
13. `characters` / `character-creator` (Character Card Studio & SillyTavern V2/V3 import/export)
14. `rp-studio` (Roleplay Studio with personality depth metrics)
15. `workflows` (Node-based visual execution canvas)
16. `documents` (Document ingestion, chunking, and RAG pipelines)
17. `privacy` (Local-first storage audit and encryption overview)
18. `playground` (Multi-model comparative prompt scratchpad)
19. `settings` (Model defaults, API endpoints, themes, and sound FX)
20. `status` (System diagnostics, error logs, and task center)

*(All 4 legacy aliases—`gallery`, `models`, `batch`, `diagnostics`—continue to resolve cleanly).*

### 2.2 Preserved Core Infrastructure & Stores
* **State Management:** All 22+ Zustand stores (`settings-store`, `chat-store`, `character-store`, `media-studio-store`, `workflow-store`, `background-task-store`, `auth-store`, `project-store`, `profile-store`, etc.) retain their full schemas, persistence contracts, and actions.
* **Dual Transport:** Both Electron IPC (`desktopBridge.ts`) and Express proxy routes (`server/`) remain contract-compatible.
* **Security & Auth:** Secure API key storage in OS Keychain / Electron main process is unmodified; no credential leakage to renderer.
* **Audio & Haptics:** `uiSoundController` feedback hooks remain wired to interactive triggers.

---

## 3. Structural Layout Architecture & Cockpit Geometry

```
+---------------------------------------------------------------------------------------------------------+
| Top Telemetry Header: Model Health | Token Rate | Latency (ms) | Active Project | Window Controls       |
+-----------+-------------------------------------------------------------+-------------------------------+
| Zone 1    | Zone 2: Central Workbench Canvas                            | Zone 3: Contextual Inspector  |
| Global    |                                                             |                               |
| Nav Rail  | • Reading Column (640px / 40rem) for chat & prose           | • 320px–360px collapsible bay |
|           | • Parametric Form Bay (760px / 47.5rem) for configurations  | • Live Prompt Assembly Trace  |
| • 60px    | • Fluid Canvas (100%) for node graph & media gallery        | • Temperature / Top_P Sliders |
|   compact |                                                             | • Generation Seed Readouts    |
| • 240px   | [Docked Execution Dock: Multi-line Input | Token Metronome] | • Active Task Center Drawer   |
|   expanded|                                                             |                               |
+-----------+-------------------------------------------------------------+-------------------------------+
```

### 3.1 Zone 1: Global Navigation Rail (Left)
* **Collapsed Mode (`60px`):** Fixed micro-icon rail. Features high-contrast SVG glyphs, a 2px active crimson vertical indicator, and micro-pips for background tasks.
* **Expanded Mode (`240px`):** Grouped by canonical operational domains:
  * **Conversation:** Standard Chat, Character Chats, History.
  * **Generate:** Media Studio, Image Inspector, Audio, Music, Video, Scenes.
  * **Build:** Character Studio, RP Studio, AI Workflows, Prompt Library, Document Ingestion.
  * **System:** Research Workspace, Lineage Graph, Diagnostics, Settings.
* Toggleable via keyboard shortcut (`Cmd/Ctrl + B`) or header trigger.

### 3.2 Zone 2: Central Workbench Canvas (Center)
* **Adaptive Width Bounds:**
  * `max-w-[40rem]` (640px): Standard chat transcripts, system lorebooks, and markdown preview to prevent eye strain.
  * `max-w-[47.5rem]` (760px): Complex parametric forms (ST card creation, persona trait telemetry).
  * `w-full` (Fluid 100%): Node execution graph (`workflows`), media grid gallery (`media`), and lineage trees.
* **Top Telemetry Ribbon (`Header.tsx`):** Displays real-time Venice API latency (`~184ms`), active model badge with capability pills (`[VISION]`, `[FUNCTION_CALLING]`), token budget metronome, and active project selector.
* **Docked Execution Dock:** Fixed bottom console housing multi-line auto-expanding textarea, multimodal attachment chips, system prompt toggle, and solid crimson execution trigger (`Cmd/Ctrl + Enter`).

### 3.3 Zone 3: Contextual Inspector & Telemetry Rail (Right)
* **`320px–360px` Docked Utility Bay:**
  * Replaces floating modals and temporary sheets with a stable docked sidebar.
  * **Prompt Inspector Drawer:** Visualizes deterministic prompt assembly order:
    `[Safety Boundary]` $\rightarrow$ `[Persona System Prompt]` $\rightarrow$ `[Lorebook Injections]` $\rightarrow$ `[Working Memory]` $\rightarrow$ `[User Query]`.
  * **Model Parameters Drawer:** Temperature, top_p, presence penalty, and seed locked inputs.
  * **Task Center Drawer:** Active background rendering queues, pollers, and retry controls.

### 3.4 Responsive Reflow Breakpoints
* **Workstation ($\ge 1024\text{px}$):** Persistent 3-zone layout with side-by-side workbench and docked telemetry rail.
* **Tablet / Compact ($768\text{px} - 1023\text{px}$):** Nav rail locks to 60px; right inspector shifts to an on-demand slide-over drawer.
* **Mobile / Narrow ($< 768\text{px}$):** Nav rail transforms into an off-canvas drawer; canvas runs edge-to-edge with 12px padding; multi-column media grids step down to exactly 2 columns.

---

## 4. Surface Hierarchy & Color-as-State Palette

### 4.1 Stepped Graphite Surface Continuum
Depth is established through stepped luminance rather than drop-shadows:

| Token Name | Hex Value | Purpose |
| :--- | :--- | :--- |
| `vf-shell-bg` | `#050505` | Canvas sub-floor. Zero-glare, anti-reflective matte black. |
| `vf-panel-bg-inset` | `#08080A` | Recessed wells for code blocks, prompt traces, and timeline runners. |
| `vf-panel-bg` | `#0D0D10` | Primary working surface for sidebar, main workspace, and inspector. |
| `vf-panel-bg-raised` | `#16161A` | Elevated tier for cards, inputs, dropdowns, and button clusters. |
| `vf-panel-border` | `#26262C` | Hairline 1px structural boundary between adjoining workspaces. |
| `vf-panel-border-hot` | `#743940` | Crimson-tinted border for active focus, streaming, and execution. |
| `vf-panel-border-strong` | `#5C5C64` | High-emphasis border for hover states and focused controls. |
| `vf-grid-line` | `#26262C8C` | Micro-grid telemetry background pattern. |

* **Matte Console Texture:** An ultra-subtle static noise grain wash (`opacity: 0.04`) applied to the window body to emulate tactical cockpit equipment without GPU animation cost.

### 4.2 Color as State Vectoring
Colors are semantic vectors indicating activity, capability, and validation:
* **Primary Crimson (`#EF555F`):** Execution vector (CTA buttons, active navigation indicator bar, execution triggers, focus outlines).
* **Secondary Telemetry Cyan (`#6EE7D3`):** Multimodal capabilities (`[VISION]`, `[UPSCALE]`, `[VIDEO]`, `[VOICE]`), parameter verification tags, and token counters.
* **Tertiary Metadata Blue (`#7DA7FF`):** Lineage parent-child relations, docs references, and external links.
* **Status Quadrants:**
  * **Success (`#6FBF73`):** Completed tasks, cache hits, 200 OK responses.
  * **Warning (`#D6A84F`):** Rate limits, high token counts, unsaved card edits.
  * **Danger / Safety Block (`#EF4444`):** HTTP 451 blocks, network disconnections, schema errors.

---

## 5. Typography & Monospace Telemetry

### 5.1 Dual-Engine Typography System
* **Primary Engine (`Inter`):**
  * Applied to UI labels, navigation copy, dialog headings, and assistant conversation transcripts.
  * Tall x-height and clear terminals maintain optical legibility at `13px`–`15px`.
  * Conversational containers are capped at `40rem` (640px) to maintain a strict 65–75 characters-per-line budget.
* **Telemetry Engine (`JetBrains Mono`):**
  * Applied to token counters, latency readouts (`ms`), model IDs, prompt debug traces, JSON payloads, and generation seeds.
  * Monospace character widths guarantee stable alignment across tables and telemetry ribbons without text shifting.
* **Micro-Tracking Standard:** All 11px uppercase section headers, category pills, and capability badges use expanded tracking (`tracking-wider` / `+0.04em`).

---

## 6. Component Specifications

### 6.1 Interactive Triggers & Buttons
* **Primary CTA:**
  * Solid Venice Crimson (`#EF555F`) fill, pitch-black (`#050505`) text, `rounded-md` (6px radius).
  * 140ms hover transition to `#F65964` with ambient crimson glow (`rgba(239, 85, 95, 0.12)`).
  * Active state scales to `0.98` with crisp 2px focus ring.
* **Secondary / Neutral:**
  * Inset `#16161A` fill, `1px solid #26262C` border, `#DEDCDF` text.
  * On hover: elevates to `#202026` with `#5C5C64` boundary.
* **Destructive Action:**
  * `1px solid #EF4444` with 10% red transparent wash and red text. Focus applies high-contrast red ring without layout shift.
* **Micro Action Toolbar (`IconButton`):**
  * 28px/32px square controls with 6px radius, displaying keyboard shortcut badges on tooltip hover.

### 6.2 Form Inputs & Parameter Sliders
* **Text Inputs & Textareas:**
  * Dark inset `#16161A` background with `1px solid #26262C` border and 6px radius.
  * Focus shifts border to `vf-panel-border-hot` (`#743940`) with 2px high-contrast ring.
* **Precision Parameter Sliders:**
  * Sunken 4px track in `#08080A` with crimson fill.
  * Paired with an adjacent `JetBrains Mono` editable numeric pill for direct keyboard entry.

### 6.3 Multimodal Capability Badges & Pips
* **Capability Micro-Pills:**
  * Low-profile capsules (`rounded-full`, 11px uppercase `JetBrains Mono`) with 10% cyan background wash and `1px solid #6EE7D3` border.
* **Status Pips:**
  * 6px circular indicators (Green: Ready; Pulsing Crimson: Streaming/Generating; Amber: Queued; Red: Error).

### 6.4 Cards & Tiles
* **Media Studio Cards:**
  * Stepped graphite card with 256px thumbnail container, 1px `#26262C` border, 8px radius.
  * Inset footer contains model tag, seed number, aspect ratio badge, and reveal-on-hover icon toolbar (Download, Upscale, Remix, Delete).
* **Workflow Node Tiles:**
  * Rigid rectangular nodes with stepped header, color-coded socket terminals (Cyan for multimodal assets, Crimson for execution signals), and inline parameter controls.

---

## 7. Stitch MCP Synchronization Protocol

Stitch MCP connects our local environment directly to the Stitch design canvas:
1. **Design System Specification:**
   * Maintain `DESIGN.md` in repository root matching this specification.
   * Encode `DESIGN.md` in UTF-8 base64 and upload to Stitch project `12225516409245957947` via `upload_design_md`.
   * Invoke `create_design_system_from_design_md` to synchronize design tokens in Stitch.
2. **Screen Generation & Iteration:**
   * Generate missing or refined screen views using `generate_screen_from_text` (Gemini 3.8 Flash, `DESKTOP` device type, linked to design system `assets/1e3607950a454c348b3736aec3b03cf0`).
   * Generate variations using `generate_variants` when exploring layout densities.
   * Retrieve HTML/CSS source code and high-res screenshot renders via `get_screen` to serve as visual and structural benchmarks.

---

## 8. Implementation Phases & Validation Plan

### Phase 1: Foundation Tokens & Theme Custom Properties
* Update `src/theme/` and `tailwind.config.js` to register the stepped graphite palette, `Inter`, `JetBrains Mono`, and optical border tokens.
* Verify CSS custom property mappings (`vf-shell-bg`, `vf-panel-bg`, `vf-panel-bg-inset`, `vf-panel-bg-raised`, `vf-panel-border`, `vf-panel-border-hot`).
* Validate dark/light and high-contrast accessibility compliance.

### Phase 2: Cockpit Shell & Navigation Framework
* Refactor `Sidebar.tsx` to implement the 60px/240px dual-mode navigation rail with category groupings and state pips.
* Refactor `Header.tsx` to host the live telemetry ribbon (API latency, model badges, token rate).
* Implement the docked `InspectorPane.tsx` with collapsible drawers for prompt assembly and parameter controls.

### Phase 3: Canonical Tab Adaptation
* Adapt the core views to the new 3-zone layout and surface tiers:
  * Chat & Character RP: standard reading column (`640px`), docked execution dock, prompt trace drawer.
  * Media Studio: stepped media cards, batch action ribbon, full-width fluid gallery.
  * Workflows: fluid node execution canvas with stepped node styling.
  * Settings & Diagnostics: high-density technical telemetry layout.

### Phase 4: Verification & Test Suite
* Run linting and typecheck: `npm run lint:eslint`, `npm run typecheck`.
* Run test suites: `npm test`, `npm run test:server`, `npm run test:electron`.
* Run contract and CI verifiers: `npm run verify:safety-guard`, `npm run verify:contracts`, `npm run build`.
* Conduct visual tab acceptance across all 15 views.
