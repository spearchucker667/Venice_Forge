import { describe, it, expect } from 'vitest'
import { CANONICAL_TAB_ORDER, TAB_REGISTRY, isTabId, normaliseTab, resolveTab, type TabId } from './tabs'

describe('Tab registry (BUG-TAB-ALIASES regression)', () => {
  it('exposes the canonical tab order with the Media Studio right after Image Studio', () => {
    const order = CANONICAL_TAB_ORDER as readonly TabId[]
    const imageIdx = order.indexOf('image')
    const mediaIdx = order.indexOf('media')
    expect(imageIdx).toBeGreaterThanOrEqual(0)
    expect(mediaIdx).toBe(imageIdx + 1)
  })

  it('resolves the legacy "gallery" alias to the Media Studio descriptor', () => {
    const resolved = resolveTab('gallery')
    expect(resolved?.id).toBe<TabId>('media')
    expect(resolved?.label).toBe('Media Studio')
    expect(normaliseTab('gallery')).toBe<TabId>('media')
  })

  it('rejects unknown ids by falling back to chat', () => {
    expect(normaliseTab('not-a-tab')).toBe<TabId>('chat')
    expect(normaliseTab(null)).toBe<TabId>('chat')
    expect(normaliseTab(undefined)).toBe<TabId>('chat')
  })

  it('isTabId recognises every known id (canonical + legacy)', () => {
    for (const t of TAB_REGISTRY) {
      expect(isTabId(t.id)).toBe(true)
    }
    expect(isTabId('gallery')).toBe(true)
    expect(isTabId('chat')).toBe(true)
    expect(isTabId('not-a-tab')).toBe(false)
    expect(isTabId(null)).toBe(false)
    expect(isTabId(undefined)).toBe(false)
  })

  it('does NOT include legacy aliases in the canonical order', () => {
    expect(CANONICAL_TAB_ORDER).not.toContain('gallery')
    expect(CANONICAL_TAB_ORDER).not.toContain('models')
    expect(CANONICAL_TAB_ORDER).not.toContain('batch')
    expect(CANONICAL_TAB_ORDER).not.toContain('diagnostics')
  })

  it('every canonical tab is in exactly one group', () => {
    const seen = new Set<string>()
    for (const t of TAB_REGISTRY) {
      expect(seen.has(t.id)).toBe(false)
      seen.add(t.id)
    }
  })
})
