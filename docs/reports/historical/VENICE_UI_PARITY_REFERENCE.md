# Venice UI Parity Reference

> [!NOTE]
> Historical design reference. Archived on 2026-06-15.
> The implementation map below cites paths that existed during the 2026-06-03
> capture and have since been removed or refactored. Do not treat this document
> as current implementation guidance. The canonical UI surfaces live in
> `src/components/layout/`, `src/components/chat/`, `src/components/image/`,
> `src/components/video/`, `src/components/prompts/`, `src/components/scenes/`,
> `src/components/rp-studio/`, and the canonical tab registry in
> `src/config/tabs.ts`.

## 1. Capture Method and Date
- **Method:** Ephemeral Playwright script targeting public pages (home, chat, studio, api) with Chromium.
- **Date:** 2026-06-03
- **Color Scheme:** Evaluated in both light and dark mode contexts. (Targeting Dark Mode Parity).

## 2. Pages Captured
- `https://venice.ai`
- `https://venice.ai/chat`
- `https://venice.ai/studio`
- `https://venice.ai/api`

## 3. Layout Dimensions
- **Sidebar width:** Not fully exposed through basic DOM class targeting in automated capture, but visually referencing modern apps, typically ~260px.
- **Main workspace max widths:** Usually unbounded or maxed around 1200px.
- **Composer width/height:** 
  - Chat Composer: ~694px width, auto-expanding height starting around 40px (padding ~8px).
  - API Composer/Inputs: ~212px width.
- **Modal width/height:** N/A (requires interaction).
- **Common card padding:** ~12px to 24px (e.g. 12px 50px 12px 12px).
- **Common gaps:** 8px to 16px.

## 4. Colors (Dark Mode Targets)
- **App background:** `#080A0F` (rgb(8, 10, 15))
- **Sidebar background:** `#080A0F` (same continuous app canvas)
- **Surface:** `#111318`
- **Surface Elevated:** `#181A20`
- **Hover/active:** `#1E2028`
- **Input/control:** `#252830`
- **Border:** `#2A2D35`
- **Primary text:** `#F7F5ED`
- **Secondary text:** `#A6B0BC`
- **Muted text:** `#687483`
- **Green credit/status (Success):** `#22C55E`
- **Purple badge:** `#4B3F72` background with `#C4B5FD` text.
- **Blue accent:** `#125DA3`, hover/focus `#3C8FDD`.

## 5. Typography
- **Approximate font stack:** `-apple-system, "system-ui", "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"`. The API page uses `__aeonik_625d6f`. We will stick to the standard system sans-serif or the project's default sans stack for parity without loading heavy custom webfonts unless Aeonik is available.
- **Heading sizes:** Typically `text-2xl` to `text-4xl`.
- **Body sizes:** `text-sm` (14px) and `text-base` (16px).
- **Label sizes:** `text-xs` (12px).
- **Tracking/weight notes:** Medium weights for headings, regular for body.

## 6. Components
- **Sidebar nav row:** Dark, minimal, rounded, muted text when inactive.
- **Top bar:** Minimal, often merging with background.
- **Chat landing composer:** Centered, rounded, sticky/bottom.
- **Studio composer:** Segmented toolbar on top.
- **Segmented toolbar:** Toggle pills for modes.
- **Stat card:** Dark panels, subtle borders.
- **Table row:** Flat, hover state.
- **Settings/profile modal:** Left rail nav, right cards.
- **Account card:** Bottom of sidebar.
- **Chips/badges/buttons:** Small border radii (`8px` to `12px` observed), subtle backgrounds.

## 7. Implementation Mapping
- **Theme tokens:** `src/styles/theme.css` now uses the ZIP's dark app colors as the default dark canvas.
- **Shell/sidebar:** `src/components/VeniceShell.tsx`, `src/components/VeniceSidebar.tsx`, and `src/components/TabButton.tsx` use a continuous 260px dark rail, compact rounded nav rows, and subtle active states.
- **Catalog:** `src/modules/ModelsModule.tsx` uses compact model cards with type/capability badges and direct model selection.
- **Video support:** `src/modules/VideoModule.tsx`, `src/components/VideoGenerationForm.tsx`, and `src/services/videoGenerationService.ts` restore first-class video model selection and async queue flow.
