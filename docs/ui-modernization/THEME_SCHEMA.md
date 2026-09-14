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
│       │    ├── tokens: ThemeTokens (37 semantic roles) │
│       │    └── code: CodeThemeConfig                   │
│       │         ├── preset: CodeSyntaxPresetId         │
│       │         └── tokens: CodeThemeTokens            │
│       └── dark: ThemeVariant                           │
│            ├── tokens: ThemeTokens (37 semantic roles) │
│            └── code: CodeThemeConfig                   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Canonical ThemeTokens Taxonomy (37 Roles)

Every theme variant defines 37 semantic UI color tokens:

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
All color values must parse as valid CSS color strings:
- 6-digit or 8-digit Hex: `#RRGGBB`, `#RRGGBBAA`
- RGB / RGBA: `rgb(r, g, b)`, `rgba(r, g, b, a)`
- HSL / HSLA: `hsl(h, s, l)`, `hsla(h, s, l, a)`
- Validated at ingest time by `src/theme/validateColor.ts`
