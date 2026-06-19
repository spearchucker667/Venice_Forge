import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')

function collectScanFiles(root: string, scanRoots: string[]): string[] {
  const files: string[] = []
  for (const target of scanRoots) {
    const abs = resolve(root, target)
    if (!existsSync(abs)) continue
    const stat = statSync(abs)
    if (stat.isFile()) {
      files.push(relative(root, abs))
      continue
    }
    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const s = statSync(full)
        if (s.isDirectory()) {
          walk(full)
        } else if (s.isFile() && (entry.endsWith('.tsx') || entry.endsWith('.ts'))) {
          files.push(relative(root, full))
        }
      }
    }
    walk(abs)
  }
  return files
}

const SCAN_FILES = collectScanFiles(ROOT, ['src/App.tsx', 'src/components'])

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
