# Command Results

All npm commands below used `PATH="$HOME/.nvm/versions/node/v22.13.1/bin:$PATH"`. Output is summarized and redacted; no environment values are recorded.

| Command | Exit | Status | Result / output reference |
|---|---:|---|---|
| Root bootstrap and Git baseline commands | 0 | PASS | Correct root, clean `main`, baseline `f735b101`. |
| Inventory sweeps (`git ls-files`, `find`, `rg`, size/hash/history checks) | 0 | PASS | Counts in `03-file-inventory.md`. |
| Live GitHub workflow/check queries | 0 | PASS | Hosted baseline green; separate settings query exposed `VF-AUDIT-001`. |
| Main branch protection API query | 1/HTTP 404 | FAIL | Confirmed no protection configuration; external remediation required. |
| Actions workflow permission API query | 0 | PASS with finding | Default write permission confirmed. |
| High-signal tracked secret scan | 0 | PASS | 30 candidates manually classified as fixtures/placeholders/API examples. |
| `npm outdated --json` | 1 | PASS with updates | Expected nonzero because updates exist; see `VF-AUDIT-006`. |
| `npm ci` | 0 | PASS | 866 packages installed; 867 audited; zero vulnerabilities. |
| Focused three-file Vitest run | 0 | PASS | 3 files, 28 tests. |
| `npm run typecheck` | 0 | PASS | Renderer + Electron. |
| `npm run lint:eslint` | 0 | PASS | Zero warnings. |
| Initial `npm run ci` | 1 | FAIL, superseded | All tests/audit/build passed to contracts; new `VERIFY-126` exposed a stale hygiene-verifier maximum of 125. Introduced by this audit, fixed without weakening the guard. |
| Final `npm run ci` | 0 | PASS | Lint, typecheck, segmented tests, zero-vulnerability audit, build, every contract and dist-output verification passed. |
| `npm run test:coverage` | 0 | PASS | 360 files / 4,284 tests; 72.33 statements, 64.09 branches, 70.40 functions, 75.59 lines. |
| `npm run smoke:electron` | 0 | SKIPPED | One test discovered and intentionally skipped because headed Electron smoke was not enabled in this environment. |
| `npm run dist:mac:arm64` | 0 | PASS with signing caveat | Built unsigned arm64 DMG/ZIP, blockmaps and metadata; signing skipped because identity was explicitly null. |
| `npm run verify:dist:mac -- --arch arm64` | 0 | PASS | DMG, ZIP, metadata and both blockmaps verified. |
| `cd release && shasum -a 256 -c *.sha256` | 0 | PASS | Six artifact/metadata checksum files verified. |
| `npm run verify:archive-clean` | 0 | PASS | Archive exclusions and 1,143 tracked paths clean. |
| `git diff --check` | 0 | PASS | No whitespace errors. |
| `git status --short` | 0 | PASS with expected audit changes | 18 tracked files modified; audit package and two secure-file source/test paths untracked; no unrelated user changes. |

The external React Doctor package was not downloaded ad hoc; repository-owned lint, hooks tests, typecheck, component tests and build provide the auditable frontend evidence. Gitleaks/TruffleHog are not installed; repository archive/dist scanners and the classified tracked-source scan were used instead. Historical secret scanning remains NOT CONFIGURED locally.
