import { REQUIRED_THEME_TOKEN_KEYS } from '../../config/configSchema';
import { CODE_SYNTAX_PRESET_IDS, CODE_THEME_TOKEN_KEYS } from '../themeTypes';
import { isValidColorValue } from '../validateColor';

export const DANGEROUS_YAML_KEYS = new Set<string>(['__proto__', 'prototype', 'constructor']);

export const ALLOWED_TOP_LEVEL_KEYS = new Set<string>([
  'schemaVersion',
  'id',
  'name',
  'variants',
  'base',
  'aliases',
  'description',
  'author',
]);

export const ALLOWED_VARIANT_KEYS = new Set<string>(['tokens', 'code']);

export const ALLOWED_BASE_KEYS = new Set<string>(['tokens']);

const ID_RE = /^[A-Za-z0-9_-]+$/;
const MAX_ID_LEN = 128;
const MAX_NAME_LEN = 128;

function normalizeTokenKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/** Bound nesting and reject recursive YAML aliases before walking token maps. */
export function collectDangerousKeys(
  obj: Record<string, unknown>, prefix = '', ancestors = new Set<object>(), depth = 0,
): string[] {
  if (depth > 16) return [`${prefix}: excessively nested document`];
  if (ancestors.has(obj)) return [`${prefix}: cyclic alias`];
  const out: string[] = [];
  const nextAncestors = new Set(ancestors).add(obj);
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (DANGEROUS_YAML_KEYS.has(key)) out.push(path);
    if (value && typeof value === 'object') {
      out.push(...collectDangerousKeys(value as Record<string, unknown>, path, nextAncestors, depth + 1));
    }
  }
  return out;
}

function validateTokens(
  tokens: unknown,
  path: string,
  required = true,
): string[] {
  const errors: string[] = [];
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) {
    if (required) {
      errors.push(`${path} must be a mapping of token names to color values.`);
    }
    return errors;
  }
  const t = tokens as Record<string, unknown>;
  const dangerous = collectDangerousKeys(t, path);
  if (dangerous.length > 0) {
    errors.push(...dangerous.map((p) => `${p}: dangerous key is not allowed.`));
  }

  const allowlist = new Set<string>(REQUIRED_THEME_TOKEN_KEYS);
  for (const [rawKey, value] of Object.entries(t)) {
    const normalizedKey = normalizeTokenKey(rawKey);
    const tokenPath = `${path}.${rawKey}`;
    if (!allowlist.has(normalizedKey)) {
      errors.push(`${tokenPath}: unknown token "${rawKey}".`);
      continue;
    }
    if (typeof value !== 'string') {
      errors.push(`${tokenPath}: color value must be a string.`);
      continue;
    }
    if (!isValidColorValue(value)) {
      errors.push(`${tokenPath}: invalid or unsafe color value "${value}".`);
    }
  }

  if (required) {
    for (const req of REQUIRED_THEME_TOKEN_KEYS) {
      const found = Object.keys(t).some((k) => normalizeTokenKey(k) === req);
      if (!found) {
        errors.push(`${path}.${req}: missing required token.`);
      }
    }
  }

  return errors;
}

const CODE_TOKEN_ALLOWLIST = new Set<string>(CODE_THEME_TOKEN_KEYS);
const PRESET_ALLOWLIST = new Set<string>(CODE_SYNTAX_PRESET_IDS);

function validateCode(
  code: unknown,
  path: string,
): string[] {
  const errors: string[] = [];
  if (code === undefined) return errors;
  if (!code || typeof code !== 'object' || Array.isArray(code)) {
    errors.push(`${path} must be an object.`);
    return errors;
  }
  const c = code as Record<string, unknown>;
  const dangerous = collectDangerousKeys(c, path);
  if (dangerous.length > 0) {
    errors.push(...dangerous.map((p) => `${p}: dangerous key is not allowed.`));
  }
  for (const key of Object.keys(c)) {
    if (key !== 'preset' && key !== 'tokens') {
      errors.push(`${path}.${key}: unknown code key.`);
    }
  }
  if (c.preset !== undefined) {
    if (typeof c.preset !== 'string') {
      errors.push(`${path}.preset: must be a string.`);
    } else if (!PRESET_ALLOWLIST.has(c.preset)) {
      errors.push(`${path}.preset: unknown preset "${c.preset}".`);
    }
  }
  if (c.tokens !== undefined) {
    if (!c.tokens || typeof c.tokens !== 'object' || Array.isArray(c.tokens)) {
      errors.push(`${path}.tokens: must be a mapping.`);
    } else {
      const tokens = c.tokens as Record<string, unknown>;
      for (const [rawKey, value] of Object.entries(tokens)) {
        const normalizedKey = normalizeTokenKey(rawKey);
        const tokenPath = `${path}.tokens.${rawKey}`;
        if (!CODE_TOKEN_ALLOWLIST.has(normalizedKey)) {
          errors.push(`${tokenPath}: unknown code token "${rawKey}".`);
          continue;
        }
        if (typeof value !== 'string') {
          errors.push(`${tokenPath}: color value must be a string.`);
          continue;
        }
        if (!isValidColorValue(value)) {
          errors.push(`${tokenPath}: invalid or unsafe color value "${value}".`);
        }
      }
    }
  }
  return errors;
}

function validateVariant(
  mode: 'light' | 'dark',
  variant: unknown,
  path: string,
): string[] {
  const errors: string[] = [];
  if (!variant || typeof variant !== 'object' || Array.isArray(variant)) {
    errors.push(`${path} must be an object.`);
    return errors;
  }
  const v = variant as Record<string, unknown>;
  const dangerous = collectDangerousKeys(v, path);
  if (dangerous.length > 0) {
    errors.push(...dangerous.map((p) => `${p}: dangerous key is not allowed.`));
  }
  for (const key of Object.keys(v)) {
    if (!ALLOWED_VARIANT_KEYS.has(key)) {
      errors.push(`${path}.${key}: unknown variant key.`);
    }
  }
  errors.push(...validateTokens(v.tokens, `${path}.tokens`));
  errors.push(...validateCode(v.code, `${path}.code`));
  return errors;
}

function validateBase(base: unknown, path: string): string[] {
  if (base === undefined) return [];
  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    return [`${path} must be an object.`];
  }
  const b = base as Record<string, unknown>;
  for (const key of Object.keys(b)) {
    if (!ALLOWED_BASE_KEYS.has(key)) {
      return [`${path}.${key}: unknown base key.`];
    }
  }
  return validateTokens(b.tokens, `${path}.tokens`, false);
}

export function validateThemeId(value: unknown, path: string, protectedIds?: Set<string>): string[] {
  const errors: string[] = [];
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string.`);
    return errors;
  }
  if (value.length > MAX_ID_LEN) {
    errors.push(`${path} must be <= ${MAX_ID_LEN} characters.`);
  }
  if (!ID_RE.test(value) || DANGEROUS_YAML_KEYS.has(value)) {
    errors.push(`${path} must contain only letters, numbers, hyphens, and underscores.`);
  }
  if (protectedIds?.has(value)) {
    errors.push(`${path} "${value}" is a protected built-in theme id.`);
  }
  return errors;
}

function validateName(value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string.`);
    return errors;
  }
  if (value.length > MAX_NAME_LEN) {
    errors.push(`${path} must be <= ${MAX_NAME_LEN} characters.`);
  }
  return errors;
}

function validateAliases(value: unknown, path: string): string[] {
  if (value === undefined) return [];
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return errors;
  }
  for (let i = 0; i < value.length; i++) {
    const alias = value[i];
    if (typeof alias !== 'string' || alias.length === 0) {
      errors.push(`${path}[${i}] must be a non-empty string.`);
    } else if (!ID_RE.test(alias)) {
      errors.push(`${path}[${i}] may only contain letters, numbers, hyphens, and underscores.`);
    }
  }
  return errors;
}

/**
 * Strictly validate a raw Theme Engine V2 YAML object before normalization.
 * Returns an array of human-readable errors; an empty array means the object
 * is structurally valid and safe to normalize.
 */
export function validateRawThemeYaml(
  raw: unknown,
  options: {
    protectedIds?: Set<string>;
    /** When true, a missing schemaVersion is reported as an error rather than
     *  treated as a legacy document. */
    requireV2?: boolean;
  } = {},
): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['Theme document must be an object.'];
  }
  const doc = raw as Record<string, unknown>;

  const dangerous = collectDangerousKeys(doc);
  if (dangerous.length > 0) {
    errors.push(...dangerous.map((p) => `${p}: dangerous key is not allowed.`));
  }

  const isV2 = doc.schemaVersion === 2;
  if (doc.schemaVersion !== undefined && !isV2) {
    errors.push(`schemaVersion must be 2, got ${String(doc.schemaVersion)}.`);
  }
  if (options.requireV2 && !isV2) {
    errors.push(`schemaVersion must be 2.`);
  }

  if (isV2) {
    for (const key of Object.keys(doc)) {
      if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
        errors.push(`Unknown top-level key "${key}".`);
      }
    }

    errors.push(...validateThemeId(doc.id, 'id', options.protectedIds));
    errors.push(...validateName(doc.name, 'name'));
    errors.push(...validateAliases(doc.aliases, 'aliases'));
    for (const key of ['author', 'description'] as const) {
      if (doc[key] !== undefined && (typeof doc[key] !== 'string' || doc[key].length > 2048)) {
        errors.push(`${key} must be a string of at most 2048 characters.`);
      }
    }

    if (!doc.variants || typeof doc.variants !== 'object' || Array.isArray(doc.variants)) {
      errors.push('variants must be an object with light and dark entries.');
    } else {
      const variants = doc.variants as Record<string, unknown>;
      const dangerousVariants = collectDangerousKeys(variants, 'variants');
      if (dangerousVariants.length > 0) {
        errors.push(...dangerousVariants.map((p) => `${p}: dangerous key is not allowed.`));
      }
      errors.push(...validateVariant('light', variants.light, 'variants.light'));
      errors.push(...validateVariant('dark', variants.dark, 'variants.dark'));
      for (const key of Object.keys(variants)) {
        if (key !== 'light' && key !== 'dark') {
          errors.push(`variants.${key}: only light and dark are allowed.`);
        }
      }
    }

    errors.push(...validateBase(doc.base, 'base'));
  }

  return errors;
}
