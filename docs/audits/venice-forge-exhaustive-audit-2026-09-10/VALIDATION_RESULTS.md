# Validation results

Environment for local commands: macOS, nvm Node **22.15.0** (repository `.nvmrc`; default shell Node 22.13.1 is below `engines.node` `>=22.15.0` and was not used). npm 10.9.2.

`npm ci` was **not** re-run. `node_modules` was already present and matched the lockfile enough to compile and test. Hosted CI for this SHA did run `npm ci`.

## Commands

| Command | Exit | Result | Related findings |
|---|---:|---|---|
| `git rev-parse HEAD` / `origin/main` | 0 | both `c3ae21af2f723111d92b43c7888a60930226d213` | |
| `git status --short` (start) | 0 | clean | |
| `npm run lint:eslint` | 0 | PASS, max-warnings=0 | |
| `npm run typecheck` | 0 | PASS (src + electron + electron tests) | |
| `npm run test:server` | 0 | PASS 64/64 | |
| `npm run test:ci` (first invocation) | **1** | Failed `scripts/verify-markdown-links.test.ts` while this package's README linked files not yet written | audit-docs race, not product |
| `npx vitest run scripts/verify-markdown-links.test.ts` (after package complete) | 0 | PASS 15/15 | |
| `npm run test:unit:scripts` (rerun) | 0 | PASS 33 files / 272 tests | |
| Remaining `test:unit` shards (types, config, agent, constants, research, i18n) | 0 | PASS | |
| First `test:ci` shards before the markdown failure (server, electron, ingestion, unit stores/services/hooks/lib/shared/utils/theme) | 0 | PASS (server 64; electron 106 files) | |
| `npm run test:ui` | 0 | PASS (layout 106, chat 111, gallery 72, image 46, research 21, settings 18) | |
| `npm run test:contracts` | 0 | PASS 23 files / 269 tests | |
| `npm run build` | 0 | PASS web + server + electron | |
| `npm run verify:dist` | 0 | PASS | |
| `npm audit --omit=dev --audit-level=moderate` | **1** | js-yaml 4.3.1 high | P1-001 |
| `npm audit --audit-level=critical` | 0 | no critical; remaining high/moderate reported | P1-001, P2-003, P3-005 |
| `npm run verify:safety-guard` | 0 | PASS | |
| `npm run verify:markdown-links` | 0 | PASS (280 then 292 files after this package; 291 on continuation closeout) | |
| `npm run verify:i18n` | 0 | PASS, 12 locales / 12 namespaces | |
| `npm run verify:i18n-hardcoded-regressions` | 0 | 0 regressions | |
| `npm run verify:venice-contract-drift` | 0 | PASS against tracked snapshot | P2-004 (stale vs official, not vs tracker) |
| `npm run verify:network-boundaries` | 0 | PASS | |
| `npm run verify:custom-protocol-privileges` | 0 | PASS | |
| `npm run verify:contracts` full | not run as one alias | static subset + `test:contracts` + feature verifiers above | |
| Hosted CI `34044151608` | success | 11/11 jobs | CI_REVIEW.md |
| Hosted CodeQL `34044151609` | success | | |

## Notes

- Local default `node` is 22.13.1; engines require `>=22.15.0`. Validation used `nvm use 22.15.0`. This is an environment mismatch on the machine, not a repository defect.
- `npm audit --audit-level=critical` passing does **not** mean zero vulnerabilities.
