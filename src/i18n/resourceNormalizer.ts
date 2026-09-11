/**
 * @fileoverview Resource normalizer that scrubs untranslated marker and
 * obsolete-sentinel values from non-en-US resource trees before they are
 * registered with i18next. Marker values cause i18next to fall back to
 * `fallbackLng: 'en-US'` (via `returnEmptyString: false` configured in
 * `src/i18n/index.ts`).
 *
 * This is the **runtime** half of the marker firewall. The half that lives
 * in `scripts/verify-i18n.cjs` (the catalog verifier) is the source-of-truth
 * gate: a missing-marker in a committed catalog still fails
 * `verify:i18n`, even though the user will never see it.
 */

import { DEFAULT_LOCALE } from './locales';

/**
 * Tests whether a catalog value is an internal untranslated marker that
 * must never reach the rendered UI.
 *
 * @param value The catalog value to test.
 * @param keyPath Optional dotted key path. When provided, values that equal
 *   the key path (or the path relative to the namespace root) are treated as
 *   key-name fallback placeholders (e.g. `"contextMenu.saveAs":
 *   "contextMenu.saveAs"`) and are also scrubbed.
 */
export function isUntranslatedCatalogValue(value: unknown, keyPath?: string): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.startsWith('__MISSING__:')) return true;
  if (/^\s*Tr:\s/.test(trimmed)) return true;
  // [RU], [DE], [FR], [JA], [ZH], [ES], [PT], [HI], [AR], [KO], [SV] patterns
  // produced by the long-retired `scripts/generate-locales.cjs` (lines 837-849).
  if (/^\s*\[[A-Za-z][A-Za-z-]{1,10}\]\s/.test(trimmed)) return true;
  // Key-name fallback placeholders produced when a translation sync tool
  // copies the dotted key path into the value slot. These must fall back to
  // the canonical en-US string instead of being rendered as raw key names.
  // Both the full path (namespace.relative.key) and the relative path are
  // accepted because different tools write different prefixes. Require at
  // least one dot in the matched path to avoid flagging legitimate single-word
  // translations that happen to equal the leaf key.
  if (keyPath) {
    const relativeKeyPath = keyPath.replace(/^[^.]+\./, '');
    for (const candidate of [keyPath, relativeKeyPath]) {
      if (!candidate.includes('.')) continue;
      if (trimmed === candidate) return true;
      if (
        trimmed.startsWith(candidate) &&
        /^\s+\{\{/.test(trimmed.slice(candidate.length))
      ) {
        return true;
      }
    }
  }
  return false;
}

export interface MissingCatalogEntry {
  locale: string;
  namespace: string;
  key: string;
  marker: string;
}

/**
 * Walks a single non-en-US resource tree and replaces every marker value
 * with `''`, returning the cleaned tree (a deep clone) plus the list of
 * detected missing entries.
 *
 * The structure is preserved: nested objects retain their keys so that
 * future valid translations can be plugged in without reshape.
 */
export function normalizeLocaleResource(
  source: Record<string, unknown>,
  locale: string,
  namespace: string,
  out: MissingCatalogEntry[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(source)) {
    const keyPath = `${namespace}.${k}`.replace(/^\./, '');
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      result[k] = normalizeLocaleResource(
        v as Record<string, unknown>,
        locale,
        keyPath,
        out,
      );
    } else if (isUntranslatedCatalogValue(v, keyPath)) {
      out.push({
        locale,
        namespace: keyPath,
        key: keyPath,
        marker: String(v),
      });
      result[k] = '';
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Scans the entire runtime resource bundle. For every locale other than
 * `DEFAULT_LOCALE`, replaces marker values with `''` so i18next falls back
 * to the en-US catalog. The `DEFAULT_LOCALE` itself is left untouched.
 *
 * Returns the scrubbed resource bundle plus the deduplicated missing-entries
 * list (deduplicated by `locale + namespace + marker`).
 */
export function normalizeResources(
  resources: Record<string, Record<string, Record<string, unknown>>>,
  fallback: string = DEFAULT_LOCALE,
): {
  resources: Record<string, Record<string, Record<string, unknown>>>;
  missingEntries: MissingCatalogEntry[];
} {
  const missingEntries: MissingCatalogEntry[] = [];
  const scrubbed: Record<string, Record<string, Record<string, unknown>>> = {};

  for (const [locale, namespaces] of Object.entries(resources)) {
    if (locale === fallback) {
      scrubbed[locale] = namespaces;
      continue;
    }
    const scrubbedNs: Record<string, Record<string, unknown>> = {};
    for (const [namespace, catalog] of Object.entries(namespaces)) {
      scrubbedNs[namespace] = normalizeLocaleResource(
        catalog,
        locale,
        namespace,
        missingEntries,
      );
    }
    scrubbed[locale] = scrubbedNs;
  }

  const dedup = new Map<string, MissingCatalogEntry>();
  for (const e of missingEntries) {
    const k = `${e.locale}:${e.marker}`;
    if (!dedup.has(k)) dedup.set(k, e);
  }

  return { resources: scrubbed, missingEntries: dedupMapToArray(dedup) };
}

function dedupMapToArray(map: Map<string, MissingCatalogEntry>): MissingCatalogEntry[] {
  const out: MissingCatalogEntry[] = [];
  for (const v of map.values()) out.push(v);
  return out;
}

/**
 * Records a deduplicated dev-mode diagnostic warning for missing catalog
 * entries. Production builds should suppress this with `__DEV__`.
 */
export function warnMissingEntries(
  entries: MissingCatalogEntry[],
  emit: (line: string) => void = (line) => console.warn(line),
): void {
  if (entries.length === 0) return;
  emit(
    `[i18n] ${entries.length} missing-marker entries fell back to '${DEFAULT_LOCALE}'. ` +
      `Run \`npm run verify:i18n\` for the canonical list.`,
  );
}
