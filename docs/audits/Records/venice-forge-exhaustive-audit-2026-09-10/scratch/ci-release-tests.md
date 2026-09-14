# CI / Release / Tests Audit Scratch

- **Auditor:** CI/release/test subagent
- **Date:** 2026-09-10
- **Baseline SHA:** `c3ae21af2f723111d92b43c7888a60930226d213` (`main`, equals `origin/main`)
- **Package:** `venice-forge@3.0.0-beta.3`
- **Scope:** `.github/workflows/{ci,codeql,dependency-review,release}.yml`, `electron-builder.config.cjs`, `package.json` scripts vs docs, Vitest skip/only/mocks/coverage, signing/notarization, `scripts/verify-*.cjs`
- **Mode:** static read-only (no local `npm test` / `npm run ci` execution in this pass)
- **Finding IDs:** `VF-AUD-20260910-CI-NNN`

This file is scratch evidence for the 2026-09-10 exhaustive audit. Historical audits are hypotheses only; claims below are re-verified against the checked-out tree and hosted GitHub state for this SHA.

---

## Counts

| Metric | Count |
|---|---:|
| Findings (this file) | 22 |
| Confirmed defect | 8 |
| Verifier drift | 3 |
| Documentation drift | 5 |
| Security risk | 4 |
| Missing feature / missing negative cases | 2 |
| External/dependency risk (CI-015; Dependabot, not an app source bug) | 1 (counted in security risk) |
| `test.only` / `describe.only` / `it.only` | 0 |
| Conditional `test.skip` / `it.skip` sites | 3 files |
| Tracked `*.test.ts(x)` files | 513 |
| Test files not targeted by `test:ci` | 65 |
| Of those, smoke-gated | 3 |
| Of those, still run via `verify:contracts` (`test:character-cards`) | 3 |
| Remainder omitted from `npm run test:ci` / `npm run ci` / `release.yml` tests | 59 |
| `scripts/verify-*.cjs` | 47 |
| Verifiers with sibling `*.test.ts` | 20 |
| Verifiers with no sibling test | 27 |
| External GitHub Action `uses:` (all workflows) | 50 references / 8 unique actions |
| Unpinned action tags/branches | 0 |
| `pull_request_target` | 0 |
| Workflows granting extra permissions beyond `contents: read` | 2 (`codeql.yml` `security-events: write`; `release.yml` publish job `contents: write`) |
| Hosted CI run `34044151608` | SUCCESS (11 jobs, including packaged smoke mac/win/linux) |
| Hosted CodeQL run `34044151609` | SUCCESS |
| Open CodeQL alerts | 0 |
| Open Dependabot alerts | 3 (1 medium vitest mocker, 2 low joi) |

Classification totals above count each finding once by its primary class.

---

## Hosted evidence for this SHA

Independently re-fetched via GitHub API (not assumed from the task prompt):

| Run | Workflow | Event | Conclusion | URL |
|---|---|---|---|---|
| 34044151608 | CI (`.github/workflows/ci.yml`) | `push` | **success** | https://github.com/spearchucker667/Venice_Forge/actions/runs/34044151608 |
| 34044151609 | CodeQL (`.github/workflows/codeql.yml`) | `push` | **success** | https://github.com/spearchucker667/Venice_Forge/actions/runs/34044151609 |

CI jobs on run 34044151608 (all `success`): `lint-and-typecheck`, `unit-and-integration-tests` (`npm run test:ci`), `coverage` (`npm run test:coverage`), `script-coverage`, `contracts` (`verify:contracts` + both `npm audit` gates), `windows-sensitive-tests`, `macos-sensitive-tests`, `build`, plus packaged smoke mac/win/linux (present in the workflow and reported SUCCESS for this SHA).

`dependency-review.yml` did **not** run for this SHA: it is `pull_request`-only, and this commit was a direct `push` to `main`.

Open Dependabot (state=open, 2026-09-10):

| Alert | Package | Severity | CVE | Locked version | Fixed in |
|---|---|---|---|---|---|
| 33 | `@vitest/mocker` (dev, via `vitest`) | medium | CVE-2026-84373 | `4.1.10` | `4.1.11` |
| 32 | `joi` (dev, transitive) | low | CVE-2026-84368 | `18.2.3` | `18.2.5` |
| 31 | `joi` (dev, transitive) | low | CVE-2026-84367 | `18.2.3` | `18.2.4` |

Missing signing/notarization **credentials** are **not** classified as source bugs. `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md` still records no verified production signed artifacts; that is external evidence debt.

---

## Verified controls (non-findings)

These were inspected and are **not** defects:

1. **No `pull_request_target`.** All four workflows use `pull_request`, `push`, `schedule`, `workflow_dispatch`, and/or `push.tags`.
2. **All external Actions are pinned to 40-hex SHAs**, with version comments. `scripts/verify-ci-contract.cjs` enforces this across `.github/workflows/*`. Unique pins:
   - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1)
   - `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` (v7.0.0)
   - `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` (v4.6.2)
   - `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093` (v4.3.0)
   - `github/codeql-action@{init,analyze}@9e3211c9a3b9311dfe05da2ed48eea3386f042dd` (v4.37.6)
   - `actions/dependency-review-action@2031cfc080254a8a887f58cffee85186f0e49e48` (v4.9.0)
   - `softprops/action-gh-release@fe965f7af51af5f2602596916f38a38df2e33de0` (v3.0.2) — third-party but pinned
3. **Default GITHUB_TOKEN is least-privilege** (`permissions.contents: read`) on CI, dependency-review, and release. CodeQL adds only `security-events: write`. Release `publish` elevates `contents: write` on that job only.
4. **Secrets are passed via `env:`**, not interpolated into `run:` source. `verify-release-packaging-hardening.cjs` asserts this.
5. **Windows signing env is isolated** (`WIN_CSC_*` only; generic `CSC_LINK` is forbidden in the Windows job).
6. **Tag releases fail closed** without signing secrets unless `vars.RELEASE_ALLOW_UNSIGNED=true` (documented exception, not a missing-credential source bug).
7. **Dist scripts use `--publish never`.** `electron-builder.config.cjs` still declares `publish.provider: github` for updater metadata, but packaging scripts do not auto-publish.
8. **CodeQL analyzes `javascript-typescript` and `actions`** with `security-extended,security-and-quality` and per-language `category`.
9. **No `.only` tests.** Conditional skips are limited to packaged smoke (`RUN_ELECTRON_SMOKE`) and archive zip/unzip availability.
10. **Node pin:** `.nvmrc` is `22.15.0`; `engines.node` is `>=22.15.0 <23.0.0`; workflows use `node-version-file: '.nvmrc'`.
11. **Hosted CI for this SHA is green**, including coverage thresholds, contracts, audits as configured, and packaged smoke.

---

## Findings

### VF-AUD-20260910-CI-001

- **Class:** confirmed defect
- **Severity:** P1
- **Title:** `test:ci` (and therefore `npm run ci` and `release.yml`) omit 59 tracked test files
- **Path:** `package.json` scripts `test:ci`, `test:unit:stores:*`, `test:ui*`; `docs/DEVELOPMENT/testing.md`; `.github/workflows/release.yml` (Test step)
- **Observed:** Expanding `test:ci` the same way `verify-ci-contract.cjs` does yields directory/file targets that miss **65 / 513** test files. Subtract 3 smoke files and 3 `test:character-cards` files still run from `verify:contracts`. **59 files never run** under `npm run test:ci`, `npm run ci`, or the release workflow test step.
- **Expected:** `docs/DEVELOPMENT/testing.md` calls `test:ci` “the aggregate correctness command”. `README.md` calls it a “Complete CI-equivalent gate”. Release packaging re-runs `npm run test:ci` as its test gate.
- **Proof:** Explicit store shards list 41 of 47 `src/stores/**/*.test.ts` files. Omitted store tests:
  - `src/stores/character-creator-launch-store.test.ts`
  - `src/stores/chat-folder-store.test.ts`
  - `src/stores/chat-media-reference.test.ts`
  - `src/stores/image-inspector-store.test.ts`
  - `src/stores/inspector-store.test.ts`
  - `src/stores/profile-store-helpers/sanitizePersistedProfileState.test.ts`
  UI shards omit entire trees, including `src/components/{documents,rp-studio,settings,status,ui,video,audio,workflows,character-creator,prompts,scenes,playground,embeddings,image-inspector}/**` (except three RP editor tests pulled in by `test:character-cards`), plus `src/main.boot.test.tsx`, `src/App.onboarding.integration.test.tsx`, and `tests/character-creator/*`.
- **Notes:** Hosted **coverage** job uses `vitest run` with only smoke / `tests/electron` / `scripts/verify-document-ingestion.test.ts` excluded, so those 59 files **do** run on `push` to `main`. They do **not** run in `release.yml`. A green local `npm run ci` is not equivalent to hosted CI.

### VF-AUD-20260910-CI-002

- **Class:** verifier drift
- **Severity:** P1
- **Title:** `verify-ci-contract.cjs` treats a `src/<dir>` prefix as fully covered
- **Path:** `scripts/verify-ci-contract.cjs` (section 10, `getTransitiveVitestTargets` / `missingSrcDirs`); `scripts/verify-ci-contract.test.ts`
- **Observed:** The verifier only checks that each `src/<top-level-dir>` that contains tests has **some** `test:ci` target equal to that prefix or starting with `src/<dir>/`. `src/stores/asset-store.test.ts` satisfies `src/stores`. `src/components/FirstRunModal.test.tsx` satisfies `src/components`. New tests under those trees are invisible.
- **Expected:** Adding a test file under an already-covered directory must fail the CI contract until a shard lists it, or shards must be directory-based rather than explicit file lists.
- **Proof:** `requiredContractTestPaths` is a fixed allowlist of `tests/*` roots plus one script test. There is no per-file union check. Sibling tests mostly assert that the **verifier source text** contains strings (see CI-005), so they cannot catch this gap.

### VF-AUD-20260910-CI-003

- **Class:** documentation drift
- **Severity:** P2
- **Title:** README and package-script test claim `test:ci` collects coverage / is CI-equivalent
- **Path:** `README.md` (Validation / CI Gates); `tests/package-scripts.test.ts` lines 70–72; `docs/RELEASE/release.md` Phase 2J table (“CI workflow … `npm test`”)
- **Observed:**
  - `README.md`: “Complete CI-equivalent gate, including coverage and feature contracts” followed by `npm run test:ci`.
  - `tests/package-scripts.test.ts`: `it("uses test:ci in the aggregate ci script so coverage is collected")` only asserts `pkg.scripts.ci` contains `npm run test:ci`.
  - `package.json` `"ci"` is `lint:eslint && typecheck && test:ci && npm audit … && build && verify:contracts && verify:dist` — **no** `test:coverage`.
  - Hosted coverage is a **separate** CI job. `npm test` is `vitest run` (full suite). `test:ci` is a subset (CI-001).
- **Expected:** Docs and the regression test must name the real commands: hosted `test:coverage` + `test:ci` + `verify:contracts`; local `npm test` is broader than `test:ci`.

### VF-AUD-20260910-CI-004

- **Class:** confirmed defect (tautological test)
- **Severity:** P2
- **Title:** `tests/package-scripts.test.ts` coverage assertion is tautological
- **Path:** `tests/package-scripts.test.ts:70-72`
- **Observed:** The test name claims coverage is collected because `ci` invokes `test:ci`. `test:ci` does not pass `--coverage` and is not `test:coverage`.
- **Expected:** Either wire coverage into `ci`, or assert the hosted workflow contains `npm run test:coverage` and stop claiming `test:ci` collects coverage.
- **Proof:** `package.json` `"test:ci"` and `"ci"` strings; `vitest.config.ts` coverage is opt-in via `--coverage`.

### VF-AUD-20260910-CI-005

- **Class:** tautological mocks / missing negative cases (verifier tests)
- **Severity:** P2
- **Title:** `verify-ci-contract.test.ts` mostly string-searches its own source; `requiredGates` is a subset
- **Path:** `scripts/verify-ci-contract.test.ts`; `scripts/verify-ci-contract.cjs` `requiredGates`
- **Observed:** The first two `describe` blocks read `verify-ci-contract.cjs` and `expect(source).toContain(...)`. They cannot fail if the verifier is weakened as long as the comment/string remains. `requiredGates` omits gates that **are** in `verify:contracts:static` / features, including `verify:lockfile`, `verify:i18n`, `verify:i18n-hardcoded-regressions`, `verify:provider-adapters`, `verify:document-agent`, `verify:backup-sync`, `verify:character-card-*`, `verify:custom-protocol-privileges`, `verify:venice-contract-drift`, `verify:prompt-language`, `verify:transitive-deprecations`. Removing those from `verify:contracts` would not fail this verifier.
- **Expected:** Negative fixtures (mutated `package.json` / `ci.yml` / omitted test file) must make the verifier exit non-zero. `requiredGates` should match the actual `verify:contracts*` closure or be generated from it.
- **Notes:** The file **does** have two real checks: spawn of the verifier against the live tree, and a SHA-pin scan of workflow `uses:` lines.

### VF-AUD-20260910-CI-006

- **Class:** confirmed defect
- **Severity:** P1
- **Title:** Signature evidence JSON is derived from a boolean flag, not from `codesign` / Authenticode output
- **Path:** `scripts/write-signature-evidence.cjs` `buildEvidence()`; `scripts/write-signature-evidence.test.ts`; `.github/workflows/release.yml` “Write macOS/Windows signature evidence”; `scripts/collect-release-evidence.cjs`
- **Observed:** For macOS, `unsigned ? "unsigned-exception" : "signed-and-notarized"` with `signed: !unsigned`, `notarized: !unsigned`. Windows sets `signatureStatus: "Valid"` whenever `--unsigned` is absent. Tests assert this mapping and never run `codesign` or `Get-AuthenticodeSignature`. `collect-release-evidence.cjs` copies `signatures.macos.status` into the published manifest.
- **Expected:** Evidence files must record actual verifier output (or refuse to claim signed/notarized when verification did not run).
- **Do not classify as:** missing Apple/Windows certificates. This is a source-level false-evidence path even when credentials exist.

### VF-AUD-20260910-CI-007

- **Class:** confirmed defect
- **Severity:** P1
- **Title:** macOS tag signature verification fail-opens if `.app` directories are missing
- **Path:** `.github/workflows/release.yml` “Verify macOS signature and notarization”
- **Observed:** Both arch blocks are `if [ -d "release/mac/Venice Forge.app" ]; then … fi` (and `mac-arm64`). If neither directory exists, the step exits 0. DMG “verification” is only `if [ -f "release/Venice-Forge-${GITHUB_REF_NAME#v}-*.dmg" ]; then echo … fi`.
- **Expected:** Missing `.app` after a tag package must fail the job. DMG presence is not signature verification.
- **Related:** `scripts/verify-dist.cjs` has **no** `codesign` / Authenticode / stapler checks (grep: zero matches). Artifact allowlisting cannot compensate.

### VF-AUD-20260910-CI-008

- **Class:** confirmed defect / documentation drift
- **Severity:** P2
- **Title:** `dmg.sign: false` contradicts the signed-artifact contract
- **Path:** `electron-builder.config.cjs` `dmg.sign: false`; `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md` (“macOS `.app`, `.dmg`, and `.zip` artifacts must be signed and notarized”); release.yml DMG branch only checks file existence
- **Observed:** electron-builder is configured not to sign the DMG. The evidence doc requires signed DMGs. Workflow does not `codesign --verify` the DMG or staple it.
- **Expected:** Either sign/notarize the DMG and verify it, or change the canonical evidence contract to “signed `.app` inside an unsigned DMG” and stop requiring signed DMGs.
- **Not classified as:** missing Developer ID secrets.

### VF-AUD-20260910-CI-009

- **Class:** confirmed defect
- **Severity:** P2
- **Title:** `release.yml` does not re-run packaged smoke or the coverage test surface
- **Path:** `.github/workflows/release.yml` Test steps (`npm run test:ci` only); compare `.github/workflows/ci.yml` `electron-smoke-*` and `coverage`
- **Observed:** Tag/dispatch release jobs run `test:ci` + `verify:release-readiness` + package + `verify:dist:*`. They never set `RUN_ELECTRON_SMOKE=true` and never run `test:coverage`. `ci.yml` is not triggered on tag push (`on.push.branches: [main]` only).
- **Expected:** A production tag must re-validate the same smoke and (at least) the union of tests hosted CI already requires, or must require that the tagged SHA already has a green CI run and fail if not.
- **Notes:** Tagging a `main` SHA that already passed CI reduces practical risk. Tagging any `v*` ref still starts `release.yml` without that check (`verify-release-metadata.cjs` only compares `GITHUB_REF_NAME` to `v${package.json.version}`).

### VF-AUD-20260910-CI-010

- **Class:** security risk
- **Severity:** P2
- **Title:** `dependency-review.yml` never runs on the actual `main`-push workflow
- **Path:** `.github/workflows/dependency-review.yml`; AGENTS.md branch policy (work on `main`, no PRs unless requested); this SHA’s event was `push`
- **Observed:** Triggers: `pull_request` to `main` **and** `paths: [package.json, package-lock.json]`. Direct pushes to `main` (including this baseline SHA) skip it. Even on PRs, a lockfile-free change skips it.
- **Expected:** If PRs are not the normal path, dependency review must run on `push` to `main` (or `workflow_run` after CI) whenever the lockfile changes. Path filters should not drop lockfile-adjacent supply-chain review if that is the stated control (`docs/RELEASE/repository-settings.md`).
- **Mitigation present:** CI `contracts` job runs `npm audit --omit=dev --audit-level=moderate` and `npm audit --audit-level=critical` (see CI-015 for the hole).

### VF-AUD-20260910-CI-011

- **Class:** security risk (supply chain / reproducibility)
- **Severity:** P3
- **Title:** `dependency-review.yml` uses floating `ubuntu-latest`; no workflow sets `persist-credentials: false`
- **Path:** `.github/workflows/dependency-review.yml` (`runs-on: ubuntu-latest`); all four workflows’ `actions/checkout` steps
- **Observed:** Other jobs pin `ubuntu-22.04` / `ubuntu-24.04` / `windows-2022` / `macos-14`. `ubuntu-latest` can move under the workflow. Checkout defaults to persisting `GITHUB_TOKEN` into the workspace for subsequent `npm ci` / `electron-builder` steps. `electron-builder.config.cjs` declares `publish.provider: github`.
- **Expected:** Pin the runner image. Set `persist-credentials: false` after checkout (release publish job may need a later explicit token). Dist scripts already pass `--publish never`; this is defense in depth, not a demonstrated leak.

### VF-AUD-20260910-CI-012

- **Class:** security risk
- **Severity:** P2
- **Title:** Packaged Electron builds do not enable ASAR integrity or Electron fuses
- **Path:** `electron-builder.config.cjs` (no `electronFuses`, no `asarIntegrity`, no `afterPack` fuse helper)
- **Observed:** `asar: true` only. Grep over `*.cjs`/`*.ts`/`*.js`/`*.yml` for `asarIntegrity`, `electronFuses`, `enableEmbeddedAsarIntegrityValidation`, `onlyLoadAppFromAsar`, `runAsNode` returns no matches.
- **Expected:** Production Electron 43 packages typically disable `runAsNode`, enable ASAR integrity, and restrict cookie encryption / node options (electron fuse defaults). Absence is a packaging hardening gap, independent of Apple/Windows certs.

### VF-AUD-20260910-CI-013

- **Class:** documentation drift
- **Severity:** P2
- **Title:** SECURITY.md / repository-settings still document a CodeQL kill switch that was removed
- **Path:** `SECURITY.md` (Static Analysis); `docs/RELEASE/repository-settings.md`; `.github/workflows/codeql.yml`; `docs/summary_of_work.md` records removal of `VENICE_FORGE_DISABLE_CODEQL`
- **Observed:** Docs: “You can opt-out by setting the repository variable `VENICE_FORGE_DISABLE_CODEQL=true`.” Current `codeql.yml` has no such `if:` and no reference to that variable. `docs/RELEASE/repository-settings.md` “Verified Live State” is dated **2026-07-16**.
- **Expected:** Docs must match the tracked workflow (CodeQL unconditional on eligible events).

### VF-AUD-20260910-CI-014

- **Class:** documentation drift
- **Severity:** P2
- **Title:** SECURITY.md overclaims the npm audit release gate
- **Path:** `SECURITY.md` (“A clean audit at the `moderate` level or higher (`npm audit --audit-level=moderate`) is a release gate requirement.”); `.github/workflows/ci.yml` / `release.yml` audit steps; `package.json` `"ci"`
- **Observed:** Actual commands are `npm audit --omit=dev --audit-level=moderate` **and** `npm audit --audit-level=critical`. Medium/high **devDependency** advisories do not fail CI. That is why CVE-2026-84373 (`vitest`/`@vitest/mocker` 4.1.10, medium, dev) and the two `joi` lows do not fail hosted CI.
- **Expected:** Either raise the complete-graph gate to `moderate`/`high`, or document the intentional production-vs-dev split.

### VF-AUD-20260910-CI-015

- **Class:** external/dependency risk (not an application source bug)
- **Severity:** P2 (dev-server) / P3 (joi)
- **Title:** Known open Dependabot CVEs are not CI-blocking under the current audit policy
- **Path:** `package-lock.json` `node_modules/vitest` 4.1.10, `node_modules/@vitest/mocker` 4.1.10, `node_modules/joi` 18.2.3; Dependabot alerts 31–33
- **Observed:** Vitest mocker path traversal is a **development-server** issue (HMR websocket), not a packaged-app issue. `joi` is a **dev** transitive (electron-builder). CI policy (CI-014) will stay green until these are upgraded.
- **Expected:** Upgrade `vitest` / `@vitest/coverage-v8` to `>=4.1.11` and `joi` to `>=18.2.5` via the lockfile; do not treat the CVEs as Venice Forge source defects.
- **Not classified as:** missing GitHub credentials.

### VF-AUD-20260910-CI-016

- **Class:** documentation drift
- **Severity:** P3
- **Title:** Canonical docs disagree on validation commands and PR vs `main`-push
- **Path:** `README.md`; `docs/DEVELOPMENT/building.md` (“Before submitting a PR”); `docs/DEVELOPMENT/testing.md`; `docs/RELEASE/release.md` Phase 2J CI row; `AGENTS.md` (work on `main`, no PRs); `.github/bypass_actors.md` (standard PR workflow)
- **Observed:**
  - `building.md` still says submit a PR and lists `npm test` (full suite), not `test:ci`.
  - `building.md` omits Linux packaging (`dist:linux` exists and is used in CI/release).
  - `dist:*` scripts already run `checksum:release`; `building.md` / `macos.md` / `release.md` tell the user to run it again (harmless duplication).
  - `release.md` Phase 2J table: CI runs `npm test` — hosted CI runs `test:ci` + separate coverage.
  - `macos.md` display text `SIGNING_AND_NOTARIZATION.md` points at `signing-and-notarization.md` (link target is correct; filename in prose is not).
- **Expected:** One command matrix: hosted jobs, local `npm run ci`, local `npm test`, release.yml.

### VF-AUD-20260910-CI-017

- **Class:** missing negative cases
- **Severity:** P2
- **Title:** electron-builder signed/notarize branch is never unit-tested
- **Path:** `electron-builder.config.cjs` `isCIRelease`; `scripts/electron-builder-config.test.ts`
- **Observed:** Tests load the config in the default env (no Apple secrets) and assert schema + Linux desktop identity. They never set `CSC_LINK`/`APPLE_*` and therefore never assert `hardenedRuntime: true` / `notarize: { teamId }` vs `identity: null`. A regression in the `isCIRelease` ternary would not fail this file.
- **Expected:** Env-gated tests for both branches, plus assertion that `dmg.sign` matches the signed-artifact contract (CI-008).

### VF-AUD-20260910-CI-018

- **Class:** missing negative cases / verifier drift
- **Severity:** P2
- **Title:** 27 contract verifiers have no sibling tests; script coverage cannot see them
- **Path:** `scripts/verify-*.cjs`; `vitest.config.ts` coverage (`all` not set); `package.json` `test:coverage:scripts`
- **Observed:** No sibling `*.test.ts`: `verify-bundle-budget`, `verify-character-card-{v2,png,security}`, `verify-document-agent`, `verify-i18n`, `verify-icon`, `verify-image-policy`, `verify-inactive-feature-archive`, `verify-lockfile`, `verify-media-studio-power-tools`, `verify-model-aware-recipes`, `verify-network-boundaries`, `verify-no-native-dialogs`, `verify-prompt-language`, `verify-prompt-library`, `verify-repo-handoff-hygiene`, `verify-research-workspace`, `verify-rp-studio-polish`, `verify-scene-composer`, `verify-scene-references`, `verify-stack-facts`, `verify-status-diagnostics`, `verify-storage-policy`, `verify-venice-contract-drift`, `verify-work-orders`, `verify-workflow-templates`.
- **Coverage:** `test:coverage:scripts` runs Vitest on `scripts/` tests. Without `coverage.all: true`, unimported `.cjs` files are absent from the map. Thresholds for that job are branches 41 / functions 38 / lines 57 / statements 56 — far below the aggregate floor (59/68/73/70) that `verify-ci-contract.cjs` protects.
- **Expected:** Negative-path tests (or a meta-test that each `verify-*.cjs` is imported/spawned and fails on a mutated fixture). Raise or isolate thresholds so untested verifiers cannot hide.

### VF-AUD-20260910-CI-019

- **Class:** confirmed defect
- **Severity:** P3
- **Title:** `checksum-release.cjs` exits 0 when `release/` is missing or empty
- **Path:** `scripts/checksum-release.cjs` lines 53–64; `scripts/checksum-release.test.ts` (no test for this path)
- **Observed:** “No release directory found. Skipping.” / “No release artifacts found to checksum.” both `process.exit(0)`. Tests cover allowlist membership and happy-path sidecar writes, not the skip.
- **Expected:** In CI/release, missing artifacts must be non-zero (or the skip must be unreachable because `verify:dist` always follows). Today `verify:dist:*` is the real gate; checksum’s fail-open is a missing negative case if step order changes.

### VF-AUD-20260910-CI-020

- **Class:** confirmed defect
- **Severity:** P3
- **Title:** macOS packaged smoke only exercises arm64; Intel mac packaging is unsmoked
- **Path:** `.github/workflows/ci.yml` `electron-smoke-macos` (`npm run dist:mac:arm64`); `electron-builder.config.cjs` still ships x64+arm64 for `dist:mac`; `docs/DEVELOPMENT/macos.md` claims official Intel support
- **Observed:** CI smoke packages `ELECTRON_BUILDER_MAC_ARCH=arm64` only. `release.yml` `dist:mac` builds both archs but does not launch them (CI-009).
- **Expected:** Smoke x64 as well, or document Intel as packaging-only / community, matching the Linux arm64 comment already in `electron-builder.config.cjs`.

### VF-AUD-20260910-CI-021

- **Class:** verifier drift
- **Severity:** P3
- **Title:** CodeQL checkout is shallow (`fetch-depth` default 1)
- **Path:** `.github/workflows/codeql.yml` checkout step
- **Observed:** GitHub’s CodeQL JS/Actions setup recommends `fetch-depth: 0`. The tracked workflow does not set it. Run 34044151609 still succeeded; this is analysis-quality drift, not a red X.
- **Expected:** `fetch-depth: 0` on the CodeQL checkout.

### VF-AUD-20260910-CI-022

- **Class:** documentation drift
- **Severity:** P3
- **Title:** Coverage job discards successful coverage artifacts; `test:coverage` excludes contract tests that `test:ci` runs
- **Path:** `.github/workflows/ci.yml` coverage upload `if: failure()`; `package.json` `"test:coverage"` excludes `tests/smoke/**/*`, `tests/electron/**/*`, `scripts/verify-document-ingestion.test.ts`
- **Observed:** Successful coverage is not retained for review. `tests/electron/productionStartupInvariant.test.ts` and `scripts/verify-document-ingestion.test.ts` run in `test:ci` / `test:contracts` but **not** in the coverage job. Neither hosted test job is a full `vitest run`; only their **union** plus smoke approximates the suite.
- **Expected:** Document the union explicitly; consider uploading coverage on success (retention-bounded) and including `tests/electron` in the coverage map.

---

## Skipped tests (inventory, not extra findings)

| File | Mechanism | When it runs |
|---|---|---|
| `tests/smoke/packaged-launch-csp.test.ts` | `test.skip` unless `RUN_ELECTRON_SMOKE=true` | CI/release smoke jobs only (release.yml: never) |
| `tests/smoke/packaged-onboarding-profile-bootstrap.test.ts` | same | same |
| `scripts/verify-archive-clean.test.ts` | `it.skip` if `zip`/`unzip` missing | Hosted Ubuntu has the tools; Windows-sensitive job does not run this file |

`tests/smoke/packaged-executable-discovery.test.ts` is **not** skip-gated, but lives under `tests/smoke/`, which `test:ci` and `test:coverage` both exclude. It only runs when a job executes `vitest run tests/smoke/`.

No `test.only` / `describe.only` / `it.only` / `xit` / `fit` in tracked tests.

---

## `package.json` scripts vs docs (compact)

| Command | Actual | Doc claim that drifts |
|---|---|---|
| `npm test` | `vitest run` (full tree; smoke tests skip) | README step 3 “full Vitest suite” — **accurate**; building.md uses this as the PR baseline |
| `npm run test:ci` | segmented subset (CI-001) | README “CI-equivalent … including coverage”; testing.md “aggregate correctness” |
| `npm run ci` | lint, typecheck, **test:ci**, audits, build, contracts, verify:dist | Does **not** run coverage; AGENTS.md still lists `npm test` then `npm run ci` (duplicate + different surfaces) |
| `npm run test:coverage` | almost-full `vitest run --coverage` with three excludes | Hosted only; not in `ci` script |
| `verify:contracts` | static + features + release-hardening | Hosted `contracts` job and `ci` script; not inside `test:ci` |
| `dist:*` | clean, verify:icon, build, electron-builder `--publish never`, checksum | Docs repeat checksum/build |
| `verify:i18n` | `--allow-missing-markers --allow-key-name-fallbacks` | Release uses `verify:i18n:release` (`--strict`) via `verify:release-readiness` |

---

## Signing / notarization (config vs secrets)

| Item | Tree state | Classification |
|---|---|---|
| Tag fail-closed without `CSC_*` / `WIN_CSC_*` / Apple IDs | Implemented in `release.yml` | Control; missing secrets ≠ source bug |
| `RELEASE_ALLOW_UNSIGNED=true` bypass | Implemented + documented | Intentional exception; residual release-safety risk if left set |
| `isCIRelease` requires all five Apple env vars | `electron-builder.config.cjs` | Unsigned local builds set `identity: null`, `notarize: false` |
| Windows portable Authenticode | Warning only in release.yml; documented in `release.md` as unsigned-by-default | Matches docs; primary signed channel is NSIS |
| Linux signing | Explicitly `no-code-signing` | Documented |
| Evidence JSON | Flag-derived (CI-006) | Source defect |
| `SIGNED_ARTIFACT_EVIDENCE.md` table | all `pending` | External evidence debt, not a source bug |
| Electron fuses / ASAR integrity | Unset (CI-012) | Source hardening gap |

---

## Supply-chain workflow YAML (independent inspection)

| Check | Result |
|---|---|
| `pull_request_target` | none |
| Unpinned `uses: org/action@vN` / `@branch` | none (verifier + manual scan) |
| Third-party actions | `softprops/action-gh-release` only; SHA-pinned |
| Floating runner labels | `ubuntu-latest` in dependency-review only (CI-011) |
| Workflow-level write permissions | none except CodeQL `security-events` and release publish `contents: write` |
| Secrets in `run:` scripts | none (env-only; verifier-enforced) |
| `workflow_run` / `issue_comment` / untrusted checkout execute | none |

---

## Remaining / deferred (out of this pass)

- No local execution of `npm run test:ci`, `npm run test:coverage`, or `npm run verify:contracts` in this subagent pass (static proof only).
- No attempt to exercise signing/notarization (credentials out of scope; not source bugs).
- Hosted CI logs were not downloaded; job conclusions came from the Actions API.
- App-level tautological mocks outside CI/release tests were sampled (`toBeDefined`/`toHaveBeenCalled` without args exist but many are legitimate). No `expect(true).toBe(true)` found. Deep per-suite mock quality belongs to domain audit slices.
- `VF-VERIFY-005` signed/headed/paid acceptance remains external (`docs/ROADMAP.md`); not re-opened here as a CI YAML bug.

---

## Finding ID index

| ID | Class | Sev | One-line |
|---|---|---|---|
| CI-001 | confirmed defect | P1 | `test:ci` omits 59 tests |
| CI-002 | verifier drift | P1 | CI contract prefix check hides omitted files |
| CI-003 | documentation drift | P2 | README/`release.md` misstate test/coverage commands |
| CI-004 | confirmed defect | P2 | package-scripts test tautologically “collects coverage” |
| CI-005 | tautological tests | P2 | ci-contract tests search their own source; `requiredGates` incomplete |
| CI-006 | confirmed defect | P1 | signature evidence is a boolean, not codesign |
| CI-007 | confirmed defect | P1 | macOS codesign step fail-opens if `.app` missing |
| CI-008 | confirmed defect | P2 | `dmg.sign: false` vs signed-DMG contract |
| CI-009 | confirmed defect | P2 | release.yml skips smoke + coverage surface |
| CI-010 | security risk | P2 | dependency-review never runs on main push |
| CI-011 | security risk | P3 | `ubuntu-latest` + checkout credential persistence |
| CI-012 | security risk | P2 | no Electron fuses / ASAR integrity |
| CI-013 | documentation drift | P2 | CodeQL disable-var still documented |
| CI-014 | documentation drift | P2 | SECURITY.md overclaims `npm audit` moderate-all |
| CI-015 | external/dep risk | P2 | vitest/joi Dependabot CVEs not CI-blocking |
| CI-016 | documentation drift | P3 | PR vs main, Linux packaging, checksum duplication |
| CI-017 | missing negative cases | P2 | electron-builder notarize branch untested |
| CI-018 | missing negative cases | P2 | 27 verifiers untested; script coverage `all` false |
| CI-019 | confirmed defect | P3 | checksum-release skip-exit 0 |
| CI-020 | confirmed defect | P3 | mac smoke arm64-only |
| CI-021 | verifier drift | P3 | CodeQL shallow clone |
| CI-022 | documentation drift | P3 | coverage artifacts/excludes vs test:ci union |

**Primary-class counts (22, one class each):** confirmed defect 8 (001, 004, 006, 007, 008, 009, 019, 020); verifier drift 3 (002, 005, 021); documentation drift 5 (003, 013, 014, 016, 022); security risk 4 (010, 011, 012, 015); missing negative cases 2 (017, 018). CI-015 is an open Dependabot/devDependency advisory, not an application source bug. CI-005 is tautological verifier tests (counted as verifier drift).
