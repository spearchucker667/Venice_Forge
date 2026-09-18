# Venice Forge — Components (source-grounded init)

> Generated for application baseline `7bf1defa`. The repository head may advance with docs-only successors; implementation source is authoritative.

## Canonical source map

| Name | Source path | Description | Obvious props |
|---|---|---|---|
| `IconButton` | `src/components/ui/primitives.tsx` | Accessible icon-only action with tone, size, disabled, and optional plain-button semantics | `icon`, `ariaLabel`, `tone`, `size`, `filled`, `asPlainButton` |
| `Pill` | `src/components/ui/primitives.tsx` | Semantic status/category badge | `tone`, `solid`, `leading` |
| `Toolbar` | `src/components/ui/primitives.tsx` | Compact action group with opt-in toolbar semantics | `size`, `bare`, `align`, `asToolbar` |
| `Card` | `src/components/ui/primitives.tsx` | Elevated grouped surface | `elevation`, `tone`, `padded` |
| `EmptyState` | `src/components/ui/primitives.tsx` | Empty/zero-state composition | `eyebrow`, `headline`, `helper`, `illustration`, `action` |
| `Input` | `src/components/ui/primitives.tsx` | Theme-aware input with adornments | `tone`, `inputSize`, `leading`, `trailing` |
| `AccessibleDialog` | `src/components/ui/AccessibleDialog.tsx` | Focus-trapped modal with Escape and restore semantics | `title`, `description`, `children`, `onClose`, `initialFocusRef`, `headerAction`, `panelRef`, `panelClassName`, `closeOnBackdrop`, `zIndexClassName` |
| `Select` | `src/components/ui/select.tsx` | Searchable keyboard-accessible portal select | `value`, `onChange`, `options`, `placeholder`, `searchable`, `className`, `id`, `ariaLabel`, `labelledBy`, `disabled`, `data-testid` |
| `ContextMenu` | `src/components/ui/ContextMenu.tsx` | Viewport-bounded portaled menu with roving keyboard focus and focus restoration | `position`, `items`, `onClose`, `ariaLabel`, `minWidth` |
| `Meteocon` | `src/components/ui/Meteocon.tsx` | CSP-safe weather/icon system | `name`, `size`, `className` |

## Shared primitive source (`src/components/ui/primitives.tsx`)

```tsx
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: React.ReactNode
  ariaLabel: string
  tone?: Tone
  size?: Size
  asPlainButton?: boolean
  filled?: boolean
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
      <div role="button" tabIndex={disabled ? -1 : 0} aria-label={ariaLabel}
        aria-disabled={disabled || undefined} className={cls}
        onClick={disabled ? undefined : (onClick as unknown as React.MouseEventHandler<HTMLDivElement>)}
        onKeyDown={handleKeyDown} {...(plainRest as unknown as React.HTMLAttributes<HTMLDivElement>)}>
        {icon}
      </div>
    )
  }
  return <button type={type ?? 'button'} aria-label={ariaLabel} className={cls} {...rest}>{icon}</button>
}
```

## Layout and overlay components

- `src/components/layout/sidebar.tsx` — resizable grouped navigation and profile/project controls.
- `src/components/layout/header.tsx` — current tab title, model selector, task center, connection status.
- `src/components/layout/inspector-pane.tsx` — optional right utility rail with traffic/prompt layers.
- `src/components/status/DiagnosticsDrawer.tsx` and `TaskCenterDrawer.tsx` — full-height utility drawers.
- `src/components/layout/AppMeshOverlay.tsx` — fixed, `aria-hidden`, pointer-events-none ambient layer.

## CSS/token sources

- `src/styles/theme.css` — semantic runtime variables, typography, geometry, and derived `--color-vf-*` material tokens.
- `src/styles/components.css` — shared surface, action, shell, and utility-rail classes.
- `src/styles/accessibility.css` — focus, reduced-motion, forced-colors, and target-size rules.

## Legacy/shared compatibility

`src/components/ui/shared.tsx` still exposes compatibility helpers. New shared UI should use `primitives.tsx`; do not create a third duplicate Card/EmptyState/Pill system. Preserve the Electron/web bridge, i18n, safety, and theme-token contracts when adding components.
