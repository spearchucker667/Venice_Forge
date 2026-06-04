import { describe, expect, it } from 'vitest'
import { cn, formatTokens, generateId, truncate } from './utils'

describe('cn', () => {
  it('joins truthy classes with a single space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('returns empty string when all are falsy', () => {
    expect(cn(false, null, undefined)).toBe('')
  })

  it('returns empty string with no args', () => {
    expect(cn()).toBe('')
  })
})

describe('generateId', () => {
  it('produces a valid UUID v4 string', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('returns a different value on each call', () => {
    const a = generateId()
    const b = generateId()
    expect(a).not.toBe(b)
  })
})

describe('truncate', () => {
  it('returns the string unchanged when shorter than len', () => {
    expect(truncate('hi', 10)).toBe('hi')
  })

  it('returns the string unchanged when equal to len', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })

  it('truncates and adds ellipsis when longer than len', () => {
    expect(truncate('hello world', 5)).toBe('hello...')
  })

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('')
  })
})

describe('formatTokens', () => {
  it('formats values under 1K as plain numbers', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })

  it('formats values in thousands with one decimal K suffix', () => {
    expect(formatTokens(1_000)).toBe('1.0K')
    expect(formatTokens(1_500)).toBe('1.5K')
    expect(formatTokens(123_456)).toBe('123.5K')
  })

  it('formats values in millions with one decimal M suffix', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M')
    expect(formatTokens(2_500_000)).toBe('2.5M')
  })
})
