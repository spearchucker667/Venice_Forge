import { cn } from '../../lib/utils'
import { Spinner } from './spinner'
import { RefreshCw } from 'lucide-react'

export function Label({ children, htmlFor, hint }: { children: React.ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label htmlFor={htmlFor} className="block text-[11.5px] font-semibold text-foreground-muted uppercase tracking-[0.08em]">
        {children}
      </label>
      {hint && <span className="text-[11px] text-foreground-subtle">{hint}</span>}
    </div>
  )
}

export function TextArea({ value, onChange, placeholder, rows = 3, ariaLabel, maxLength, autoFocus, id }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  ariaLabel?: string
  maxLength?: number
  autoFocus?: boolean
  id?: string
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      aria-label={ariaLabel ?? placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      className="w-full bg-input-bg border border-border rounded-lg px-3 py-2.5 text-[15px] text-input-fg outline-none focus:border-border-strong transition-colors resize-none placeholder:text-placeholder leading-relaxed"
    />
  )
}

export function PrimaryButton({ onClick, disabled, loading, children, ariaLabel, size = 'md' }: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  children: React.ReactNode
  ariaLabel?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizing = size === 'sm' ? 'py-1.5 text-[13px]' : size === 'lg' ? 'py-2.5 text-[15px]' : 'py-2 text-[14px]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      className={cn(
        'w-full rounded-lg font-medium transition-all duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2',
        sizing,
        !disabled && !loading
          ? 'bg-button-primary-bg text-button-primary-fg hover:bg-accent-hover active:scale-[0.99] shadow-sm'
          : 'bg-surface-muted text-disabled-fg cursor-not-allowed',
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2"><Spinner className="text-disabled-fg" /> Working…</span>
      ) : children}
    </button>
  )
}

export function GhostButton({ onClick, children, disabled, ariaLabel }: { onClick: () => void; children: React.ReactNode; disabled?: boolean; ariaLabel?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'px-3 py-1.5 text-[13px] font-medium rounded-lg border border-border bg-button-secondary-bg text-button-secondary-fg hover:border-border-strong hover:bg-surface-muted transition-colors disabled:text-disabled-fg disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2',
      )}
    >
      {children}
    </button>
  )
}

export function PillGroup({ options, value, onChange, ariaLabel }: {
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
  ariaLabel?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'text-[13px] font-medium px-2.5 py-1 rounded-md border transition-all duration-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-focus-ring',
            o.value === value
              ? 'border-border-strong bg-surface-muted text-foreground shadow-sm'
              : 'border-border text-foreground-muted hover:text-foreground hover:border-border-strong hover:bg-surface-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 text-[13px] text-red-300/95 bg-red-500/[0.06] border border-red-500/20 rounded-lg px-3 py-2">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-px">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span className="leading-relaxed">{children}</span>
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center flex-1 text-white/30 text-[14px]">{children}</div>
}

export function ExamplePrompts({ items, onPick, title = 'Try one of these', onShuffle }: {
  items: string[]
  onPick: (text: string) => void
  title?: string
  onShuffle?: () => void
}) {
  return (
    <div className="w-full max-w-md flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.08em] text-white/40 font-semibold">{title}</div>
        {onShuffle && (
          <button
            type="button"
            onClick={onShuffle}
            className="text-[11px] text-[var(--color-accent)] hover:opacity-85 flex items-center gap-1 cursor-pointer transition-opacity"
            title="Shuffle suggestions"
          >
            <RefreshCw className="w-3 h-3 animate-hover-spin" />
            Shuffle
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="group text-left px-3.5 py-3 rounded-xl border border-white/[0.06] bg-white/[0.015] hover:border-white/[0.16] hover:bg-white/[0.04] transition-all text-[13.5px] text-white/70 hover:text-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
          >
            <span className="flex items-start gap-2">
              <span className="text-white/25 group-hover:text-[var(--color-accent)] transition-colors mt-px">→</span>
              <span className="leading-relaxed">{text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-surface border border-white/[0.06] rounded-xl', className)}>
      {children}
    </div>
  )
}

export function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="text-[11px] uppercase tracking-[0.08em] text-white/40 font-semibold">{children}</h3>
      {action}
    </div>
  )
}

const TONE: Record<string, string> = {
  emerald: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/20',
  sky: 'bg-sky-400/15 text-sky-300 border-sky-400/20',
  violet: 'bg-violet-400/15 text-violet-300 border-violet-400/20',
  amber: 'bg-amber-400/15 text-amber-300 border-amber-400/20',
  pink: 'bg-pink-400/15 text-pink-300 border-pink-400/20',
  slate: 'bg-white/[0.05] text-white/60 border-white/10',
  rose: 'bg-rose-400/15 text-rose-300 border-rose-400/20',
  teal: 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] border-[var(--color-accent)]/30',
}

export function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: keyof typeof TONE }) {
  return (
    <span className={cn('inline-flex items-center text-[10px] px-1.5 py-px rounded font-medium uppercase tracking-wider border', TONE[tone] ?? TONE.slate)}>
      {children}
    </span>
  )
}

export function StatusDot({ tone = 'slate', pulsing }: { tone?: 'emerald' | 'amber' | 'rose' | 'slate' | 'teal'; pulsing?: boolean }) {
  const color = tone === 'emerald' ? 'bg-emerald-400'
    : tone === 'amber' ? 'bg-amber-400'
    : tone === 'rose' ? 'bg-rose-400'
    : tone === 'teal' ? 'bg-[var(--color-accent)]'
    : 'bg-white/30'
  return (
    <span className={cn('inline-block w-1.5 h-1.5 rounded-full', color, pulsing && 'animate-pulse-dot')} />
  )
}
