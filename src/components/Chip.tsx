import React from 'react';

interface ChipProps {
  children: React.ReactNode;
  tone?: string;
  className?: string;
}

const toneClasses: Record<string, string> = {
  ok: 'bg-accent/10 text-accent border-transparent',
  warn: 'bg-[rgba(212,168,67,0.12)] text-[var(--color-warning)] border-transparent',
  danger: 'bg-[rgba(239,68,68,0.12)] text-[var(--color-danger)] border-transparent',
  running: 'bg-accent/10 text-accent border-transparent',
  muted: 'bg-surface-elevated text-text-muted border-border',
  video: 'bg-[rgba(110,231,211,0.08)] text-accent border-transparent',
  default: 'bg-surface text-text-primary border-border'
};

export function Chip({ children, tone = "default", className = "" }: ChipProps) {
  const toneClass = toneClasses[tone] || toneClasses.default;

  return (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[12px] font-medium leading-normal border ${toneClass} ${className}`}>
      {children}
    </span>
  );
}