# Proposed File Operations

## Safe to Delete

### `debug-webcrypto.cjs`

- Purpose/history: one-off WebCrypto console probe, 2,402 bytes, introduced by commit `ed01773`; no later compatibility history.
- Static references: none in tracked source, scripts, tests, configs, docs or workflows.
- Dynamic/build/package references: no filename construction or glob includes it; root Electron Builder inclusion is explicit and excludes it.
- Runtime loading: no import/require, package script, child process, hook or documentation command.
- Classification: SAFE TO DELETE after owner approval.
- Verification: delete, then `npm run verify:archive-clean && npm run ci`.
- Rollback: restore the path from Git.

### `test_playwright.js`

- Purpose/history: 121-byte console probe that checks whether Playwright Electron is present; introduced by commit `584d413`.
- Static references: none in tracked source, scripts, tests, configs, docs or workflows.
- Dynamic/build/package references: excluded by explicit package files; no discovery glob treats root `test_*.js` as a test.
- Runtime loading: none.
- Classification: SAFE TO DELETE after owner approval.
- Verification/rollback: same as above.

No deletion was executed because the work order prohibits automatic deletion.

## Review Required Before Deletion

- None beyond the explicit owner-approval gate for the two safe candidates.

## Files to Merge

- None.

## Files to Rename

- None.

## Files to Update

- Agent instruction surfaces, security/error paths, verifier/tests, canonical docs ledger/index and this audit package were updated.

## Files to Preserve

- Duplicate branding source/public files: packaging contract.
- Thin pointer pairs: agent discovery parity.
- Historical reports/plans: clearly scoped evidence, not current authority.
- Large current assets and API reference: active documented inputs.

## Generated Files That Should Be Ignored

- `.DS_Store`, `node_modules/`, `dist/`, `dist-electron/`, `release/`, coverage, logs and local config are already ignored. No ignore gap was found.
