# Venice Forge — Theme Engine Migration Guide

> **Target Version:** Theme Engine V2  
> **Applicability:** Custom Themes, Third-Party Themes, Embedded Presets  
> **Codec Implementation:** `src/theme/yamlTheme.ts`  
> **Date:** September 14, 2026  

---

## 1. Motivation & Context

In early Venice Forge releases (V1), themes were stored as flat key-value YAML files defining a single color mode (either light or dark). Users switching between daytime and nighttime environments were forced to manually switch between two disconnected theme files. Furthermore, syntax highlighting in code blocks relied on hardcoded prism stylesheets that clashed with custom palettes.

**Theme Engine V2 introduces:**
1. **Dual-Mode Theme Families:** A single `.theme.yaml` file houses both `light` and `dark` mode variants.
2. **Integrated Code Theming:** Syntax tokens and code editor surfaces are fully customized per-variant with automated syntax presets or custom palettes.
3. **Lossless Legacy Compatibility:** Any legacy V1 flat theme is automatically up-converted in memory into a compliant V2 family without data loss.

---

## 2. Token Name Mapping

Legacy theme tokens are automatically mapped to canonical V2 token names during parsing:

| Legacy V1 Token | Canonical V2 Token | Purpose |
| :--- | :--- | :--- |
| `bg` | `background` | Window/canvas background |
| `text` | `foreground` | High-contrast primary copy |
| `textMuted` | `foregroundMuted` | Secondary text |
| `textSubtle` | `foregroundSubtle` | Muted captions and hints |
| `brandPrimary` | `accent` | Brand interactive accent |
| `brandPrimaryHover` | `accentHover` | Brand hover state |
| `brandPrimaryFg` | `accentForeground` | Text on accent surfaces |
| `borderSubtle` | `border` | Primary card and divider outline |
| `borderStrong` | `borderStrong` | Focused or highlighted borders |
| `toneError` | `danger` | Validation failure / destructive actions |
| `toneWarning` | `warning` | Warnings and cautions |
| `toneSuccess` | `success` | Confirmations and green status |
| `surfaceBase` | `surface` | Workspace panel canvas |
| `surfaceRaised` | `surfaceElevated` | Elevated card surfaces |

---

## 3. Migration Algorithms

### 3.1 Mode Detection via Luminance
When importing a legacy file without an explicit `schemaVersion: 2` header:
```typescript
export function legacyThemeToFamily(theme: Theme): ThemeFamily {
  const isLight = luminance(theme.tokens.background) > 0.55;
  const canonicalMode: ThemeMode = isLight ? "light" : "dark";
  const complementaryMode: ThemeMode = isLight ? "dark" : "light";

  // Derive complementary variant using algorithmic contrast inversion
  const derivedVariant = deriveComplementaryVariant(theme.tokens, complementaryMode);

  return {
    schemaVersion: 2,
    id: theme.id,
    name: theme.name,
    builtIn: false,
    variants: {
      [canonicalMode]: {
        tokens: completeThemeTokens(canonicalMode, theme.tokens),
        code: theme.code ?? { preset: "automatic", tokens: deriveCodeThemeTokens(...) },
      },
      [complementaryMode]: derivedVariant,
    },
  };
}
```

### 3.2 Automatic Code Syntax Generation
If a legacy theme does not declare code syntax tokens, `deriveCodeThemeTokens()` generates harmonious prism syntax tokens derived mathematically from the UI's `accent`, `success`, `warning`, and `foregroundMuted` values:
- Strings derive from `--success` hue.
- Keywords derive from `--accent` hue.
- Numbers & Booleans derive from `--warning` hue.
- Comments derive from `--foregroundSubtle` with calibrated opacity.

---

## 4. Step-by-Step Author Migration Checklist

If you maintain a custom Venice Forge theme:

1. Open **Settings → Theme Maker** in Venice Forge.
2. Select your custom theme from the active theme dropdown.
3. Switch between **Dark Mode** and **Light Mode** tabs to verify both variants.
4. If one mode was generated automatically, adjust individual tokens using the color pickers.
5. Under **Code & Syntax**, select a syntax preset (`automatic`, `one-dark`, `dracula`, `nord`, etc.) or fine-tune individual token colors.
6. Click **Save Theme**.
7. Click **Export Theme** to generate the modern Schema V2 YAML file.
