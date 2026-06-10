import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static-import boundary regression guard for P2-008.
 *
 * `src/App.tsx` must NOT use a static `import` for any of the heavyweight
 * views — they have to be loaded via `React.lazy(() => import(...))` so
 * the initial renderer bundle does not pay for Settings (956 lines),
 * Media Studio (936), Search & Scrape (789), Scene Composer (768),
 * Prompt Library (686), or the Storage / Privacy dashboard (249) until
 * the user navigates to them.
 *
 * If a future change reintroduces a static import, the parse below
 * fails and the build is blocked. This is the test-layer equivalent
 * of the Vite/Rollup chunk-size invariant: a code reviewer is the
 * fallback, but the test catches the common case.
 */
describe('App.tsx static-import boundary (P2-008)', () => {
  const APP_PATH = resolve(__dirname, './App.tsx')
  const source = readFileSync(APP_PATH, 'utf8')

  const heavyweightTargets = [
    './components/SettingsView',
    './components/SearchScrapeView',
    './components/gallery/gallery-view',
    './components/prompts/PromptLibraryView',
    './components/scenes/SceneComposerView',
    './components/privacy/StoragePrivacyDashboard',
  ] as const

  for (const target of heavyweightTargets) {
    it(`does not statically import ${target}`, () => {
      // Look for `import ... from '<target>'` or `import '<target>'` —
      // both are static (synchronous) imports that defeat the lazy
      // boundary. `lazy(() => import('...'))` is fine because the
      // import expression lives inside a function body and is dynamic.
      const staticImportRe = new RegExp(
        String.raw`^\s*import\s+(?:[\s\S]+?\s+from\s+)?['"]${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
        'm',
      )
      expect(source).not.toMatch(staticImportRe)
    })
  }

  it('uses React.lazy for every heavyweight view (sanity check)', () => {
    // Belt-and-braces: confirm at least one `lazy(() => import(...))`
    // call exists for each heavyweight target. This guards against
    // the static-import check being silently bypassed by, e.g.,
    // someone deleting the lazy wrapper entirely.
    for (const target of heavyweightTargets) {
      const lazyRe = new RegExp(
        String.raw`lazy\(\s*\(\)\s*=>\s*import\(\s*['"]${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
      )
      expect(source, `expected lazy(() => import('${target}')) in App.tsx`).toMatch(lazyRe)
    }
  })
})
