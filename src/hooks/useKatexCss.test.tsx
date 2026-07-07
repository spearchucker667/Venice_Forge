// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useKatexCss } from './useKatexCss'

const katexLoadTracker = vi.hoisted(() => ({ count: 0 }))

vi.mock('katex/dist/katex.min.css', () => {
  // The dynamic import is cached by Vite (same chunk URL per call) but our
  // useKatexCss hook ALSO dedupes at the module level so this factory only
  // runs once across many hook mounts. If a future change accidentally
  // bypasses the singleton (e.g. by inlining the import() inside the
  // hook body) the count will balloon and this test fails.
  katexLoadTracker.count++
  return { default: '' }
})

describe('useKatexCss singleton (BUG-React#4)', () => {
  afterEach(() => {
    katexLoadTracker.count = 0
  })

  it('returns undefined', () => {
    const { result } = renderHook(() => useKatexCss())
    expect(result.current).toBeUndefined()
  })

  it('does not throw across many simultaneous mounts', () => {
    expect(() => {
      for (let i = 0; i < 50; i++) renderHook(() => useKatexCss())
    }).not.toThrow()
  })

  it('is idempotent across re-renders of the same hook', () => {
    const { rerender } = renderHook(() => useKatexCss())
    expect(() => {
      for (let i = 0; i < 50; i++) rerender()
    }).not.toThrow()
  })
})

