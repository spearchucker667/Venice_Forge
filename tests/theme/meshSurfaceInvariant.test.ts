import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')

const SCAN_FILES = [
  'src/App.tsx',
  'src/components/layout/sidebar.tsx',
  'src/components/layout/header.tsx',
  'src/components/layout/inspector-pane.tsx',
  'src/components/CharactersView.tsx',
  'src/components/status/HeaderStatusCluster.tsx',
]

function countMatches(patterns: RegExp[], paths: string[]): Array<{ file: string; matches: number }> {
  const counts: Array<{ file: string; matches: number }> = []
  for (const f of paths) {
    const full = join(ROOT, f)
    const src = readFileSync(full, 'utf-8')
    let n = 0
    for (const re of patterns) {
      const m = src.match(re)
      if (m) n += m.length
    }
    if (n > 0) counts.push({ file: f, matches: n })
  }
  return counts
}

describe('Mesh surface invariant (VERIFY-MESH, UI-SEAM-002)', () => {
  it('major shell files have zero raw hard border classes (border-[trbl] border-border)', () => {
    // We want to ban border-b border-border, border-t border-border, border-r border-border, border-l border-border
    // without opacity modifiers
    const counts = countMatches([/border-[trbl]\s+border-border(?!\/\d+)/g], SCAN_FILES)
    expect(
      counts,
      `Unexpected hard borders in shell regions: ${JSON.stringify(counts, null, 2)}\n` +
        `Use soft-separator-x or soft-separator-y instead.`
    ).toEqual([])
  })
})
