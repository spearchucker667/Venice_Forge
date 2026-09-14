import React, { useEffect, useRef } from "react";
import { completeThemeTokens, type Theme } from "../theme/themeTypes";
import { contrastRatio } from "../theme/contrast";
import { highlightCode } from "./chat/codeHighlighting";
import { Trans, useTranslation } from "react-i18next";

export function ThemePreview({ theme }: { theme: Theme }) {
  const { t: translate } = useTranslation("common");
  const t = completeThemeTokens(theme.mode, theme.tokens);
  const containerRef = useRef<HTMLDivElement>(null);
  const warnings: string[] = [];
  const ratios = [
    { name: "Foreground / Background", fg: t.foreground, bg: t.background },
    {
      name: "Muted foreground / Surface",
      fg: t.foregroundMuted,
      bg: t.surface,
    },
    {
      name: "Accent foreground / Accent",
      fg: t.accentForeground,
      bg: t.accent,
    },
    {
      name: "Input foreground / Input background",
      fg: t.inputForeground,
      bg: t.inputBackground,
    },
    {
      name: "Danger foreground / Danger",
      fg: t.dangerForeground,
      bg: t.danger,
    },
    {
      name: "Warning foreground / Warning",
      fg: t.warningForeground,
      bg: t.warning,
    },
    {
      name: "Success foreground / Success",
      fg: t.successForeground,
      bg: t.success,
    },
  ];
  ratios.forEach((r) => {
    const ratio = contrastRatio(r.fg, r.bg);
    if (ratio < 4.5) {
      warnings.push(
        `${translate(`themeEditor.contrast.${r.name}`)}: ${ratio.toFixed(2)}:1 (AA: 4.5:1)`,
      );
    }
  });

  const c = theme.code.tokens;
  const codeRatios = [
    {
      name: "Code foreground / background",
      fg: c.foreground,
      bg: c.background,
    },
    {
      name: "Inline code foreground / background",
      fg: c.inlineForeground,
      bg: c.inlineBackground,
    },
    {
      name: "Code header foreground / background",
      fg: c.headerForeground,
      bg: c.headerBackground,
    },
    { name: "Code string / background", fg: c.string, bg: c.background },
    { name: "Code keyword / background", fg: c.keyword, bg: c.background },
    { name: "Code function / background", fg: c.function, bg: c.background },
    { name: "Code comment / background", fg: c.comment, bg: c.background },
  ];
  codeRatios.forEach((r) => {
    const ratio = contrastRatio(r.fg, r.bg);
    if (ratio < 4.5) {
      warnings.push(
        `${translate(`themeEditor.contrast.${r.name}`)}: ${ratio.toFixed(2)}:1 (AA: 4.5:1)`,
      );
    }
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.setProperty("--preview-bg", t.background);
    el.style.setProperty("--preview-border", t.border);
    el.style.setProperty("--preview-border-strong", t.borderStrong);
    el.style.setProperty("--preview-surface", t.surface);
    el.style.setProperty("--preview-surface-elevated", t.surfaceElevated);
    el.style.setProperty("--preview-text-primary", t.foreground);
    el.style.setProperty("--preview-text-secondary", t.foregroundMuted);
    el.style.setProperty("--preview-text-muted", t.foregroundSubtle);
    el.style.setProperty("--preview-accent", t.accent);
    el.style.setProperty("--preview-accent-fg", t.accentForeground);
    el.style.setProperty("--preview-focus-ring", t.focusRing);
    el.style.setProperty("--preview-input-bg", t.inputBackground);
    el.style.setProperty("--preview-input-fg", t.inputForeground);
    el.style.setProperty("--preview-btn-sec-bg", t.buttonSecondaryBackground);
    el.style.setProperty("--preview-btn-sec-fg", t.buttonSecondaryForeground);
    el.style.setProperty("--preview-selection-bg", t.selectionBackground);
    el.style.setProperty("--preview-selection-fg", t.selectionForeground);
    el.style.setProperty("--preview-danger", t.dangerForeground);
    el.style.setProperty(
      "--preview-danger-bg",
      `color-mix(in srgb, ${t.danger} 12%, transparent)`,
    );
    el.style.setProperty(
      "--preview-danger-border",
      `color-mix(in srgb, ${t.danger} 25%, transparent)`,
    );

    const c = theme.code.tokens;
    el.style.setProperty("--preview-code-bg", c.background);
    el.style.setProperty("--preview-code-fg", c.foreground);
    el.style.setProperty("--preview-code-border", c.border);
    el.style.setProperty("--preview-code-header-bg", c.headerBackground);
    el.style.setProperty("--preview-code-header-fg", c.headerForeground);
    el.style.setProperty("--preview-code-inline-bg", c.inlineBackground);
    el.style.setProperty("--preview-code-inline-fg", c.inlineForeground);
    el.style.setProperty("--preview-code-selection-bg", c.selectionBackground);
    el.style.setProperty("--syntax-comment", c.comment);
    el.style.setProperty("--syntax-punctuation", c.punctuation);
    el.style.setProperty("--syntax-property", c.property);
    el.style.setProperty("--syntax-tag", c.tag);
    el.style.setProperty("--syntax-boolean", c.boolean);
    el.style.setProperty("--syntax-number", c.number);
    el.style.setProperty("--syntax-constant", c.constant);
    el.style.setProperty("--syntax-symbol", c.symbol);
    el.style.setProperty("--syntax-deleted", c.deleted);
    el.style.setProperty("--syntax-selector", c.selector);
    el.style.setProperty("--syntax-attribute", c.attribute);
    el.style.setProperty("--syntax-string", c.string);
    el.style.setProperty("--syntax-character", c.character);
    el.style.setProperty("--syntax-builtin", c.builtin);
    el.style.setProperty("--syntax-inserted", c.inserted);
    el.style.setProperty("--syntax-operator", c.operator);
    el.style.setProperty("--syntax-entity", c.entity);
    el.style.setProperty("--syntax-url", c.url);
    el.style.setProperty("--syntax-atrule", c.atRule);
    el.style.setProperty("--syntax-keyword", c.keyword);
    el.style.setProperty("--syntax-function", c.function);
    el.style.setProperty("--syntax-class-name", c.className);
    el.style.setProperty("--syntax-regex", c.regex);
    el.style.setProperty("--syntax-important", c.important);
    el.style.setProperty("--syntax-variable", c.variable);
  }, [t, theme.code.tokens]);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="rounded-xl border p-4 space-y-3 bg-[var(--preview-bg)] border-[var(--preview-border)]"
      >
        {/* Header mock */}
        <div className="flex items-center justify-between rounded-lg px-3 py-2 bg-[var(--preview-surface)] border border-[var(--preview-border)]">
          <span className="text-[var(--preview-text-primary)] font-semibold">
            <Trans i18nKey="common:surface.componentsThemepreview.text.forge" />
          </span>
          <span className="text-[var(--preview-text-muted)] text-[12px]">
            <Trans i18nKey="common:surface.componentsThemepreview.text.status" />
          </span>
        </div>
        {/* Sidebar + Content mock */}
        <div className="flex gap-2">
          <div className="w-1/3 rounded-lg p-2 space-y-1 bg-[var(--preview-surface)] border border-[var(--preview-border)]">
            <div className="rounded px-2 py-1 text-xs bg-[var(--preview-accent)] text-[var(--preview-accent-fg)] font-medium">
              <Trans i18nKey="common:surface.componentsThemepreview.text.activeItem" />
            </div>
            <div className="rounded px-2 py-1 text-xs text-[var(--preview-text-secondary)]">
              <Trans i18nKey="common:surface.componentsThemepreview.text.inactiveItem" />
            </div>
            <div className="rounded px-2 py-1 text-xs bg-[var(--preview-selection-bg)] text-[var(--preview-selection-fg)]">
              <Trans i18nKey="common:surface.componentsThemepreview.text.selectedItem" />
            </div>
          </div>
          <div className="flex-1 rounded-lg p-3 space-y-2 bg-[var(--preview-surface-elevated)] border border-[var(--preview-border-strong)]">
            <div className="h-2 rounded w-3/4 bg-[var(--preview-text-muted)]" />
            <div className="h-2 rounded w-1/2 bg-[var(--preview-text-muted)]" />
            <div className="pt-2 flex flex-wrap gap-2">
              <div className="rounded px-3 py-1 text-xs font-medium bg-[var(--preview-accent)] text-[var(--preview-accent-fg)]">
                <Trans i18nKey="common:surface.componentsThemepreview.text.primaryButton" />
              </div>
              <div className="rounded px-3 py-1 text-xs font-medium border border-[var(--preview-border)] bg-[var(--preview-btn-sec-bg)] text-[var(--preview-btn-sec-fg)]">
                <Trans i18nKey="common:surface.componentsThemepreview.text.secondary" />
              </div>
            </div>
          </div>
        </div>
        {/* Input & Focus ring mock */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg px-3 py-2 text-sm bg-[var(--preview-input-bg)] border border-[var(--preview-border)] text-[var(--preview-input-fg)]">
            <Trans i18nKey="common:surface.componentsThemepreview.text.inputField" />
          </div>
          <div className="rounded-lg px-3 py-2 text-sm bg-[var(--preview-input-bg)] border border-[var(--preview-border-strong)] text-[var(--preview-input-fg)] outline outline-2 outline-[var(--preview-focus-ring)] outline-offset-1">
            <Trans i18nKey="common:surface.componentsThemepreview.text.focusedControl" />
          </div>
        </div>
        {/* Alert mock */}
        <div className="rounded-lg px-3 py-2 text-xs bg-[var(--preview-danger-bg)] border border-[var(--preview-danger-border)] text-[var(--preview-danger)]">
          <Trans i18nKey="common:surface.componentsThemepreview.text.alertMessageBoundary" />
        </div>

        {/* Code preview */}
        <div className="rounded-lg border overflow-hidden bg-[var(--preview-code-bg)] border-[var(--preview-code-border)]">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--preview-code-border)] bg-[var(--preview-code-header-bg)]">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--preview-code-header-fg)] select-none">
              <Trans i18nKey="common:surface.componentsThemepreview.text.syntaxPreview" />
            </span>
          </div>
          <div className="p-3 overflow-x-auto text-[13px] leading-relaxed">
            <pre className="m-0 p-0 bg-transparent border-none">
              <code className="font-mono text-[var(--preview-code-fg)] bg-transparent border-none p-0">
                {highlightCode(
                  `type ThemeMode = "light" | "dark";

export function resolveTheme(name: string, enabled = true) {
  const count = 42;
  // Theme-aware syntax preview
  return enabled ? \`\${name}:\${count}\` : null;
}`,
                  "typescript",
                )}
              </code>
            </pre>
          </div>
        </div>
      </div>
      {warnings.length > 0 && (
        <div
          className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning"
          aria-live="polite"
        >
          <strong>
            <Trans i18nKey="common:surface.componentsThemepreview.text.contrastWarnings" />
          </strong>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
