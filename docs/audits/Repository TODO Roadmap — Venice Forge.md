
   Repository TODO Roadmap — Venice Forge

   Verification Addendum — 2026-06-16

   This addendum cross-references the roadmap against the live working tree and the repair evidence in
   `docs/audits/kimi-batch-evidence-2026-06-16.yaml` plus `docs/summary_of_work.md`. The original roadmap text below is retained as
   historical audit input; its unchecked boxes are no longer authoritative for closed P0/P1 items.

   Current verification baseline:

   • Repo: `/Users/super_user/Projects/Windows-Venice-API-connector` on `main` at `1de7d42`.
   • Runtime used for verification: Node `v22.22.3`, npm `10.9.8` via `.node22/bin`.
   • Working tree was dirty before verification and remains dirty; unrelated dirty work was preserved.

   P0/P1 cross-reference result:

   | Roadmap item | Current status | Live evidence |
   |---|---|---|
   | P0 native `window.confirm` in History batch delete | Closed | `HistoryView.tsx` uses `askDecision`; `npm run verify:no-native-dialogs` passes. |
   | P0 prior conversation context leakage | Closed | `chatPayloadContext.ts` redacts and bounds selected context; targeted chat-context tests pass. |
   | P0 repo slug / updater metadata mismatch | Closed | Active metadata/docs use `spearchucker667/Venice_Forge`; `verify:release-packaging-hardening` now rejects retired active slugs and passes. |
   | P0 Jina rate-limit flake | Closed | Focused `server.test.ts -t "rate-limit"` run plus five consecutive reruns pass under Node 22. |
   | P0 Electron bundle ships renderer source | Closed | `build:electron` cleans stale output; `dist-electron/src` absent; generated Electron output has no `../src` imports; `verify:dist` passes. |
   | P0 dependency vulnerabilities | Closed | `npm audit --audit-level=moderate` and `npm audit --omit=dev --audit-level=moderate` both report 0 vulnerabilities. |
   | P0 macOS notarization config | Closed with limitation | `electron-builder.config.cjs` enables `mac.notarize` only when CI signing and Apple credentials are present; end-to-end notarization still requires a signed CI release run. |
   | P1 Storage Privacy API-key status | Closed | `useAuthStore` feeds safe API-key metadata; `verify:storage-privacy` passes. |
   | P1 Windows portable signing/documentation | Closed by documentation | Release docs document portable `.exe` unsigned limitation and SmartScreen impact. |
   | P1 Linux arm64 cross-compilation | Closed by scope reduction | Linux targets are x64 only; release docs document arm64 as not produced until a native/cross toolchain exists. |
   | P1 draft/verification release gate | Closed | `release.yml` runs `verify:dist:release` before `softprops/action-gh-release` with `draft: true`. |
   | P1 macOS PR CI runner | Closed | `ci.yml` includes `macos-sensitive-tests` on `macos-latest`. |
   | P1 packaged Electron smoke in CI | Closed | `ci.yml` includes `electron-smoke-macos` with `RUN_ELECTRON_SMOKE=true`. |
   | P1 noisy test warnings/mock leaks | Partially closed | PromptLibrary `act(...)` and Node localStorage noise were repaired; full stderr-clean audit was not rerun in this pass. |
   | P1 Node engine alignment | Closed | `.nvmrc` exists and workflows/package engines pin Node 22; verification used Node 22. |
   | P1 media-store cache bound | Closed | `MEDIA_IN_MEMORY_CACHE_MAX` and cache-bound tests pass. |
   | P1 chat dirty map bound | Closed | `MAX_DIRTY_CONVERSATIONS` and dirty-map tests pass. |
   | P1 server dependency on Electron utility | Closed | `server.ts` imports `isPrivateHostname` from `src/shared/urlSecurity`; no `server.ts` import from `electron/**`. |
   | P1 release cancel-in-progress | Closed | `release.yml` has `cancel-in-progress: true`. |

   Additional P2 fixes applied during this verification:

   • Corrected web-mode Jina key storage docs to process-memory session key, not LocalStorage.
   • Clarified desktop chat history storage as local plaintext JSON in `docs/ABOUT.md`.
   • Refreshed stale `SECURITY.md` `server.ts` line references.
   • Removed the unrelated image from `CODE_OF_CONDUCT.md`.
   • Standardized release/contribution CHANGELOG references to `docs/audits/CHANGELOG.md`.
   • Removed the dead diagnostics audit spread and unused audit snapshot read.
   • Changed chat message rendering to use stable `msg.id` keys.
   • Surfaced Electron image-save failures through redacted toasts instead of `console.error`.
   • Changed media size sorting to use decoded byte estimates.
   • Split Dependabot npm groups by security-critical, production, development, and major updates.
   • Made the Vite proxy `secure` flag conditional on HTTPS targets.
   • Prepended `npm run clean` to `dist:*` packaging scripts and removed the unused root `immer` devDependency.

   Remaining open roadmap items after this pass:

   • P1 noisy test warning audit still needs a full `npm test 2>&1` stderr classification if strict zero-warning closure is required.
   • P2 oversized component extraction remains open.
   • P2 low-coverage module campaign remains open.
   • P3 Windows arm64 packaging, Linux update metadata, repository-settings docs, funding metadata, status recompute optimization, and DiagnosticsDrawer privacy disambiguation remain future/backlog items.
   • End-to-end signed macOS notarization, Windows portable signing behavior, GitHub branch-protection settings, and packaged-app smoke on final release artifacts still require environment/credential-backed release verification.

   1. Current-State Summary

   What this repo appears to do

   Venice Forge is an unofficial third-party Electron + Vite + React desktop/web studio for the Venice API. It provides chat,
   image/video/audio generation, character/RP workflows, model discovery, media gallery management, research tools, prompt/scene
   libraries, diagnostics, secure desktop API-key storage, and cross-platform desktop packaging.

   Tech stack

   • Electron 42 with contextBridge/preload IPC
   • Vite 6 + React 19 + TypeScript 5.8 strict
   • Tailwind CSS 4
   • Zustand 5 stores
   • IndexedDB/local persistence (desktop chat history uses atomic JSON files)
   • Express 4 dev proxy
   • Vitest 4 with v8 coverage
   • electron-builder 26
   • GitHub Actions CI/release

   Maturity assessment

   The project is past prototype but not yet release-hardened. It has extensive test coverage (3,100+ tests), strong secret-redaction
   and safety-guard foundations, and a working build. However, the current working tree is dirty, one server test is flaky, package
   metadata contradicts the actual repository name, and several production-blocking issues (native dialog regression, secret leakage
   in new feature, auto-updater repo mismatch, notarization gap, build-tool vulnerabilities) must be resolved before a trustworthy
   public release.

   Biggest strengths

   • Solid security baseline: OS safeStorage, secret redaction, Local Family Safe Mode, CSP, sandbox, contextIsolation.
   • Comprehensive Phase 2 feature contracts (model-aware recipes, media power tools, status diagnostics, prompt library, scene
   composer, RP studio) with verifier scripts.
   • Strong test volume and coverage thresholds that currently pass.
   • Clean lint, typecheck, and build on the dirty tree.
   • Good legal/privacy documentation foundation (MIT, DISCLAIMER, PRIVACY, TRADEMARKS).

   Biggest weaknesses

   • Working tree is dirty with 25 modified/untracked files, including in-flight feature changes.
   • A native window.confirm was reintroduced in the new History batch-delete UI.
   • New "prior conversation context" feature forwards unredacted historical messages to Venice API.
   • Repository metadata still points to the old Venice-API-connector slug while the actual remote is Venice_Forge.
   • server.test.ts Jina rate-limit test is timing-sensitive and intermittently times out.
   • Electron main bundle includes duplicated renderer source under dist-electron/src/.
   • Build-time dependencies have 4 known vulnerabilities (3 high, 1 moderate).
   • macOS notarization is not explicitly configured.
   • Storage Privacy Dashboard does not report actual API-key status.

   Immediate risks

   • Shipping a release with broken auto-updater due to repo-name mismatch.
   • Secret leakage through prior-context injection.
   • Native blocking dialog regression hurts accessibility and violates the project's own invariant.
   • CI/release blocked by flaky rate-limit test.
   • macOS Gatekeeper blocking unnotarized signed builds.
   • Compromised build toolchain injecting malware into release artifacts.

   Runnable/buildable/testable/maintainable assessment

   ┌────────────────────────┬──────────────────────────────────────────────────────────────────┐
   │ Area                   │ Status                                                           │
   ├────────────────────────┼──────────────────────────────────────────────────────────────────┤
   │ Install                │ Runnable (npm ci warns about Node engine mismatch)               │
   ├────────────────────────┼──────────────────────────────────────────────────────────────────┤
   │ Lint                   │ Passes                                                           │
   ├────────────────────────┼──────────────────────────────────────────────────────────────────┤
   │ Typecheck              │ Passes                                                           │
   ├────────────────────────┼──────────────────────────────────────────────────────────────────┤
   │ Build                  │ Passes                                                           │
   ├────────────────────────┼──────────────────────────────────────────────────────────────────┤
   │ Coverage               │ Passes thresholds                                                │
   ├────────────────────────┼──────────────────────────────────────────────────────────────────┤
   │ Full test suite        │ Intermittently fails (flaky Jina rate-limit test)                │
   ├────────────────────────┼──────────────────────────────────────────────────────────────────┤
   │ CI parity (npm run ci) │ Currently blocked by flaky test + dev audit vulnerabilities      │
   ├────────────────────────┼──────────────────────────────────────────────────────────────────┤
   │ Packaged-app smoke     │ Not exercised in CI                                              │
   ├────────────────────────┼──────────────────────────────────────────────────────────────────┤
   │ Maintainability        │ Good docs/tests, but oversized files and dirty tree add friction │
   └────────────────────────┴──────────────────────────────────────────────────────────────────┘

   ────────────────────────────────────────────────────────────────────────────────

   2. Repository Evidence Map

   Verified entry points

   • electron/main.ts — Electron main process
   • electron/preload.ts — preload bridge
   • src/main.tsx (inferred from Vite/React setup) — renderer root
   • vite.config.ts — Vite config
   • server.ts — Express dev proxy
   • electron-builder.config.cjs — packaging config
   • dist/index.html + dist-electron/electron/main.js — packaged outputs

   Verified source directories

   • src/components/, src/hooks/, src/stores/, src/services/, src/utils/, src/types/, src/config/, src/theme/, src/shared/
   • electron/ipc/, electron/services/
   • tests/, scripts/

   Verified build/config files

   • package.json, package-lock.json
   • vite.config.ts, vitest.config.ts
   • tsconfig.json, tsconfig.electron.json
   • electron-builder.config.cjs
   • .env, .env.example, .config/*.yaml

   Verified test files

   • 248+ test files, 3,103+ tests
   • Notable: server.test.ts, electron/ipc/handlers.test.ts, electron/services/bridgeServer.test.ts, src/stores/chat-store.test.ts,
   src/components/chat/HistoryView.test.tsx, src/components/chat/chat-view.test.tsx

   Verified CI/CD workflows

   • .github/workflows/ci.yml — Ubuntu + Windows matrix
   • .github/workflows/release.yml — Windows, macOS, Linux builds
   • .github/dependabot.yml

   Verified documentation files

   • README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, AGENTS.md, CLAUDE.md, .cursorrules, .windsurfrules
   • docs/ABOUT.md, docs/FAQ.md, docs/SUPPORT.md
   • docs/DEVELOPMENT/*, docs/RELEASE/*, docs/design/*, docs/legal/*
   • docs/audits/CHANGELOG.md, docs/audits/todo.md, docs/summary_of_work.md

   Verified release/package files

   • release/mac-arm64/ with Venice-Forge-2.0.0-arm64.dmg etc.
   • build/icon.ico, build/icon.icns, build/icon.png
   • scripts/verify-dist.cjs, scripts/checksum-release.cjs, scripts/verify-release-packaging-hardening.cjs

   Verified security-sensitive files

   • electron/preload.ts, electron/ipc/handlers.ts, electron/services/bridgeServer.ts
   • src/services/desktopBridge.ts, src/services/veniceClient.ts, src/services/diagnosticsService.ts
   • src/shared/redaction.ts, src/shared/safety/*
   • server.ts

   Missing or recommended standard repo files

   • .nvmrc (recommended)
   • SECURITY.md exists but needs refresh
   • .github/FUNDING.yml (optional)
   • docs/RELEASE/repository-settings.md (recommended)
   • scripts/verify-no-native-dialogs.cjs (recommended)

   ────────────────────────────────────────────────────────────────────────────────

   3. Critical Findings

   1. Native window.confirm reintroduced in History batch delete

   • Evidence: src/components/chat/HistoryView.tsx:71 calls window.confirm(...) for batch deletion. The project invariant and prior
   audit claimed no native dialogs, but the detection regex \bprompt\(|\bconfirm\( cannot match window.confirm(.
   • Impact: Blocks renderer, breaks accessibility/keyboard handling, spoofable, violates CSP/native-dialog invariant.
   • Priority: P0
   • Affected files: src/components/chat/HistoryView.tsx, src/components/chat/HistoryView.test.tsx
   • Fix: Replace with await askDecision({...}) from src/components/ui/modal-requests.tsx; add a verifier script.
   • Validation: rg -n "window\.confirm\|window\.prompt\|window\.alert" src returns empty; npm test.

   2. Prior conversation context injection can leak secrets to Venice API

   • Evidence: src/utils/chatPayloadContext.ts slices the last 12 messages per selected conversation with no token budget and no
   secret redaction; src/hooks/use-chat.ts injects explicitContext into message metadata; src/components/chat/chat-view.tsx does not
   warn users that selected history is sent to Venice.
   • Impact: User-typed API keys, passwords, PII in earlier chats can be forwarded raw to api.venice.ai.
   • Priority: P0
   • Affected files: src/utils/chatPayloadContext.ts, src/hooks/use-chat.ts, src/components/chat/chat-view.tsx
   • Fix: Redact prior context through redactPromptSecrets; impose character/token cap; show preview/confirmation; add regression
   tests.
   • Validation: npx vitest run src/utils/chatPayloadContext.test.ts src/hooks/use-chat.test.ts.

   3. Repository metadata mismatch breaks auto-updater and public links

   • Evidence: git remote -v shows spearchucker667/Venice_Forge.git, but package.json homepage/repository/bugs,
   electron-builder.config.cjs publish.repo, README badges, issue templates, CONTRIBUTING, SECURITY, and release docs all reference
   Venice-API-connector. Packaged macOS app-update.yml contains repo: Venice-API-connector.
   • Impact: electron-updater fails, release links 404, confused contributors.
   • Priority: P0
   • Affected files: package.json, electron-builder.config.cjs, README.md, .github/ISSUE_TEMPLATE/config.yml, SECURITY.md,
   CONTRIBUTING.md, docs/RELEASE/release.md
   • Fix: Canonicalize all references to Venice_Forge (or rename the repo to Venice-API-connector and update local dir).
   • Validation: Rebuild packaged app; inspect app-update.yml; npm run verify:release-packaging-hardening.

   4. Flaky server.test.ts Jina rate-limit test blocks CI

   • Evidence: Full npm test intermittently fails on should rate-limit /api/proxy-jina after 3 requests with 5005ms timeout; the test
   makes real network calls to r.jina.ai.
   • Impact: Tag-triggered release workflow fails; v2.0.0+ cannot ship reliably.
   • Priority: P0
   • Affected files: server.test.ts, possibly server.ts
   • Fix: Stub global.fetch and the safety guard for rate-limit assertions; reset rate-limit state per test.
   • Validation: npm test passes 5 consecutive times; rate-limit test runs <500ms.

   5. Electron main bundle ships duplicated renderer source

   • Evidence: npm run build emits dist-electron/src/config/configSchema.js, dist-electron/src/shared/redaction.js, etc.;
   dist-electron/electron/main.js requires ../src/shared/redaction.
   • Impact: Bloated installer, accidental leakage of renderer internals, harder security review.
   • Priority: P0
   • Affected files: electron/main.ts, electron/preload.ts, tsconfig.electron.json, electron-builder.config.cjs,
   scripts/verify-dist.cjs
   • Fix: Move shared code to a root shared/ directory or bundle electron main with esbuild externalizing src/.
   • Validation: npm run build && [ -z "$(find dist-electron/src -type f 2>/dev/null)" ] && npm run verify:dist.

   6. Build-time dependencies have known high-severity vulnerabilities

   • Evidence: npm audit reports 4 vulnerabilities: esbuild (high RCE/arbitrary file read), vite (high via esbuild), form-data (high
   CRLF injection), tar (moderate file smuggling). CI only runs npm audit --omit=dev.
   • Impact: Compromised build tools can inject malware into shipped artifacts.
   • Priority: P0
   • Affected files: package.json, package-lock.json, .github/workflows/ci.yml, .github/workflows/release.yml
   • Fix: Upgrade esbuild ≥0.28.1, patch tar and form-data, update vite, add dev-dependency audit gate to CI.
   • Validation: npm audit --audit-level=moderate exits 0; npm run ci passes.

   7. macOS notarization is not explicitly configured

   • Evidence: electron-builder.config.cjs sets hardenedRuntime: true conditionally but has no notarize block. Docs claim notarization
   happens when env vars are present.
   • Impact: Signed but unnotarized macOS apps are blocked by Gatekeeper.
   • Priority: P0
   • Affected files: electron-builder.config.cjs, docs/RELEASE/signing-and-notarization.md
   • Fix: Add explicit notarize: { teamId: process.env.APPLE_TEAM_ID } guarded by isCIRelease.
   • Validation: Signed CI build passes notarization; spctl -a -vv allows launch.

   ────────────────────────────────────────────────────────────────────────────────

   4. TODO Roadmap

   P0 — Critical Blockers

   ```markdown
     - [ ] **P0 — Security/UX: Replace native `window.confirm` in History batch delete with app-modal confirmation**
       - **Evidence:** `src/components/chat/HistoryView.tsx:71` calls `window.confirm(...)`. The prior audit regex
   `\bprompt\(|\bconfirm\(` cannot match `window.confirm(`, so the invariant was falsely claimed passing.
   `src/components/ui/modal-requests.tsx` already exports `askDecision`.
       - **Why:** Native dialogs block the renderer, are inaccessible, spoofable, and violate the production CSP/native-dialog
   invariant.
       - **Action:** Replace `handleBatchDelete`'s `window.confirm` with `await askDecision({ title: "Delete N conversations?",
   detail: "...", actionLabel: "Delete", danger: true })`; update `HistoryView.test.tsx` to mock `askDecision`.
       - **Files likely affected:** `src/components/chat/HistoryView.tsx`, `src/components/chat/HistoryView.test.tsx`.
       - **Validate:** `rg -n "window\.confirm\|window\.prompt\|window\.alert" src` returns 0 matches; `npm test`.
       - **Risk if ignored:** Shipping a production client with native blocking dialogs; accessibility and security posture regress.

     - [ ] **P0 — Security/Privacy: Redact and bound prior conversation context before sending to Venice API**
       - **Evidence:** `src/utils/chatPayloadContext.ts` slices the last 12 messages per selected conversation with no token budget;
   `src/hooks/use-chat.ts` injects `explicitContext` into message metadata; `src/components/chat/chat-view.tsx` does not disclose that
   selected history is sent to Venice.
       - **Why:** Users may have pasted API keys, passwords, or PII into earlier chats; selecting those as context forwards raw text
   to `api.venice.ai`.
       - **Action:** Run selected prior-context text through `redactPromptSecrets`; impose a hard character/token budget; show the
   user a preview/confirmation; add regression tests.
       - **Files likely affected:** `src/utils/chatPayloadContext.ts`, `src/hooks/use-chat.ts`, `src/components/chat/chat-view.tsx`,
   `src/utils/chatPayloadContext.secrets.test.ts` (new).
       - **Validate:** `npx vitest run src/utils/chatPayloadContext.test.ts src/hooks/use-chat.test.ts
   src/components/chat/chat-view.test.tsx`.
       - **Risk if ignored:** Sensitive user content leaks to a third-party API; violates the app's stated privacy posture.

     - [ ] **P0 — Packaging: Canonicalize repository/product slug across all metadata**
       - **Evidence:** `git remote -v` is `spearchucker667/Venice_Forge.git`; `package.json`, `electron-builder.config.cjs`
   `publish.repo`, README, CONTRIBUTING, SECURITY, issue templates, and release docs all use `Venice-API-connector`. Packaged macOS
   `app-update.yml` contains `repo: Venice-API-connector`.
       - **Why:** Auto-updater reads `app-update.yml` at runtime; wrong repo causes silent update failures and broken public links.
       - **Action:** Update all metadata/doc references to `spearchucker667/Venice_Forge` (or rename the repo to match the old slug).
   Add a verifier that compares `publish.repo` against tracked remote.
       - **Files likely affected:** `package.json`, `electron-builder.config.cjs`, `README.md`, `.github/ISSUE_TEMPLATE/config.yml`,
   `SECURITY.md`, `CONTRIBUTING.md`, `docs/RELEASE/release.md`, `scripts/verify-release-packaging-hardening.cjs`.
       - **Validate:** Rebuild packaged app; inspect `app-update.yml` for `repo: Venice_Forge`; `npm run
   verify:release-packaging-hardening`.
       - **Risk if ignored:** Auto-updater non-functional; release links 404; confused contributors.

     - [ ] **P0 — Testing/CI: Eliminate flaky `server.test.ts` Jina rate-limit test**
       - **Evidence:** `npm test` intermittently times out on `should rate-limit /api/proxy-jina after 3 requests` (5005 ms). The test
   makes real `POST /api/proxy-jina` calls to `r.jina.ai`.
       - **Why:** The release workflow runs `npm test`; a flaky test blocks every tag-triggered release.
       - **Action:** Stub `global.fetch` and the safety guard for rate-limit tests; reset rate-limit state per test; assert on count
   threshold rather than wall-clock delay.
       - **Files likely affected:** `server.test.ts`, possibly `server.ts` (test-only export hook).
       - **Validate:** `npm test` passes 5 consecutive times; `npx vitest run server.test.ts -t "rate-limit"` completes in <500 ms.
       - **Risk if ignored:** Intermittent CI failures; blocked releases; developers learn to ignore red builds.

     - [ ] **P0 — Build/Architecture: Stop shipping renderer source inside the Electron main bundle**
       - **Evidence:** After `npm run build`, `dist-electron/src/` contains renderer/config/theme files;
   `dist-electron/electron/main.js` imports `../src/shared/redaction`.
       - **Why:** Increases installer size, duplicates code, and exposes renderer internals in the main process.
       - **Action:** Restructure shared code into a root `shared/` directory or bundle the electron main with esbuild externalizing
   `src/`; update imports and `verify-dist.cjs`.
       - **Files likely affected:** `electron/main.ts`, `electron/preload.ts`, `tsconfig.electron.json`,
   `electron-builder.config.cjs`, `scripts/verify-dist.cjs`, plus new `shared/**`.
       - **Validate:** `npm run build && [ -z "$(find dist-electron/src -type f 2>/dev/null)" ] && npm run verify:dist`.
       - **Risk if ignored:** Bloated installer; stale shared modules in main process; accidental leakage of renderer internals.

     - [ ] **P0 — Dependencies: Resolve build-time vulnerabilities and extend CI audit gate**
       - **Evidence:** `npm audit --audit-level=moderate` reports 4 vulnerabilities: `esbuild` (high RCE/arbitrary file read), `vite`
   (high via esbuild), `form-data` (high CRLF injection), `tar` (moderate). CI only runs `npm audit --omit=dev`.
       - **Why:** Vulnerable build tools bundle `dist/server.cjs` and run in CI; compromised tools can inject malware into shipped
   artifacts.
       - **Action:** Upgrade `esbuild` ≥0.28.1, patch `tar` and `form-data`, update `vite`; add dev-dependency audit gate to CI.
       - **Files likely affected:** `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`.
       - **Validate:** `npm audit --audit-level=moderate` exits 0; `npm run ci` passes.
       - **Risk if ignored:** Malicious code inserted into release binaries or local dev builds.

     - [ ] **P0 — macOS Packaging: Add explicit notarization configuration**
       - **Evidence:** `electron-builder.config.cjs` sets `hardenedRuntime: true` conditionally but has no `notarize` block; docs
   claim notarization occurs when env vars are present.
       - **Why:** Signed but unnotarized macOS apps are blocked by Gatekeeper on macOS 10.15+.
       - **Action:** Add `notarize: { teamId: process.env.APPLE_TEAM_ID }` to mac config, guarded by `isCIRelease`.
       - **Files likely affected:** `electron-builder.config.cjs`, `docs/RELEASE/signing-and-notarization.md`.
       - **Validate:** Run signed CI/release build; confirm notarization success; Gatekeeper allows launch.
       - **Risk if ignored:** Public macOS releases fail Gatekeeper on first launch.
   ```

   P1 — Production Readiness

   ```markdown
     - [ ] **P1 — Storage Privacy: Fix Storage Privacy Dashboard API-key status reporting**
       - **Evidence:** `src/stores/storage-privacy-store.ts` reads `veniceApiKey` from `useSettingsStore`, which has no such field;
   `src/services/storagePrivacyService.ts` added `apiKey` input that is never populated.
       - **Why:** Dashboard falsely reports "No Venice API key configured" even when a key is present.
       - **Action:** Read `useAuthStore` instead and pass `configured`/`storage`/`lastValidationStatus` to `buildStorageInventory`;
   update tests.
       - **Files likely affected:** `src/stores/storage-privacy-store.ts`, `src/services/storagePrivacyService.test.ts`,
   `src/stores/storage-privacy-store.test.ts`, `src/components/privacy/StoragePrivacyDashboard.test.tsx`.
       - **Validate:** `npm run verify:storage-privacy`; `npx vitest run src/stores/storage-privacy-store.test.ts`.
       - **Risk if ignored:** Users/support rely on false key-status indicator.

     - [ ] **P1 — Windows Packaging: Sign portable executable or document limitation**
       - **Evidence:** `electron-builder.config.cjs` produces `nsis` and `portable` targets; portable `.exe` is not signed by default.
       - **Why:** README treats portable as first-class deliverable, but it triggers SmartScreen even when the installer is signed.
       - **Action:** Configure portable signing or document the unsigned limitation.
       - **Files likely affected:** `electron-builder.config.cjs`, `docs/RELEASE/signing-and-notarization.md`, `README.md`.
       - **Validate:** Build signed Windows release; compare SmartScreen behavior.
       - **Risk if ignored:** Users see uncaught SmartScreen warnings on recommended portable build.

     - [ ] **P1 — Linux Packaging: Validate or remove arm64 cross-compilation in CI**
       - **Evidence:** `electron-builder.config.cjs` linux target includes `arm64` for AppImage/deb/rpm; release `build-linux` runs on
   `ubuntu-latest` (x64).
       - **Why:** Cross-compiling Linux arm64 from x64 requires qemu/binfmt not installed by default.
       - **Action:** Add qemu setup, split arm64 to arm64 runner, or remove arm64 Linux targets until tested.
       - **Files likely affected:** `.github/workflows/release.yml`, `electron-builder.config.cjs`,
   `docs/DEVELOPMENT/platform-support.md`.
       - **Validate:** `npm run dist:linux` in fresh x64 environment produces all 6 artifacts; `npm run verify:dist:linux` passes in
   CI.
       - **Risk if ignored:** Linux release job fails or ships broken arm64 packages.

     - [ ] **P1 — Release Workflow: Add draft/verification gate before publishing**
       - **Evidence:** `.github/workflows/release.yml` publish job uses `softprops/action-gh-release` with `draft: false`; no combined
   artifact verification runs before release creation.
       - **Why:** A `v*` tag immediately creates a public release with whatever artifacts were downloaded.
       - **Action:** Set `draft: true` or add a verification job running `npm run verify:dist:release` and checksum verification
   before final publish.
       - **Files likely affected:** `.github/workflows/release.yml`.
       - **Validate:** Push test tag; verify release is draft or verify job runs.
       - **Risk if ignored:** Broken/partial releases go public immediately.

     - [ ] **P1 — CI/CD: Add macOS runner to pull-request CI**
       - **Evidence:** `.github/workflows/ci.yml` runs Ubuntu + Windows; macOS is only tested at release time.
       - **Why:** macOS-specific filesystem/native assumptions should be exercised pre-merge.
       - **Action:** Add `macos-sensitive-tests` job mirroring Windows subset.
       - **Files likely affected:** `.github/workflows/ci.yml`.
       - **Validate:** CI passes on `macos-latest`.
       - **Risk if ignored:** macOS-only regressions discovered during release.

     - [ ] **P1 — Testing: Run packaged Electron smoke test in CI**
       - **Evidence:** `tests/smoke/electron-smoke.test.ts` is skipped unless `RUN_ELECTRON_SMOKE=true`; no workflow sets it.
       - **Why:** Unit tests do not exercise production bundle, ASAR layout, CSP nonce, or platform binaries.
       - **Action:** Add CI job running `npm run dist` then `RUN_ELECTRON_SMOKE=true npm run smoke:electron` with `xvfb-run`/headless.
       - **Files likely affected:** `.github/workflows/ci.yml`, `tests/smoke/electron-smoke.test.ts`.
       - **Validate:** `RUN_ELECTRON_SMOKE=true npm run smoke:electron` passes after `npm run dist`.
       - **Risk if ignored:** Packaging regressions reach users.

     - [ ] **P1 — Testing: Clean noisy test warnings and mock leaks**
       - **Evidence:** `npm test` stderr shows `localStorage not available`, `act(...)` warnings, `HTMLCanvasElement.getContext()` not
   implemented, `desktopConversations.save is not a function`, `No "desktopChat" export`.
       - **Why:** Noise hides real regressions; missing mocks mean tests exercise fallback paths.
       - **Action:** Add `localStorage` mock/`--localstorage-file`, add `canvas` mock, wrap async updates in `act`, fix
   `desktopBridge` mock exports, stub `flushAllPendingSaves`.
       - **Files likely affected:** `vitest.config.ts`, test setup/mocks, `src/hooks/use-chat.test.ts`,
   `src/components/layout/sidebar.test.tsx`, `src/components/prompts/PromptLibraryView.test.tsx`.
       - **Validate:** `npm test` completes with zero unexpected stderr warnings.
       - **Risk if ignored:** Flaky or false-passing tests.

     - [ ] **P1 — Dependencies: Refresh outdated packages and align Node engine usage**
       - **Evidence:** `npm outdated` shows 28 outdated packages; `package.json` engines requires Node 22 but host runs Node 26.
       - **Why:** Untested Node major and stale deps can introduce ABI/native-module issues.
       - **Action:** Bump patch/minor security-sensitive deps; either certify Node 26 and widen engines or add `.nvmrc` pinning Node
   22.
       - **Files likely affected:** `package.json`, `package-lock.json`, `.nvmrc` (new).
       - **Validate:** `npm ci` produces no engine warnings; `npm run ci` passes.
       - **Risk if ignored:** Local dev drifts from CI; missed security patches.

     - [ ] **P1 — Performance: Bound media-store in-memory cache**
       - **Evidence:** `src/stores/media-store.ts` `items` array grows via `refresh`, `loadMore`, `loadById` with no eviction cap.
       - **Why:** Large libraries cause unbounded renderer memory growth and jank.
       - **Action:** Add configurable cap/LRU and ensure `loadById` can re-fetch evicted records.
       - **Files likely affected:** `src/stores/media-store.ts`, `src/stores/media-store.test.ts`.
       - **Validate:** `npx vitest run src/stores/media-store.test.ts`; memory profile stable after loading >3 pages.
       - **Risk if ignored:** OOM or severe UI lag for heavy users.

     - [ ] **P1 — Performance: Bound chat-store dirty-conversation map**
       - **Evidence:** `src/stores/chat-store.ts` `dirtyConversations` Map has no size cap; subscription callback is O(n) on every
   store change.
       - **Why:** Long sessions with many mutated conversations grow unbounded.
       - **Action:** Add max dirty-map size with LRU eviction and eager flush of oldest entries.
       - **Files likely affected:** `src/stores/chat-store.ts`, `src/stores/chat-store.dirty.test.ts`.
       - **Validate:** `npx vitest run src/stores/chat-store.dirty.test.ts src/stores/chat-store.test.ts`.
       - **Risk if ignored:** Memory pressure and degraded responsiveness.

     - [ ] **P1 — Architecture: Remove server dependency on Electron-only utility path**
       - **Evidence:** `server.ts` imports `isPrivateHostname` from `./electron/utils/urlSecurity`.
       - **Why:** Express proxy should not depend on `electron/` files that may import Electron APIs.
       - **Action:** Move cross-cutting network utilities to a root `shared/utils/network.ts`.
       - **Files likely affected:** `server.ts`, `electron/utils/urlSecurity.ts`, new `shared/utils/network.ts`.
       - **Validate:** `npm run typecheck && npm run build && npm test`; `grep -R "from .*/electron/" server.ts` returns nothing.
       - **Risk if ignored:** Accidental Electron module inclusion in server bundle.

     - [ ] **P1 — Release Workflow: Enable cancel-in-progress**
       - **Evidence:** `.github/workflows/release.yml` concurrency sets `cancel-in-progress: false`.
       - **Why:** Force-pushed tags queue duplicate builds, wasting runners and risking races.
       - **Action:** Set `cancel-in-progress: true`.
       - **Files likely affected:** `.github/workflows/release.yml`.
       - **Validate:** Re-run workflow; previous in-progress run cancels.
       - **Risk if ignored:** Resource waste; possible duplicate/conflicting releases.
   ```

   P2 — Quality, DX, and Maintainability

   ```markdown
     - [ ] **P2 — Documentation/Legal: Canonicalize repo slug in all docs**
       - **Evidence:** README, CONTRIBUTING, issue templates, SECURITY, release docs use `Venice-API-connector` while remote is
   `Venice_Forge`.
       - **Why:** Broken links and inconsistent identity.
       - **Action:** Update all references; keep intentional historical references only.
       - **Files likely affected:** Multiple docs files.
       - **Validate:** `npm run verify:markdown-links`; grep shows only new slug.
       - **Risk if ignored:** Broken public links and contributor confusion.

     - [ ] **P2 — Documentation/Privacy: Correct web-mode Jina key storage claim**
       - **Evidence:** `docs/DEVELOPMENT/platform-support.md:9` says Jina key in `LocalStorage`; `docs/legal/PRIVACY.md` and
   `VERIFY-038` say memory-only.
       - **Why:** False security claim.
       - **Action:** Update platform matrix to "memory-only session (Jina)".
       - **Files likely affected:** `docs/DEVELOPMENT/platform-support.md`.
       - **Validate:** `npm run verify:markdown-links`.
       - **Risk if ignored:** Users/auditors distrust privacy model.

     - [ ] **P2 — Documentation/Privacy: Clarify desktop chat history is plaintext JSON**
       - **Evidence:** `docs/ABOUT.md:24` claims chat history in IndexedDB; README says desktop chat history is plaintext JSON files.
       - **Why:** Material privacy/storage disclosure gap.
       - **Action:** Rewrite `docs/ABOUT.md` to match README dual-mode table.
       - **Files likely affected:** `docs/ABOUT.md`.
       - **Validate:** `npm run verify:markdown-links`.
       - **Risk if ignored:** Users assume encrypted-at-rest desktop conversations.

     - [ ] **P2 — Documentation/Security: Refresh stale `server.ts` line references in `SECURITY.md`**
       - **Evidence:** `SECURITY.md:168-173` cites `server.ts:387/393` but those lines are now a BUG-001 comment block.
       - **Why:** Suppression documentation must map to actual code.
       - **Action:** Update line numbers and rule IDs; add regression comment in `server.ts`.
       - **Files likely affected:** `SECURITY.md`, `server.ts`.
       - **Validate:** Cited lines match described suppressions; `npm run verify:markdown-links`.
       - **Risk if ignored:** Auditors dismiss valid findings.

     - [ ] **P2 — Documentation: Remove unrelated image from `CODE_OF_CONDUCT.md`**
       - **Evidence:** `CODE_OF_CONDUCT.md:5` embeds an anime-girl wallpaper image.
       - **Why:** Unprofessional and potentially conflicts with CoC standards.
       - **Action:** Delete the `<img>` tag.
       - **Files likely affected:** `CODE_OF_CONDUCT.md`.
       - **Validate:** `npm run verify:markdown-links`; read file.
       - **Risk if ignored:** Perceived unprofessionalism; image may break.

     - [ ] **P2 — Documentation: Standardize CHANGELOG references**
       - **Evidence:** `CONTRIBUTING.md`, PR template, release docs reference `CHANGELOG.md` without path; canonical file is
   `docs/audits/CHANGELOG.md`.
       - **Why:** Contributors edit wrong file.
       - **Action:** Update all references to `docs/audits/CHANGELOG.md`.
       - **Files likely affected:** `CONTRIBUTING.md`, `.github/pull_request_template.md`, `docs/RELEASE/release.md`.
       - **Validate:** `npm run verify:markdown-links`.
       - **Risk if ignored:** Fragmented release notes.

     - [ ] **P2 — Documentation/Process: Update `docs/summary_of_work.md` Validation Matrix**
       - **Evidence:** Ledger records `npm test` as PASS, but the suite has a known flaky failure.
       - **Why:** Canonical handoff record must be honest.
       - **Action:** Append audit session entry; mark `npm test` FAIL with failing test name; add repair to Open TODO Ledger.
       - **Files likely affected:** `docs/summary_of_work.md`.
       - **Validate:** Re-run `npm test`; ledger matches.
       - **Risk if ignored:** Future agents treat suite as green.

     - [ ] **P2 — UX: Redact raw error text in chat-view "Forget fact" toast**
       - **Evidence:** `src/components/chat/chat-view.tsx:158` surfaces raw `err.message` in `toast.error`.
       - **Why:** Raw errors may leak local paths or storage internals.
       - **Action:** Route through `sanitizeErrorText(redactErrorMessage(err))`.
       - **Files likely affected:** `src/components/chat/chat-view.tsx`.
       - **Validate:** `npx vitest run src/components/chat/chat-view.test.tsx`.
       - **Risk if ignored:** Local paths exposed in UI toasts.

     - [ ] **P2 — Correctness: Remove dead audit spread in `computeSafeDiagnosticsSnapshot`**
       - **Evidence:** `src/services/diagnosticsService.ts:431` has `...(audit ? {} : {})`.
       - **Why:** Dead code misleadingly suggests audit data inclusion.
       - **Action:** Delete the no-op spread.
       - **Files likely affected:** `src/services/diagnosticsService.ts`.
       - **Validate:** `npm run typecheck`; `npx vitest run src/services/diagnosticsService.test.ts`; `npm run
   verify:status-diagnostics`.
       - **Risk if ignored:** Future maintainer may incorrectly expose audit data.

     - [ ] **P2 — Performance: Precompute lowercase index for History search**
       - **Evidence:** `src/components/chat/HistoryView.tsx:35-42` recomputes `contentToSearchText(...).toLowerCase().includes(s)` on
   every keystroke over all messages.
       - **Why:** O(n·m) work per keystroke.
       - **Action:** Build stable lowercase search-index per conversation in `useMemo`.
       - **Files likely affected:** `src/components/chat/HistoryView.tsx`, `src/components/chat/HistoryView.test.tsx`.
       - **Validate:** `npx vitest run src/components/chat/HistoryView.test.tsx`.
       - **Risk if ignored:** Slow, stuttering search UX.

     - [ ] **P2 — Correctness: Use stable React keys for chat messages**
       - **Evidence:** `src/components/chat/chat-view.tsx:266-268` uses array index as `key`.
       - **Why:** Index keys cause stale content on delete/reorder.
       - **Action:** Use `msg.id` as key.
       - **Files likely affected:** `src/components/chat/chat-view.tsx`.
       - **Validate:** `npx vitest run src/components/chat/chat-view.test.tsx`.
       - **Risk if ignored:** Message rendering glitches.

     - [ ] **P2 — UX: Surface image download failures as toasts**
       - **Evidence:** `src/components/image/image-view.tsx:151-169` logs `console.error` on failure and has no web fallback error
   handling.
       - **Why:** Users get no feedback on failed downloads.
       - **Action:** Replace with `toast.error(...)` using safe message helpers.
       - **Files likely affected:** `src/components/image/image-view.tsx`, `src/components/image/image-view.test.tsx`.
       - **Validate:** `npx vitest run src/components/image/image-view.test.tsx`.
       - **Risk if ignored:** Users think app is unresponsive.

     - [ ] **P2 — Correctness: Fix media "size" sort to use actual bytes**
       - **Evidence:** `src/stores/media-store.ts:493-500` sorts by `a.image.length` (base64 string length) with a 4× heuristic for
   video.
       - **Why:** String length is not decoded byte size.
       - **Action:** Sort by decoded byte length or store original byte size on `MediaItem`.
       - **Files likely affected:** `src/stores/media-store.ts`, `src/stores/media-store.test.ts`.
       - **Validate:** `npx vitest run src/stores/media-store.test.ts`.
       - **Risk if ignored:** Size sort is misleading.

     - [ ] **P2 — UX/Architecture: Extract oversized view components**
       - **Evidence:** `SettingsView.tsx` 1006 lines, `media-inspector.tsx` 912, `CommandPalette.tsx` 815, `gallery-view.tsx` 947,
   `image-view.tsx` 769.
       - **Why:** Hard to test/review/maintain.
       - **Action:** Split into co-located sub-component folders.
       - **Files likely affected:** Multiple component files + new folders.
       - **Validate:** `npm run lint:eslint && npm run typecheck && npm test && npm run build`.
       - **Risk if ignored:** Maintainability debt; higher regression risk.

     - [ ] **P2 — Testing: Close coverage gaps in low-covered modules**
       - **Evidence:** `src/types/desktop.ts` 0%, `src/shared/safety/index.ts` 0%, `src/types/connectivity.ts` 7.14%,
   `src/types/scene.ts` 70.47%, `src/stores/research-store.ts` 85.41%.
       - **Why:** Uncovered edge-case code regresses in production.
       - **Action:** Add unit tests for type guards, safety index fallbacks, connectivity helpers, scene sanitization, research error
   branches.
       - **Files likely affected:** New test files for above modules.
       - **Validate:** `npm run test:coverage` passes with no 0%-covered source files.
       - **Risk if ignored:** Silent regressions.

     - [ ] **P2 — Dependencies: Improve Dependabot grouping**
       - **Evidence:** `.github/dependabot.yml` groups all npm packages with pattern `*`.
       - **Why:** Single giant PR delays security fixes.
       - **Action:** Split into `security-critical`, `production`, `development`, `electron`, `major-updates` groups.
       - **Files likely affected:** `.github/dependabot.yml`.
       - **Validate:** Dependabot opens categorized PRs; `npm run ci` passes.
       - **Risk if ignored:** Delayed security patches; large breaking-change PRs.

     - [ ] **P2 — Release Hygiene: Clean `release/` between platform builds**
       - **Evidence:** `npm run dist:*` scripts do not run `npm run clean` first; `release/` accumulates artifacts.
       - **Why:** Risk of shipping stale/wrong-platform files.
       - **Action:** Prepend `npm run clean` to each `dist:*` script or add clear docs.
       - **Files likely affected:** `package.json`, `docs/RELEASE/release.md`.
       - **Validate:** Run `npm run dist:mac` twice; verify old artifacts removed.
       - **Risk if ignored:** Accidental publication of stale files.

     - [ ] **P2 — Dev Config: Fix Vite proxy `secure: true` with HTTP target**
       - **Evidence:** `vite.config.ts` targets `http://127.0.0.1:3000` with `secure: true`.
       - **Why:** Misleading for HTTPS switching.
       - **Action:** Make `secure` conditional on target protocol or set false for default HTTP.
       - **Files likely affected:** `vite.config.ts`.
       - **Validate:** `npm run dev` proxies without TLS errors.
       - **Risk if ignored:** Developer confusion/proxy failures.

     - [ ] **P2 — Build Config: Remove unused `immer` devDependency**
       - **Evidence:** `package.json` lists `immer`; no imports in `src/`, `electron/`, `server.ts`, `scripts/`.
       - **Why:** Dead dependency bloat.
       - **Action:** Remove `immer` and update lockfile.
       - **Files likely affected:** `package.json`, `package-lock.json`.
       - **Validate:** `npm run lint:eslint && npm run typecheck && npm test`.
       - **Risk if ignored:** Supply-chain bloat.
   ```

   P3 — Future Enhancements

   ```markdown
     - [ ] **P3 — Future Platform Parity: Consider Windows arm64 packaging**
       - **Evidence:** `docs/DEVELOPMENT/platform-support.md` lists Windows ARM64 as not packaged by default.
       - **Action:** Add `arm64` to Windows targets, update CI, docs, and verification.
       - **Files likely affected:** `electron-builder.config.cjs`, `.github/workflows/release.yml`, `scripts/verify-dist.cjs`,
   `docs/DEVELOPMENT/platform-support.md`.
       - **Validate:** `npm run verify:dist:win` includes arm64 artifacts.
       - **Risk if ignored:** Windows ARM users rely on x64 emulation.

     - [ ] **P3 — Future: Publish Linux auto-updater metadata or disable Linux update checks**
       - **Evidence:** Linux built in CI but update path unclear; `electron/ipc/updates.ts` exposes updates on all platforms.
       - **Action:** Generate `latest-linux.yml` or return friendly unsupported message on Linux.
       - **Files likely affected:** `electron/ipc/updates.ts`, `electron-builder.config.cjs`.
       - **Validate:** Linux update check resolves or shows unsupported message.
       - **Risk if ignored:** Confusing Linux update errors.

     - [ ] **P3 — Documentation: Add branch-protection and signing secrets configuration notes**
       - **Evidence:** No tracked repo-settings guidance.
       - **Action:** Create `docs/RELEASE/repository-settings.md`.
       - **Files likely affected:** `docs/RELEASE/repository-settings.md` (new).
       - **Validate:** Maintainer review.
       - **Risk if ignored:** Accidental disabled checks or lost signing knowledge.

     - [ ] **P3 — Documentation: Add `FUNDING.yml` or explicit no-donations note**
       - **Evidence:** No funding metadata.
       - **Action:** Add `.github/FUNDING.yml` or note in README/ABOUT.
       - **Files likely affected:** `.github/FUNDING.yml` or `README.md` + `docs/ABOUT.md`.
       - **Validate:** GitHub renders file correctly.
       - **Risk if ignored:** Minor appearance of incompleteness.

     - [ ] **P3 — UX/Performance: Avoid recomputing status snapshot on every tab change**
       - **Evidence:** `HeaderStatusCluster.tsx` calls `recompute()` in `useEffect` when `activeTab` changes.
       - **Action:** Rely on store-driven updates.
       - **Files likely affected:** `src/components/status/HeaderStatusCluster.tsx`.
       - **Validate:** Status indicators still update.
       - **Risk if ignored:** Minor unnecessary CPU work.

     - [ ] **P3 — Diagnostics: Disambiguate "Privacy" section in DiagnosticsDrawer**
       - **Evidence:** DiagnosticsDrawer maps "Privacy" label to the same `storage` key as Storage section.
       - **Action:** Add dedicated `privacy` category or merge into Overview/Repair.
       - **Files likely affected:** `src/types/status.ts`, `src/services/diagnosticsService.ts`,
   `src/components/status/DiagnosticsDrawer.tsx`.
       - **Validate:** `npm run verify:status-diagnostics`.
       - **Risk if ignored:** Misleading diagnostics UX.
   ```

   ────────────────────────────────────────────────────────────────────────────────

   5. Category Coverage Matrix

   ┌───────────────────────────┬─────────┬───────────────────────────────────────────────────────┬───────────────────────────────────┐
   │ Category                  │ Status  │ Evidence inspected                                    │ Notes                             │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Build/runtime             │ Covered │ package.json, vite.config.ts, tsconfig*.json,         │ P0: duplicated renderer code in   │
   │                           │         │ electron-builder.config.cjs, npm run build, npm run   │ dist-electron/src/, engine        │
   │                           │         │ typecheck, npm run lint:eslint                        │ mismatch, build-tool              │
   │                           │         │                                                       │ vulnerabilities                   │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Architecture              │ Covered │ electron/main.ts, electron/preload.ts, server.ts,     │ P1: server imports electron/      │
   │                           │         │ src/ directory structure, wc -l oversized files       │ utils; P2: oversized components   │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Security                  │ Covered │ electron/preload.ts, electron/ipc/handlers.ts,        │ P0: native confirm, prior-context │
   │                           │         │ src/services/desktopBridge.ts, src/shared/safety/*,   │ secret leak; P1: dashboard key    │
   │                           │         │ server.ts, npm run verify:safety-guard, secret grep   │ status                            │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Testing                   │ Covered │ vitest.config.ts, 248 test files, npm test, npm run   │ P0: flaky Jina rate-limit test;   │
   │                           │         │ test:coverage, npm audit                              │ P2: noisy warnings, mock leaks,   │
   │                           │         │                                                       │ coverage gaps                     │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ CI/CD                     │ Covered │ .github/workflows/ci.yml,                             │ P1: no macOS PR runner, no        │
   │                           │         │ .github/workflows/release.yml, .github/dependabot.yml │ packaged smoke, no dev audit      │
   │                           │         │                                                       │ gate, no cancel-in-progress       │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Documentation             │ Covered │ README.md, CONTRIBUTING.md, docs/**/*, SECURITY.md,   │ P1/P2: repo slug mismatch, stale  │
   │                           │         │ CODE_OF_CONDUCT.md                                    │ claims, CoC image, stale          │
   │                           │         │                                                       │ SECURITY.md lines                 │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Developer experience      │ Covered │ package.json scripts, no .nvmrc, npm ci engine        │ P1: add .nvmrc; P2: noisy tests   │
   │                           │         │ warnings                                              │                                   │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Dependencies              │ Covered │ package.json, package-lock.json, npm audit, npm       │ P0: 4 vulnerabilities; P1: 28     │
   │                           │         │ outdated                                              │ outdated packages                 │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Packaging/release         │ Covered │ electron-builder.config.cjs, release/,                │ P0: repo slug, notarization; P1:  │
   │                           │         │ scripts/verify-dist.cjs,                              │ portable signing, Linux arm64,    │
   │                           │         │ scripts/checksum-release.cjs, npm run verify:dist:mac │ draft gate                        │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Config/env                │ Covered │ .env, .env.example, .config/*.yaml,                   │ P2: local .env audit; web dev     │
   │                           │         │ scripts/init-config.ts, scripts/validate-config.ts    │ session keys have no expiry       │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Logging/diagnostics       │ Covered │ src/services/diagnosticsService.ts,                   │ P2: dead audit spread, raw error  │
   │                           │         │ src/stores/status-store.ts, status components, npm    │ toast, privacy section ambiguity  │
   │                           │         │ run verify:status-diagnostics                         │                                   │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Performance/reliability   │ Covered │ src/stores/media-store.ts, src/stores/chat-store.ts,  │ P1: unbounded media/chat caches;  │
   │                           │         │ src/components/chat/HistoryView.tsx                   │ P2: O(n·m) search, index keys     │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ UX/app                    │ Covered │ src/components/chat/HistoryView.tsx,                  │ P0: native confirm; P2: raw       │
   │ behavior/accessibility    │         │ src/components/image/image-view.tsx,                  │ toast, silent download failures,  │
   │                           │         │ src/components/chat/chat-view.tsx                     │ stable keys                       │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ GitHub hygiene            │ Covered │ .github/ISSUE_TEMPLATE/*, pull_request_template.md,   │ P2/P3: slug alignment, CHANGELOG  │
   │                           │         │ CODEOWNERS, dependabot.yml, no FUNDING.yml            │ path, branch-protection docs,     │
   │                           │         │                                                       │ FUNDING                           │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Legal/licensing/privacy   │ Covered │ LICENSE, docs/legal/*, assets/branding/NOTICE.md,     │ P1: Venice.ai brand-asset         │
   │                           │         │ trademark docs                                        │ approval before wide distribution │
   ├───────────────────────────┼─────────┼───────────────────────────────────────────────────────┼───────────────────────────────────┤
   │ Roadmap                   │ Covered │ docs/audits/todo.md, docs/audits/combined-todo.yml,   │ P3: future Windows arm64, Linux   │
   │                           │         │ docs/summary_of_work.md                               │ updates                           │
   └───────────────────────────┴─────────┴───────────────────────────────────────────────────────┴───────────────────────────────────┘

   ────────────────────────────────────────────────────────────────────────────────

   6. Suggested GitHub Issues

   P0 Issues

   1. [P0] Replace native window.confirm in History batch delete and add detection verifier
   2. [P0] Redact and bound prior conversation context before sending to Venice API
   3. [P0] Canonicalize repository slug across package metadata, docs, and auto-updater
   4. [P0] Fix flaky server.test.ts Jina rate-limit test
   5. [P0] Stop shipping renderer source inside dist-electron/src/
   6. [P0] Resolve build-time dependency vulnerabilities (esbuild/vite/form-data/tar)
   7. [P0] Add explicit macOS notarization configuration to electron-builder

   P1 Issues

   1. [P1] Fix Storage Privacy Dashboard API-key status reporting
   2. [P1] Sign Windows portable executable or document unsigned limitation
   3. [P1] Validate or remove Linux arm64 cross-compilation in CI
   4. [P1] Add draft/verification gate before GitHub release publish
   5. [P1] Add macOS runner to pull-request CI
   6. [P1] Run packaged Electron smoke test in CI
   7. [P1] Clean noisy test warnings and mock leaks
   8. [P1] Refresh outdated dependencies and align Node engine usage
   9. [P1] Bound media-store in-memory cache
   10. [P1] Bound chat-store dirty-conversation map

   P2 Issues

   1. [P2] Canonicalize repo slug in all documentation
   2. [P2] Correct web-mode Jina key storage claim in platform matrix
   3. [P2] Clarify desktop chat history is plaintext JSON in ABOUT.md
   4. [P2] Refresh stale server.ts line references in SECURITY.md
   5. [P2] Remove unrelated image from CODE_OF_CONDUCT.md
   6. [P2] Standardize CHANGELOG path references
   7. [P2] Update summary_of_work.md Validation Matrix for failing test
   8. [P2] Redact raw error text in chat-view "Forget fact" toast
   9. [P2] Precompute lowercase index for History search
   10. [P2] Extract oversized view components

   P3 Issues

   1. [P3] Consider Windows arm64 packaging
   2. [P3] Publish Linux auto-updater metadata or disable Linux update checks
   3. [P3] Document GitHub branch-protection and signing secrets
   4. [P3] Add FUNDING.yml or no-donations note

   ────────────────────────────────────────────────────────────────────────────────

   7. Suggested Milestones

   0.1.0 — Repo Stabilization

   • Fix repo slug mismatch across metadata and docs
   • Update docs/summary_of_work.md Validation Matrix
   • Clean dirty working tree and cut a clean tag
   • Remove unrelated image from CODE_OF_CONDUCT.md
   • Fix SECURITY.md stale line references

   0.2.0 — Test and CI Foundation

   • Fix flaky server.test.ts Jina rate-limit test
   • Eliminate noisy test warnings and mock leaks
   • Add macOS runner to PR CI
   • Persist test/coverage artifacts
   • Close low-covered module coverage gaps

   0.3.0 — Security, Privacy, and Config Hardening

   • Replace native window.confirm with app-modal + verifier
   • Redact and bound prior conversation context
   • Fix Storage Privacy Dashboard key-status reporting
   • Resolve build-time dependency vulnerabilities
   • Add dev-dependency audit gate to CI
   • Web dev session key expiry/rotation

   0.4.0 — Windows/macOS Packaging and Release Pipeline

   • Add explicit macOS notarization config
   • Sign Windows portable executable or document limitation
   • Validate/remove Linux arm64 cross-compilation
   • Add draft/verification gate before release publish
   • Stop shipping renderer source in dist-electron/src/
   • Enable release workflow cancel-in-progress

   0.5.0 — UX, Accessibility, and Diagnostics Hardening

   • Redact raw error toasts
   • Surface image download failures
   • Use stable React keys for messages
   • Precompute History search index
   • Extract oversized components
   • Bound media/chat caches

   1.0.0 — Production-Ready Desktop Release

   • All P0/P1 items closed
   • Full npm run ci green on clean tag
   • Signed/notarized macOS artifacts
   • Signed Windows NSIS + documented portable
   • Verified Linux x64 artifacts
   • Updated legal/trademark approvals

   2.0.0 — Advanced Venice Forge Platform Roadmap

   • Windows arm64 packaging
   • Linux auto-updater or explicit unsupported path
   • Branch-protection documentation
   • Accessibility automation (axe-core)
   • Performance benchmarks for large galleries/conversations

   ────────────────────────────────────────────────────────────────────────────────

   8. Recommended First 10 Actions

   ┌───────┬──────────────────────┬─────────────────────────────────────┬──────────────────────────┬─────────────────────────────────┐
   │ Order │ Action               │ Command / File(s)                   │ Expected Outcome         │ Validation                      │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 1     │ Replace native       │ src/components/chat/HistoryView.tsx │ Native dialogs           │ rg -n "window\.confirm" src     │
   │       │ window.confirm in    │ , HistoryView.test.tsx              │ eliminated               │ empty; npm test                 │
   │       │ History batch delete │                                     │                          │                                 │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 2     │ Add native-dialog    │ scripts/verify-no-native-dialogs.cj │ CI catches regressions   │ node                            │
   │       │ verifier script      │ s (new), package.json               │                          │ scripts/verify-no-native-dialog │
   │       │                      │                                     │                          │ s.cjs                           │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 3     │ Redact prior         │ src/utils/chatPayloadContext.ts,    │ Secrets not forwarded    │ New regression tests pass       │
   │       │ conversation context │ src/hooks/use-chat.ts,              │                          │                                 │
   │       │                      │ chat-view.tsx                       │                          │                                 │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 4     │ Fix repo slug        │ package.json,                       │ app-update.yml has       │ npm run                         │
   │       │ mismatch             │ electron-builder.config.cjs,        │ Venice_Forge             │ verify:release-packaging-harden │
   │       │                      │ README, docs                        │                          │ ing                             │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 5     │ Fix flaky Jina       │ server.test.ts                      │ npm test passes 5×       │ Run full suite 5 times          │
   │       │ rate-limit test      │                                     │ consecutively            │                                 │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 6     │ Resolve build-time   │ package.json, package-lock.json     │ npm audit                │ Audit + npm run ci              │
   │       │ vulnerabilities      │                                     │ --audit-level=moderate   │                                 │
   │       │                      │                                     │ exits 0                  │                                 │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 7     │ Add macOS            │ electron-builder.config.cjs         │ Signed CI build          │ spctl -a -vv allows launch      │
   │       │ notarization config  │                                     │ notarizes                │                                 │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 8     │ Fix Storage Privacy  │ src/stores/storage-privacy-store.ts │ Dashboard reports real   │ npm run verify:storage-privacy  │
   │       │ Dashboard key status │                                     │ key status               │                                 │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 9     │ Remove renderer      │ electron/main.ts,                   │ dist-electron/src/ empty │ npm run build + find            │
   │       │ source from main     │ tsconfig.electron.json, build       │ after build              │ dist-electron/src               │
   │       │ bundle               │ config                              │                          │                                 │
   ├───────┼──────────────────────┼─────────────────────────────────────┼──────────────────────────┼─────────────────────────────────┤
   │ 10    │ Clean dirty working  │ All modified/untracked files        │ git status --short empty │ git status --short              │
   │       │ tree                 │                                     │                          │                                 │
   └───────┴──────────────────────┴─────────────────────────────────────┴──────────────────────────┴─────────────────────────────────┘

   ────────────────────────────────────────────────────────────────────────────────

   9. Validation Command Matrix

   ┌────────────────────┬──────────────────────────────────────┬─────────────────┬───────────────────────────────────────────────────┐
   │ Area               │ Command                              │ Expected result │ Notes                                             │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Install            │ npm ci                               │ Pass with       │ Engine mismatch (Node 26 vs required 22), 4 dev   │
   │                    │                                      │ warnings        │ audit vulns, deprecated packages                  │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Lint               │ npm run lint:eslint                  │ Pass            │ Zero warnings                                     │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Typecheck          │ npm run typecheck                    │ Pass            │ Renderer + Electron                               │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Unit tests         │ npm test                             │ Intermittent    │ server.test.ts > should rate-limit                │
   │                    │                                      │ fail            │ /api/proxy-jina after 3 requests times out ~5005  │
   │                    │                                      │                 │ ms                                                │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Coverage           │ npm run test:coverage                │ Pass            │ Stmts 70.62%, Branch 61.7%, Funcs 68.18%, Lines   │
   │                    │                                      │                 │ 73.68% vs thresholds 70/61/68/73                  │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Build              │ npm run build                        │ Pass            │ dist/ + dist-electron/ + dist/server.cjs          │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Dev audit          │ npm audit --audit-level=moderate     │ Fail            │ 4 vulnerabilities (3 high esbuild/form-data, 1    │
   │                    │                                      │                 │ moderate tar)                                     │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Prod audit         │ npm audit --omit=dev                 │ Pass            │ 0 vulnerabilities                                 │
   │                    │ --audit-level=moderate               │                 │                                                   │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Verify dist        │ npm run verify:dist                  │ Pass            │ Build outputs only                                │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Verify contracts   │ npm run verify:contracts             │ Pass (per       │ All Phase 2 contract verifiers pass               │
   │                    │                                      │ subagent)       │                                                   │
   ├────────────────────┼──────────────────────────────────────┼─────────────────┼───────────────────────────────────────────────────┤
   │ Release packaging  │ npm run                              │ Pass            │ 75/75 checks (but does not catch repo slug        │
   │ hardening          │ verify:release-packaging-hardening   │                 │ mismatch)                                         │
   └────────────────────┴──────────────────────────────────────┴─────────────────┴───────────────────────────────────────────────────┘

   ────────────────────────────────────────────────────────────────────────────────

   10. Remaining Unknowns

   ┌────────────────────────────────────────┬──────────────────────────────────┬─────────────────────────────────────────────────────┐
   │ Unknown                                │ Why it matters                   │ How to verify                                       │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ .env contents                          │ Could contain real API keys      │ Manual maintainer audit; git ls-files | grep -E     │
   │                                        │                                  │ '^\.env' must be empty                              │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ Actual GitHub repo settings            │ Branch protection, required      │ Maintainer with admin access checks Settings        │
   │                                        │ checks, secrets                  │                                                     │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ macOS notarization end-to-end          │ Signed builds may still be       │ Run release workflow with Apple credentials; xcrun  │
   │                                        │ unnotarized                      │ notarytool log                                      │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ Windows portable signing behavior      │ Portable exe may remain unsigned │ Build on Windows runner; check SmartScreen          │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ Linux arm64 CI cross-compilation       │ May fail on x64 GitHub runner    │ Run npm run dist:linux on ubuntu-latest             │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ Real upstream Venice API compatibility │ All proxy tests use mocks        │ Manual integration test with real key               │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ Runtime memory profiles for large      │ Unbounded cache findings are     │ Run npm run profile:media-studio with 1000+ records │
   │ galleries                              │ code-inferred                    │                                                     │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ Accessibility scan across components   │ No automated a11y tooling        │ Add axe-core or manual screen-reader test           │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ Venice.ai brand-asset approval         │ Blocking wide distribution       │ Legal review / written approval                     │
   ├────────────────────────────────────────┼──────────────────────────────────┼─────────────────────────────────────────────────────┤
   │ Whether repo rename to Venice_Forge is │ Determines metadata update       │ Confirm with project owner                          │
   │ intentional                            │ direction                        │                                                     │
   └────────────────────────────────────────┴──────────────────────────────────┴─────────────────────────────────────────────────────┘

```text
   NOTES:
   .env contents: .env file is within standard
   Actual GitHub repo settings: GH auth command line is authorized with an admin PAT. Github actions are configured with the same PAT. Allowed.
   macOS notarization end-to-end: currently no Dev signing.
   Real upstream Venice API compatibility: use given `venince_api_key` within `.env`. file.
   Accessibility scan across components: install `a11y` CLI tool and run `a11y check ` on the built HTML, or use a browser extension.
   Venice.ai brand-asset approval: approve brand assets as per Venice.ai guidelines.
   Whether repo rename is intentional: Yes, the repo was renamed to Venice_Forge.
```
