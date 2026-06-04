import { useState, useRef, useEffect, useMemo } from 'react'
import { cn } from '../../lib/utils'

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  placeholder?: string
  searchable?: boolean
  className?: string
}

export function Select({ value, onChange, options, placeholder = 'Select...', searchable = false, className }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open && searchable) inputRef.current?.focus()
  }, [open, searchable])

  const filtered = useMemo(() =>
    search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options,
    [options, search],
  )

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        onClick={() => { const next = !open; setOpen(next); if (!next) setSearch('') }}
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
        <div className="absolute z-50 w-full mt-0.5 bg-surface-elevated border border-border rounded-lg shadow-2xl shadow-black/30 animate-scale-in overflow-hidden">
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
          <div className="max-h-60 overflow-y-auto p-0.5">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2.5 text-[14px] text-text-muted text-center">No results</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false) }}
                  className={cn(
                    'w-full text-left px-3 py-[6px] text-[15px] rounded transition-colors cursor-pointer',
                    o.value === value
                      ? 'bg-accent/15 text-accent font-semibold'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary',
                  )}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
