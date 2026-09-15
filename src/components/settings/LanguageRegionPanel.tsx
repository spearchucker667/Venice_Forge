/**
 * @fileoverview Language & Region settings panel for Venice Forge.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';
import { SUPPORTED_LOCALES, SUPPORTED_LOCALE_CODES, resolveEffectiveLocale, getTextDirection } from '../../i18n/locales';
import { formatBytes, formatDate, formatNumber, formatTime } from '../../i18n/formatters';
import type { LocaleSetting } from '../../i18n/locale-types';
import { GlobeIcon, CheckIcon, LayersIcon } from 'lucide-react';

export function LanguageRegionPanel() {
  const { t } = useTranslation(['settings', 'common']);
  const uiLocale = useSettingsStore((s) => s.uiLocale);
  const setUiLocale = useSettingsStore((s) => s.setUiLocale);

  const activeEffectiveLocale = resolveEffectiveLocale(uiLocale);
  const activeDirection = getTextDirection(activeEffectiveLocale);
  const sampleDate = new Date();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as LocaleSetting;
    setUiLocale(value);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <GlobeIcon className="w-5 h-5 text-accent" />
          {t('settings:languageRegion.title', 'Language & Region')}
        </h3>
        <p className="text-sm text-text-secondary mt-1">
          {t('settings:languageRegion.description', 'Customize application language, text direction, and regional formatting preferences.')}
        </p>
      </div>

      <div className="p-4 rounded-xl bg-vf-panel-bg-raised border border-vf-panel-border space-y-4">
        <div>
          <label htmlFor="ui-language-select" className="block text-sm font-medium text-text-primary mb-1.5">
            {t('settings:languageRegion.uiLanguageLabel', 'Interface Language')}
          </label>
          <select
            id="ui-language-select"
            value={uiLocale}
            onChange={handleLanguageChange}
            className="w-full sm:w-80 px-3 py-2 bg-vf-panel-bg border border-vf-panel-border rounded-lg text-sm text-text-primary focus:ring-2 focus:ring-accent focus:border-accent"
          >
            <option value="system">
              {t('settings:languageRegion.useSystemLanguage', 'Use system language')} ({SUPPORTED_LOCALES[resolveEffectiveLocale('system')]?.nativeName})
            </option>
            {SUPPORTED_LOCALE_CODES.map((code) => (
              <option key={code} value={code}>
                {SUPPORTED_LOCALES[code].nativeName} — {SUPPORTED_LOCALES[code].englishName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-vf-panel-border">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-muted">
              {t('settings:languageRegion.resolvedLocale', 'Active Locale')}
            </span>
            <span className="text-sm font-semibold text-text-primary mt-0.5 flex items-center gap-1.5">
              <CheckIcon className="w-4 h-4 text-success" />
              {SUPPORTED_LOCALES[activeEffectiveLocale]?.nativeName} ({activeEffectiveLocale})
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-medium text-text-muted">
              {t('settings:languageRegion.textDirection', 'Text Direction')}
            </span>
            <span className="text-sm font-semibold text-text-primary mt-0.5 flex items-center gap-1.5">
              <LayersIcon className="w-4 h-4 text-accent" />
              {activeDirection === 'rtl'
                ? t('settings:languageRegion.rightToLeft', 'Right-to-Left (RTL)')
                : t('settings:languageRegion.leftToRight', 'Left-to-Right (LTR)')}
            </span>
          </div>
        </div>
      </div>

      {/* Regional Formatting Preview */}
      <div className="p-4 rounded-xl bg-vf-panel-bg-raised border border-vf-panel-border space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t('settings:languageRegion.formattingPreview', 'Regional Formatting Preview')}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-vf-panel-bg-raised border border-vf-panel-border">
            <span className="text-text-muted block text-[11px]">
              {t('settings:languageRegion.dateExample', 'Date')}
            </span>
            <span className="font-medium text-text-primary truncate block mt-0.5">
              {formatDate(sampleDate, activeEffectiveLocale)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-vf-panel-bg-raised border border-vf-panel-border">
            <span className="text-text-muted block text-[11px]">
              {t('settings:languageRegion.timeExample', 'Time')}
            </span>
            <span className="font-medium text-text-primary truncate block mt-0.5">
              {formatTime(sampleDate, activeEffectiveLocale)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-vf-panel-bg-raised border border-vf-panel-border">
            <span className="text-text-muted block text-[11px]">
              {t('settings:languageRegion.numberExample', 'Number')}
            </span>
            <span className="font-medium text-text-primary truncate block mt-0.5">
              {formatNumber(1234567.89, activeEffectiveLocale)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-vf-panel-bg-raised border border-vf-panel-border">
            <span className="text-text-muted block text-[11px]">
              {t('settings:languageRegion.bytesExample', 'File Size')}
            </span>
            <span className="font-medium text-text-primary truncate block mt-0.5">
              {formatBytes(15485760, activeEffectiveLocale)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
