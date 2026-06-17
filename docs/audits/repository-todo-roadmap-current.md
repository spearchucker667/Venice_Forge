# Repository TODO Roadmap

> Current canonical TODO list saved on 2026-06-16 after cross-referencing
> `docs/audits/Repository TODO Roadmap — Venice Forge.md` against the live
> repository and Node 22 validation results. Historical audit snapshots were
> cleaned up in this pass; use this file plus `docs/summary_of_work.md` as the
> current roadmap.

## 1. Audit Scope

- Repository: `/Users/super_user/Projects/Windows-Venice-API-connector`
- Branch: `main`
- Baseline HEAD: `1de7d42`
- Toolchain: Node `v22.22.3`, npm `10.9.8`
- Tracked files at audit time: `739`
- Status: local gates pass; production release remains blocked on clean-tree and credential-backed signing/notarization evidence.

## 2. Validation Summary

| Command | Result | Notes |
|---|---:|---|
| `npm ci` | PASS | 0 vulnerabilities; transitive deprecation warnings remain. |
| `npm run lint` | PASS | ESLint plus typecheck. |
| `npm run typecheck` | PASS | Renderer and Electron TypeScript clean. |
| `npm test -- --run` | PASS | 248 files passed, 1 skipped; 3,116 tests passed, 1 skipped. |
| `npm run test:coverage` | PASS | Statements 70.69%, branches 61.93%, functions 68.28%, lines 73.75%. |
| `npm run build` | PASS | Web, server, and Electron outputs built. |
| `npm audit --audit-level=moderate` | PASS | 0 vulnerabilities. |
| `npm run verify:dist` | PASS | Build outputs verified. |

## 3. P0 Release Blockers

### TODO P0-001
- Priority: P0
- Area: Release governance
- Problem: Production tags must be cut only from a clean, reviewed tree.
- Evidence: The audit began with a large dirty tree spanning source, docs, workflows, package metadata, scripts, and untracked audit files.
- Expected fix: Land intentional changes in reviewed commits, remove obsolete local artifacts, and tag only after `git status --short` is clean.
- Suggested files: repository-wide
- Validation: `git status --short` returns empty immediately before tagging.
- Risk if ignored: A release can ship accidental or unreviewed local state.
- Dependencies: maintainer release decision.
- Estimated effort: M
- Status: Open until this hygiene commit is pushed and the next release starts from a clean checkout.

### TODO P0-002
- Priority: P0
- Area: Signing/notarization proof
- Problem: macOS and Windows signing are conditionally configured, but credential-backed release artifacts still need external proof.
- Evidence: `release.yml` warns when signing secrets are absent; `electron-builder.config.cjs` enables macOS notarization only when signing and Apple credentials are present.
- Expected fix: Run a tagged release with signing secrets configured and record `codesign`, `spctl`, `notarytool`, Windows signature, and SmartScreen/portable behavior evidence.
- Suggested files: `.github/workflows/release.yml`, `docs/RELEASE/signing-and-notarization.md`, `docs/summary_of_work.md`
- Validation: Downloaded release artifacts verify as signed/notarized where expected.
- Risk if ignored: Users can receive unsigned or Gatekeeper/SmartScreen-blocked production artifacts.
- Dependencies: Apple Developer and Windows code-signing credentials.
- Estimated effort: M/L
- Status: External verification required.

## 4. P1 High-Priority TODOs

### TODO P1-001
- Priority: P1
- Area: Release workflow
- Problem: Tagged releases currently warn, rather than fail, when signing credentials are missing.
- Evidence: `release.yml` contains missing-secret warning steps before packaging.
- Expected fix: Fail closed for production tags unless an explicit unsigned prerelease/manual override is chosen.
- Suggested files: `.github/workflows/release.yml`
- Validation: A tag release without required secrets fails before upload; manual unsigned development packaging remains available.
- Risk if ignored: Unsigned artifacts may be mistaken for production releases.
- Dependencies: release policy.
- Estimated effort: S/M
- Status: Open.

### TODO P1-002
- Priority: P1
- Area: Packaged smoke coverage
- Problem: Packaged Electron smoke coverage is present for macOS but not Windows/Linux.
- Evidence: `ci.yml` has `electron-smoke-macos`; equivalent packaged Windows/Linux smoke jobs are not present.
- Expected fix: Add minimal Windows and Linux packaged-launch smoke jobs or document why they are intentionally excluded.
- Suggested files: `.github/workflows/ci.yml`, `tests/smoke/electron-smoke.test.ts`
- Validation: Packaged smoke jobs run on PR, scheduled CI, or release CI for all supported platforms.
- Risk if ignored: Platform-specific packaging regressions can escape.
- Dependencies: runner/display constraints.
- Estimated effort: M
- Status: Open.

### TODO P1-003
- Priority: P1
- Area: Test hygiene
- Problem: Full test and coverage runs pass but emit repeated jsdom canvas warnings.
- Evidence: `HTMLCanvasElement.getContext()` warnings appeared during `npm test -- --run` and `npm run test:coverage`.
- Expected fix: Add a focused canvas mock/setup file or route canvas-dependent tests to an environment with the required implementation.
- Suggested files: `vitest.config.ts`, test setup files, canvas-dependent component tests
- Validation: Full test and coverage stderr are warning-clean or warnings are explicitly classified.
- Risk if ignored: Real warnings become easier to miss.
- Dependencies: mock/package choice.
- Estimated effort: S/M
- Status: Open.

### TODO P1-004
- Priority: P1
- Area: Security automation
- Problem: CodeQL is documented as GitHub default setup, but no tracked CodeQL or dependency-review workflow exists.
- Evidence: `git ls-files .github/workflows` returns `ci.yml` and `release.yml` only.
- Expected fix: Add tracked CodeQL/dependency-review workflows or document repository settings as external required controls.
- Suggested files: `.github/workflows/codeql.yml`, `.github/workflows/dependency-review.yml`, `SECURITY.md`
- Validation: PRs show code scanning and dependency-review checks.
- Risk if ignored: Security controls can drift outside source review.
- Dependencies: GitHub repository settings.
- Estimated effort: S/M
- Status: Open.

### TODO P1-005
- Priority: P1
- Area: Dependency hygiene
- Problem: Vulnerability audit is clean, but install still reports deprecated transitive packages.
- Evidence: `npm ci` warns for transitive `inflight`, `rimraf@2`, `lodash.isequal`, `glob@7`, and `boolean`.
- Expected fix: Trace dependency paths, upgrade/remove upstream packages where practical, and document unavoidable holdouts.
- Suggested files: `package.json`, `package-lock.json`
- Validation: `npm ci` warning count is reduced or justified.
- Risk if ignored: stale transitive packages can become future install/security blockers.
- Dependencies: upstream releases.
- Estimated effort: M
- Status: Open.

### TODO P1-006
- Priority: P1
- Area: DOM/CSP hardening
- Problem: Security-sensitive DOM sinks remain and should be explicitly justified or removed.
- Evidence: `src/utils/markdown.tsx` uses `dangerouslySetInnerHTML`; `src/main.tsx` uses `innerHTML` in fallback paths.
- Expected fix: Replace fallback `innerHTML` with DOM construction and add sanitizer tests/allowlist evidence around markdown rendering.
- Suggested files: `src/main.tsx`, `src/utils/markdown.tsx`, markdown tests
- Validation: Static sink audit passes with only documented, tested exceptions.
- Risk if ignored: future markdown or fallback changes could introduce XSS.
- Dependencies: markdown rendering requirements.
- Estimated effort: M
- Status: Open.

## 5. P2 Medium-Priority TODOs

### TODO P2-001
- Priority: P2
- Area: Maintainability
- Problem: Several files are too large for comfortable review.
- Evidence: `electron/ipc/handlers.ts` 1,408 lines, `SettingsView.tsx` 1,007, `gallery-view.tsx` 948, `media-inspector.tsx` 912, `CommandPalette.tsx` 816.
- Expected fix: Extract cohesive submodules without behavior changes.
- Suggested files: listed large files
- Validation: Existing tests plus focused extracted-module tests pass.
- Risk if ignored: future changes become harder to audit safely.
- Dependencies: none.
- Estimated effort: L
- Status: Open.

### TODO P2-002
- Priority: P2
- Area: Coverage quality
- Problem: Overall coverage passes while low-coverage modules remain.
- Evidence: Coverage report shows weak/zero coverage in several UI/runtime files, including `ModelSelect.tsx`, `StatusView.tsx`, music views/hooks, `desktopBridge.ts`, and RP/UI modules.
- Expected fix: Add targeted tests for high-risk low-coverage modules before raising thresholds.
- Suggested files: low-coverage files from the current coverage report
- Validation: Branch/function coverage improves without lowering thresholds.
- Risk if ignored: thresholds pass while important paths stay weak.
- Dependencies: browser/Electron mock cleanup.
- Estimated effort: L
- Status: Open.

### TODO P2-003
- Priority: P2
- Area: Bundle performance
- Problem: Production build still emits large renderer/worker assets.
- Evidence: build output includes a 915.73 kB main renderer chunk and a 1,375.84 kB PDF worker asset.
- Expected fix: Add bundle budget checks and lazy-load heavy routes/workers where practical.
- Suggested files: `vite.config.ts`, route/component imports
- Validation: build reports budget regressions and initial chunk size is reduced.
- Risk if ignored: slower startup and larger release artifacts.
- Dependencies: UX decision on lazy boundaries.
- Estimated effort: M
- Status: Open.

## 6. P3 Backlog

### TODO P3-001
- Priority: P3
- Area: Repository metadata
- Problem: Community templates remain minimal.
- Evidence: PR template and issue-template config exist; richer bug/feature forms and repository-settings documentation are not present.
- Expected fix: Add structured bug/feature templates and a repository settings checklist.
- Suggested files: `.github/ISSUE_TEMPLATE/*`, `docs/RELEASE/repository-settings.md`
- Validation: GitHub issue flow exposes the intended templates.
- Risk if ignored: incoming reports stay lower quality.
- Dependencies: maintainer preferences.
- Estimated effort: S
- Status: Open.

### TODO P3-002
- Priority: P3
- Area: Platform roadmap
- Problem: Linux arm64 remains intentionally out of scope.
- Evidence: `electron-builder.config.cjs` documents x64-only Linux targets until native arm64 or cross-compilation support exists.
- Expected fix: Either continue documenting x64-only Linux support or add a real arm64 runner/toolchain.
- Suggested files: `electron-builder.config.cjs`, `docs/DEVELOPMENT/platform-support.md`
- Validation: docs and release artifacts agree.
- Risk if ignored: users may expect unsupported artifacts.
- Dependencies: CI runner/toolchain availability.
- Estimated effort: M/L
- Status: Backlog.

## 7. Closed Roadmap Items

- Native browser dialog regression: closed by shared modal flow and `verify:no-native-dialogs`.
- Prior-chat context leakage: closed by bounded/redacted opt-in context selection.
- Repository slug/updater metadata drift: closed for active metadata/docs.
- Jina rate-limit flake: closed in focused Node 22 reruns.
- Electron output shipping renderer source: closed by bundled Electron build and `verify:dist`.
- Dependency vulnerabilities: closed; `npm audit --audit-level=moderate` reports 0 vulnerabilities.
- Storage Privacy API-key status: closed.
- Node 22 alignment: closed with `.nvmrc`, engines, and workflow pins.
- Media cache and chat dirty-map bounds: closed.
- Server dependency on Electron utility path: closed by shared URL-security module.

## 8. Recommended Execution Order

1. Finish this hygiene commit and push `main`.
2. Start the next release from a fresh clean checkout.
3. Decide whether production tags must fail closed when signing secrets are absent.
4. Run credential-backed macOS/Windows release verification.
5. Clean test stderr warnings.
6. Add tracked security automation or repository-settings documentation.
7. Run focused coverage and file-size reduction campaigns in small PRs.

## 9. Production Readiness Verdict

Local source health is strong: install, lint, typecheck, full tests, coverage,
build, audit, and dist verification pass under Node 22. A production release
should wait for a clean release checkout and signed/notarized artifact evidence.

## 10. Cleaned Historical TODO Artifacts

- Removed `docs/audits/todo.md`: historical 2026-06-07 snapshot superseded by this current roadmap and `docs/summary_of_work.md`.
- Removed `docs/audits/combined-todo.yml`: partial static-audit backlog whose findings were already marked closed or superseded in the session ledger.
