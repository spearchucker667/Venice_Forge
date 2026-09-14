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

const MATERIAL_CLASSES = [
  '.vf-shell-panel',
  '.vf-panel-header',
  '.vf-inset-canvas',
  '.vf-utility-rail-section',
  '.vf-dense-row',
  '.vf-accent-progress',
  '.vf-data-grid',
] as const

describe('Reference material classes', () => {
  it('declares every material class', () => {
    for (const cls of MATERIAL_CLASSES) ruleBlock(cls)
    ruleBlock('.vf-accent-progress__bar')
  })

  it('material classes reference only semantic/vf tokens (no raw colors)', () => {
    const section = css.slice(css.indexOf('=== Reference material classes'))
    expect(section.length).toBeGreaterThan(0)
    const rawHits = section.match(/#[0-9A-Fa-f]{3,8}|rgba?\(/g) ?? []
    const allowed = section.match(/THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR/g) ?? []
    expect(rawHits.length, `raw color literals: ${rawHits?.join(', ')}`).toBeLessThanOrEqual(allowed.length)
  })

  it('selected dense row carries an accent selection rail', () => {
    expect(ruleBlock('.vf-dense-row[data-selected="true"]')).toContain('inset 2px 0 0 var(--color-accent)')
  })
})
