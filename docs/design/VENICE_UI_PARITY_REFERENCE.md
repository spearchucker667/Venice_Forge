# Venice UI Parity Reference

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
- **App background:** `#050A0F` (rgb(5, 10, 15))
- **Sidebar background:** `#050A0F` (or similar deep shade, matches app background or slightly offset)
- **Surface:** `#080F15`
- **Surface Elevated:** `#111922`
- **Border:** `#1B2632` (or subtle white/gray alpha like `rgba(255, 255, 255, 0.3)`)
- **Primary text:** `#F4F6F8` (approximate to captured `rgb(238, 237, 228)`)
- **Secondary text:** `#A6B0BC`
- **Muted text:** `#687483` (approximate to captured `rgb(153, 161, 175)`)
- **Green credit/status (Success):** `#74D66A`
- **Purple badge:** TBD based on context (often `#9F7AEA` or similar).
- **Blue accent:** `#63B3ED` (rgb(99, 179, 237) observed on focus/composer borders) or `#2563EB`.

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
- **New Theme:** Add `builtin-venice` (Venice Parity Dark) to `src/theme/themes.ts`.
- **Shell:** Refactor `src/App.tsx` and `src/components/Sidebar.tsx` (or equivalent).
- **Reusable Primitives:** 
  - Need to create/update components in `src/components/` to match.
  - E.g., `VenicePill`, `VeniceComposer`, `VeniceToolbar`.
- **Modules:** Overhaul layout in `ChatModule.tsx`, `ImageModule.tsx` (Studio), `BatchModule.tsx`, etc.
