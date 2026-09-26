# Design

## Register

product

## Color

### Strategy

Venice Forge uses a semantic color system with 36 canonical roles defining a complete, accessible design language, along with 33 dedicated code and syntax highlighting roles. The application supports 43 built-in theme families shipping complete dark and light variants (52 variants total), with `venice` (Venice Parity Dark) as the default theme family. The color system uses OKLCH and modern CSS color spaces for perceptual uniformity and contrast fidelity.

### Palette

The application ships with 43 built-in dual-mode theme families including:
- Venice (default dark/light family)
- Dark and Light (neutral graphite and daylight)
- Developer favorites: Dracula, Gruvbox Dark, Nord, One Dark, Monokai, Tokyo Night, Catppuccin, Rose Pine, Solarized, GitHub Light
- Technical and aesthetic variants: Obsidian Ember, Midnight Cobalt, Terminal Forest, Porcelain Sky, Sandstone, Obsidian Bloom, Harbor Fog, Circuit Mint, Amber Archive, Neon Dusk, Aurora Boreal, Sakura Terminal, Basalt Noir, Solar Ash, Cyber Orchid, Arctic Glass, Desert Copperfield, Toxic Limewire, Midnight Velvet, Porcelain Daybreak, Synthwave Harbor, Moss Circuit, Ember Monastery, Glacial Ink, Ultraviolet Rain, Copper, Cotton Candy Console, Sweet Nightmare, Dual Persona, Polaroid Board

Every theme follows a consistent 36-token semantic structure:
- Surfaces: `background`, `surface`, `surfaceElevated`, `surfaceMuted`, `overlay`, `glow`
- Borders: `border`, `borderStrong`
- Content text: `foreground`, `foregroundMuted`, `foregroundSubtle` (with legacy derivation from `textPrimary`, `textSecondary`, `textMuted`)
- Brand & interaction: `accent`, `accentHover`, `accentForeground`
- Feedback: `success`, `successForeground`, `warning`, `warningForeground`, `danger`, `dangerForeground`, `info`
- Controls: `inputBackground`, `inputForeground`, `placeholder`, `disabledForeground`, `buttonPrimaryBackground`, `buttonPrimaryForeground`, `buttonSecondaryBackground`, `buttonSecondaryForeground`
- Navigation & selection: `link`, `focusRing`, `selectionBackground`, `selectionForeground`
- Dedicated code block and syntax tokens (33 roles under `--code-*` and `--syntax-*`)

### Accessibility

All themes maintain WCAG AA contrast ratios for text:
- Text against background: ≥4.5:1 for normal text, ≥3:1 for large text
- Interactive elements: ≥3:1 against background
- Focus indicators: High-contrast visual indication meeting 3:1 ratio
- Verified programmatically across all variants via automated contrast testing suites

## Typography

### Font Stack

Primary font:
- `MesloLGM Nerd Font` (local offline font stack with system sans-serif fallback)

Monospace and code font:
- `MesloLGS Nerd Font Mono` / `JetBrains Mono` (system monospace fallback)

Font loading is completely local and offline-first, strictly complying with the Content Security Policy by preventing external font or CDN network requests.

### Scale

The application uses a consistent typographic scale with appropriate sizing for different contexts:
- Display headings: clamp() with max ≤ 6rem
- Section headings: 1.5rem to 2.5rem
- Subheadings: 1.125rem to 1.25rem
- Body text: 0.875rem to 1rem
- Caption/secondary: 0.75rem to 0.875rem

### Line Length

Body text is capped at 65-75 characters per line for optimal readability.

## Spacing

### System

The application uses a consistent spacing system based on a 4px / 8px grid:
- 4px increments (0.25rem)
- Base unit: 16px (1rem), with 8px (0.5rem) sub-grid
- Common values: 0.25rem (4px), 0.5rem (8px), 0.75rem (12px), 1rem (16px), 1.5rem (24px), 2rem (32px), 3rem (48px), 4rem (64px)

### Rhythm

Spacing varies purposefully to create visual rhythm:
- Component internal padding: 0.5rem to 1rem
- Component group spacing: 1rem to 2rem
- Section spacing: 2rem to 4rem

## Components

### Layout

The application follows a consistent layout pattern with:
- Sidebar navigation on the left (collapsible and responsive)
- Main content area in the center
- Optional inspector panel on the right
- Header with global actions and status indicators

### Navigation

- Canonical grouped sidebar navigation defined by `src/config/tabs.ts` (`CANONICAL_TAB_ORDER`) across four functional groups: Conversation, Generate, Build, and System
- Tab-based navigation within feature areas
- Breadcrumb navigation for hierarchical contexts
- Command palette (`Cmd+K` / `Ctrl+K`) for keyboard-driven navigation

### Form Elements

- Text inputs with consistent styling and focus states
- Select dropdowns with custom styling
- Checkboxes and radio buttons with clear visual feedback
- Slider controls for numeric inputs
- Button hierarchy with primary, secondary, and ghost variants

### Data Display

- Responsive tables with proper spacing and alignment
- Card-based layouts for content organization
- List views with consistent item styling
- Detail views with clear information hierarchy

### Feedback

- Toast notifications for transient messages
- Inline validation for form fields
- Modal dialogs for critical actions
- Progress indicators for background operations

## Motion

### Principles

- Motion should be intentional and enhance usability
- Use CSS transitions for simple state changes
- Complex animations use JavaScript-based libraries when needed
- Respect user preferences for reduced motion

### Easing

- Standard transitions: ease-out
- Entrance animations: ease-out-quart/quint/expo
- Exit animations: ease-in
- No bounce or elastic easing unless specifically needed

### Duration

- Micro-interactions: 150ms-300ms
- Page transitions: 300ms-500ms
- Complex animations: 500ms-800ms

## Icons

- Icon components are used throughout the interface
- Icons are consistent in style and weight
- Icons serve as visual affordances and not just decoration
- Proper labeling for accessibility

## Responsive

### Breakpoints

- Mobile: < 768px
- Tablet: 768px - 1023px
- Desktop: 1024px - 1439px
- Large Desktop: ≥ 1440px

### Adaption

- Flexible layouts using CSS Grid and Flexbox
- Responsive component sizing
- Adaptive navigation patterns
- Touch-friendly interactive elements

## Dark Mode

Venice Forge supports both light and dark themes with careful attention to:
- Contrast ratios meeting WCAG AA standards
- Reduced eye strain in low-light environments
- Consistent color relationships across themes
- Proper handling of images and illustrations