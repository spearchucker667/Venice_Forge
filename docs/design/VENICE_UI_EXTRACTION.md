# Venice UI Extraction

## Source Routes Captured

| Route | Slug | Viewports Captured | Status |
|-------|------|-------------------|--------|
| https://venice.ai/ | home | 1440x1000, 1280x900, 1024x768, 390x844 | ✓ |
| https://venice.ai/chat/agent | chat-agent | 1440x1000, 1280x900, 390x844 | ✓ (1024x768 timeout) |
| https://venice.ai/chat/classic | chat-classic | 1440x1000, 1280x900, 1024x768, 390x844 | ✓ |
| https://venice.ai/studio/image | studio-image | 1440x1000, 1280x900, 1024x768, 390x844 | ✓ |
| https://venice.ai/studio/video | studio-video | 1440x1000, 1280x900, 1024x768, 390x844 | ✓ |
| https://venice.ai/studio/audio | studio-audio | 1440x1000, 1280x900, 1024x768, 390x844 | ✓ |
| https://venice.ai/models | models | 1440x1000, 1280x900, 1024x768, 390x844 | ✓ |
| https://venice.ai/pricing | pricing | 1440x1000, 1280x900, 1024x768, 390x844 | ✓ |
| https://venice.ai/brand | brand | 1440x1000, 1280x900, 1024x768, 390x844 | ✓ |
| https://venice.ai/lp/download | lp-download | 1440x1000, 1280x900, 1024x768, 390x844 | ✓ (partial) |

## Route Accessibility Notes

- All public routes accessible without login
- SPA hydration required for full content
- Brand page has downloadable assets (logos, etc.)
- Download page has app installation guides

## Visual Summary

Venice.ai uses a warm, minimal aesthetic with:
- **Light cream/warm beige** backgrounds (replacing dark theme as default)
- **Aeonik** custom font for branding pages, **Inter** for functional pages
- **Coral red** (#d62828, #ef233c) as accent for interactive elements
- **Navy/slate** text (#0e2942 equivalent)
- **Rounded pill buttons** (border-radius: 9999px)
- **Soft rounded corners** (6-12px) on cards and inputs
- **Subtle shadows** for elevation
- **Generous whitespace** and breathing room

## Color Palette

### Primary (Light Mode Default)
| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| background | #e5e2d7 | rgb(229, 226, 215) | Page background |
| surface | #f5f3ec | rgb(245, 243, 236) | Cards, panels |
| surface-elevated | #ffffff | rgb(255, 255, 255) | Modals, elevated elements |
| text-primary | #1c1714 | rgb(28, 23, 20) | Body text |
| text-secondary | #6e6b5f | rgb(110, 107, 95) | Secondary text |
| text-muted | #9c9a90 | rgb(156, 154, 144) | Muted/disabled text |

### Accent (Venice Coral Red)
| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| accent | #d62828 | rgb(214, 40, 40) | Primary CTA, active states |
| accent-hover | #ef233c | rgb(239, 35, 60) | Hover states |
| accent-soft | rgba(214, 40, 40, 0.12) | - | Backgrounds, highlights |

### Border/Divider
| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| border | rgba(28, 23, 20, 0.1) | - | Default borders |
| border-strong | rgba(28, 23, 20, 0.2) | - | Emphasized borders |

### Dark Mode Variants (from openvenice-master ZIP)
| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| bg-base | #0a0a0c | rgb(10, 10, 12) | Dark background |
| bg-raised | #111114 | rgb(17, 17, 20) | Dark elevated surface |
| bg-overlay | #16161b | rgb(22, 22, 27) | Dark overlay |
| text-primary-dark | rgba(255, 255, 255, 0.92) | - | Dark text |
| accent-dark | #6ee7d3 | rgb(110, 231, 211) | Dark teal accent |

## Typography

### Font Stack
| Context | Font | Source |
|---------|------|--------|
| Branding/Display | Aeonik | Custom Venice font (fallback: Inter) |
| UI/Body | Inter | Google Fonts (fallback: system-ui) |
| Code/Mono | JetBrains Mono | @fontsource package |

### Scale
| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| Page title | 32px | 600-700 | 1.2 |
| Section header | 24px | 600 | 1.3 |
| Card title | 18-20px | 500-600 | 1.4 |
| Body text | 16px | 400 | 1.5-1.7 |
| Secondary text | 14px | 400 | 1.5 |
| Small/muted | 12-13px | 400-500 | 1.4 |
| Button text | 16-18px | 400-500 | 1 |

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Tight spacing, inline elements |
| sm | 8px | Compact spacing |
| md | 12-16px | Default spacing |
| lg | 20-24px | Section spacing |
| xl | 32-40px | Large gaps |
| 2xl | 48-64px | Major sections |

## Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| sm | 6px | Inputs, small buttons |
| md | 8px | Cards, panels |
| lg | 12px | Modals, large cards |
| xl | 16px | Large containers |
| full | 9999px | Pill buttons, chips |

## Border System

- Default: 1px solid rgba(28, 23, 20, 0.1)
- Emphasized: 1px solid rgba(28, 23, 20, 0.2)
- Focus ring: 2px solid accent color with 2px offset
- Active indicator: 3px left border on nav items

## Shadow / Glow System

### Light Mode
```css
box-shadow: 0 1px 3px rgba(28, 23, 20, 0.08), 0 4px 12px rgba(28, 23, 20, 0.06);
```

### Dark Mode
```css
box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.3);
```

### Hover Elevation
```css
box-shadow: 0 4px 12px rgba(28, 23, 20, 0.12), 0 8px 24px rgba(28, 23, 20, 0.08);
```

## Surface / Panel System

| Surface | Background | Border | Radius |
|---------|------------|--------|--------|
| Page | #e5e2d7 | none | 0 |
| Card | #f5f3ec | 1px rgba(28, 23, 20, 0.08) | 8-12px |
| Input | #ffffff | 1px rgba(28, 23, 20, 0.12) | 6px |
| Modal | #ffffff | 1px rgba(28, 23, 20, 0.1) | 12px |
| Nav item active | rgba(214, 40, 40, 0.08) | none | 8px |

## Navigation Patterns

### Sidebar (Desktop)
- Width: 260px expanded, 60px collapsed
- Logo at top with wordmark
- Section labels (uppercase, 10.5px, letter-spacing: 0.1em)
- Nav items: 14px, with icon + label
- Active indicator: left border accent + background tint
- Collapse toggle at top

### Header/Topbar
- Height: 56px
- Status chips (API key, model status)
- Model selector dropdown
- User menu/profile

## Chat Layout Patterns

### Composer
- Max-width: 860px centered
- Background: #0e0e12 (dark) or #ffffff (light)
- Border: rgba(255, 255, 255, 0.08) or rgba(28, 23, 20, 0.1)
- Border-radius: 16px
- Padding: 0 20px, 8px bottom
- Textarea: auto-resize, 16px font, 1.5 line-height
- Attachment preview: 64x64px thumbnails
- Send button: 40x40px, rounded-xl, white bg

### Message Bubble
- Max-width: 960px
- Padding: 16px 20px
- Border-radius: 12px
- Code blocks: rounded-8px, monospace
- Markdown: prose styling with comfortable line-height

### Empty State
- Centered vertically
- Logo + "How can I help today?"
- Starter prompts below
- Model picker in header

## Studio Layout Patterns

### Image Studio
- Split view: input left, preview right
- Model picker in header
- Style/parameter controls
- Generation history sidebar

### Video Studio
- Similar split layout
- Aspect ratio selector
- Duration controls
- Generation queue

## Model Picker Patterns

- Dropdown with search
- Grouped by type (text, image, video)
- Model info on hover
- Recent models section

## Composer/Input Patterns

- Drag-and-drop file support
- Paste image from clipboard
- Attachment thumbnails with remove
- Shift+Enter for newline
- Enter to send
- Stop button during streaming

## Button Patterns

| Type | Radius | Background | Text |
|------|--------|------------|------|
| Primary CTA | 9999px (pill) | accent (#d62828) | white |
| Secondary | 9999px | transparent | accent |
| Ghost | 8px | transparent | text-primary |
| Icon | 8px | transparent | text-muted |
| Input action | 6px | rgba(0,0,0,0.04) | text-secondary |

## Tabs and Segmented Controls

- Pill-style segmented control
- Border-radius: 9999px
- Active: accent background
- Inactive: transparent with hover

## Loading/Empty/Error States

### Skeleton Loaders
- Shimmer animation
- 1px height for text lines
- Rounded shapes for images

### Empty States
- Centered illustration/logo
- Friendly message
- Action prompt

### Error States
- Red accent for errors
- Clear error message
- Retry action

## Responsive Behavior

- Desktop: Full sidebar (260px)
- Tablet: Compact sidebar (60px)
- Mobile: Hidden sidebar with hamburger menu
- Viewport breakpoints: 390px, 768px, 1024px, 1280px, 1440px

## Assets and Brand Notes

### Official Venice Assets
- venice-logo-lockup-red.svg (for light backgrounds)
- venice-logo-lockup-white.svg (for dark backgrounds)
- venice-keys-red.svg (icon mark)
- venice-wordmark-red.svg
- venice-wordmark-white.svg
- Venice brand colors: #d62828 (coral red), #0e2942 (navy)

### Font Licensing
- Aeonik: Custom Venice font (not freely available)
- Inter: SIL Open Font License (available via @fontsource)
- JetBrains Mono: SIL Open Font License (available via @fontsource)

## What Was Not Copied

1. **Aeonik font**: Custom Venice brand font with uncertain licensing
   - Fallback: Inter (similar geometric sans-serif)
   
2. **Production JavaScript**: Never copied from Venice.ai runtime
   
3. **User data/auth state**: Never scraped or stored
   
4. **Trackers/analytics**: Not included in this project

5. **Remote CSS/JS dependencies**: All local via @fontsource

## Implementation Mapping for This Repo

### Current Repo Assets
- Already has Inter, JetBrains Mono, Lora via @fontsource
- Has Venice branding SVGs in assets/branding/
- Has existing theme system in src/theme/
- Has existing CSS in src/styles/

### Planned Changes
1. Update color tokens for Venice palette
2. Add light theme option alongside dark
3. Update sidebar styling to match Venice
4. Update button/composer styling
5. Add skeleton/loading animations
6. Update typography scale
7. Update spacing and radius tokens

### Files to Update
- src/styles/theme.css
- src/components/VeniceShell.tsx
- src/components/VeniceSidebar.tsx
- src/components/TabButton.tsx
- src/components/Chip.tsx
- src/components/icons.tsx
- src/modules/ChatModule.tsx
- src/modules/ImageModule.tsx
- src/modules/VideoModule.tsx
- src/modules/SettingsModule.tsx

### Donors Mined
- openvenice-master/src/index.css (tokens, animations)
- openvenice-master/src/components/chat/ (chat view patterns)
- openvenice-master/src/components/layout/ (sidebar patterns)
- Venice-API-connector/src/styles/ (existing working styles)

### Unchanged (Security/Legal)
- electron/preload.ts (security boundary)
- electron/ipc/ (validation)
- src/shared/safety/ (safety guard)
- src/shared/legal.ts (disclaimers)
- docs/legal/ (legal notices)