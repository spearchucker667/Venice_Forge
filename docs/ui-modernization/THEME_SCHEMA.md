# Venice Forge — Theme Engine V2 Schema Specification

> **Schema Version:** 2  
> **Status:** Canonical Schema Specification  
> **TypeScript Interface:** `src/theme/themeTypes.ts`  
> **YAML Codec:** `src/theme/yamlTheme.ts` & `src/theme/yaml/validate.ts`  
> **Date:** September 14, 2026  

---

## 1. Overview & Architecture

Theme Engine V2 represents themes as **Theme Families** (`ThemeFamily`). Each family bundles dual `light` and `dark` mode variants, paired with dedicated code surface and syntax highlighting palettes.

```
┌────────────────────────────────────────────────────────┐
│ ThemeFamily                                            │
│  ├── id: string (kebab-case identifier)                │
│  ├── name: string (display title)                      │
│  ├── schemaVersion: 2                                  │
│  └── variants:                                         │
│       ├── light: ThemeVariant                          │
│       │    ├── tokens: ThemeTokens (36 semantic roles) │
│       │    └── code: CodeThemeConfig                   │
│       │         ├── preset: CodeSyntaxPresetId         │
│       │         └── tokens: CodeThemeTokens            │
│       └── dark: ThemeVariant                           │
│            ├── tokens: ThemeTokens (36 semantic roles) │
│            └── code: CodeThemeConfig                   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Canonical ThemeTokens Taxonomy (36 Roles)

Every theme variant defines 36 semantic UI color tokens:

### 2.1 Surfaces & Depth (6 Tokens)
| Token Key | CSS Custom Property | Role Description |
| :--- | :--- | :--- |
| `background` | `--bg` | Primary window and application canvas background |
| `surface` | `--surface` | Workspace main canvas and panel background |
| `surfaceElevated` | `--surface-elevated` | Secondary panels, message cards, floating toolbars |
| `surfaceMuted` | `--surface-muted` | Chip backgrounds, disabled states, hover tints |
| `overlay` | `--overlay` | Modal scrims, dropdown popovers, backdrop masks |
| `glow` | `--glow` | Accent ambient glow, active indicator luminescence |

### 2.2 Typography & Foreground (6 Tokens)
| Token Key | CSS Custom Property | Role Description |
| :--- | :--- | :--- |
| `foreground` | `--foreground`, `--text-primary` | High-contrast primary copy, headings, active text |
| `foregroundMuted` | `--foreground-muted`, `--text-secondary` | Secondary body text, timestamps, descriptive metadata |
| `foregroundSubtle` | `--foreground-subtle`, `--text-muted` | Placeholder captions, subtle hints, inactive tabs |
| `placeholder` | `--placeholder` | Input field placeholder text |
| `disabledForeground` | `--disabled-fg` | Disabled buttons, inactive inputs, locked controls |
| `link` | `--link` | Interactive hyperlinks, documentation cross-references |

### 2.3 Borders, Focus & Selection (5 Tokens)
| Token Key | CSS Custom Property | Role Description |
| :--- | :--- | :--- |
| `border` | `--border` | Subtle structural dividers, card outlines |
| `borderStrong` | `--border-strong` | Active input borders, table borders, selected outlines |
| `focusRing` | `--focus-ring` | Keyboard accessibility focus indicator |
| `selectionBackground`| `--selection-bg` | Highlighted text selection background |
| `selectionForeground`| `--selection-fg` | Highlighted text selection foreground |

### 2.4 Interactive Controls & Buttons (9 Tokens)
| Token Key | CSS Custom Property | Role Description |
| :--- | :--- | :--- |
| `accent` | `--accent` | Primary brand accent color, active checkboxes, radio dots |
| `accentHover` | `--accent-hover` | Hover state for accent buttons and controls |
| `accentForeground` | `--accent-fg` | Contrast foreground text rendered on top of accent |
| `buttonPrimaryBackground` | `--button-primary-bg` | Primary call-to-action button background |
| `buttonPrimaryForeground` | `--button-primary-fg` | Primary call-to-action button text |
| `buttonSecondaryBackground`| `--button-secondary-bg` | Secondary button background |
| `buttonSecondaryForeground`| `--button-secondary-fg` | Secondary button text |
| `inputBackground` | `--input-bg` | Text inputs, dropdown selects, textareas |
| `inputForeground` | `--input-fg` | Text rendered inside form inputs |

### 2.5 Status & Feedback (7 Tokens)
| Token Key | CSS Custom Property | Role Description |
| :--- | :--- | :--- |
| `success` | `--success` | Positive status, online connection, successful completion |
| `successForeground` | `--success-fg` | Foreground text rendered on top of success surfaces |
| `warning` | `--warning` | Cautionary warnings, resource thresholds, deprecation |
| `warningForeground` | `--warning-fg` | Foreground text rendered on top of warning surfaces |
| `danger` | `--danger`, `--color-error` | Errors, validation failures, destructive actions |
| `dangerForeground` | `--danger-fg`, `--color-error-fg`| Foreground text rendered on top of danger surfaces |
| `info` | `--info` | Informational callouts, inline hints, tips |

### 2.6 Legacy Text Roles (3 Tokens)
These three keys remain first-class, required members of the 36-key contract (`REQUIRED_THEME_TOKEN_KEYS`). They are the canonical persisted text roles and double as derivation sources: when `foreground` / `foregroundMuted` / `foregroundSubtle` are absent, `completeThemeTokens()` fills them from the trio.

| Token Key | CSS Custom Property | Role Description |
| :--- | :--- | :--- |
| `textPrimary` | `--text-primary` (mirrors `--foreground`) | Primary copy role; derivation source for `foreground` |
| `textSecondary` | `--text-secondary` (mirrors `--foreground-muted`) | Secondary text role; derivation source for `foregroundMuted` |
| `textMuted` | `--text-muted` (mirrors `--foreground-subtle`) | Muted text role; derivation source for `foregroundSubtle` and `borderStrong` |

---

## 3. Code Surface & Syntax Tokens Taxonomy

The code block sub-system styles both the editor/container shell and the language syntax tokens:

### 3.1 Code Surfaces (8 Tokens)
- `background` (`--code-bg`): Code block canvas background.
- `foreground` (`--code-fg`): Default unstyled code text.
- `border` (`--code-border`): Code container outer boundary.
- `headerBackground` (`--code-header-bg`): Language badge and copy toolbar bar header.
- `headerForeground` (`--code-header-fg`): Filename and language indicator text.
- `inlineBackground` (`--code-inline-bg`): Inline `` `code` `` pill background.
- `inlineForeground` (`--code-inline-fg`): Inline `` `code` `` text.
- `selectionBackground` (`--code-selection-bg`): Text selection within code blocks.

### 3.2 Code Syntax Tokens (25 Tokens)
Populated by Refractor Prism syntax analysis via CSS custom properties:
`comment`, `punctuation`, `property`, `tag`, `boolean`, `number`, `constant`, `symbol`, `deleted`, `selector`, `attribute`, `string`, `character`, `builtin`, `inserted`, `operator`, `entity`, `url`, `atRule`, `keyword`, `function`, `className`, `regex`, `important`, `variable`.

---

## 4. Fallback Hierarchy & Validation

When a user imports or parses an incomplete theme definition:

```
Runtime Request
      │
      ▼
Explicit Variant Token Defined? ──Yes──► Use Token
      │ No
      ▼
V1 Single-Mode Legacy Fallback? ──Yes──► Map to Variant
      │ No
      ▼
Canonical Built-in Fallback (Venice Theme)
      │
      ▼
System Safe Colors (#ffffff / #000000 / #3b82f6)
```

### Color Format Validation
All color values must parse as valid CSS color strings (enforced at ingest time by `src/theme/validateColor.ts`):
- **Hex:** 3, 4, 6, or 8 digits — `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
- **RGB / RGBA:** `rgb(r, g, b)` and `rgba(r, g, b, a)` — comma-separated, or modern space-separated components with `/` alpha (number or percent)
- **HSL / HSLA:** `hsl(h, s%, l%)` and `hsla(h, s%, l%, a)` — hue with optional `deg`, comma-separated or modern space/slash alpha
- **Keywords:** `transparent`, `currentColor`

Values longer than 128 characters and any value containing dangerous CSS patterns — `url(`, `expression(`, `javascript:`, `@import` — are rejected.

### Top-Level Document Keys
A V2 theme document may carry only the following top-level keys (`ALLOWED_TOP_LEVEL_KEYS` in `src/theme/yaml/validate.ts`):

| Key | Required | Notes |
| :--- | :--- | :--- |
| `schemaVersion` | yes | Must be `2`. Documents without it are treated as legacy and routed through the V1 parser. |
| `id` | yes | Non-empty string of letters, numbers, hyphens, underscores (max 128 chars); must not collide with reserved/protected ids. |
| `name` | yes | Non-empty display title (max 128 chars). |
| `variants` | yes | Object with exactly `light` and `dark` entries, each `{ tokens, code? }`. |
| `base` | no | Optional `{ tokens }` inherited by variants; values must still be valid colors. |
| `aliases` | no | Array of alternate string ids. |
| `description` | no | Free text (max 2048 chars). |
| `author` | no | Free text (max 2048 chars). |
| `mode` | no | **Tolerated but ignored.** Accepted for backward compatibility when its value is `light` or `dark`; nothing reads it after import (normalization drops it), and the serializer no longer emits it. |
| `version` | — | **Not allowed.** A top-level `version:` key (e.g. `version: 1.0.0`) is an unknown key and fails validation. |
