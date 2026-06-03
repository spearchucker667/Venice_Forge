import React from 'react';

const toneClasses: Record<string, string> = {
  ok: "text-success border-success/30 bg-success/10",
  warn: "text-warning border-warning/30 bg-warning/10",
  danger: "text-danger border-danger/30 bg-danger/10",
  running: "text-accent border-accent/40 bg-accent/10",
  muted: "text-text-muted border-border/30 bg-surface/50",
  video: "text-brand-300 border-brand-700/40 bg-brand-900/35",
  default: "text-text-primary border-border/50 bg-surface/80 shadow-sm"
};

export function Chip({ children, tone = "", className = "" }: { children: React.ReactNode; tone?: string; className?: string }) {
  const baseClasses = "inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-[11px] font-medium leading-snug transition-all duration-200 border";
  const appliedTone = toneClasses[tone] || toneClasses.default;

  return (
    <span className={`${baseClasses} ${appliedTone} ${className}`.trim()}>
      {children}
    </span>
  );
}
