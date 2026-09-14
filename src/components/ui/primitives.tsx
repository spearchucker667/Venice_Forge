/**
 * VF Design System 2026-09-13 — primitive components.
 *
 * These primitives are the shared visual vocabulary of the chat surface
 * (and any future surface). They consume the design tokens defined in
 * src/styles/theme.css and src/styles/components.css and intentionally
 * avoid inline `style` props or hardcoded color literals.
 *
 * Conventions:
 * - Use `data-tone` and `data-size` attributes when a primitive is
 *   styled by CSS in components.css. Avoids stringly-typed classNames.
 * - Icons are passed as ReactNode so callers can keep their inline SVG
 *   approach (consistent with the project's current icon strategy).
 * - All interactive primitives have explicit focus-visible styles and
 *   aria-label requirements documented on the prop.
 */
import * as React from 'react'
import { cn } from '../../lib/utils'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'
type Size = 'sm' | 'md' | 'lg'

/* ---------------------------------------------------------------------------
 * IconButton
 * Single icon-only button. The caller MUST pass an aria-label or a
 * labelledby target. Icons are rendered at the requested pixel size.
 * ------------------------------------------------------------------------- */
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The icon node (typically an inline SVG, see project convention). */
  icon: React.ReactNode
  /** Required for screen readers. */
  ariaLabel: string
  /** Visual tone; affects hover color. */
  tone?: Tone
  /** Pixel size of the button; the icon scales with it. */
  size?: Size
  /** Render as a plain button. If true, the primitive becomes a div
   *  with role="button" and keyboard handling — used only when the
   *  surrounding markup genuinely requires non-button semantics. */
  asPlainButton?: boolean
  /** When true, renders a subtle filled surface (used inside the
   *  message-bubble action bar). Default false keeps it borderless. */
  filled?: boolean
}

const ICON_BUTTON_SIZE: Record<Size, { box: string; icon: number }> = {
  sm: { box: 'h-7 w-7', icon: 14 },
  md: { box: 'h-9 w-9', icon: 16 },
  lg: { box: 'h-10 w-10', icon: 18 },
}

const ICON_BUTTON_TONE: Record<Tone, string> = {
  neutral: 'text-text-secondary hover:text-text-primary',
  accent: 'text-text-secondary hover:text-accent',
  success: 'text-text-secondary hover:text-success',
  warning: 'text-text-secondary hover:text-warning',
  danger: 'text-text-secondary hover:text-danger',
  info: 'text-text-secondary hover:text-accent',
}

export function IconButton({
  icon,
  ariaLabel,
  tone = 'neutral',
  size = 'md',
  filled = false,
  asPlainButton = false,
  className,
  type,
  ...rest
}: IconButtonProps) {
  const sizing = ICON_BUTTON_SIZE[size]
  const toneClasses = ICON_BUTTON_TONE[tone]
  const cls = cn(
    'inline-flex items-center justify-center rounded-md transition-colors duration-100',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2',
    'disabled:text-disabled-fg disabled:cursor-not-allowed',
    sizing.box,
    filled
      ? 'bg-surface-overlay hover:bg-surface-elevated border border-border-soft'
      : 'hover:bg-surface-elevated',
    toneClasses,
    className,
  )

  if (asPlainButton) {
    const { disabled, onClick, onKeyDown, ...plainRest } = rest
    const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
      const handleCallerKeyDown = onKeyDown as unknown as
        | React.KeyboardEventHandler<HTMLDivElement>
        | undefined
      handleCallerKeyDown?.(event)
      if (event.defaultPrevented || disabled) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.currentTarget.click()
      }
    }

    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        className={cls}
        onClick={
          disabled
            ? undefined
            : (onClick as unknown as React.MouseEventHandler<HTMLDivElement>)
        }
        onKeyDown={handleKeyDown}
        {...(plainRest as unknown as React.HTMLAttributes<HTMLDivElement>)}
      >
        {icon}
      </div>
    )
  }

  return (
    <button
      type={type ?? 'button'}
      aria-label={ariaLabel}
      className={cls}
      {...rest}
    >
      {icon}
    </button>
  )
}

/* ---------------------------------------------------------------------------
 * Pill — small status / category badge with semantic tone.
 * Distinct from PillGroup (which is a filter selector). Use Pill for
 * labels like "Streaming", "Cached", "Voice", "Image".
 * ------------------------------------------------------------------------- */
export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  /** When true, use a more saturated fill (for selected states). */
  solid?: boolean
  /** Optional small leading icon (typically an inline SVG). */
  leading?: React.ReactNode
}

const PILL_TONE: Record<Tone, string> = {
  neutral: 'text-text-secondary bg-surface-overlay border-border-soft',
  accent: 'text-accent bg-accent/10 border-accent/20',
  success: 'text-success bg-success/10 border-success/20',
  warning: 'text-warning bg-warning/10 border-warning/20',
  danger: 'text-danger bg-danger/10 border-danger/20',
  info: 'text-accent bg-accent/10 border-accent/20',
}

const PILL_TONE_SOLID: Record<Tone, string> = {
  neutral: 'bg-surface-elevated text-text-primary border-border',
  accent: 'bg-accent text-button-primary-fg border-accent',
  success: 'bg-success text-success-fg border-success',
  warning: 'bg-warning text-warning-fg border-warning',
  danger: 'bg-danger text-danger-fg border-danger',
  info: 'bg-accent text-button-primary-fg border-accent',
}

export function Pill({
  tone = 'neutral',
  solid = false,
  leading,
  className,
  children,
  ...rest
}: PillProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'vf-tag',
        solid ? PILL_TONE_SOLID[tone] : PILL_TONE[tone],
        className,
      )}
      {...rest}
    >
      {leading && <span className="inline-flex">{leading}</span>}
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * Toolbar — horizontal action group used by message bubbles, headers,
 * and inline editor strips. Items can be buttons, pills, or arbitrary
 * nodes (passed as children). The toolbar itself is non-semantic and
 * delegates a11y to its children.
 * ------------------------------------------------------------------------- */
export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: Size
  /** When true, removes the background surface. */
  bare?: boolean
  /** Alignment of items when they overflow. */
  align?: 'start' | 'center' | 'end'
  /** Explicitly opt in to role="toolbar". When false and unlabelled, Toolbar is a visual action group without role="toolbar". */
  asToolbar?: boolean
}

const TOOLBAR_GAP: Record<Size, string> = {
  sm: 'gap-0.5',
  md: 'gap-1',
  lg: 'gap-1.5',
}

const TOOLBAR_ALIGN: Record<NonNullable<ToolbarProps['align']>, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
}

export function Toolbar({
  size = 'md',
  bare = false,
  align = 'start',
  asToolbar = false,
  role,
  className,
  children,
  ...rest
}: ToolbarProps) {
  // Option A (VF-CUR-P3-010): Do not emit role="toolbar" by default for generic action groups.
  // Emit role="toolbar" only when explicitly requested (asToolbar / role="toolbar") or when an
  // accessible label is supplied.
  const resolvedRole =
    role !== undefined
      ? role
      : asToolbar || rest['aria-label'] || rest['aria-labelledby']
        ? 'toolbar'
        : undefined

  return (
    <div
      role={resolvedRole}
      data-toolbar-size={size}
      className={cn(
        'inline-flex items-center',
        TOOLBAR_ALIGN[align],
        TOOLBAR_GAP[size],
        !bare && 'vf-action-bar',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Card — a generic elevated surface for grouped content.
 * ------------------------------------------------------------------------- */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual elevation: "flat" (border only), "elevated" (border + soft
   *  shadow), "elevated-2" (top tier, used for primary modals). */
  elevation?: 'flat' | 'elevated' | 'elevated-2'
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  padded?: boolean
}

const CARD_ELEVATION: Record<NonNullable<CardProps['elevation']>, string> = {
  flat: 'border border-border bg-surface',
  elevated: 'border border-border-soft bg-surface-elevated shadow-sm',
  'elevated-2': 'surface-elevated-2 shadow-md',
}

const CARD_TONE: Record<NonNullable<CardProps['tone']>, string> = {
  neutral: '',
  accent: 'border-accent/30',
  success: 'border-success/30',
  warning: 'border-warning/30',
  danger: 'border-danger/30',
}

export function Card({
  elevation = 'elevated',
  tone = 'neutral',
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      data-elevation={elevation}
      data-tone={tone}
      className={cn(
        'rounded-xl',
        CARD_ELEVATION[elevation],
        CARD_TONE[tone],
        padded && 'p-4',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * EmptyState — illustration + headline + helper + optional CTA.
 * This supersedes the basic EmptyState in shared.tsx for surfaces that
 * need a real visual treatment. shared.tsx's EmptyState remains for
 * trivial placeholder uses.
 * ------------------------------------------------------------------------- */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Small uppercase eyebrow label above the headline. */
  eyebrow?: React.ReactNode
  /** Required primary headline. */
  headline: React.ReactNode
  /** Supporting copy below the headline. */
  helper?: React.ReactNode
  /** Optional illustration node (typically an inline SVG). */
  illustration?: React.ReactNode
  /** Optional CTA region. */
  action?: React.ReactNode
}

export function EmptyState({
  eyebrow,
  headline,
  helper,
  illustration,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn('vf-empty-state', className)}
      {...rest}
    >
      {illustration && (
        <div className="vf-empty-state__illustration mb-4 opacity-90">
          {illustration}
        </div>
      )}
      {eyebrow && <div className="vf-empty-state__eyebrow">{eyebrow}</div>}
      <div className="vf-empty-state__headline">{headline}</div>
      {helper && <p className="vf-empty-state__helper">{helper}</p>}
      {action && <div className="vf-empty-state__action">{action}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Input — accessible, theme-styled form input primitive.
 * ------------------------------------------------------------------------- */
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Visual tone for validation feedback. */
  tone?: 'neutral' | 'accent' | 'danger' | 'success'
  /** Optional leading icon or adornment. */
  leading?: React.ReactNode
  /** Optional trailing icon, clear button, or adornment. */
  trailing?: React.ReactNode
  /** Size scale. */
  inputSize?: Size
}

const INPUT_SIZE: Record<Size, string> = {
  sm: 'h-8 px-2.5 vf-meta',
  md: 'h-10 px-3 vf-body',
  lg: 'h-12 px-4 text-base',
}

const INPUT_TONE: Record<NonNullable<InputProps['tone']>, string> = {
  neutral: 'border-border focus-within:border-border-strong',
  accent: 'border-accent/40 focus-within:border-accent',
  danger: 'border-danger/60 focus-within:border-danger text-danger',
  success: 'border-success/60 focus-within:border-success',
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      tone = 'neutral',
      inputSize = 'md',
      leading,
      trailing,
      className,
      disabled,
      ...rest
    },
    ref,
  ) {
    return (
      <div
        className={cn(
          'relative flex items-center min-w-0 w-full rounded-lg border bg-input-bg transition-colors duration-100',
          'focus-within:outline focus-within:outline-2 focus-within:outline-focus-ring focus-within:outline-offset-1',
          INPUT_TONE[tone],
          disabled && 'opacity-60 cursor-not-allowed bg-surface-muted',
        )}
      >
        {leading && (
          <span aria-hidden="true" className="flex shrink-0 items-center pl-3 text-text-muted pointer-events-none select-none">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          disabled={disabled}
          aria-invalid={tone === 'danger' || undefined}
          className={cn(
            'vf-input-control w-full bg-transparent text-input-fg placeholder:text-placeholder outline-none',
            INPUT_SIZE[inputSize],
            Boolean(leading) && 'pl-2',
            Boolean(trailing) && 'pr-2',
            className,
          )}
          {...rest}
        />
        {trailing && (
          <span className="flex items-center pr-3 text-text-muted">
            {trailing}
          </span>
        )}
      </div>
    )
  },
)
