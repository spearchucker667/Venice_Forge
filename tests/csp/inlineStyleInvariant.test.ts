// VERIFY-007 regression guard: T1 / CSP `style-src 'unsafe-inline'` audit.
//
// The Electron renderer's production CSP includes 'unsafe-inline' for styles
// because public/bootstrap-theme.js writes CSS variables via
// `document.documentElement.style.setProperty(...)` at startup to prevent
// FOUC. Removing 'unsafe-inline' from style-src would block the bootstrap
// and cause a flash of unstyled content on every launch.
//
// This test enforces the invariant: the *application* code (under src/) must
// have ZERO inline `style={...}` JSX attributes. If a future PR introduces
// one, this test fails immediately, prompting either:
//   (a) refactor the component to use a CSS class or CSS variable, or
//   (b) update the audit backlog with rationale for the new inline style.
//
// Combined with the explicit comment in electron/main.ts:31, the CSP can be
// tightened to `'unsafe-inline'` for the bootstrap script only after the
// bootstrap is migrated to a nonced stylesheet (or to a self-hosted CSS
// file that applies the variables via :root). See docs/AUDIT_TODO.md T1.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SCAN_DIRS = ['src/components', 'src/layouts', 'src/views', 'src/pages']
const SCAN_EXTS = new Set(['.tsx', '.jsx'])
const IGNORE_PATH_PREFIXES = [
  'src/components/ToastHost.test.tsx',
  'src/components/ConfirmModal.test.tsx',
  'src/components/ErrorBoundary.test.tsx',
  'src/components/Field.test.tsx',
]

/** Recursively gather all matching source files. */
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
    if (stat.isDirectory()) {
      walk(full, out)
    } else if (SCAN_EXTS.has(extname(entry))) {
      out.push(full)
    }
  }
  return out
}

function findInlineStyleAttrs(source: string): Array<{ line: number; snippet: string }> {
  const hits: Array<{ line: number; snippet: string }> = []
  // Match `style={...}` or `style={{...}}` as JSX attribute. The non-greedy
  // match stops at the first `}` to avoid swallowing siblings.
  const re = /\bstyle\s*=\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const idx = m.index
    const before = source.slice(Math.max(0, idx - 80), idx)
    // Skip the bootstrap-theme.js path (not in src/) and any
    // `setProperty` calls (those are programmatic, not JSX attrs).
    if (/document\.documentElement\.style\.setProperty/i.test(before)) continue
    // Compute line number.
    const line = source.slice(0, idx).split('\n').length
    const snippet = source.slice(idx, Math.min(source.length, idx + 80)).replace(/\n/g, ' ')
    hits.push({ line, snippet })
  }
  return hits
}

describe('CSP inline style invariant (VERIFY-007, T1)', () => {
  it('renderer source has zero JSX inline `style={...}` attributes', () => {
    const offenders: Array<{ file: string; line: number; snippet: string }> = []

    for (const sub of SCAN_DIRS) {
      const dir = join(ROOT, sub)
      const files = walk(dir)
      for (const f of files) {
        const rel = relative(ROOT, f)
        if (IGNORE_PATH_PREFIXES.some((p) => rel.replace(/\\/g, '/').endsWith(p))) continue
        const src = readFileSync(f, 'utf-8')
        const hits = findInlineStyleAttrs(src)
        for (const h of hits) {
          offenders.push({ file: rel, line: h.line, snippet: h.snippet })
        }
      }
    }

    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([])
  })
})
