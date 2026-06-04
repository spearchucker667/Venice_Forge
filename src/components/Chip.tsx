import React from 'react';

interface ChipProps {
  children: React.ReactNode;
  tone?: string;
  className?: string;
  style?: React.CSSProperties;
}

const toneStyles: Record<string, { bg: string; color: string; border: string }> = {
  ok: { bg: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid transparent' },
  warn: { bg: 'rgba(212, 168, 67, 0.12)', color: 'var(--warning)', border: '1px solid transparent' },
  danger: { bg: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)', border: '1px solid transparent' },
  running: { bg: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid transparent' },
  muted: { bg: 'var(--surface-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
  video: { bg: 'rgba(110, 231, 211, 0.08)', color: 'var(--accent)', border: '1px solid transparent' },
  default: { bg: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
};

export function Chip({ children, tone = "default", className = "", style }: ChipProps) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.25rem 0.625rem',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: 1.4,
    ...toneStyles[tone] || toneStyles.default,
    ...style
  };

  return (
    <span className={className} style={baseStyle}>
      {children}
    </span>
  );
}