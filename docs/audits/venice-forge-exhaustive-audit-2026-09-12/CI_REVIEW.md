# Venice Forge — CI Review

**Audit date:** 2026-09-12

---

## Workflow Files

| File | Last modified | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | 2026-09-01 | PR and push validation |
| `.github/workflows/release.yml` | 2026-09-11 | Release packaging and publication |
| `.github/workflows/codeql.yml` | 2026-08-25 | GitHub CodeQL security analysis |
| `.github/workflows/dependency-review.yml` | 2026-07-24 | Dependency vulnerability review on PRs |

---

## ci.yml Review

### Job Structure

| Job | Runner | Timeout |
|---|---|---|
| `build` (main) | ubuntu-22.04 | 45 min |
| `windows-sensitive-tests` | windows-2022 | 30 min |
| `macos-sensitive-tests` | macos-14 | 30 min |
| `electron-smoke-macos` | macos-14 | 45 min |
| `electron-smoke-windows` | windows-2022 | 45 min |
| `electron-smoke-linux` | ubuntu-22.04 | 45 min |

### Gate Quality

- ✅ Node version pinned to `.nvmrc` via `actions/setup-node`
- ✅ Uses `npm ci` (not `npm install`) for reproducible installs
- ✅ ESLint runs with zero-warnings gate
- ✅ TypeScript checked separately from build
- ✅ `npm run test:ci` (not `npm test`) for CI-optimized test run
- ✅ Coverage thresholds enforced
- ✅ All 30+ verifiers run as part of `verify:contracts`
- ✅ `npm audit --omit=dev --audit-level=moderate` AND `npm audit --audit-level=critical`
- ✅ Build output verified via `verify:dist`
- ✅ Packaged smoke tests on all 3 platforms (macOS, Windows, Linux)
- ✅ Smoke jobs depend on `build` job completing (not run speculatively)

### Action Reference Pinning

All 50 external GitHub Actions references are pinned to full 40-character SHA digests, verified by `verify:ci-contract`. Example:
```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
```

Assessment: ✅ Excellent supply-chain security hygiene.

### Smoke Test Diagnostics

On failure, each smoke job:
1. Runs `scripts/capture-smoke-diagnostics.cjs` to produce sanitized diagnostics
2. Uploads to GitHub Artifacts via `actions/upload-artifact` (failure only)
3. Artifact name includes `github.sha` for traceability

The diagnostic collector is documented as "sanitized only — no secrets, prompts, raw generated media, or unredacted userData."

---

## release.yml Review

### Signing and Notarization

| Platform | Credential Handling | Assessment |
|---|---|---|
| macOS | `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` via repository secrets | ✅ |
| Windows | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (VERIFY-054: separate from macOS CSC) | ✅ |
| Linux | No code signing (expected for AppImage/deb/rpm) | ✅ |

**Tag release fail-closed check:** If signing credentials are absent on a tagged release, the job fails unless `RELEASE_ALLOW_UNSIGNED=true` variable is explicitly set. This prevents accidental unsigned releases.

### Release Artifact Pipeline

1. Build and package on each platform (macOS arm64/x64, Windows x64/portable, Linux)
2. Upload artifacts to GitHub Artifacts
3. Run `checksum:release` to generate SHA-256 checksums
4. Publish job downloads artifacts from Artifacts (does not re-build)
5. Verifies artifact integrity before publishing to GitHub Releases

Assessment: ✅ Correct artifact custody chain; no local build outputs are trusted in the publish step.

### Dependency Audit in Release

The release job runs:
```yaml
- run: npm audit --omit=dev --audit-level=moderate
- run: npm audit --audit-level=critical
```

**Note:** Because `react` and `react-dom` are in `devDependencies` (VF-AUD-20260912-P1-004), `npm audit --omit=dev` skips auditing React's transitive dependency graph. This is a gap in the security audit coverage.

---

## codeql.yml Review

- Analyzes `javascript-typescript` and `actions` languages
- Deterministic categories for proper tracking
- ✅ Verified by `verify:ci-contract`

---

## dependency-review.yml Review

- Runs on pull requests
- Reviews new dependencies for vulnerabilities before merge
- ✅ Tracked by CI contract check

---

## Overall CI Assessment

**CI posture: EXCELLENT**

The CI pipeline is comprehensive, well-structured, and follows security best practices. All action SHAs are pinned. Three-platform smoke testing provides real packaging validation. The release pipeline correctly separates build artifacts from the publish step.

The single gap is that `react`/`react-dom` in `devDependencies` causes them to be excluded from `--omit=dev` audit scans (VF-AUD-20260912-P1-004).
