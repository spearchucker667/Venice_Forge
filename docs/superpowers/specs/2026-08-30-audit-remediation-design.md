# Audit Remediation Design — August 30, 2026

## Context

A re-audit of `main` at commit `5ee33ab4950f1ec059f9f7ebf5492848833e8ac1` found the repository materially healthier than the previous audit. Several prior findings are resolved. The remaining findings are configuration-level and are remediated by targeted, minimal changes to local workflow, script, and documentation files. This design maps each finding to its implementation.

## Scope

Address all remaining findings from the audit:

1. **P1** — Branch protection Rules01 omits the three packaged Electron smoke jobs.
2. **P1** — Release tags are not validated against `package.json.version`.
3. **P2** — Electron test TypeScript is not part of the explicit `tsc` typecheck contract.
4. **P2** — CI coverage excludes `scripts/` despite dedicated coverage infrastructure.
5. **P2** — Release artifact collection is overly broad; no reject-unknown-files allowlist.
6. **P3** — Rules01 contains an always-on repository-role bypass actor.

## Design

### 1. Branch protection smoke-job coverage

The local ruleset helper `scripts/enforce-github-rules.sh` will be updated so that the JSON payload it pushes includes all three packaged Electron smoke jobs in `required_status_checks`:

- `electron-smoke-macos`
- `electron-smoke-windows`
- `electron-smoke-linux`

`docs/reports/historical/FINAL_AUDIT_REMEDIATION_REPORT_2026-08-26.md` and `docs/summary_of_work.md` will record that the live GitHub Rules01 ruleset must be synchronized with this helper by a repository administrator.

### 2. Tag/version parity gate

`scripts/verify-release-metadata.cjs` will gain a tag-vs-version check: when the environment variable `GITHUB_REF_NAME` is set and starts with `v`, the verifier will require `GITHUB_REF_NAME === "v" + package.json.version`. This keeps the check inside the existing release-metadata verifier, which already has tests.

`scripts/verify-release-metadata.test.ts` will be extended with a test that rejects a mistag (e.g., `v3.0.0` against package version `3.0.0-beta.2`) and accepts a correct tag.

`.github/workflows/release.yml` will invoke the updated verifier before packaging so that a mistag fails the workflow early.

### 3. Electron-test TypeScript typecheck

`tsconfig.electron.test.json` will be updated to include `vitest/globals` types so the test project can resolve global test helpers. Adding `tsc --noEmit --project tsconfig.electron.test.json` to the `typecheck` script is the audit's recommended fix, but doing so surfaces ~140 pre-existing type errors across Electron tests and some shared source paths. Rather than leaving `npm run typecheck` red, the actual command change is deferred to a dedicated remediation pass and tracked in `docs/ROADMAP.md` as `VF-ELECTRON-TEST-TYPECHECK-2026-08-31`.

### 4. Required script coverage CI job

`.github/workflows/ci.yml` will gain a new job `script-coverage` that runs:

```bash
npm run test:coverage:scripts
```

This job will depend on `lint-and-typecheck` so it does not waste runner minutes when the typecheck contract is broken. It will upload coverage artifacts on failure.

### 5. Release artifact allowlist

`scripts/verify-dist.cjs` will be extended to build an explicit allowlist of expected artifact names (and their checksum sidecars and blockmaps) for the requested platform set. After verifying expected files, it will compare every file in `release/` against the allowlist and fail on unexpected top-level output. Only files on the allowlist are eligible for the GitHub Release action.

`scripts/verify-dist.test.ts` will gain tests for the allowlist behavior, including rejection of an unexpected file and acceptance of a complete expected set.

### 6. Repository-role bypass actor

`.github/bypass_actors.md` already documents the single remaining admin bypass as a deliberate emergency-access exception. The audit classifies this as P3 hardening with a recommendation to remove or narrow it. Because the project has documented this as intentional emergency access, the design keeps the bypass but refreshes the rationale and risk-acceptance language. If the project later decides emergency bypass is unnecessary, the same file will guide its removal.

## Files to change

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `scripts/verify-release-metadata.cjs`
- `scripts/verify-release-metadata.test.ts`
- `scripts/verify-dist.cjs`
- `scripts/verify-dist.test.ts`
- `scripts/enforce-github-rules.sh`
- `.github/bypass_actors.md`
- `package.json`
- `docs/summary_of_work.md`
- `docs/ROADMAP.md` (if remaining work remains)

## Testing

- Run `npm run typecheck` after updating the script.
- Run `npm run test:unit:scripts` to cover modified scripts.
- Run `npm run verify:release-metadata` locally.
- Run `npm run verify:dist` and `npm run verify:dist:release` locally.
- Run `npm run verify:ci-contract` to ensure CI contract still holds.

## Out-of-scope

- Live GitHub Rules01 update (requires admin access to the repository; tracked as a manual follow-up).
- Changes to Electron security settings, CSP, or main-process code (already healthy).
- Broad refactoring of workflows or verifiers; only the targeted findings are addressed.
