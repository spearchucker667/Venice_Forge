import React from 'react';

interface ChipProps {
  children: React.ReactNode;
  tone?: string;
  className?: string;
}

const toneClasses: Record<string, string> = {
  ok: 'bg-accent/10 text-accent border-transparent',
  warn: 'bg-warning/10 text-warning border-transparent',
  danger: 'bg-danger/10 text-danger border-transparent',
  running: 'bg-accent/10 text-accent border-transparent',
  muted: 'bg-vf-panel-bg-raised text-text-muted border-vf-panel-border',
  video: 'bg-info/10 text-info border-transparent',
  default: 'bg-vf-panel-bg text-text-primary border-vf-panel-border'
};

export function Chip({ children, tone = "default", className = "" }: ChipProps) {
  const toneClass = toneClasses[tone] || toneClasses.default;

  return (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[12px] font-medium leading-normal border ${toneClass} ${className}`}>
      {children}
    </span>
  );
}