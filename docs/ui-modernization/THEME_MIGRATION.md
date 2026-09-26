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

## 2. Token Normalization & Role Derivation

Legacy theme tokens are not renamed during parsing. Both V2 YAML documents and legacy V1 `themes:` block entries use the same canonical 36-key token contract (`REQUIRED_THEME_TOKEN_KEYS` in `src/config/configSchema.ts`), with one normalization pass:

- **Key casing:** snake_case keys are normalized to camelCase (e.g. `text_primary` → `textPrimary`, `button_primary_background` → `buttonPrimaryBackground`). Unknown token names are rejected: V2 YAML import fails validation with a descriptive error, and V1 `themes:` entries are skipped with a `ConfigWarning`.
- **Role derivation:** `completeThemeTokens()` (`src/theme/themeTypes.ts`) fills missing roles from related ones, so partially specified legacy palettes still resolve. The actual derivation table:

| Derived Role | Source (first present value wins) |
| :--- | :--- |
| `foreground` | `foreground` ?? `textPrimary` |
| `foregroundMuted` | `foregroundMuted` ?? `textSecondary` |
| `foregroundSubtle` | `foregroundSubtle` ?? `textMuted` |
| `surfaceMuted` | `surfaceMuted` ?? `surface` |
| `borderStrong` | `borderStrong` ?? `textMuted` |
| `dangerForeground` / `warningForeground` / `successForeground` | explicit value ?? `#ffffff` (light) ?? `background` (dark) |
| `inputBackground` | `inputBackground` ?? `surfaceElevated` |
| `inputForeground` | `inputForeground` ?? `foreground` |
| `placeholder` | `placeholder` ?? `foregroundSubtle` |
| `disabledForeground` | `disabledForeground` ?? `foregroundSubtle` |
| `buttonPrimaryBackground` / `buttonPrimaryForeground` | ?? `accent` / `accentForeground` |
| `buttonSecondaryBackground` / `buttonSecondaryForeground` | ?? `surfaceElevated` / `foreground` |
| `link` | `link` ?? `info` |
| `selectionBackground` / `selectionForeground` | ?? `accent` / `accentForeground` |

Note the direction of the legacy relationship: the `textPrimary` / `textSecondary` / `textMuted` trio are the canonical persisted keys, and the `foreground*` roles derive *from* them when absent — not the other way around.

---

## 3. Migration Algorithms

### 3.1 Single-Mode Lift to Dual-Variant Families
Legacy content never undergoes luminance-based mode detection and there is no algorithmic "complementary variant" derivation. A legacy single-mode theme is lifted to a V2 family by copying the **same authored tokens into both variants**, so the theme keeps its exact look regardless of the active appearance mode. The canonical conversion in `src/theme/applyTheme.ts`:

```typescript
export function legacyThemeToFamily(theme: Theme): ThemeFamily {
  const code = theme.code ?? completeCodeThemeConfig(theme.mode, undefined, { mode: theme.mode, tokens: theme.tokens });
  return {
    schemaVersion: 2,
    id: theme.id,
    name: theme.name,
    aliases: [],
    builtIn: false,
    variants: {
      light: { tokens: theme.tokens, code },
      dark: { tokens: theme.tokens, code },
    },
  };
}
```

The same copy-both-variants lift is applied on every legacy ingestion path:
- **Persisted custom `Theme` records** — `legacyThemeToFamily()` in `src/theme/applyTheme.ts` (single `customTheme` and `customThemes` entries).
- **Legacy V1 `themes:` YAML entries** — `parseV1ThemeEntry()` / `themeToFamily()` in `src/theme/yaml/legacy.ts` (validated first by `validateThemesFile()` in `src/config/configSchema.ts`).
- **Single-mode YAML theme entries** — `yamlThemeToFamily()` in `src/theme/yamlTheme.ts`.

Because both variants start identical, ThemeMaker shows the same palette under both the Light Mode and Dark Mode tabs until the user edits one variant explicitly.

### 3.2 Legacy ID Migration
Persisted selection ids are mapped to V2 family ids by `migrateLegacyThemeId()` in `src/theme/migration.ts` before registry lookup:

| Legacy Id | V2 Family Id | Preferred Mode |
| :--- | :--- | :--- |
| `builtin-light` | `light` | `light` |
| `builtin-dark` | `dark` | `dark` |
| `builtin-solarized-dark` | `solarized` | `dark` |
| `builtin-solarized-light` | `solarized` | `light` |
| `builtin-<id>` | `<id>` | — |
| anything else | unchanged | — |

### 3.3 Automatic Code Syntax Generation
If a legacy theme does not declare code syntax tokens, `deriveCodeThemeTokens()` (`src/theme/codeSyntax.ts`) generates a readable palette deterministically from the UI tokens:
- **Code surfaces** are blended from `background` (slight surface mix for the block background, header, and inline backgrounds; foreground-based mixes for borders).
- **Strings, characters, and URLs** derive from `link` (falling back to `info`, then `accent`).
- **Keywords, tags, at-rules, and `!important`** derive from `danger`.
- **Numbers, booleans, constants, symbols, builtins, and attributes** derive from `accent`.
- **Inserted diff markers and selectors** derive from `success`; **regexes** derive from `warning`.
- **Comments** use a dimmed (light themes) or lightened (dark themes) `foreground` (`textDim`).
- **Functions and class names** are `accent` darkened on light themes or lightened on dark themes.

---

## 4. Step-by-Step Author Migration Checklist

If you maintain a custom Venice Forge theme:

1. Open **Settings → Theme Maker** in Venice Forge.
2. Select your custom theme from the active theme dropdown.
3. Switch between **Dark Mode** and **Light Mode** tabs to verify both variants.
4. Both variants start as copies of the legacy tokens; adjust individual tokens per mode using the color pickers.
5. Under **Code & Syntax**, select a syntax preset (`automatic`, `one-dark`, `dracula`, `nord`, etc.) or fine-tune individual token colors.
6. Click **Save Theme**.
7. Click **Export Theme** to generate the modern Schema V2 YAML file.
