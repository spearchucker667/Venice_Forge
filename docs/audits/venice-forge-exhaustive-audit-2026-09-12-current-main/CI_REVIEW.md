# CI/CD Review

## Workflows inventory

| Workflow | Triggers | Key jobs | Notes |
|---|---|---|---|
| `ci.yml` | push/PR to `main` | lint-and-typecheck, unit-and-integration-tests, coverage, script-coverage, contracts, build | Uses `npm ci`, `.nvmrc`, pinned actions, least-privilege `permissions: contents: read` |
| `codeql.yml` | push/PR to `main`, schedule | CodeQL analysis | Pinned `github/codeql-action/*` SHAs |
| `dependency-review.yml` | pull_request | Dependency review | Pinned action |
| `release.yml` | tags `v*`, workflow_dispatch | build-macos, build-windows, publish | Signing/notarization checks, `verify:release-readiness`, checksums |

## Observations

- **Action pinning:** All referenced actions use full commit SHAs with version comments (e.g., `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`).
- **Permissions:** `ci.yml` and `release.yml` declare `permissions: contents: read` at workflow level; release jobs elevate only where needed via `id-token` or job-level grants.
- **No `pull_request_target` misuse:** workflows do not use `pull_request_target`.
- **Node version:** derived from `.nvmrc`, matching the project contract (Node 22.x).
- **npm caching:** enabled via `actions/setup-node` cache.
- **Lockfile:** `npm ci` used in all jobs.
- **Release gates:** macOS and Windows jobs fail closed when signing secrets are missing on tag pushes, unless `RELEASE_ALLOW_UNSIGNED=true` is set.
- **Timeout:** CI jobs capped at 30 minutes; release jobs at 90 minutes.
- **Artifacts:** failure-only upload of test/coverage results with 7-day retention.

## Findings

No new CI/CD defects were identified in this audit. The release workflow correctly gates signing/notarization and runs the full `verify:release-readiness` suite before packaging.

## Hosted CI state

Hosted workflow results for `main` were not inspected via `gh` CLI during this audit (no authenticated session used). Local validation commands that mirror CI all passed.
