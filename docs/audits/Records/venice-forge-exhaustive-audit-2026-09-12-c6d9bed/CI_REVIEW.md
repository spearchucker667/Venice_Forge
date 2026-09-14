# CI Review — audit of `main` @ `c6d9bed3`

## Hosted workflow inspection (GitHub API via authenticated `gh`)

Runs on `main` around the baseline (queried 2026-09-13):

| SHA | Workflow | Status | Conclusion | Started (UTC) |
|---|---|---|---|---|
| `c6d9bed3…` | CodeQL | completed | **success** | 2026-09-13T06:33:09Z |
| `c6d9bed3…` | CI | completed | **failure** | 2026-09-13T06:33:09Z |
| `bb29350e…` | CodeQL | completed | success | 2026-09-13T06:23:11Z |
| `bb29350e…` | CI | completed | **cancelled** | 2026-09-13T06:23:11Z |
| `84cf5bbe…` | CodeQL | completed | success | 2026-09-12T14:07:43Z |
| `84cf5bbe…` | CI | completed | success | 2026-09-12T14:07:43Z |

### Run 34743024816 (CI on `c6d9bed3`) — job conclusions

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
| electron-smoke-macos | **failure** |
| electron-smoke-windows | **failure** |
| electron-smoke-linux | **failure** |

Failure mode (from `gh run view --log-failed`): identical across all three platforms —

```
FAIL tests/smoke/packaged-launch-csp.test.ts > packaged renderer CSP blocks inline scripts
AssertionError: expected true to be false
❯ tests/smoke/packaged-launch-csp.test.ts:88:31
```

That is finding `VF-AUD-20260912-C6-P1-001`. The probe was added in `bb29350e`; that
commit's own CI run was cancelled (superseded by the next push before completion), which
is why the red state was first observed on `c6d9bed3`. The last fully green CI on `main`
was `84cf5bbe`.

## Workflow definition review (as checked into the baseline)

- `.github/workflows/ci.yml`: triggers push/PR on `main`; least-privilege
  (`permissions: contents: read`); concurrency cancellation; per-job timeouts; Node
  installed from `.nvmrc` (22.15.0); `npm ci` everywhere (lockfile honored); aggregate
  coverage exactly once with the script-coverage shard separated (correct handling of
  the global-threshold overwrite problem); Windows + macOS sensitive jobs exercise
  platform-specific filesystem/safeStorage paths; three packaged-smoke jobs (mac/win/
  linux) build real artifacts, run `tests/smoke/` with `RUN_ELECTRON_SMOKE=true`,
  clean staging dirs, verify dist, and upload sanitized failure-only diagnostics.
  All actions are SHA-pinned with version comments. No `continue-on-error` on gates.
- `.github/workflows/codeql.yml`: `security-events: write` scoped correctly; matrix over
  `javascript-typescript` and `actions` languages; weekly schedule. Pass on baseline.
- `.github/workflows/release.yml`: workflow_dispatch + `v*` tags; build-macos/windows/
  linux then a draft-publish job. Fails closed on missing signing credentials unless
  `RELEASE_ALLOW_UNSIGNED=true` (deliberate, logged as warning); verifies codesign +
  `spctl` + `stapler validate` on macOS, Authenticode on Windows (portable warning-only
  as documented in `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md`); generates checksums and
  `release-evidence/` artifacts; verify-dist re-run in the publish job before
  `softprops/action-gh-release` with `draft: true` and prerelease inferred from the tag.
  Tag/version parity is verified via `verify:release-metadata`.
- `.github/workflows/dependency-review.yml` present (dependency scanning on PRs).

### Findings

1. **C6-P1-001** (see `FINDINGS.md`) — the only CI defect; everything else about the
   pipeline design is sound.
2. Improvement (non-defect): the packaged-smoke jobs are the only CI jobs that can break
   without any local signal for contributors who never build a package; a short
   "how to run packaged smokes locally" note exists in `docs/DEVELOPMENT/testing.md`
   per prior handoffs — verify it mentions `RUN_ELECTRON_SMOKE=true` explicitly when
   remediating C6-P1-001.

No hosted security-alert state was queried beyond CodeQL conclusions (workflow-run
level). CodeQL is green on the baseline SHA.
