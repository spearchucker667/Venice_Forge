# Repository TODO Roadmap

> Current canonical TODO roadmap saved on 2026-06-17 after a live checkout
> audit on `main` at `757efbe`, using the repo-supported Node 22 toolchain.
> Historical audit reports are evidence snapshots only; do not treat their
> unchecked items, line numbers, or pass/fail claims as current without
> rerunning validation.

## 1. Current-State Summary

### What this repo appears to do

Venice Forge is a local-first Electron + Vite + React + TypeScript app for
Venice API workflows: chat, image/audio/video generation, media management,
character/RP workflows, prompt/scene/workflow tools, research via Venice/Jina,
storage/privacy diagnostics, and desktop packaging.

### Tech stack

Electron 42, React 19, Vite 6, TypeScript 5.8 strict, Zustand 5, Express 4
proxy, Vitest 4, electron-builder 26, GitHub Actions, Node 22/npm 10.

### Maturity assessment

High active-development maturity. The repo has strong validation gates,
extensive tests, Electron boundary hardening, release scripts, docs,
legal/privacy files, dependency automation, and tracked verifier scripts. It is
not fully production-release complete because signed/notarized artifact
evidence and non-macOS packaged smoke coverage remain incomplete.

### Biggest strengths

- Clean source validation on repo-supported Node `v22.22.3` / npm `10.9.8`.
- Strong Electron defaults: `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`, CSP, URL/navigation guards.
- Centralized Venice/Jina network boundaries and safety verifiers.
- Extensive regression suite: 250 test files, 3,146 tests, current coverage
  thresholds pass.
- Release workflow produces Windows/macOS/Linux artifacts with checksum and
  artifact verification.
- Security/legal docs exist: `SECURITY.md`, `PRIVACY.md`, `LEGAL.md`,
  `LICENSE`, `CODE_OF_CONDUCT.md`.

### Biggest weaknesses

- Production signing/notarization evidence is still external/open.
- Packaged smoke testing exists only for macOS CI; local smoke test skips unless
  `RUN_ELECTRON_SMOKE=true`.
- CodeQL exists but is manual and gated behind
  `VENICE_FORGE_ENABLE_ADVANCED_CODEQL`.
- Several large modules remain hard to review safely.
- Some UI/privacy maintenance actions are visible/planned but not implemented
  behind the action dispatcher.
- Package metadata and older prompt/workspace naming disagree.

### Immediate risks

No source-level P0 build/test failure was found. Immediate release risks are
process/artifact risks: unsigned Windows/macOS production artifacts, missing
Windows packaged smoke proof, and repository identity drift between the local
checkout path / older prompt name and active `Venice_Forge` metadata.

### Runnable/buildable/testable/maintainable assessment

Runnable/buildable/testable: yes, verified. Maintainable: improving, but large
UI/IPC files and stale historical audit artifacts will slow outside
contributors unless the current roadmap and ledger stay authoritative.

---

## 2. Repository Evidence Map

### Verified entry points

- Electron main: `electron/main.ts`; package main:
  `dist-electron/electron/main.js`.
- Electron preload: `electron/preload.ts`; exposes `window.veniceForge` via
  `contextBridge`.
- Renderer: `src/main.tsx`, `src/App.tsx`, root `index.html`.
- Vite config: `vite.config.ts`.
- Local/dev server and API proxy: `server.ts`.
- Packaged desktop app: `electron-builder.config.cjs`,
  `scripts/build-electron.cjs`, `scripts/start-production.cjs`.

### Verified source directories

`src/components`, `src/services`, `src/stores`, `src/hooks`, `src/utils`,
`src/config`, `src/types`, `src/shared`, `src/theme`, `src/research`,
`electron/ipc`, `electron/services`, `electron/utils`, `tests`, `scripts`.

### Verified build/config files

`package.json`, `package-lock.json`, `.nvmrc`, `vite.config.ts`,
`vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`,
`tsconfig.electron.json`, `tsconfig.electron.test.json`,
`electron-builder.config.cjs`, `.env.example`, `.config/config.example.yaml`.

### Verified test files

251 tracked test paths from `git ls-files '*.test.ts' '*.test.tsx' 'tests/**'`.
Key areas include `server.test.ts`, `electron/**/*.test.ts`,
`src/**/*.test.ts(x)`, `tests/safety`, `tests/storage`,
`tests/smoke/electron-smoke.test.ts`, and
`tests/electron/productionStartupInvariant.test.ts`.

### Verified CI/CD workflows

`.github/workflows/ci.yml`, `release.yml`, `codeql.yml`,
`dependency-review.yml`.

### Verified documentation files

`README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, `PRIVACY.md`,
`LEGAL.md`, `LICENSE`, `docs/ABOUT.md`, `docs/DEVELOPMENT/*`,
`docs/RELEASE/*`, `docs/legal/*`, `docs/design/*`, `docs/audits/*`,
`docs/summary_of_work.md`.

### Verified release/package files

`electron-builder.config.cjs`, `build/icon.ico`, `build/icon.icns`,
`build/icon.png`, `scripts/checksum-release.cjs`, `scripts/verify-dist.cjs`,
`scripts/verify-release-packaging-hardening.cjs`, `scripts/clean-repo-zip.sh`,
`.github/workflows/release.yml`.

### Verified security-sensitive files

`electron/main.ts`, `electron/preload.ts`, `electron/ipc/handlers.ts`,
`electron/services/secureStore.ts`, `electron/services/guardPipeline.ts`,
`electron/services/bridgeServer.ts`, `server.ts`,
`src/services/desktopBridge.ts`, `src/services/diagnosticsService.ts`,
`src/shared/redaction.ts`, `src/shared/urlSecurity.ts`, `src/shared/safety/*`.

### Missing or recommended standard repo files

No major standard community files are missing. Present: `CODEOWNERS`, issue
templates, PR template, Dependabot, CodeQL, dependency review, security policy,
support docs, code of conduct, and license.

Recommended new/updated files:

- `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md` (new)
- `.github/workflows/packaged-smoke.yml` or added jobs in `ci.yml`
  (new/modified)
- `docs/DOCS_INDEX.md` (new)

---

## 3. Critical Findings

- **Evidence:** `docs/summary_of_work.md` says P0-002 remains external:
  credential-backed macOS notarization and Windows signing evidence.
  `electron-builder.config.cjs` enables notarization only when signing/Apple
  credentials exist. `release.yml` warns and creates unsigned draft artifacts
  unless `VENICE_FORGE_REQUIRE_SIGNED_RELEASE=true`.
  **Impact:** A public production release can still ship unsigned/not-notarized
  draft artifacts if maintainers publish without checking.
  **Priority:** P0.
  **Affected files:** `.github/workflows/release.yml`,
  `electron-builder.config.cjs`, `docs/RELEASE/signing-and-notarization.md`,
  `docs/summary_of_work.md`.
  **Recommended fix:** Require signed release mode for production tags, record
  downloaded artifact signature/notarization verification, and document unsigned
  draft policy.
  **Validation:** `codesign --verify --deep --strict`, `spctl -a -vv`,
  `xcrun notarytool log`, Windows `Get-AuthenticodeSignature`,
  `npm run verify:dist:release`.

- **Evidence:** `ci.yml` has `electron-smoke-macos`;
  `tests/smoke/electron-smoke.test.ts` supports Windows portable and macOS app
  lookup, but local `npm run smoke:electron` skipped because
  `RUN_ELECTRON_SMOKE` was unset. No Windows packaged smoke CI job was found.
  **Impact:** Windows packaging/startup regressions can escape despite Windows
  being a primary target.
  **Priority:** P1.
  **Affected files:** `.github/workflows/ci.yml`,
  `tests/smoke/electron-smoke.test.ts`.
  **Recommended fix:** Add Windows packaged portable smoke job with
  `RUN_ELECTRON_SMOKE=true`; document Linux smoke status separately.
  **Validation:** CI run on `windows-latest` packages `npm run dist:portable`
  or `npm run dist:win`, then runs
  `RUN_ELECTRON_SMOKE=true npm run smoke:electron`.

- **Evidence:** Older task prompts and local checkout path use
  `Windows-Venice-API-connector`, but `git remote -v`, `package.json`,
  `README.md`, and `electron-builder.config.cjs` point to
  `spearchucker667/Venice_Forge`.
  **Impact:** Contributors and release consumers can land in the wrong
  repo/issues/releases if the old name keeps circulating.
  **Priority:** P1.
  **Affected files:** `package.json`, `README.md`, `electron-builder.config.cjs`,
  `.github/ISSUE_TEMPLATE/config.yml`, release docs.
  **Recommended fix:** Decide canonical public repository slug and align all
  metadata, badges, release publish config, docs, and user-facing links.
  **Validation:** `rg -n "Windows-Venice-API-connector|Venice_Forge|github.com/spearchucker667" package.json README.md docs .github electron-builder.config.cjs`.

---

## 4. TODO Roadmap

### P0 - Critical Blockers

- [x] **P0 - Release: Capture signed and notarized artifact proof before production publish**
  - **Evidence:** `docs/summary_of_work.md` records P0-002 as external;
    `release.yml` only warns when signing secrets are absent unless
    `VENICE_FORGE_REQUIRE_SIGNED_RELEASE=true`; `electron-builder.config.cjs`
    uses signing/notarization only when credentials exist.
  - **Why:** Windows/macOS users need trustworthy desktop artifacts; unsigned
    production builds trigger Gatekeeper/SmartScreen and weaken supply-chain
    trust.
  - **Action:** Configure signing secrets, set
    `VENICE_FORGE_REQUIRE_SIGNED_RELEASE=true` for production tags, run a tagged
    release, download artifacts, and record macOS/Windows signature evidence.
  - **Files likely affected:** `.github/workflows/release.yml`,
    `docs/RELEASE/signing-and-notarization.md`,
    `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md` (new),
    `docs/summary_of_work.md`.
  - **Validate:** `npm run verify:dist:release`;
    `codesign --verify --deep --strict`; `spctl -a -vv`;
    `xcrun notarytool log`; Windows `Get-AuthenticodeSignature`.
  - **Risk if ignored:** A public release may ship unsigned or unverifiable
    installers.

### P1 - Production Readiness

- [x] **P1 - CI/CD: Add Windows packaged Electron smoke coverage**
  - **Evidence:** `.github/workflows/ci.yml` only has `electron-smoke-macos`;
    `tests/smoke/electron-smoke.test.ts` supports Windows portable lookup;
    local `npm run smoke:electron` skipped because `RUN_ELECTRON_SMOKE` was not
    set.
  - **Why:** Windows is a primary supported platform.
  - **Action:** Add a Windows CI job that packages portable or installer output
    and runs smoke with `RUN_ELECTRON_SMOKE=true`.
  - **Files likely affected:** `.github/workflows/ci.yml`,
    `tests/smoke/electron-smoke.test.ts`.
  - **Validate:** `RUN_ELECTRON_SMOKE=true npm run smoke:electron` on
    `windows-latest` after packaging.
  - **Risk if ignored:** Windows startup/package regressions can ship.

- [x] **P1 - GitHub Hygiene: Resolve canonical repository URL and metadata drift**
  - **Evidence:** Older prompt/workspace naming uses
    `Windows-Venice-API-connector`; actual remote and package metadata point to
    `spearchucker667/Venice_Forge`.
  - **Why:** Public users and outside contributors need one canonical
    issue/release/security location.
  - **Action:** Confirm canonical slug, then align package metadata, badges,
    release publish repo, issue-template links, README clone commands, and
    release docs.
  - **Files likely affected:** `package.json`, `README.md`,
    `electron-builder.config.cjs`, `.github/ISSUE_TEMPLATE/config.yml`,
    `docs/RELEASE/*`.
  - **Validate:** `rg -n "Windows-Venice-API-connector|Venice_Forge|github.com/spearchucker667" package.json README.md docs .github electron-builder.config.cjs`.
  - **Risk if ignored:** Users may file bugs, fetch releases, or audit source
    from the wrong repository.

- [x] **P1 - Security Automation: Make CodeQL run on PR/push or scheduled scans**
  - **Evidence:** `.github/workflows/codeql.yml` exists but only has
    `workflow_dispatch` and `if: vars.VENICE_FORGE_ENABLE_ADVANCED_CODEQL == 'true'`.
  - **Why:** Manual, variable-gated code scanning is easy to forget.
  - **Action:** Add `pull_request`, `push`, or scheduled triggers, or document a
    repository-level default setup requirement that is externally enforced.
  - **Files likely affected:** `.github/workflows/codeql.yml`, `SECURITY.md`,
    `docs/RELEASE/repository-settings.md`.
  - **Validate:** GitHub checks show CodeQL on PRs or scheduled runs.
  - **Risk if ignored:** Security regressions may not be scanned before merge.

- [x] **P1 - Testing: Clean or classify full-suite jsdom canvas warnings**
  - **Evidence:** `npm test -- --run` and `npm run test:coverage` passed but
    emitted repeated `HTMLCanvasElement.getContext()` not implemented warnings.
  - **Why:** Noisy test output hides real warnings.
  - **Action:** Add a Vitest setup mock for canvas paths or isolate
    canvas-dependent tests.
  - **Files likely affected:** `vitest.config.ts`, `tests/setup.ts` (new),
    canvas/image component tests.
  - **Validate:** `npm test -- --run` and `npm run test:coverage` pass without
    unclassified warnings.
  - **Risk if ignored:** Real regressions become easier to miss in CI logs.

- [x] **P1 - Dependency Hygiene: Reduce or document deprecated transitive packages**
  - **Evidence:** `npm ci` passes but warns for `inflight`, `rimraf@2`,
    `lodash.isequal`, `glob@7`, and `boolean`.
  - **Why:** Deprecated transitives can become future vulnerability or install
    blockers.
  - **Action:** Run dependency-path analysis, upgrade direct dependencies where
    feasible, and document unavoidable upstream holdouts.
  - **Files likely affected:** `package.json`, `package-lock.json`,
    `docs/DEVELOPMENT/troubleshooting.md`.
  - **Validate:** `npm ci`; `npm ls inflight rimraf lodash.isequal glob boolean`.
  - **Risk if ignored:** Future npm/node changes can break installs or audits.

### P2 - Quality, DX, and Maintainability

- [x] **P2 - Architecture: Extract oversized modules into smaller reviewable units**
  - **Evidence:** `wc -l` shows `electron/ipc/handlers.ts` 1,408 lines,
    `SettingsView.tsx` 1,007, `gallery-view.tsx` 962,
    `media-inspector.tsx` 912, `CommandPalette.tsx` 816,
    `desktopBridge.ts` 944, `server.ts` 936.
  - **Why:** Large files make security review and regression isolation harder.
  - **Action:** Extract IPC channel groups, Settings sections, gallery inspector
    actions, command registry sections, and desktop bridge domains without
    behavior changes.
  - **Files likely affected:** Listed files plus new sibling modules.
  - **Validate:** `npm run lint:eslint`; `npm run typecheck`; focused tests for
    extracted modules; `npm run verify:contracts`.
  - **Risk if ignored:** Future changes will be slower and riskier to audit.

- [x] **P2 - Storage/Privacy UX: Remove or wire unimplemented maintenance-plan actions**
  - **Evidence:** `src/services/storageMaintenance.ts` creates
    `copy-privacy-summary` and `export-privacy-summary` actions, but
    `applyMaintenanceAction()` default returns "Action not implemented or
    supported"; the dashboard also has separate top-level Copy/Export buttons.
  - **Why:** Users can see actions that fail when run.
  - **Action:** Either remove those actions from the maintenance plan or route
    them to the store's `copySafeSummary` / `exportSafeSummary`.
  - **Files likely affected:** `src/services/storageMaintenance.ts`,
    `src/components/privacy/StoragePrivacyDashboard.tsx`,
    `src/services/storageMaintenance.test.ts`.
  - **Validate:** `npm run verify:storage-privacy`.
  - **Risk if ignored:** Privacy dashboard presents broken controls.

- [x] **P2 - Storage/Privacy UX: Add first-load error/retry state**
  - **Evidence:** `StoragePrivacyDashboard.tsx` renders only a loading state
    while `inventory` is null; `storage-privacy-store.ts` catches refresh
    errors, clears `refreshing`, and toasts, but does not persist an error
    state.
  - **Why:** A failed first inventory leaves the dashboard ambiguous.
  - **Action:** Add `error` state and retry UI.
  - **Files likely affected:** `src/stores/storage-privacy-store.ts`,
    `src/components/privacy/StoragePrivacyDashboard.tsx`, tests.
  - **Validate:** `npm run verify:storage-privacy`; targeted dashboard failure
    test.
  - **Risk if ignored:** Users cannot recover clearly from storage inventory
    failures.

- [x] **P2 - Media UX: Use canonical clipboard helper in gallery and embeddings**
  - **Evidence:** `media-inspector.tsx` calls `navigator.clipboard.writeText`
    directly at prompt/negative/seed/metadata/recipe copy sites;
    `embeddings-view.tsx` does the same for vectors.
  - **Why:** Direct clipboard calls may fail in restricted contexts and bypass
    fallback/error handling.
  - **Action:** Route these through the existing `copyText` helper pattern from
    `src/stores/media-send-to.ts` or a shared clipboard utility.
  - **Files likely affected:** `src/components/gallery/media-inspector.tsx`,
    `src/components/embeddings/embeddings-view.tsx`, clipboard tests.
  - **Validate:** `npm test -- --run src/components/gallery/media-inspector.test.tsx src/components/embeddings/embeddings-view.test.tsx`.
  - **Risk if ignored:** Copy actions fail silently in some browser/Electron
    contexts.

- [x] **P2 - Coverage: Target high-risk low-coverage modules before raising thresholds**
  - **Evidence:** Coverage passes globally but reports low coverage for
    `electron/ipc/rpHandlers.ts`, `src/services/desktopBridge.ts`,
    `src/components/SettingsView.tsx`, `StatusView.tsx`, music views/hooks, and
    other UI paths.
  - **Why:** Global thresholds can hide weak coverage on user-facing or
    boundary modules.
  - **Action:** Add targeted tests for low-coverage, high-risk modules; then
    raise thresholds incrementally.
  - **Files likely affected:** Low-coverage files and corresponding tests.
  - **Validate:** `npm run test:coverage`.
  - **Risk if ignored:** Important paths can regress while global coverage
    remains green.

- [x] **P2 - Performance: Add bundle budgets and reduce initial renderer chunk size**
  - **Evidence:** `npm run build` emits `dist/assets/index-ijmoMU_S.js` at
    919.43 kB and PDF worker at 1,375.84 kB; `vite.config.ts` only sets
    `chunkSizeWarningLimit: 1000`.
  - **Why:** Large initial assets slow startup and updates.
  - **Action:** Add budget checks and lazy-load heavy routes/workers where
    practical.
  - **Files likely affected:** `vite.config.ts`, route imports in `src/App.tsx`,
    feature component lazy boundaries.
  - **Validate:** `npm run build`; recommended new bundle-budget script.
  - **Risk if ignored:** Startup and package size regressions go unnoticed.

- [x] **P2 - Documentation: Keep one canonical current roadmap**
  - **Evidence:** The old `docs/audits/Repository TODO Roadmap — Venice Forge.md`
    and `docs/audits/roadmap-verification-2026-06-16.yaml` duplicated and
    partially contradicted this file.
  - **Why:** Outside contributors and agents need one current TODO source.
  - **Action:** Keep this file plus `docs/summary_of_work.md` authoritative;
    delete or archive duplicate roadmap/status snapshots when they become
    former-bug evidence.
  - **Files likely affected:** `docs/audits/repository-todo-roadmap-current.md`,
    `docs/DOCS_INDEX.md`, `docs/summary_of_work.md`.
  - **Validate:** `npm run verify:markdown-links`; `npm run verify:agent-docs`.
  - **Risk if ignored:** Duplicate or already-closed issues waste review time.

### P3 - Future Enhancements

- [x] **P3 - Packaging: Decide Linux support wording and maintainer metadata**
  - **Evidence:** `electron-builder.config.cjs` has Linux x64 AppImage/deb/rpm
    targets and placeholder maintainer `venice-forge@localhost.invalid`;
    `docs/DEVELOPMENT/platform-support.md` says Linux is not officially
    packaged but CI builds Linux artifacts.
  - **Why:** Users need clear support boundaries.
  - **Action:** Either make Linux experimental with precise wording or remove
    release prominence; replace placeholder maintainer email if distributing
    `.deb`/`.rpm`.
  - **Files likely affected:** `electron-builder.config.cjs`, `README.md`,
    `docs/DEVELOPMENT/platform-support.md`, `docs/RELEASE/release.md`.
  - **Validate:** `npm run verify:release-packaging-hardening`;
    `npm run verify:dist:linux` in Linux CI.
  - **Risk if ignored:** Linux users may assume unsupported artifacts are
    production-supported.

- [x] **P3 - Image Studio: Derive downloaded image extension from MIME type**
  - **Evidence:** `image-view.tsx` saves generated images as
    `venice-image*.png` regardless of actual returned media type.
  - **Why:** Incorrect extensions can confuse users and external tools.
  - **Action:** Parse/track returned MIME and choose `.png`, `.jpg`, `.webp`,
    etc.
  - **Files likely affected:** `src/components/image/image-view.tsx`, image
    tests.
  - **Validate:** Targeted image-view test and manual generation/download.
  - **Risk if ignored:** Saved files can have misleading extensions.

- [x] **P3 - Randomness: Use Web Crypto for image random seed generation**
  - **Evidence:** `src/utils/payloadBuilders.ts` uses `Math.random()` in
    `randomSeed()`.
  - **Why:** Not security-critical, but deterministic quality and fairness are
    better with `crypto.getRandomValues`.
  - **Action:** Replace with Web Crypto fallback where available.
  - **Files likely affected:** `src/utils/payloadBuilders.ts`,
    `src/utils/payloadBuilders.test.ts`.
  - **Validate:** `npm test -- --run src/utils/payloadBuilders.test.ts`.
  - **Risk if ignored:** Low; seed randomness remains non-cryptographic.

---

## 5. Category Coverage Matrix

| Category | Status | Evidence inspected | Notes |
|---|---:|---|---|
| Build/runtime | Covered | `package.json`, `vite.config.ts`, `electron/main.ts`, validation commands | Build passes. |
| Architecture | Covered | `src/*`, `electron/*`, file-size counts | Large modules remain. |
| Security | Covered | IPC, preload, proxy, redaction, safety, workflows | No direct source P0 found; signing evidence open. |
| Testing | Covered | 251 test paths, Vitest output, coverage | Tests pass; warning cleanup remains. |
| CI/CD | Covered | `.github/workflows/*` | Strong, but CodeQL manual/gated and Windows smoke gap. |
| Documentation | Covered | README, docs, audits, summary ledger | Current roadmap refreshed in this file. |
| Developer experience | Covered | scripts, `.nvmrc`, docs, config examples | Good; repo identity naming decision remains. |
| Dependencies | Covered | `npm ci`, `npm audit`, `package-lock.json`, Dependabot | Audit clean; deprecated transitives. |
| Packaging/release | Covered | electron-builder, release workflow, verify-dist | Signing/notarization proof open. |
| Config/env | Covered | `.env.example`, `.config/config.example.yaml`, config docs | Good secret guidance. |
| Logging/diagnostics | Covered | `diagnosticsService.ts`, logger/redaction, `app:getDiagnostics` | Safe by design; live connectivity is explicit. |
| Performance/reliability | Covered | build output, cache/storage docs, timeout guards | Bundle budget TODO remains. |
| UX/app behavior/accessibility | Covered | privacy dashboard, media inspector, smoke tests | Broken maintenance action UX, clipboard helper gaps. |
| GitHub hygiene | Covered | CODEOWNERS, templates, Dependabot, workflows | Repo identity drift. |
| Legal/licensing/privacy | Covered | LICENSE, LEGAL, PRIVACY, SECURITY, NOTICE docs | Present and reasonably mature. |
| Roadmap | Covered | this file, `docs/summary_of_work.md` | Duplicate old roadmap artifacts removed in this pass. |

---

## 6. Suggested GitHub Issues

### P0 Issues

1. `[P0] Capture and require signed/notarized Windows and macOS release artifact evidence`

### P1 Issues

1. `[P1] Add Windows packaged Electron smoke coverage`
2. `[P1] Resolve canonical repository URL and metadata drift`
3. `[P1] Run CodeQL automatically on PR/push or scheduled scans`
4. `[P1] Clean or classify full-suite jsdom canvas warnings`
5. `[P1] Reduce or document deprecated transitive dependencies`

### P2 Issues

1. `[P2] Extract oversized IPC/UI/bridge modules`
2. `[P2] Wire or remove unimplemented Storage Privacy maintenance actions`
3. `[P2] Add Storage Privacy first-load error and retry state`
4. `[P2] Route gallery and embeddings copy actions through clipboard helper`
5. `[P2] Add targeted coverage for high-risk low-coverage modules`
6. `[P2] Add bundle budgets and reduce initial renderer chunk size`
7. `[P2] Keep one canonical current roadmap`

### P3 Issues

1. `[P3] Clarify Linux support status and maintainer metadata`
2. `[P3] Derive image download extension from MIME type`
3. `[P3] Use Web Crypto for random image seeds`

---

## 7. Suggested Milestones

### `0.1.0 - Repo Stabilization`

- Resolve canonical repository URL and metadata drift.
- Keep one canonical current roadmap.
- Clean or classify test warnings.

### `0.2.0 - Test and CI Foundation`

- Add Windows packaged Electron smoke coverage.
- Make CodeQL automatic.
- Add targeted tests for high-risk low-coverage modules.

### `0.3.0 - Security, Privacy, and Config Hardening`

- Wire/remove Storage Privacy maintenance actions.
- Add Storage Privacy error/retry state.
- Continue secret-redaction regression coverage.

### `0.4.0 - Windows/macOS Packaging and Release Pipeline`

- Capture signed/notarized artifact proof.
- Enforce signed production release policy.
- Clarify Linux support boundaries.

### `0.5.0 - UX, Accessibility, and Diagnostics Hardening`

- Clipboard helper migration.
- Media/Image Studio polish.
- Bundle budget and startup performance work.

### `1.0.0 - Production-Ready Desktop Release`

- Signed Windows installer and verified macOS notarized artifacts.
- Windows/macOS packaged smoke evidence.
- Current docs and release checklist green.

### `2.0.0 - Advanced Venice Forge Platform Roadmap`

- Advanced workflow automation.
- More robust cross-platform update channels.
- Optional Linux support if storage/signing/smoke requirements are solved.

---

## 8. Recommended First 10 Actions

1. **Order:** 1
   **Command:** `git remote -v && rg -n "Windows-Venice-API-connector|Venice_Forge|github.com/spearchucker667" package.json README.md docs .github electron-builder.config.cjs`
   **Files:** repo metadata/docs
   **Expected outcome:** Canonical slug decision.
   **Validation:** All active links agree.

2. **Order:** 2
   **Command:** none
   **Files:** `.github/workflows/release.yml`,
   `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md`
   **Expected outcome:** Production signing evidence plan.
   **Validation:** Artifact signature commands pass.

3. **Order:** 3
   **Command:** `RUN_ELECTRON_SMOKE=true npm run smoke:electron` in Windows CI
   after packaging
   **Files:** `.github/workflows/ci.yml`
   **Expected outcome:** Windows packaged smoke proof.
   **Validation:** CI job passes.

4. **Order:** 4
   **Command:** none
   **Files:** `.github/workflows/codeql.yml`
   **Expected outcome:** CodeQL runs automatically.
   **Validation:** PR check appears.

5. **Order:** 5
   **Command:** `npm test -- --run`
   **Files:** `vitest.config.ts`, test setup
   **Expected outcome:** No unclassified canvas warnings.
   **Validation:** Warning-clean test output.

6. **Order:** 6
   **Command:** `npm ls inflight rimraf lodash.isequal glob boolean`
   **Files:** `package.json`, `package-lock.json`
   **Expected outcome:** Deprecated transitive plan.
   **Validation:** Reduced warnings or documented blockers.

7. **Order:** 7
   **Command:** `npm run verify:storage-privacy`
   **Files:** `src/services/storageMaintenance.ts`,
   `StoragePrivacyDashboard.tsx`
   **Expected outcome:** No broken maintenance actions.
   **Validation:** Tests pass.

8. **Order:** 8
   **Command:** `npm run test:coverage`
   **Files:** low-coverage modules
   **Expected outcome:** Focused coverage gains.
   **Validation:** Coverage improves without lowering thresholds.

9. **Order:** 9
   **Command:** `npm run build`
   **Files:** `vite.config.ts`, lazy imports
   **Expected outcome:** Bundle budgets and smaller initial chunks.
   **Validation:** Build budget passes.

10. **Order:** 10
    **Command:** `npm run verify:markdown-links && npm run verify:agent-docs`
    **Files:** `docs/audits/repository-todo-roadmap-current.md`,
    `docs/DOCS_INDEX.md`
    **Expected outcome:** Current docs stop contradicting live source.
    **Validation:** Docs verifiers pass.

---

## 9. Validation Command Matrix

| Area | Command | Expected result | Notes |
|---|---|---:|---|
| Install | `PATH="$PWD/.node22/bin:$PATH" npm ci` | Pass | Passed; deprecation warnings. |
| Lint | `PATH="$PWD/.node22/bin:$PATH" npm run lint` | Pass | Passed; includes typecheck. |
| Typecheck | `PATH="$PWD/.node22/bin:$PATH" npm run typecheck` | Pass | Passed. |
| Unit tests | `PATH="$PWD/.node22/bin:$PATH" npm test -- --run` | Pass | Passed: 249 files, 3,145 tests; 1 skipped. |
| Coverage | `PATH="$PWD/.node22/bin:$PATH" npm run test:coverage` | Pass | Passed: 71 / 62.33 / 68.49 / 74.09. |
| Build | `PATH="$PWD/.node22/bin:$PATH" npm run build` | Pass | Passed. |
| Audit | `PATH="$PWD/.node22/bin:$PATH" npm audit --audit-level=moderate` | Pass | 0 vulnerabilities. |
| Prod audit | `PATH="$PWD/.node22/bin:$PATH" npm audit --omit=dev --audit-level=moderate` | Pass | 0 vulnerabilities. |
| Dist verify | `PATH="$PWD/.node22/bin:$PATH" npm run verify:dist` | Pass | Passed. |
| Contracts | `PATH="$PWD/.node22/bin:$PATH" npm run verify:contracts` | Pass | Passed all aggregate gates. |
| Smoke | `PATH="$PWD/.node22/bin:$PATH" npm run smoke:electron` | Skipped locally | Requires `RUN_ELECTRON_SMOKE=true` and packaged app. |
| Package | `npm run dist:win`, `npm run dist:mac` | Not run locally | Heavy/signing-sensitive; workflows inspected. |

---

## 10. Remaining Unknowns

- Whether production signing/notarization secrets are configured in GitHub.
- Whether a current tagged release produces signed Windows and notarized macOS
  artifacts.
- Whether Windows packaged smoke passes with `RUN_ELECTRON_SMOKE=true`.
- Whether the intended canonical public repo is the active `Venice_Forge` slug
  or a future rename.
- Whether CodeQL is enabled as GitHub default setup outside the tracked
  workflow.
- Whether Linux artifacts are intended as public/experimental/support-only.

---

## 11. Historical Hygiene Decisions

- Deleted duplicate old roadmap: `docs/audits/Repository TODO Roadmap — Venice Forge.md`.
- Deleted old roadmap verification addendum:
  `docs/audits/roadmap-verification-2026-06-16.yaml`.
- Deleted superseded cross-check snapshots:
  `docs/audits/current-audit-cross-check-status.md` and
  `docs/audits/current-audit-cross-check-status.yaml`.
- Kept release-bug cross-reference and evidence YAMLs because they map closed
  v2.1.0 defects to regression tests and remain useful historical evidence.
- Kept `docs/reports/historical/*` because those reports already carry
  historical/superseded banners and are referenced as audit trail evidence.
