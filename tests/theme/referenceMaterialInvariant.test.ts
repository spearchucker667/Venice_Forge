import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const css = readFileSync(join(ROOT, 'src/styles/components.css'), 'utf-8')

function ruleBlock(selector: string): string {
  const start = css.indexOf(selector + ' {')
  expect(start, `rule ${selector} not found`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('\n}', start))
}

describe('Reference ambient layer invariants', () => {
  it('app-mesh-overlay is a static grain/vignette layer, not accent blobs', () => {
    const block = ruleBlock('.app-mesh-overlay')
    expect(block).toContain('pointer-events: none')
    expect(block).toContain('repeating-linear-gradient')
    expect(block).not.toContain('radial-gradient(circle at')
    expect(block).not.toMatch(/color-accent\) (1[0-8]|8)%,/)
  })

  it('vf-grain utility exists, is static and non-interactive', () => {
    const block = ruleBlock('.vf-grain')
    expect(block).toContain('pointer-events: none')
    expect(block).toContain('repeating-linear-gradient')
    expect(block).not.toContain('animation')
  })

  it('ambient layer scales with the noise opacity token', () => {
    expect(ruleBlock('.app-mesh-overlay')).toContain('var(--vf-noise-opacity')
  })
})
