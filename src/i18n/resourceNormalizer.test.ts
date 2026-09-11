/**
 * Phase 2 regression guard: the runtime marker firewall
 * (`src/i18n/resourceNormalizer.ts`) must scrub `__MISSING__:` and `[XX]`
 * sentinel values from non-en-US resource trees before they reach i18next,
 * and must NOT mutate the en-US fallback bundle.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import {
  type MissingCatalogEntry,
  isUntranslatedCatalogValue,
  normalizeLocaleResource,
  normalizeResources,
} from './resourceNormalizer';

describe('isUntranslatedCatalogValue', () => {
  it('flags __MISSING__: markers', () => {
    expect(isUntranslatedCatalogValue('__MISSING__:apiKeys.saveKey')).toBe(true);
    expect(isUntranslatedCatalogValue('  __MISSING__:x  ')).toBe(true);
  });

  it('flags legacy [XX] sentinel prefixes (any 2-10 char locale tag)', () => {
    expect(isUntranslatedCatalogValue('[RU] On')).toBe(true);
    expect(isUntranslatedCatalogValue('[DE] Chat')).toBe(true);
    expect(isUntranslatedCatalogValue('[SV-SE] Settings')).toBe(true);
    expect(isUntranslatedCatalogValue('[ZH] 保存')).toBe(true);
  });

  it('flags Tr: scaffolding and key-name leftovers with interpolations', () => {
    expect(isUntranslatedCatalogValue('Tr: Save As…')).toBe(true);
    expect(isUntranslatedCatalogValue('mediaSave.exported {{count}}', 'media.mediaSave.exported')).toBe(true);
  });

  it('flags key-name fallback placeholders when keyPath is provided', () => {
    expect(isUntranslatedCatalogValue('contextMenu.saveAs', 'contextMenu.saveAs')).toBe(true);
    expect(
      isUntranslatedCatalogValue(
        'imageStudioRuntime.enhancementSafetyBlockedMandatory',
        'imageStudioRuntime.enhancementSafetyBlockedMandatory',
      ),
    ).toBe(true);
  });

  it('does NOT flag a value that merely contains its leaf key without the full path', () => {
    expect(isUntranslatedCatalogValue('saveAs', 'contextMenu.saveAs')).toBe(false);
  });

  it('does NOT misclassify legitimate strings containing underscores or colons', () => {
    expect(isUntranslatedCatalogValue('Save_Key')).toBe(false);
    expect(isUntranslatedCatalogValue('api:keys')).toBe(false);
    expect(isUntranslatedCatalogValue('Snake_case_string')).toBe(false);
    expect(isUntranslatedCatalogValue('設定')).toBe(false);
    expect(isUntranslatedCatalogValue('App name • private mode')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(isUntranslatedCatalogValue(null)).toBe(false);
    expect(isUntranslatedCatalogValue(undefined)).toBe(false);
    expect(isUntranslatedCatalogValue(42)).toBe(false);
    expect(isUntranslatedCatalogValue({})).toBe(false);
  });
});

describe('normalizeLocaleResource', () => {
  it('replaces marker values with empty string and records missing entries', () => {
    const source = {
      a: 'Save',
      b: '__MISSING__:b',
      c: { save: '__MISSING__:c.save', normal: 'Cancel' },
    };
    const missing: MissingCatalogEntry[] = [];
    const cleaned = normalizeLocaleResource(source, 'ru', 'navigation', missing);
    expect(cleaned.a).toBe('Save');
    expect(cleaned.b).toBe('');
    const cSubtree = cleaned.c as Record<string, unknown>;
    expect(cSubtree.save).toBe('');
    expect(cSubtree.normal).toBe('Cancel');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0]).toMatchObject({ locale: 'ru' });
  });

  it('replaces key-name fallback placeholders with empty string', () => {
    const source = {
      contextMenu: {
        saveAs: 'contextMenu.saveAs',
        copyImage: 'Copiar imagen',
      },
    };
    const missing: MissingCatalogEntry[] = [];
    const cleaned = normalizeLocaleResource(source, 'es', 'media', missing);
    const contextMenu = cleaned.contextMenu as Record<string, unknown>;
    expect(contextMenu.saveAs).toBe('');
    expect(contextMenu.copyImage).toBe('Copiar imagen');
    expect(missing.some((m) => m.key === 'media.contextMenu.saveAs')).toBe(true);
  });

  it('does not mutate source tree', () => {
    const source = {
      a: '__MISSING__:a',
    };
    normalizeLocaleResource(source, 'es', 'common', []);
    expect(source.a).toBe('__MISSING__:a');
  });
});

describe('normalizeResources', () => {
  it('scrubs every non-en-US resource and leaves en-US untouched', () => {
    const r = normalizeResources({
      'en-US': {
        common: { save: 'Save' },
      },
      es: { common: { save: '__MISSING__:common.save' } },
      fr: { common: { save: '[FR] Save' } },
    });
    expect(r.resources['en-US'].common.save).toBe('Save');
    expect(r.resources.es.common.save).toBe('');
    expect(r.resources.fr.common.save).toBe('');
    expect(r.missingEntries.length).toBe(2);
  });

  it('deduplicates by locale + marker', () => {
    const r = normalizeResources({
      'en-US': { common: { x: 'X' } },
      es: { common: { x: '__MISSING__:x', y: '__MISSING__:x' } },
    });
    expect(r.missingEntries.length).toBe(1);
  });
});
