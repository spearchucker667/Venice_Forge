import { describe, expect, it } from 'vitest'
import { TAB_ORDER } from './App'
import { CANONICAL_TAB_ORDER, resolveTab, type TabId } from './config/tabs'
import { isShortcutTargetEditable } from './App'

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

describe('isShortcutTargetEditable (APP-001 regression)', () => {
  function makeEvent(tagName: string, isContentEditable = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown')
    Object.defineProperty(event, 'target', {
      value: { tagName: tagName.toUpperCase(), isContentEditable },
      enumerable: true,
    })
    return event
  }

  it('ignores shortcuts when the active element is an input', () => {
    expect(isShortcutTargetEditable(makeEvent('input'))).toBe(true)
  })

  it('ignores shortcuts when the active element is a textarea', () => {
    expect(isShortcutTargetEditable(makeEvent('textarea'))).toBe(true)
  })

  it('ignores shortcuts when the active element is contenteditable', () => {
    expect(isShortcutTargetEditable(makeEvent('div', true))).toBe(true)
  })

  it('allows shortcuts when the active element is a plain div', () => {
    expect(isShortcutTargetEditable(makeEvent('div'))).toBe(false)
  })
})
