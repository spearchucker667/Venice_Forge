import { describe, expect, it } from 'vitest'
import { TAB_ORDER } from './App'

describe('TAB_ORDER', () => {
  it('includes the Media Studio tab immediately after Image Studio', () => {
    expect(TAB_ORDER).toContain('gallery')
    expect(TAB_ORDER.indexOf('gallery')).toBe(TAB_ORDER.indexOf('image') + 1)
  })
})
