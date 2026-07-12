// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('global keyboard focus styles', () => {
  it('limits the native focus reset to non-focus-visible interactions', () => {
    const css = readFileSync(new URL('../../src/styles/theme.css', import.meta.url), 'utf8')
    expect(css).toContain('*:focus-visible { outline: 2px solid var(--focus-ring)')
    for (const selector of ['button', 'a', 'textarea', 'input', 'select']) {
      expect(css).toContain(`${selector}:focus:not(:focus-visible)`)
    }
    expect(css).not.toMatch(/button:focus\s*,/)
  })
})
