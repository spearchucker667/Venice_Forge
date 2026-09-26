import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const themeCss = readFileSync(join(ROOT, 'src/styles/theme.css'), 'utf-8')

const themeBlock = themeCss.slice(
  themeCss.indexOf('@theme'),
  themeCss.indexOf('}', themeCss.indexOf('@theme')),
)

// Backfilled vf-* aliases referenced by components but previously never
// declared (silent no-op utilities). Each must exist in @theme and derive
// from the semantic --color-* chain only.
const EXTENDED_TOKENS = [
  '--color-vf-control-hover-muted',
  '--color-vf-panel-bg-hover',
  '--color-vf-panel-bg-muted',
  '--color-vf-panel-bg-sunken',
  '--color-vf-panel-border-soft',
  '--color-vf-panel-border-strong',
  '--color-vf-button-primary-bg',
  '--color-vf-button-primary-text',
  '--color-vf-button-primary-hover-bg',
] as const

// Container namespace. In Tailwind v4 max-w-<name> resolves from
// --container-<name>, so these back max-w-chat-bubble / max-w-vf-comfort /
// max-w-vf-wide.
const CONTAINER_TOKENS = [
  '--container-reading',
  '--container-vf-comfort',
  '--container-vf-wide',
  '--container-chat-bubble',
] as const

describe('Extended shell/control alias tokens', () => {
  it('declares every backfilled --color-vf-* token inside @theme', () => {
    for (const token of EXTENDED_TOKENS) {
      expect(themeBlock, `missing ${token} in @theme`).toContain(`${token}:`)
    }
  })

  it('derives every backfilled token from semantic --color-* tokens (no raw colors)', () => {
    for (const token of EXTENDED_TOKENS) {
      const line = themeCss
        .split('\n')
        .find((l) => l.trimStart().startsWith(`${token}:`))
      expect(line, `missing declaration for ${token}`).toBeDefined()
      const value = line!.slice(line!.indexOf(':') + 1).trim()
      expect(
        /var\(--color-/.test(value),
        `${token} must derive from a --color-* token, got: ${value}`,
      ).toBe(true)
      expect(
        /#[0-9A-Fa-f]{3,8}|rgba?\(/.test(value),
        `raw color literal in ${token}: ${value}`,
      ).toBe(false)
    }
  })

  it('declares container-width tokens in the --container-* namespace', () => {
    for (const token of CONTAINER_TOKENS) {
      expect(themeBlock, `missing ${token} in @theme`).toContain(`${token}:`)
    }
  })

  it('no longer declares legacy --width-* tokens (superseded by --container-*)', () => {
    for (const legacy of [
      '--width-narrow',
      '--width-reading',
      '--width-comfort',
      '--width-wide',
      '--width-chat-bubble',
    ]) {
      expect(themeBlock, `legacy ${legacy} still in @theme`).not.toContain(`${legacy}:`)
    }
  })
})
