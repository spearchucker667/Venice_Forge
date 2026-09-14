import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const themeCss = readFileSync(join(ROOT, 'src/styles/theme.css'), 'utf-8')

const REQUIRED_TOKENS = [
  '--color-vf-shell-bg',
  '--color-vf-shell-bg-deep',
  '--color-vf-panel-bg',
  '--color-vf-panel-bg-raised',
  '--color-vf-panel-bg-inset',
  '--color-vf-panel-border',
  '--color-vf-panel-border-hot',
  '--color-vf-panel-highlight',
  '--color-vf-grid-line',
  '--color-vf-accent-glow',
  '--color-vf-accent-glow-strong',
  '--color-vf-control-hover',
  '--color-vf-control-active',
] as const

describe('Reference shell material tokens', () => {
  it('declares every required --color-vf-* token inside @theme', () => {
    const themeBlock = themeCss.slice(
      themeCss.indexOf('@theme'),
      themeCss.indexOf('}', themeCss.indexOf('@theme')),
    )
    for (const token of REQUIRED_TOKENS) {
      expect(themeBlock, `missing ${token} in @theme`).toContain(`${token}:`)
    }
    expect(themeBlock).toContain('--vf-noise-opacity:')
  })

  it('derives every token from semantic theme tokens (no raw hex/rgb)', () => {
    const vfLines = themeCss
      .split('\n')
      .filter((l) => l.trimStart().startsWith('--color-vf-') && l.includes(':'))
    expect(vfLines.length).toBeGreaterThanOrEqual(REQUIRED_TOKENS.length)
    for (const line of vfLines) {
      const value = line.slice(line.indexOf(':') + 1).trim()
      expect(
        /var\(--color-/.test(value) || /color-mix\(.*var\(--color-/.test(value),
        `token must derive from a semantic --color-* token, got: ${line.trim()}`,
      ).toBe(true)
      expect(
        /#[0-9A-Fa-f]{3,8}|rgba?\(/.test(value),
        `raw color literal in derived token: ${line.trim()}`,
      ).toBe(false)
    }
  })
})
