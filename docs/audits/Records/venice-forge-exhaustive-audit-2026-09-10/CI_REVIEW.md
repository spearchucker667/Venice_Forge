# CI review

Baseline SHA: `c3ae21af2f723111d92b43c7888a60930226d213`

## Workflows

| File | Permissions | Pinning | Notes |
|---|---|---|---|
| `.github/workflows/ci.yml` | `contents: read` | checkout/setup-node/upload-artifact pinned by SHA | Node from `.nvmrc`; `npm ci`; lint, typecheck, test:ci, coverage, script-coverage, contracts+audit, build, Windows/macOS sensitive, packaged smoke ×3 |
| `.github/workflows/codeql.yml` | `contents: read`, `security-events: write` | checkout + codeql-action SHA | javascript-typescript + actions languages |
| `.github/workflows/dependency-review.yml` | `contents: read`, `pull-requests: read` | SHA-pinned | PRs that touch lockfile; `fail-on-severity: moderate` |
| `.github/workflows/release.yml` | `contents: read` | SHA-pinned | Tag fail-closed without signing secrets unless `RELEASE_ALLOW_UNSIGNED` |

No `pull_request_target`. Actions are SHA-pinned with version comments.

## Hosted results for this SHA

CI run: https://github.com/spearchucker667/Venice_Forge/actions/runs/34044151608
Event: push `main` / commit message `update`
Conclusion: **success**

| Job | Conclusion |
|---|---|
| lint-and-typecheck | success |
| unit-and-integration-tests | success |
| coverage | success |
| script-coverage | success |
| contracts | success |
| build | success |
| windows-sensitive-tests | success |
| macos-sensitive-tests | success |
| electron-smoke-macos | success |
| electron-smoke-windows | success |
| electron-smoke-linux | success |

CodeQL run: https://github.com/spearchucker667/Venice_Forge/actions/runs/34044151609 — **success**

## Divergence since that run

On 2026-09-10 this worktree, the same contracts audit command fails:

```text
npm audit --omit=dev --audit-level=moderate  → exit 1 (js-yaml 4.3.1, GHSA-2883-xcg3-v3hh)
```

Hosted green is therefore **stale relative to the npm advisory database**, not proof the gate is still green.

## Supply-chain notes

- `CSC_IDENTITY_AUTO_DISCOVERY: "false"` on release packaging is correct when using `CSC_LINK`.
- `electron-builder.config.cjs` `dmg.sign: false` is unconditional. The `.app` is still signed/notarized in CI when credentials exist. Treat unsigned DMG wrapper as a release-process note, not a source P0.
- `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md` still records no verified production signed artifact. External acceptance remains open (`VF-EXTERNAL-RELEASE-ACCEPTANCE-2026-08-31`).
- `scripts/write-signature-evidence.cjs` records `signed-and-notarized` from `!unsigned`, not from `codesign`/`stapler` output. macOS verify is wrapped in `if [ -d … .app ]` and fail-opens if the directory is missing — **VF-AUD-20260910-P2-021**.
- `npm run test:ci` (used by `release.yml`) omits 59 tracked test files that the hosted **coverage** job still runs. Process gap **TG-009**, not a product P1.
- `VF-RULES01-SYNC-2026-08-31` remains an admin-only live GitHub ruleset update.

## Commit hygiene

HEAD subject is `update`. That is governance debt (`VF-GOVERNANCE-2026-08-25-002`), not a runtime defect.
