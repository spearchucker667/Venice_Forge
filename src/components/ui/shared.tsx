import { cn } from '../../lib/utils'
import { Spinner } from './spinner'

export function Label({ children, htmlFor, hint }: { children: React.ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label htmlFor={htmlFor} className="block text-[11.5px] font-semibold text-white/55 uppercase tracking-[0.08em]">
        {children}
      </label>
      {hint && <span className="text-[11px] text-white/35">{hint}</span>}
    </div>
  )
}

export function TextArea({ value, onChange, placeholder, rows = 3, ariaLabel, maxLength, autoFocus }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  ariaLabel?: string
  maxLength?: number
  autoFocus?: boolean
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      aria-label={ariaLabel ?? placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      className="w-full bg-[#0d0d11] border border-white/[0.08] rounded-lg px-3 py-2.5 text-[15px] text-white/90 outline-none focus:border-white/[0.22] transition-colors resize-none placeholder:text-white/25 leading-relaxed"
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
        'w-full rounded-lg font-medium transition-all duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
        sizing,
        !disabled && !loading
          ? 'bg-white text-black hover:bg-white/90 active:scale-[0.99] shadow-sm'
          : 'bg-white/[0.06] text-white/30 cursor-not-allowed',
      )}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2"><Spinner className="text-white/45" /> Working…</span>
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
        'px-3 py-1.5 text-[13px] font-medium rounded-lg border border-white/[0.1] text-white/70 hover:text-white hover:border-white/[0.2] hover:bg-white/[0.03] transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
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
            'text-[13px] font-medium px-2.5 py-1 rounded-md border transition-all duration-100 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]',
            o.value === value
              ? 'border-white/15 bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
              : 'border-white/[0.06] text-white/55 hover:text-white/85 hover:border-white/[0.14] hover:bg-white/[0.02]',
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

export function ExamplePrompts({ items, onPick, title = 'Try one of these' }: {
  items: string[]
  onPick: (text: string) => void
  title?: string
}) {
  return (
    <div className="w-full max-w-md flex flex-col gap-2.5">
      <div className="text-[11px] uppercase tracking-[0.08em] text-white/40 font-semibold">{title}</div>
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
    <div className={cn('bg-[#111114] border border-white/[0.06] rounded-xl', className)}>
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
