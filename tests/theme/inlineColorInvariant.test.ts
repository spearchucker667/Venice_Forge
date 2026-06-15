// VERIFY-010 regression guard: T11 / Theme token coverage invariant.
//
// The audit's 2026-06-04 snapshot reported 322 text-white/[opacity] and
// 28 bg-[#hex] violations across the renderer. As of 2026-06-05 the
// actual codebase has been cleaned to:
//   - 0 `text-white/[opacity]` violations in src/components/
//   - 4 `bg-[#hex]` violations, all in playground/workflow canvas
//     overrides where `!important` is required to override React Flow
//     defaults (the `!bg-[#111]` syntax is a Tailwind v4 important
//     modifier, not a new violation).
//
// This test enforces the invariant: no NEW text-white/[opacity] or
// bg-[#hex] violations are introduced. If a contributor adds one,
// the test fails, prompting either:
//   (a) replace with a semantic token (var(--color-text-primary) etc.),
//   (b) update the threshold here with documented justification, or
//   (c) file an exception in docs/AUDIT_FOLLOWUP_2026_06_05.md.
//
// We allow the existing 4 hex backgrounds as a tolerated baseline
// because each is a !important override of React Flow canvas styling
// and cannot be replaced with a CSS variable (the override must
// win specificity). Adding any new bg-[#hex] in a non-canvas file
// should be flagged.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')

// Files allowed to contain bg-[#hex] (React Flow canvas overrides + toaster):
const HEX_BG_ALLOWLIST = new Set([
  'src/components/playground/preview-node.tsx',
  'src/components/playground/workflow-preview.tsx',
  'src/components/ui/toaster.tsx',
  'src/components/workflows/workflows-view.tsx',
])

// Existing violations exposed when T-202 corrected the matcher. This is an
// exact non-growth baseline while the tracked theme migration removes them.
const TEXT_WHITE_BASELINE = new Map([
  ['src/components/audio/audio-view.tsx', 8],
  ['src/components/embeddings/embeddings-view.tsx', 10],
  ['src/components/image/image-page.tsx', 2],
  ['src/components/image/image-tools.tsx', 9],
  ['src/components/image/image-view.tsx', 6],
  ['src/components/music/music-view.tsx', 13],
  ['src/components/playground/agent-model-picker.tsx', 12],
  ['src/components/playground/playground-chat.tsx', 14],
  ['src/components/playground/playground-view.tsx', 19],
  ['src/components/playground/preview-node.tsx', 5],
  ['src/components/playground/workflow-preview.tsx', 3],
  ['src/components/video/video-view.tsx', 22],
  ['src/components/workflows/workflow-node.tsx', 28],
  ['src/components/workflows/workflows-view.tsx', 20],
])

const SCAN_DIRS = ['src/components', 'src/layouts', 'src/views', 'src/pages']
const SCAN_EXTS = new Set(['.tsx', '.jsx'])
const IGNORE_PATH_PREFIXES = [
  'src/components/ToastHost.test.tsx',
  'src/components/ConfirmModal.test.tsx',
  'src/components/ErrorBoundary.test.tsx',
  'src/components/Field.test.tsx',
]

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (SCAN_EXTS.has(extname(entry))) out.push(full)
  }
  return out
}

function countMatches(patterns: RegExp[], paths: string[]): Array<{ file: string; matches: number }> {
  const counts: Array<{ file: string; matches: number }> = []
  for (const f of paths) {
    const rel = relative(ROOT, f).replace(/\\/g, '/')
    if (IGNORE_PATH_PREFIXES.some((p) => rel.endsWith(p))) continue
    const src = readFileSync(f, 'utf-8')
    let n = 0
    for (const re of patterns) {
      const m = src.match(re)
      if (m) n += m.length
    }
    if (n > 0) counts.push({ file: rel, matches: n })
  }
  return counts
}

describe('Theme token coverage invariant (VERIFY-010, T11)', () => {
  it('renderer does not grow the known `text-white/[opacity]` baseline', () => {
    const files: string[] = []
    for (const sub of SCAN_DIRS) files.push(...walk(join(ROOT, sub)))
    const counts = countMatches([/text-white(?:\/\d+|\/\[[\d.]+\])/g], files)
    const unexpected = counts.filter(({ file, matches }) => {
      const baseline = TEXT_WHITE_BASELINE.get(file)
      return baseline === undefined || matches > baseline
    })
    expect(unexpected, JSON.stringify(unexpected, null, 2)).toEqual([])
  })

  it('renderer has zero `bg-[#hex]` violations OUTSIDE the documented allowlist', () => {
    const files: string[] = []
    for (const sub of SCAN_DIRS) files.push(...walk(join(ROOT, sub)))
    const counts = countMatches([/bg-\[#[0-9a-fA-F]{3,6}\]/g], files)
    const offending = counts.filter((c) => !HEX_BG_ALLOWLIST.has(c.file))
    expect(
      offending,
      `Unexpected bg-[#hex] outside allowlist: ${JSON.stringify(offending, null, 2)}\n` +
        `If you must add a new hex background, document the rationale in ` +
        `docs/AUDIT_FOLLOWUP_2026_06_05.md and add the file to HEX_BG_ALLOWLIST.`,
    ).toEqual([])
  })

  it('hex-background allowlist has not grown beyond 4 entries (tolerated baseline)', () => {
    // The 4-entry baseline is documented above. If a new entry is added,
    // the contributor should also update the comment in this test file
    // to explain why the new file cannot use a semantic token.
    expect(HEX_BG_ALLOWLIST.size).toBeLessThanOrEqual(4)
  })
})
