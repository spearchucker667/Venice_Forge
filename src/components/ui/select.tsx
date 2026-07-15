import {  useState, useRef, useEffect, useMemo, useId  } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; element?: React.ReactNode }>
  placeholder?: string
  searchable?: boolean
  className?: string
  id?: string
  ariaLabel?: string
  labelledBy?: string
  disabled?: boolean
  "data-testid"?: string
}

export function Select({ value, onChange, options, placeholder = 'Select...', searchable = false, className, id, ariaLabel, labelledBy, disabled, "data-testid": dataTestId }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const generatedId = useId()
  const triggerId = id ?? generatedId
  const listboxId = `${triggerId}-listbox`
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [flip, setFlip] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const filtered = useMemo(() =>
    search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options,
    [options, search],
  )

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Need to also check if click is inside portal
      if (ref.current && !ref.current.contains(e.target as Node) && listRef.current && !listRef.current.closest('.mesh-panel')?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!open) {
      // Focus return is only when closed while it still has focus or is expected to
      if (document.activeElement === inputRef.current || document.activeElement === listRef.current) {
        triggerRef.current?.focus()
      }
      return
    }
    const update = () => {
      if (ref.current) {
        const r = ref.current.getBoundingClientRect()
        setRect(r)
        if (listRef.current) {
          const listHeight = listRef.current.getBoundingClientRect().height
          setFlip(r.bottom + listHeight + 10 > window.innerHeight && r.top - listHeight - 10 > 0)
        } else {
          setFlip(r.bottom + 250 > window.innerHeight && r.top - 250 > 0)
        }
      }
    }
    update()
    // Small delay to measure list size after it renders
    const timer = setTimeout(update, 0)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value)
      setHighlightedIndex(idx >= 0 ? idx : 0)
      if (searchable) inputRef.current?.focus()
    } else {
      setSearch('')
    }
  }, [open, options, value, searchable])

  const handleKeyDown = (e: React.KeyboardEvent | KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      if (!open) {
        setOpen(true)
        return
      }
      setHighlightedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      if (!open) {
        setOpen(true)
        return
      }
      setHighlightedIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length))
      return
    }
    if (open && e.key === 'Home') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex(0)
      return
    }
    if (open && e.key === 'End') {
      e.preventDefault()
      e.stopPropagation()
      setHighlightedIndex(filtered.length - 1)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (!open) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(true)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const opt = filtered[highlightedIndex]
        if (opt) {
          onChange(opt.value)
          setOpen(false)
        }
        return
      }
    }
    if (open && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !searchable) {
      e.preventDefault()
      e.stopPropagation()
      const char = e.key.toLowerCase()
      const current = options.findIndex((o) => o.value === value)
      const start = Math.max(current, 0)
      const nextIndex = options.findIndex((o, i) => i > start && o.label.toLowerCase().startsWith(char))
      if (nextIndex >= 0) {
        setHighlightedIndex(nextIndex)
      } else {
        const wrapIndex = options.findIndex((o) => o.label.toLowerCase().startsWith(char))
        if (wrapIndex >= 0) setHighlightedIndex(wrapIndex)
      }
    }
  }

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlightedIndex}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [highlightedIndex, open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        onClick={() => { if (disabled) return; const next = !open; setOpen(next); if (!next) setSearch('') }}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && !searchable && filtered[highlightedIndex] ? `${listboxId}-opt-${highlightedIndex}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        data-testid={dataTestId}
        className={cn(
          'mesh-input w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[15px] hover:border-text-muted outline-none cursor-pointer',
          open && 'border-accent',
          disabled && 'opacity-50 cursor-not-allowed hover:border-border'
        )}
      >
        <span className={cn('truncate text-[15px]', value ? 'text-text-primary' : 'text-text-muted')}>{selectedLabel}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          className={cn('shrink-0 text-text-muted transition-transform duration-150', open && 'rotate-180')} aria-hidden="true">
          <path d="M2.5 3.75L5 6.25L7.5 3.75" />
        </svg>
      </button>

      {open && rect && createPortal(
        <div
          style={{
            position: 'fixed',
            top: flip ? undefined : rect.bottom + 4,
            bottom: flip ? window.innerHeight - rect.top + 4 : undefined,
            left: rect.left,
            width: rect.width
          }}
          onKeyDown={handleKeyDown}
          className="mesh-panel absolute z-50 w-full mt-0.5 rounded-lg animate-scale-in overflow-hidden shadow-xl border border-border"
        >
          {searchable && (
            <div className="p-1 border-b border-border/50">
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={open}
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={filtered[highlightedIndex] ? `${listboxId}-opt-${filtered[highlightedIndex].value.replace(/\W+/g, '-')}` : undefined}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                aria-label="Search options"
                className="mesh-input w-full rounded px-2 py-1 text-[15px] text-text-primary outline-none placeholder:text-text-muted/50"
              />
            </div>
          )}
          <div ref={listRef} id={listboxId} role="listbox" aria-labelledby={triggerId} tabIndex={-1} className="max-h-60 overflow-y-auto p-0.5">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2.5 text-[14px] text-text-muted text-center">No results</div>
            ) : (
              filtered.map((o, i) => (
                <div
                  key={o.value}
                  role="option"
                  id={`${listboxId}-opt-${o.value.replace(/\W+/g, '-')}`}
                  aria-selected={o.value === value}
                  data-index={i}
                  data-highlighted={i === highlightedIndex}
                  onClick={(e) => { e.stopPropagation(); onChange(o.value); setOpen(false) }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={cn(
                    'w-full text-left px-3 py-[6px] text-[15px] rounded transition-colors cursor-pointer',
                    o.value === value
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary',
                    'data-[highlighted=true]:bg-accent/10 data-[highlighted=true]:text-text-primary',
                  )}
                >
                  {o.element || o.label}
                </div>
              ))
            )}
          </div>
        </div>
      , document.body)}
    </div>
  )
}
