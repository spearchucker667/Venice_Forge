# Validation Results — audit of `main` @ `c6d9bed3`

All commands executed against the baseline tree on 2026-09-12/13 (local Node v22.13.1,
npm 10.9.2 — see environmental note). Exit codes are from `$?` immediately after each run.

| # | Command | Exit | Result | Notes |
|---|---|---|---|---|
| 1 | `git rev-parse HEAD` / `git rev-parse origin/main` (after `git fetch origin main`) | 0 | PASS | Both `c6d9bed34544a64d04ed84f981f4ce8bd8756d86`; no divergence |
| 2 | `git status --porcelain=v1` | 0 | PASS | 0 entries (clean tree at start; unchanged by audit except intentional package additions) |
| 3 | `npm run verify:lockfile` | 0 | PASS | `[verify:lockfile] OK` |
| 4 | `npm run lint:eslint` | 0 | PASS | zero warnings enforced (`--max-warnings=0`) |
| 5 | `npm run typecheck` | 0 | PASS | root + `tsconfig.electron.json` + `tsconfig.electron.test.json` |
| 6 | `npm test` | 0 | PASS | **5,936 passed / 4 skipped** (2 skipped are packaged-launch smokes that auto-skip without a packaged binary at suite start), 522 test files, 176.8 s |
| 7 | `npm run build` | 0 | PASS | web (Vite) + server (`dist/server.cjs` 126.4 kB) + electron (`build-electron.cjs` + `create-cjs-package.cjs`) |
| 8 | `npm run verify:dist` | 0 | PASS | build outputs verified for v3.0.0-beta.3 |
| 9 | `npm run verify:contracts:static` | 0 | PASS | includes `verify:ipc-parity` (0 handler orphans, 0 renderer orphans), theme tokens, CSP/Meteocon, network boundaries, custom-protocol privileges, Venice API docs drift, CI contract, safety guard, i18n, transitive deprecations (5 known allowlisted) |
| 10 | `npm run verify:contracts:features` | 0 | PASS | chat/image/workflow/rp/settings verifier groups incl. `test:character-cards` |
| 11 | `npm run verify:contracts:release` | 0 | PASS | 104 checks (`verify:release-packaging-hardening`) |
| 12 | `npm run verify:i18n` | 0 | PASS | 12 locales / 12 namespaces; 55 `__MISSING__` sentinel placeholders reported per the `--allow-missing-markers` contract (non-en pending native review — matches `docs/i18n/native-review-status.json`) |
| 13 | `npm run verify:i18n-hardcoded-regressions` | 0 | PASS | 0 regressions, 530 files scanned |
| 14 | `npm run verify:theme-tokens` | 0 | PASS | 182 files scanned, no forbidden hardcoded colors |
| 15 | `npm run verify:safety-guard` | 0 | PASS | no raw prompt logging / safety bypass patterns |
| 16 | `npm audit --omit=dev --audit-level=moderate` | 0 | PASS | 0 vulnerabilities |
| 17 | `npm audit --audit-level=critical` | 0 | PASS | 0 vulnerabilities |
| 18 | `npm run dist:mac:arm64` | 0 | PASS | packaged build produced for runtime reproduction (finding C6-P1-001) |
| 19 | `npx vitest run tests/smoke/packaged-launch-csp.test.ts` (with package present) | 1 | **FAIL — reproduced** | `expected true to be false` at `packaged-launch-csp.test.ts:88`; identical to hosted failure; reproduced locally before any fix |
| 20 | `node scratch/csp-diagnostic.mjs` (temporary diagnostic, deleted after run) | 0 | Diagnostic | established CSP *is* enforced for page-context vectors; CDP evaluate exempt |

## Not run (with reasons)

- `npm run verify:i18n:release` (strict mode): intentionally not run — it fails by design
  while 55 `__MISSING__` placeholders await native translation (tracked in ROADMAP as
  `VF-I18N-NATIVE-REVIEW-001`); not a regression of this baseline.
- Windows/Linux/macOS hosted packaged smokes beyond the reproduction: executed by hosted
  CI on the exact SHA (see `CI_REVIEW.md`) — local repetition on all three platforms is
  not possible on this machine (macOS arm64 only).
- Paid/credentialed provider calls: out of scope per work order §32 and repository policy.
- Headed manual accessibility QA: not performed in this audit (no display-interaction
  environment guarantees); the repository's automated a11y tests
  (`tests/accessibility/`) pass as part of `npm test`.

## Environmental limitations

- Local Node v22.13.1 is below the declared engine floor `>=22.15.0` (`.nvmrc`). All
  validation ran on v22.13.1; hosted CI installs Node per `.nvmrc` (22.15.0) and is
  authoritative for engine-strict behavior. No toolchain incompatibility was observed.
- `npm ci` was not run (working tree lockfile verified consistent by `verify:lockfile`
  and node_modules were already in place from prior sessions on this machine).
