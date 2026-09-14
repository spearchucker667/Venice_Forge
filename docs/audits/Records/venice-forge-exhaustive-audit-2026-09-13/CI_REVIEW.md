# CI / CD Review — Venice Forge Exhaustive Audit (2026-09-13)

**Audit baseline SHA:** `2f672682d57f82e5cd2d0ecefa42a4a525a9504c`  
**GitHub Actions Status on Baseline:** **100% SUCCESS** (All 11 CI jobs + CodeQL green)

---

## 1. Hosted Workflow Health at Baseline SHA

Inspection of GitHub Actions run `34757875723` on commit `2f672682` via `gh run view 34757875723`:

| Job Name | Runner Environment | Duration | Conclusion | Notes |
|---|---|---|---|---|
| `lint-and-typecheck` | `ubuntu-22.04` | 1m 23s | **SUCCESS** | Runs `npm run lint:eslint` and `npm run typecheck` |
| `macos-sensitive-tests` | `macos-14` (arm64) | 1m 47s | **SUCCESS** | Exercises macOS safeStorage, keychain, path handling |
| `coverage` | `ubuntu-22.04` | 14m 33s | **SUCCESS** | Full test suite with v8 coverage thresholds |
| `contracts` | `ubuntu-22.04` | 2m 48s | **SUCCESS** | Static, features, and release packaging contracts |
| `unit-and-integration-tests` | `ubuntu-22.04` | 10m 40s | **SUCCESS** | Runs `npm run test:ci` |
| `windows-sensitive-tests` | `windows-2022` | 2m 53s | **SUCCESS** | Exercises Windows path separators, DPAPI, atomic replace |
| `script-coverage` | `ubuntu-22.04` | 1m 03s | **SUCCESS** | Script-specific test coverage |
| `build` | `ubuntu-22.04` | 26s | **SUCCESS** | Compiles web, server, and electron artifacts; runs `verify:dist` |
| `electron-smoke-windows` | `windows-2022` | 4m 20s | **SUCCESS** | Builds portable exe and executes packaged smoke tests |
| `electron-smoke-linux` | `ubuntu-22.04` (xvfb) | 4m 38s | **SUCCESS** | Builds AppImage/deb and executes packaged smoke tests |
| `electron-smoke-macos` | `macos-14` (arm64) | 1m 59s | **SUCCESS** | Builds .app and executes packaged smoke tests |
| **CodeQL Analysis** (`34757875712`) | `ubuntu-22.04` | 2m 42s | **SUCCESS** | JavaScript/TypeScript security static analysis |

### Resolution of Prior CI Blocker:
In commit `c6d9bed3`, the CSP smoke probe failed across all three platforms (`linux`, `windows`, `macos`) because `page.evaluate` eval was CDP-exempt from CSP. Commit `cd27ebc2` replaced the probe with an inline event-handler vector, restoring all smoke jobs to green. Commit `067dca58` drained pending macrotasks in `scenario-store.test.ts` to eliminate a latent cross-test contamination flake on Linux runners. The hosted pipeline is now completely restored.

---

## 2. Review of Workflow Configurations (`.github/workflows/`)

### 2.1 `ci.yml` (Continuous Integration)
- **Triggers:** Push to `main`, Pull Requests targeting `main`.
- **Permissions:** Minimal `contents: read`.
- **Concurrency:** `group: ci-${{ github.ref }}`, `cancel-in-progress: true`. Correctly conserves runner resources on rapid pushes.
- **Node Pinning:** Uses `actions/setup-node` pinned to `.nvmrc` (`>=22.15.0 <23.0.0`) with `cache: npm`.
- **Lockfile Enforcement:** Runs `npm ci` across all jobs, never `npm install`.
- **Packaging Hardening:**
  - On Windows: Sets `CSC_IDENTITY_AUTO_DISCOVERY: "false"` to prevent picking up stray certificates.
  - On Linux: Runs under `xvfb-run --auto-servernum` with `libgbm-dev` and `rpm` dependencies installed.
  - On failure: Automatically captures sanitized smoke diagnostics via `capture-smoke-diagnostics.cjs` and uploads artifact (excluding secrets, prompts, or user data).

### 2.2 `release.yml` (Production Packaging & Release)
- **Triggers:** Tag pushes `v*`, and manual `workflow_dispatch`.
- **Fails Closed on Unsigned Tags:**
  - Lines 74–80: Tag releases strictly require `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
  - Exits with fatal error unless `RELEASE_ALLOW_UNSIGNED=true` is explicitly set for draft exceptions.
- **Release Verification Step (`line 44`):**
  - Executes `npm run verify:release-readiness`.
  - **Identified Defect (`VF-AUD-20260913-P1-001`):** Currently fails on `--strict` i18n checks because 5 newly introduced strings across 11 locales have `__MISSING__:` prefixes. This step will block any release tag from building until resolved.
- **Artifact Verification & Integrity:**
  - Verifies macOS signature and notarization via `codesign --verify --deep --strict`, `spctl -a`, and `xcrun stapler validate`.
  - Generates SHA-256 checksums (`checksum:release`) and uploads `release-evidence/` manifest.

### 2.3 `codeql.yml`
- Pinned to GitHub recommended queries for JavaScript and TypeScript.
- Runs on push to `main` and weekly schedule.
- Zero open security alerts.

### 2.4 `dependency-review.yml`
- Runs on pull requests to check incoming package changes against GitHub Advisory Database.
- Fails on moderate+ severity advisories.
