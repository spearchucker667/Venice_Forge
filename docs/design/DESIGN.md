# Design

## Register

product

## Color

### Strategy

Venice Forge uses a semantic color system with 29 distinct roles that define a complete design language. The application supports multiple built-in themes including dark and light modes, with "Venice Parity Dark" as the default theme. The color system is based on OKLCH color space for better perceptual uniformity.

### Palette

The application ships with multiple built-in themes including:
- Venice Parity Dark (default dark theme)
- Dracula
- Gruvbox Dark
- Nord
- One Dark
- Rosepine
- Solarized Dark
- Tokyo Night
- Light
- GitHub Light
- Solarized Light

Each theme follows a consistent semantic token structure with roles like:
- background, surface, surfaceElevated, surfaceMuted
- foreground, foregroundMuted, foregroundSubtle
- accent, accentHover, accentForeground
- success, warning, danger, info
- focusRing, overlay, glow

### Accessibility

All themes maintain WCAG AA contrast ratios for text:
- Text against background: ≥4.5:1 for normal text, ≥3:1 for large text
- Interactive elements: ≥3:1 against background
- Focus indicators: High-contrast visual indication meeting 3:1 ratio

## Typography

### Font Stack

Primary font:
- Inter (system font stack fallback)

Monospace font:
- JetBrains Mono (system font stack fallback)

Font loading is handled via @fontsource packages for Inter, JetBrains Mono, and Lora.

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

The application uses a consistent spacing system based on an 8px grid:
- 4px increments (0.5rem)
- Base unit: 8px (1rem)
- Common values: 0.5rem, 1rem, 1.5rem, 2rem, 3rem, 4rem

### Rhythm

Spacing varies purposefully to create visual rhythm:
- Component internal padding: 0.5rem to 1rem
- Component group spacing: 1rem to 2rem
- Section spacing: 2rem to 4rem

## Components

### Layout

The application follows a consistent layout pattern with:
- Sidebar navigation on the left
- Main content area in the center
- Optional inspector panel on the right
- Header with global actions and status indicators

### Navigation

- Sidebar with vertical navigation for main features (Chat, History, Image Studio, Media Studio, etc.)
- Tab-based navigation within feature areas
- Breadcrumb navigation for hierarchical contexts
- Command palette for keyboard-driven navigation

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