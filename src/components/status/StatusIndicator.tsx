/** @fileoverview Phase 2C status indicator (one per category in the
 *  header status cluster + diagnostics drawer). */

import type { StatusSeverity } from "../../types/status";

/* ----------------------------------------------------------------- *
 * Tone → CSS class mapping. The class is composed with the existing
 * theme tokens (text-text-*, bg-*, border-*) so no inline colours are
 * emitted. This keeps the status cluster consistent across themes and
 * the 29-role canonical semantic contract (VERIFY-041).
 * ----------------------------------------------------------------- */

const TONE_CLASS: Record<StatusSeverity, string> = {
  ok: "bg-success/15 text-success border-success/30",
  warn: "bg-warning/15 text-warning border-warning/30",
  error: "bg-danger/15 text-danger border-danger/30",
  unknown: "bg-surface-muted text-text-muted border-border",
};

const DOT_CLASS: Record<StatusSeverity, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-danger",
  unknown: "bg-text-muted",
};

const LABEL_PREFIX: Record<StatusSeverity, string> = {
  ok: "OK",
  warn: "Warn",
  error: "Error",
  unknown: "Unknown",
};

export function getIndicatorToneClass(severity: StatusSeverity): string {
  return TONE_CLASS[severity];
}

export function getIndicatorDotClass(severity: StatusSeverity): string {
  return DOT_CLASS[severity];
}

export function getIndicatorAriaLabel(severity: StatusSeverity, label: string): string {
  return `${label}: ${LABEL_PREFIX[severity]}`;
}

export interface StatusIndicatorProps {
  id: string;
  label: string;
  severity: StatusSeverity;
  summary: string;
  onClick?: () => void;
  /** When true, renders a compact "dot + label" suitable for narrow
   *  layouts. Default false (full chip). */
  compact?: boolean;
}

/** A single clickable status chip rendered in the header cluster. */
export function StatusIndicator({
  id,
  label,
  severity,
  summary,
  onClick,
  compact = false,
}: StatusIndicatorProps) {
  const interactive = typeof onClick === "function"
  const Tag = interactive ? "button" : "div"
  const tagProps = interactive
    ? ({
        type: "button" as const,
        onClick,
        "aria-label": getIndicatorAriaLabel(severity, label),
        title: summary,
        "data-testid": `status-indicator-${id}`,
        "data-severity": severity,
      })
    : ({
        "aria-label": getIndicatorAriaLabel(severity, label),
        title: summary,
        "data-testid": `status-indicator-${id}`,
        "data-severity": severity,
      })
  return (
    <Tag
      {...tagProps}
      className={[
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]",
        TONE_CLASS[severity],
        interactive ? "cursor-pointer hover:brightness-110" : "",
        compact ? "min-w-0" : "",
      ].join(" ")}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_CLASS[severity]}`}
        data-severity-dot={severity}
      />
      <span className="text-text-primary/80">{label}</span>
      {!compact && (
        <span className="text-text-muted/70 text-[12px] hidden lg:inline">
          {LABEL_PREFIX[severity]}
        </span>
      )}
    </Tag>
  )
}
