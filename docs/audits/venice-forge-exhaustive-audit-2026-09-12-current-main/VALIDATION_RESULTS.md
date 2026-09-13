# Validation Results

All commands were executed against the checked-out worktree at commit `84cf5bbe` (main, v3.0.0-beta.3) on 2026-09-12.

## Core validation

### `npm run lint:eslint`

- **Exit code:** 0
- **Result:** PASS
- **Notes:** `--max-warnings=0` enforced; no warnings emitted.

### `npm run typecheck`

- **Exit code:** 0
- **Result:** PASS
- **Command:** `tsc --noEmit && tsc --noEmit --project tsconfig.electron.json && tsc --noEmit --project tsconfig.electron.test.json`
- **Notes:** All three projects typecheck cleanly.

### `npm test`

- **Exit code:** 0
- **Result:** PASS
- **Summary:** 514 test files passed, 2 skipped (516 total); 5,858 tests passed, 3 skipped (5,861 total).
- **Notes:** Tests run serially (`--fileParallelism=false`) per project convention.

### `npm run build` + `npm run verify:dist`

- **Exit code:** 0
- **Result:** PASS
- **Notes:** `dist/`, `dist-electron/`, and `dist/server.cjs` built successfully; `verify:dist` confirmed output structure.

## Contract / verifier suite

### `npm run verify:contracts:static`

- **Exit code:** 0
- **Result:** PASS
- **Notes:** Ran the full static verifier chain including lockfile, repository identity, roadmap currency, release metadata, bundle budget, safety guard, markdown links, repo handoff hygiene, theme tokens, Meteocon CSP, network boundaries, custom-protocol privileges, Venice API docs, contract drift, CI contract, agent docs, image policy, work orders, no-native-dialogs, inactive-feature archive, provider adapters, i18n, i18n-hardcoded-regressions, IPC parity, prompt language, and transitive deprecations.

### `npm run verify:contracts:features`

- **Exit code:** 0
- **Result:** PASS
- **Notes:** Feature contract verifiers for chat (prompt library, document ingestion, document agent), image (model-aware recipes, media studio power tools), workflow templates, RP studio (scene composer, scene references, character cards, research workspace), and settings/status (diagnostics, storage privacy/policy, backup/sync) all passed.

### `npm run verify:contracts:release`

- **Status:** NOT RUN
- **Reason:** Release-packaging verifier requires release-specific environment; run as part of the release workflow before tagging.

### `npm run verify:i18n`

- **Exit code:** 0
- **Result:** PASS with warnings
- **Notes:** 22 warnings under `--allow-missing-markers --allow-key-name-fallbacks`. These are known structural gaps (missing markers and key-name fallbacks), not regressions.

### `npm run verify:i18n-hardcoded-regressions`

- **Exit code:** 0
- **Result:** PASS
- **Notes:** No new hardcoded-string regressions against the baseline.

### `npm run verify:theme-tokens`

- **Exit code:** 0
- **Result:** PASS

## Not run / environmental limitations

- `npm run ci` (full CI parity including `npm audit` and `verify:dist`) — not run as a single command, but the constituent checks above were run individually.
- `npm run dist:mac` / `dist:win` / `dist:linux` — not run; packaging requires signing credentials and platform-specific tooling.
- Electron packaged smoke tests (`RUN_ELECTRON_SMOKE=true`) — not run; requires a packaged build and headed environment.
- Paid-provider live calls — not run; requires a funded API key.
