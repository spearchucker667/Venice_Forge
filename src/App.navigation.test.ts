import { describe, expect, it } from 'vitest'
import { TAB_ORDER } from './App'
import { CANONICAL_TAB_ORDER, resolveTab, type TabId } from './config/tabs'

describe('TAB_ORDER', () => {
  it('includes the Media Studio tab immediately after Image Studio', () => {
    // The canonical tab id is 'media' (was 'gallery' pre-audit). The
    // registry still records 'gallery' as a legacy alias that resolves
    // to the Media Studio descriptor so persisted user state is safe.
    expect(TAB_ORDER).toContain('media')
    expect(TAB_ORDER.indexOf('media')).toBe(TAB_ORDER.indexOf('image') + 1)
    const aliasDescriptor = resolveTab('gallery')
    expect(aliasDescriptor?.id).toBe<TabId>('media')
    expect(CANONICAL_TAB_ORDER).not.toContain('gallery')
  })
})
