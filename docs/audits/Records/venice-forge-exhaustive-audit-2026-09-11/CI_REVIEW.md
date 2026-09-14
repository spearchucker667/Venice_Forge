# CI and release review

## Hosted state for committed `main`

- Local HEAD equals `origin/main`: `c3ae21af2f723111d92b43c7888a60930226d213`.
- CI run `34044151608`: success.
- CodeQL push run `34044151609`: success.
- Latest scheduled CodeQL run observed, `34132681946`: success.
- Open CodeQL alerts: none.
- Open secret-scanning alerts: none.

These results cover the baseline committed SHA. The remediated tree subsequently passed the complete local `npm run ci` contract and real packaged arm64 smoke; exact-SHA hosted status remains a post-publication acceptance requirement.

## Workflow review

All four workflow files were reviewed. Actions are SHA-pinned; no `pull_request_target` trigger was found. CI uses lockfile installation and explicit cross-platform jobs. Release jobs fail closed around signing/notarization credentials and generate evidence artifacts.

## Live branch protection design risk

Rules01 (ID `21229461`) is active and strict, but requires only lint/typecheck, unit/integration, coverage, contracts, build, Windows-sensitive tests, and CodeQL analyses. It omits the repository-intended `script-coverage` plus `electron-smoke-macos`, `electron-smoke-windows`, and `electron-smoke-linux` checks. The workflow runs those jobs, but the live merge rule does not require them. This remains the documented `VF-RULES01-SYNC-2026-08-31` design risk rather than a newly duplicated confirmed finding.

## Dependency alerts

Open Dependabot alerts observed:

- Vitest and `@vitest/mocker`, medium, affected versions below 4.1.11. The dirty local lock resolves 4.1.11; committed remote main remains the relevant hosted-alert baseline until publication.
- `joi`, two low advisories. The current local dependency graph still reports the low advisory; production-only audit is clean.

## CI verdict

Committed-SHA CI and CodeQL: **PASS**.
Current-worktree local CI equivalence: **PASS**. Exact-SHA hosted CI and CodeQL: **PENDING PUBLICATION** at the time this evidence package is committed.
