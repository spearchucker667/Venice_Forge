import React, { useEffect, useRef } from "react";
import { completeThemeTokens, type Theme } from "../theme/themeTypes";
import { contrastRatio } from "../theme/contrast";

export function ThemePreview({ theme }: { theme: Theme }) {
  const t = completeThemeTokens(theme.mode, theme.tokens);
  const containerRef = useRef<HTMLDivElement>(null);
  const warnings: string[] = [];
  const ratios = [
    { name: "Foreground / Background", fg: t.foreground, bg: t.background },
    { name: "Muted foreground / Surface", fg: t.foregroundMuted, bg: t.surface },
    { name: "Accent foreground / Accent", fg: t.accentForeground, bg: t.accent },
    { name: "Input foreground / Input background", fg: t.inputForeground, bg: t.inputBackground },
    { name: "Danger foreground / Danger", fg: t.dangerForeground, bg: t.danger },
    { name: "Warning foreground / Warning", fg: t.warningForeground, bg: t.warning },
    { name: "Success foreground / Success", fg: t.successForeground, bg: t.success },
  ];
  ratios.forEach((r) => {
    const ratio = contrastRatio(r.fg, r.bg);
    if (ratio < 4.5) {
      warnings.push(`${r.name}: ${ratio.toFixed(2)}:1 (AA: 4.5:1)`);
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
    el.style.setProperty("--preview-danger-bg", `${t.danger}20`);
    el.style.setProperty("--preview-danger-border", `${t.danger}40`);
  }, [t]);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="rounded-xl border p-4 space-y-3 bg-[var(--preview-bg)] border-[var(--preview-border)]"
      >
        {/* Header mock */}
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2 bg-[var(--preview-surface)] border border-[var(--preview-border)]"
        >
          <span className="text-[var(--preview-text-primary)] font-semibold">Forge</span>
          <span className="text-[var(--preview-text-muted)] text-[12px]">Status</span>
        </div>
        {/* Sidebar + Content mock */}
        <div className="flex gap-2">
          <div
            className="w-1/3 rounded-lg p-2 space-y-1 bg-[var(--preview-surface)] border border-[var(--preview-border)]"
          >
            <div className="rounded px-2 py-1 text-xs bg-[var(--preview-accent)] text-[var(--preview-accent-fg)] font-medium">
              Active item
            </div>
            <div className="rounded px-2 py-1 text-xs text-[var(--preview-text-secondary)]">
              Inactive item
            </div>
            <div className="rounded px-2 py-1 text-xs bg-[var(--preview-selection-bg)] text-[var(--preview-selection-fg)]">
              Selected item
            </div>
          </div>
          <div
            className="flex-1 rounded-lg p-3 space-y-2 bg-[var(--preview-surface-elevated)] border border-[var(--preview-border-strong)]"
          >
            <div className="h-2 rounded w-3/4 bg-[var(--preview-text-muted)]" />
            <div className="h-2 rounded w-1/2 bg-[var(--preview-text-muted)]" />
            <div className="pt-2 flex flex-wrap gap-2">
              <div
                className="rounded px-3 py-1 text-xs font-medium bg-[var(--preview-accent)] text-[var(--preview-accent-fg)]"
              >
                Primary Button
              </div>
              <div
                className="rounded px-3 py-1 text-xs font-medium border border-[var(--preview-border)] bg-[var(--preview-btn-sec-bg)] text-[var(--preview-btn-sec-fg)]"
              >
                Secondary
              </div>
            </div>
          </div>
        </div>
        {/* Input & Focus ring mock */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-lg px-3 py-2 text-sm bg-[var(--preview-input-bg)] border border-[var(--preview-border)] text-[var(--preview-input-fg)]"
          >
            Input field…
          </div>
          <div
            className="rounded-lg px-3 py-2 text-sm bg-[var(--preview-input-bg)] border border-[var(--preview-border-strong)] text-[var(--preview-input-fg)] outline outline-2 outline-[var(--preview-focus-ring)] outline-offset-1"
          >
            Focused control
          </div>
        </div>
        {/* Alert mock */}
        <div
          className="rounded-lg px-3 py-2 text-xs bg-[var(--preview-danger-bg)] border border-[var(--preview-danger-border)] text-[var(--preview-danger)]"
        >
          Alert message boundary
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning" aria-live="polite">
          <strong>Contrast warnings:</strong>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
