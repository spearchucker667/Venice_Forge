import { useState, useRef, useEffect, useMemo, useId } from 'react'
import { cn } from '../../lib/utils'

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  searchable?: boolean
  className?: string
  id?: string
}

export function Select({ value, onChange, options, placeholder = 'Select...', searchable = false, className, id }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const generatedId = useId()
  const triggerId = id ?? generatedId
  const listboxId = `${triggerId}-listbox`

  const filtered = useMemo(() =>
    search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options,
    [options, search],
  )

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value)
      setHighlightedIndex(idx >= 0 ? idx : 0)
      if (searchable) inputRef.current?.focus()
    } else {
      setSearch('')
    }
  }, [open, options, value, searchable])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length))
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        setHighlightedIndex(0)
        return
      }
      if (e.key === 'End') {
        e.preventDefault()
        setHighlightedIndex(filtered.length - 1)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const opt = filtered[highlightedIndex]
        if (opt) {
          onChange(opt.value)
          setOpen(false)
        }
        return
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const char = e.key.toLowerCase()
        const flat = search ? filtered : options
        const current = search ? highlightedIndex : options.findIndex((o) => o.value === value)
        const start = Math.max(current, 0)
        const nextIndex = flat.findIndex((o, i) => i > start && o.label.toLowerCase().startsWith(char))
        if (nextIndex >= 0) {
          setHighlightedIndex(nextIndex)
        } else {
          const wrapIndex = flat.findIndex((o) => o.label.toLowerCase().startsWith(char))
          if (wrapIndex >= 0) setHighlightedIndex(wrapIndex)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, filtered, highlightedIndex, onChange, options, search])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlightedIndex}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [highlightedIndex, open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        id={triggerId}
        type="button"
        onClick={() => { const next = !open; setOpen(next); if (!next) setSearch('') }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={placeholder}
        className={cn(
          'w-full flex items-center justify-between gap-2 bg-surface border border-border rounded-md px-2.5 py-1.5 text-[15px] hover:border-text-muted transition-colors outline-none cursor-pointer',
          open && 'border-accent',
        )}
      >
        <span className={cn('truncate text-[15px]', value ? 'text-text-primary' : 'text-text-muted')}>{selectedLabel}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          className={cn('shrink-0 text-text-muted transition-transform duration-150', open && 'rotate-180')}>
          <path d="M2.5 3.75L5 6.25L7.5 3.75" />
        </svg>
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={triggerId}
          tabIndex={-1}
          className="absolute z-50 w-full mt-0.5 bg-surface-elevated border border-border rounded-lg shadow-2xl shadow-black/30 animate-scale-in overflow-hidden"
        >
          {searchable && (
            <div className="p-1 border-b border-border">
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-surface rounded px-2 py-1 text-[15px] text-text-primary outline-none placeholder:text-text-muted/50"
              />
            </div>
          )}
          <div ref={listRef} className="max-h-60 overflow-y-auto p-0.5">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2.5 text-[14px] text-text-muted text-center">No results</div>
            ) : (
              filtered.map((o, i) => (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  data-index={i}
                  data-highlighted={i === highlightedIndex}
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={cn(
                    'w-full text-left px-3 py-[6px] text-[15px] rounded transition-colors cursor-pointer',
                    o.value === value
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary',
                    'data-[highlighted=true]:bg-accent/10 data-[highlighted=true]:text-text-primary',
                  )}
                >
                  {o.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
