/**
 * @fileoverview Canonical typography and font service for Venice Forge.
 * Manages available font families, sizing boundaries, and runtime CSS application.
 */

export interface FontOption {
  id: string;
  name: string;
  family: string;
  category: 'mono' | 'sans' | 'serif';
  summary: string;
}

export const FONT_OPTIONS: readonly FontOption[] = [
  {
    id: 'meslo',
    name: 'MesloLGM Nerd Font',
    family: '"MesloLGM Nerd Font", monospace',
    category: 'mono',
    summary: 'Venice Forge signature monospace font', // i18n-allow: typography family technical summary
  },
  {
    id: 'inter',
    name: 'Inter',
    family: '"Inter", system-ui, -apple-system, sans-serif',
    category: 'sans',
    summary: 'Modern, highly readable geometric sans-serif', // i18n-allow: typography family technical summary
  },
  {
    id: 'jetbrains',
    name: 'JetBrains Mono',
    family: '"JetBrains Mono", monospace',
    category: 'mono',
    summary: 'Developer monospace with clear distinctions', // i18n-allow: typography family technical summary
  },
  {
    id: 'lora',
    name: 'Lora',
    family: '"Lora", Georgia, serif',
    category: 'serif',
    summary: 'Contemporary serif with literary warmth', // i18n-allow: typography family technical summary
  },
  {
    id: 'system-sans',
    name: 'System Sans',
    family: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    category: 'sans',
    summary: 'Native operating system sans-serif', // i18n-allow: typography family technical summary
  },
  {
    id: 'system-serif',
    name: 'System Serif',
    family: 'Georgia, Cambria, "Times New Roman", Times, serif',
    category: 'serif',
    summary: 'Classic operating system serif typography', // i18n-allow: typography family technical summary
  },
  {
    id: 'system-mono',
    name: 'System Monospace',
    family: 'ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace',
    category: 'mono',
    summary: 'Native operating system terminal monospace', // i18n-allow: typography family technical summary
  },
] as const;

export const DEFAULT_FONT_ID = 'meslo';
export const DEFAULT_FONT_SIZE = 16;
export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 24;

export function getFontOption(id: string): FontOption {
  return FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0];
}

export function clampFontSize(size: unknown): number {
  const numeric = typeof size === 'number' && Number.isFinite(size) ? size : DEFAULT_FONT_SIZE;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(numeric)));
}

/**
 * Apply font family and font size settings dynamically to the DOM root and body.
 */
export function applyFontSettings(fontId: string, fontSize: number): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const font = getFontOption(fontId);
  const clampedSize = clampFontSize(fontSize);

  root.style.setProperty('--app-font-family', font.family);
  root.style.setProperty('--font-sans', font.family);
  root.style.setProperty('--app-font-size', `${clampedSize}px`);
  root.style.fontSize = `${clampedSize}px`;

  if (document.body) {
    document.body.style.fontFamily = font.family;
  }
}
