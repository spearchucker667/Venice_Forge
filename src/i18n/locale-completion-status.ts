/**
 * @fileoverview Auto-generated locale completion status derived from
 * `docs/i18n/translation-status.json`. Regenerate via
 * `node scripts/i18n-locale-status.cjs --write` after every `verify:i18n`.
 *
 * Do NOT edit by hand — the verifier pipeline is the source of truth.
 */

import type { SupportedLocale } from './locale-types';

export interface LocaleCompletionRow {
  languageTag: SupportedLocale;
  nativeName: string;
  canonicalKeyTotal: number;
  translatedKeyTotal: number;
  sentinelLeaves: number;
  missingMarkerLeaves: number;
  keyNameFallbackLeaves: number;
  identicalUnapprovedLeaves: number;
  reviewStatus: 'source-language' | 'complete' | 'in-progress' | 'first-pass-machine' | 'not-started' | 'unknown';
  catalogStatus: 'complete' | 'in-progress' | 'pending-translation' | 'unknown';
  catalogStructuralCoverage: number;
  runtimeSurfaceCoverage: number;
  linguisticReviewStatus: LocaleCompletionRow['reviewStatus'];
  coveragePercent: number;
  isProductionComplete: boolean;
}

export const LOCALE_COMPLETION: Record<SupportedLocale, LocaleCompletionRow> = {
  'en-US': {
  "languageTag": "en-US",
  "nativeName": "English (US)",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "source-language",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "source-language",
  "coveragePercent": 100,
  "isProductionComplete": true
},
  'es': {
  "languageTag": "es",
  "nativeName": "Español",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'fr': {
  "languageTag": "fr",
  "nativeName": "Français",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'de': {
  "languageTag": "de",
  "nativeName": "Deutsch",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'pt-BR': {
  "languageTag": "pt-BR",
  "nativeName": "Português (Brasil)",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'ru': {
  "languageTag": "ru",
  "nativeName": "Русский",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'zh-CN': {
  "languageTag": "zh-CN",
  "nativeName": "简体中文",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'ja': {
  "languageTag": "ja",
  "nativeName": "日本語",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'hi': {
  "languageTag": "hi",
  "nativeName": "हिन्दी",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'ar': {
  "languageTag": "ar",
  "nativeName": "العربية",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'ko': {
  "languageTag": "ko",
  "nativeName": "한국어",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
  'sv-SE': {
  "languageTag": "sv-SE",
  "nativeName": "Svenska",
  "canonicalKeyTotal": 4034,
  "translatedKeyTotal": 4034,
  "sentinelLeaves": 0,
  "missingMarkerLeaves": 0,
  "keyNameFallbackLeaves": 0,
  "identicalUnapprovedLeaves": 0,
  "reviewStatus": "first-pass-machine",
  "catalogStatus": "complete",
  "catalogStructuralCoverage": 100,
  "runtimeSurfaceCoverage": 100,
  "linguisticReviewStatus": "first-pass-machine",
  "coveragePercent": 100,
  "isProductionComplete": false
},
};
