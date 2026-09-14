import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { Type, RotateCcw } from "lucide-react";
import {
  FONT_OPTIONS,
  DEFAULT_FONT_ID,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  getFontOption,
} from "../../services/fontService";
import { useSettingsStore } from "../../stores/settings-store";

export function FontSettingsPanel(): React.ReactElement {
  const { t } = useTranslation(['settings', 'common']);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const setFontFamily = useSettingsStore((s) => s.setFontFamily);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const resetFontSettings = useSettingsStore((s) => s.resetFontSettings);

  const selectId = useId();
  const sliderId = useId();

  const activeFont = getFontOption(fontFamily);
  const isDefault = fontFamily === DEFAULT_FONT_ID && fontSize === DEFAULT_FONT_SIZE;
  const percent = Math.round((fontSize / DEFAULT_FONT_SIZE) * 100);

  return (
    <div className="rounded-xl border border-border bg-surface-elevated/40 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2.5">
          <Type className="w-4 h-4 text-accent" />
          <div>
            <h3 className="vf-body font-medium text-text-primary">
              {t('settings:font.title', 'Typography & Font Settings')}
            </h3>
            <p className="vf-meta text-text-muted mt-0.5">
              {t('settings:font.description', 'Choose the application font family and adjust interface text scaling.')}
            </p>
          </div>
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={resetFontSettings}
            className="px-2.5 py-1 rounded-md vf-meta font-medium border border-border hover:bg-surface-muted text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 opacity-75" />
            {t('settings:font.reset', 'Reset to Default')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Font Family Selection */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={selectId} className="vf-meta font-medium text-text-primary">
              {t('settings:font.familyLabel', 'Font Family')}
            </label>
            <span className="vf-tag px-1.5 py-0.5 rounded bg-surface-muted text-text-muted border border-border/50 uppercase tracking-wider font-mono">
              {activeFont.category}
            </span>
          </div>
          <select
            id={selectId}
            aria-label={t('settings:font.familyLabel', 'Font Family')}
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 vf-body text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} data-font-preview={opt.id}>
                {opt.name} — {opt.summary}
              </option>
            ))}
          </select>
          <p className="vf-meta text-text-muted">
            {t('settings:font.familyDescription', 'Select the typeface for interface text and content.')}
          </p>
        </div>

        {/* Font Size Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={sliderId} className="vf-meta font-medium text-text-primary">
              {t('settings:font.sizeLabel', 'Font Size Scale')}
            </label>
            <span className="vf-tag font-mono font-medium text-accent px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20">
              {
                // i18n-allow-next-line: typography percentage scale indicator
                `${fontSize}px (${percent}%${fontSize === DEFAULT_FONT_SIZE ? ` · ${t('settings:font.default', 'Default')}` : ''})`
              }
            </span>
          </div>
          <div className="pt-1.5 pb-1">
            <input
              id={sliderId}
              type="range"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              aria-label={t('settings:font.sizeLabel', 'Font Size Scale')}
              aria-valuetext={
                fontSize === DEFAULT_FONT_SIZE
                  ? t('settings:font.rangeValuetextDefault', '{{pixels}} pixels, {{percent}} percent, default', { pixels: fontSize, percent })
                  : t('settings:font.rangeValuetext', '{{pixels}} pixels, {{percent}} percent', { pixels: fontSize, percent })
              }
              className="w-full accent-accent cursor-pointer"
            />
            <div className="flex justify-between vf-tag text-text-muted mt-1 font-mono">
              <span>
                {
                  // i18n-allow-next-line: typography percentage scale indicator
                  `${MIN_FONT_SIZE}px (75%)`
                }
              </span>
              <span className={fontSize === DEFAULT_FONT_SIZE ? 'text-accent font-semibold' : ''}>
                {
                  // i18n-allow-next-line: typography percentage scale indicator
                  '16px (100%)'
                }
              </span>
              <span>
                {
                  // i18n-allow-next-line: typography percentage scale indicator
                  `${MAX_FONT_SIZE}px (150%)`
                }
              </span>
            </div>
          </div>
          <p className="vf-meta text-text-muted">
            {t('settings:font.sizeDescription', 'Adjust interface typography scaling relative to the default size.')}
          </p>
        </div>
      </div>

      {/* Live Typography Preview */}
      <div className="rounded-lg border border-border/60 bg-surface p-4 space-y-2">
        <div className="flex items-center justify-between border-b border-border/40 pb-2">
          <span className="vf-tag font-medium text-text-muted uppercase tracking-wider">
            {t('settings:font.preview', 'Live Typography Preview')}
          </span>
          <span className="vf-tag text-text-muted font-mono">
            {activeFont.name} · {fontSize}px
          </span>
        </div>
        <div data-font-preview={activeFont.id} className="space-y-1.5 pt-1">
          <div className="font-preview-heading font-semibold text-text-primary">
            {t('settings:font.previewHeading', 'The Quietly Confident AI Workspace')}
          </div>
          <p className="font-preview text-text-secondary leading-relaxed">
            {t('settings:font.previewBody', 'Venice Forge provides private AI chat, scene composition, and multimodal generation.')}
          </p>
          <div className="p-2 rounded bg-surface-elevated border border-border/50 text-text-muted font-mono vf-meta">
            <code>
              {
                // i18n-allow-next-line: technical typography preview code snippet
                `const client = new VeniceClient({ font: "${activeFont.id}", size: ${fontSize} });`
              }
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
