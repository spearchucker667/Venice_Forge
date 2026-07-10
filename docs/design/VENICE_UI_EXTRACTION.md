# Venice UI Extraction Roadmap

This document outlines the extraction of the Venice.ai design system from captured DOM/CSS, the donor `donor-repo` repository, and the target integration into the Venice Forge Electron repository.

## 1. Discovery
We have analyzed the current primary repository, the `donor-repo` donor repo, and are actively running Playwright to capture the live design of `https://venice.ai`.
- The local repo utilizes Vite, React, Electron, and pure CSS.
- The `donor-repo` repo utilizes Vite, React, Tailwind, and Zustand.
- The capture script extracts DOM, Computed Styles, Meta, and Screenshots across 4 viewports for 10 core routes.

## 2. Assets & Typography
- **Fonts**: `Inter` (sans-serif), `JetBrains Mono` (monospace), `Lora` (display). The current repo already integrates these via `@fontsource`.
- **Icons**: Transitioning from the current SVG sets to the sleek, minimalist Lucide-inspired SVG icons from `donor-repo`.
- **Logos**: Extracted from `.integration-src/donor-repo/src/components/ui/logo.tsx`.

## 3. Design Tokens (CSS Variables)
**Surface Scale (Dark Mode):**
- `--color-bg-base: #0a0a0c;`
- `--color-bg-raised: #111114;`
- `--color-bg-overlay: #16161b;`
- `--color-bg-input: #0d0d11;`

**Accent & Borders:**
- `--color-accent: #6ee7d3;` (Venice Teal)
- `--color-border-faint: rgba(255, 255, 255, 0.05);`

These tokens exactly match the existing `src/styles/theme.css` in the primary repo, indicating the primary repo already has an accurate token foundation. We will refine Tailwind compatibility if needed, but since the primary repo is CSS-based, we will adapt the Tailwind classes from `donor-repo` back into pure CSS, or migrate the primary repo to Tailwind (as `@tailwindcss/vite` is in its `devDependencies`). Wait! `package.json` has `@tailwindcss/vite` and `tailwindcss`!

## 4. Layout Architecture
- **Primary Repo**: Double-sidebar (App Navigation + Module-specific sub-sidebars).
- **Venice (donor-repo)**: Unified collapsible sidebar. Nav groups ("Conversation", "Generate", "Build"). When the "Chat" tab is active, the Conversation History is injected directly into the primary sidebar below the navigation links.
- **Goal**: Refactor `src/components/VeniceSidebar.tsx` to handle the unified layout logic, pulling the chat history out of `ChatModule.tsx`.

## 5. Components
- `MessageBubble`: Needs refinement for Markdown formatting and action toolbars (Copy, Delete, Regenerate).
- `ChatInput`: Expandable text area, attachment pill row, and model selector integration.
- `VeniceParams`: The model settings drawer/popover.

## 6. Screens & Modules
- **Chat**: Primary focus. Empty state with "How can I help today?" and starter prompts.
- **Image/Video/Audio**: Migrate the forms to use the dark `bg-input` aesthetic.
- **Models**: Update the grid to match Venice's clean card design.
