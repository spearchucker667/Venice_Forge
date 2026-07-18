#!/usr/bin/env node
/** VERIFY-144: Research Browser remains archived and absent from active runtime/build surfaces. */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const archive = path.join(root, 'inactive-features', 'research-browser')
const required = [
  'README.md',
  'renderer/components/ResearchBrowserView.tsx',
  'renderer/services/researchBrowserBridge.ts',
  'renderer/types/researchBrowser.ts',
  'electron/services/researchBrowserServer.ts',
  'electron/security/researchBrowserNetworkPolicy.ts',
  'scripts/verify-research-browser.cjs',
]

const failures = []
for (const relative of required) {
  if (!fs.existsSync(path.join(archive, relative))) failures.push(`missing archive artifact: ${relative}`)
}

const activeFiles = [
  'electron/main.ts',
  'electron/preload.ts',
  'src/types/desktop.ts',
  'src/components/search/SearchScrapeView.tsx',
  'src/components/search/searchScrapeTypes.ts',
  'src/components/research/ResearchWorkspaceView.tsx',
  'package.json',
]
const forbidden = /ResearchBrowser|researchBrowser|research-browser|researchBrowser:|verify:research-browser|verify:web-contents-view|verify:browser-traffic-contained/
for (const relative of activeFiles) {
  const text = fs.readFileSync(path.join(root, relative), 'utf8')
  if (forbidden.test(text)) failures.push(`active Research Browser reference: ${relative}`)
}

const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'))
if (!tsconfig.exclude?.includes('inactive-features')) failures.push('tsconfig.json does not exclude inactive-features')
const vitest = fs.readFileSync(path.join(root, 'vitest.config.ts'), 'utf8')
if (!vitest.includes('"inactive-features/**"')) failures.push('vitest.config.ts does not exclude inactive-features')
const builder = fs.readFileSync(path.join(root, 'electron-builder.config.cjs'), 'utf8')
if (!builder.includes('"dist/**/*"') || builder.includes('inactive-features/**/*')) {
  failures.push('packaging allowlist does not exclude inactive feature sources')
}

if (failures.length) {
  console.error(`Inactive feature archive verification failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('VERIFY-144 passed: Research Browser is archived and inactive.')
