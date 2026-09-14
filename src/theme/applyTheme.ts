import {
  completeThemeTokens,
  type AppearanceMode,
  type ResolvedTheme,
  type Theme,
  type ThemeFamily,
  type ThemeMode,
} from './themeTypes';
import { completeCodeThemeConfig } from './codeSyntax';
import { BUILTIN_THEME_FAMILIES, DEFAULT_THEME_FAMILY } from './themes';
import { isValidColorValue } from './validateColor';
import { themeRegistry } from './registry';
import { getSystemThemeMode, resolveTheme } from './resolver';
import { migrateAppearanceMode, migrateLegacyThemeId } from './migration';

export function isValidPersistedTheme(value: unknown): value is Theme {
  if (!value || typeof value !== 'object') return false;
  const theme = value as Partial<Theme>;
  if (typeof theme.id !== 'string' || !theme.id || typeof theme.name !== 'string' || theme.name.length > 200) return false;
  if (theme.mode !== 'dark' && theme.mode !== 'light') return false;
  if (!theme.tokens || typeof theme.tokens !== 'object') return false;
  try {
    const tokens = completeThemeTokens(theme.mode, theme.tokens as Theme['tokens']);
    if (!Object.values(tokens).every((token) => isValidColorValue(token))) return false;
    const code = completeCodeThemeConfig(
      theme.mode,
      theme.code,
      { mode: theme.mode, tokens },
    );
    return Object.values(code.tokens).every((token) => isValidColorValue(token));
  } catch {
    return false;
  }
}

/**
 * Convert a legacy single-mode Theme into a ThemeFamily so it can flow through
 * the V2 resolver. Both variants reuse the same tokens so the authored look is
 * preserved regardless of the active appearance mode.
 */
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

export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  const t = theme.tokens;
  const c = theme.code.tokens;
  const map: Record<string, string> = {
    '--bg': t.background,
    '--surface': t.surface,
    '--surface-elevated': t.surfaceElevated,
    '--surface-muted': t.surfaceMuted,
    '--border': t.border,
    '--border-strong': t.borderStrong,
    '--foreground': t.foreground,
    '--foreground-muted': t.foregroundMuted,
    '--foreground-subtle': t.foregroundSubtle,
    '--text-primary': t.foreground,
    '--text-secondary': t.foregroundMuted,
    '--text-muted': t.foregroundSubtle,
    '--accent': t.accent,
    '--accent-hover': t.accentHover,
    '--accent-fg': t.accentForeground,
    '--success': t.success,
    '--success-fg': t.successForeground,
    '--warning': t.warning,
    '--warning-fg': t.warningForeground,
    '--danger': t.danger,
    '--danger-fg': t.dangerForeground,
    '--info': t.info,
    '--input-bg': t.inputBackground,
    '--input-fg': t.inputForeground,
    '--placeholder': t.placeholder,
    '--disabled-fg': t.disabledForeground,
    '--button-primary-bg': t.buttonPrimaryBackground,
    '--button-primary-fg': t.buttonPrimaryForeground,
    '--button-secondary-bg': t.buttonSecondaryBackground,
    '--button-secondary-fg': t.buttonSecondaryForeground,
    '--link': t.link,
    '--focus-ring': t.focusRing,
    '--selection-bg': t.selectionBackground,
    '--selection-fg': t.selectionForeground,
    '--overlay': t.overlay,
    '--glow': t.glow,
    '--app-mesh-opacity': theme.mode === 'light' ? '0.08' : '0.12',

    // Code surfaces
    '--code-bg': c.background,
    '--code-fg': c.foreground,
    '--code-border': c.border,
    '--code-header-bg': c.headerBackground,
    '--code-header-fg': c.headerForeground,
    '--code-inline-bg': c.inlineBackground,
    '--code-inline-fg': c.inlineForeground,
    '--code-selection-bg': c.selectionBackground,

    // Syntax tokens
    '--syntax-comment': c.comment,
    '--syntax-punctuation': c.punctuation,
    '--syntax-property': c.property,
    '--syntax-tag': c.tag,
    '--syntax-boolean': c.boolean,
    '--syntax-number': c.number,
    '--syntax-constant': c.constant,
    '--syntax-symbol': c.symbol,
    '--syntax-deleted': c.deleted,
    '--syntax-selector': c.selector,
    '--syntax-attribute': c.attribute,
    '--syntax-string': c.string,
    '--syntax-character': c.character,
    '--syntax-builtin': c.builtin,
    '--syntax-inserted': c.inserted,
    '--syntax-operator': c.operator,
    '--syntax-entity': c.entity,
    '--syntax-url': c.url,
    '--syntax-atrule': c.atRule,
    '--syntax-keyword': c.keyword,
    '--syntax-function': c.function,
    '--syntax-class-name': c.className,
    '--syntax-regex': c.regex,
    '--syntax-important': c.important,
    '--syntax-variable': c.variable,
  };
  Object.entries(map).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.themeMode = theme.mode;
  // Notify subscribers that active theme tokens have been reapplied.
  // Guarded for non-DOM test environments.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('applyTheme:complete', {
      detail: { mode: theme.mode, themeId: theme.id },
    }));
  }
}

/**
 * Register built-in theme families with the canonical registry.
 * Callers typically do not need to interact with this directly; it runs once
 * on module evaluation.
 */
export function registerBuiltinThemes(): void {
  for (const family of BUILTIN_THEME_FAMILIES) {
    themeRegistry.registerCustom(family);
  }
}

registerBuiltinThemes();

/**
 * Find a built-in theme family by id. Returns `null` if the id is not a
 * known built-in (e.g. an old custom theme id or a typo).
 */
export function findBuiltinThemeFamily(id: string | null | undefined): ThemeFamily | null {
  if (!id) return null;
  return themeRegistry.get(id);
}

/**
 * Resolve the initial theme from persisted bootstrap state. The order is:
 *   1. Custom theme matching selectedThemeId (or fallback to `bootstrap.customTheme`)
 *   2. Custom theme from `bootstrap.customThemes`
 *   3. YAML theme by id
 *   4. Built-in theme family by id (via registry, with legacy id migration)
 *   5. Fallback to the default built-in family
 *
 * Unknown / null / unrecognised ids always resolve to a real `ResolvedTheme`, so
 * the caller can blindly `applyTheme()` the result.
 */
export function resolveInitialTheme(
  bootstrap?: Partial<{
    selectedThemeId: string;
    appearanceMode: AppearanceMode;
    customTheme: Theme | null;
    customThemes?: Theme[];
  }>,
  yamlThemes?: Record<string, ThemeFamily>,
): ResolvedTheme {
  const selectedId = bootstrap?.selectedThemeId || '';
  const appearanceMode = migrateAppearanceMode(bootstrap?.appearanceMode);

  // Canonical families retain both authored variants. Legacy settings only
  // contain a single-mode projection and must not shadow the durable family.
  const yamlTheme = yamlThemes?.[selectedId];
  if (yamlTheme) {
    return resolveTheme(yamlTheme, appearanceMode);
  }

  if (selectedId === 'custom' && isValidPersistedTheme(bootstrap?.customTheme)) {
    return resolveTheme(legacyThemeToFamily(bootstrap.customTheme), appearanceMode);
  }

  const userCustom = bootstrap?.customThemes?.find((t) => t.id === selectedId);
  if (userCustom && isValidPersistedTheme(userCustom)) {
    return resolveTheme(legacyThemeToFamily(userCustom), appearanceMode);
  }

  if (bootstrap?.customTheme && bootstrap.customTheme.id === selectedId && isValidPersistedTheme(bootstrap.customTheme)) {
    return resolveTheme(legacyThemeToFamily(bootstrap.customTheme), appearanceMode);
  }


  const migrated = migrateLegacyThemeId(selectedId);
  const family = themeRegistry.get(migrated.themeId) ?? findBuiltinThemeFamily(migrated.themeId);
  if (family) {
    const effectiveAppearance: AppearanceMode = migrated.preferredMode ?? appearanceMode;
    return resolveTheme(family, effectiveAppearance);
  }

  // Final fallback: honour the effective appearance mode. Light mode users get
  // the dedicated light family; everyone else gets the default dark family.
  const effectiveMode: ThemeMode = appearanceMode === 'system' ? getSystemThemeMode() : appearanceMode;
  if (effectiveMode === 'light') {
    const lightFamily = themeRegistry.get('light');
    if (lightFamily) return resolveTheme(lightFamily, 'light');
  }
  return resolveTheme(DEFAULT_THEME_FAMILY, appearanceMode);
}
