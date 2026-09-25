# Summary of Work

This is the active handoff and validation ledger. The canonical current-work ledger is `docs/ROADMAP.md`. The ledger as it stood before the 2026-09-23 compaction is `docs/reports/historical/summary-of-work-before-2026-09-23.md`.

## Current State (machine-readable; refresh per session — VF-AUD-20260916-P3-002)

```text
repository_head_sha: 107e6e12a75aa5bc119b633d4117939b90339cb4 (fix(audit,i18n): remediate 2026-09-24 audit findings and complete first-pass locale catalogs)
application_code_sha: 107e6e12a75aa5bc119b633d4117939b90339cb4
verified_against_sha: 107e6e12a75aa5bc119b633d4117939b90339cb4
verified_at:         2026-09-24 (Pacific)
package_version:     3.1.0
node_engine:         >=22.15.0 <23.0.0
branch:              main
working_tree:        clean
ci_status:           success for 107e6e12 (run 36082441197 — 11/11 jobs)
codeql_status:       success for 107e6e12 (run 36082441227 — Analyze actions and Analyze javascript-typescript)
open_findings:       safety-contract conflict in selected 2026-09-24 audit; P2-016 headed human accessibility QA; P3-020 qualified native-language review; VF-VERIFY-005 external release evidence
external_acceptance_outstanding:
  - headed accessibility/visual QA with a human signature (P2-016)
  - qualified native-language review (P3-020)
  - funded live provider calls, signed/notarized installers, and two-device sync (VF-VERIFY-005)
```

## Latest Session Summary

- **2026-09-24 Hosted publication and validation.** Completed pre-push local validation gates (safety guard, markdown links, contracts, ESLint, TypeScript typecheck, full test suite with 7,055 tests across 588 files, segmented test suites for electron/server/ingestion, build, dist verification, and full local `npm run ci`). Committed the 2026-09-24 audit remediations, point-in-time audit record, and first-pass locale catalog completion to local main (`107e6e12a75aa5bc119b633d4117939b90339cb4`), pushed to remote main, synchronized HEAD, and verified hosted GitHub Actions CI (run 36082441197, 11/11 jobs) and CodeQL (run 36082441227, 2/2 jobs) both succeeded.

- **2026-09-24 Audit remediation and first-pass locale completion.** Repaired the mobile sidebar layout and related History/Privacy mobile controls; valid legacy history now remains retryable after vault write failure; main-frame IPC checks reject missing frame identities; the direct esbuild override follows the declared dependency; and the capture runner records measured defects with unsigned human-review notes. Added focused migration and IPC regression tests. Resolved the 128 standard i18n errors in the dirty starting worktree and, with user direction, filled 594 missing locale values as first-pass translations. Removed four pre-existing visible translation-token artifacts and added a verifier regression check for them. `node scripts/verify-i18n.cjs --strict` now passes. Non-English catalogs remain `first-pass-machine` pending qualified review. Local validation and packaging results are recorded below; no commit or push was made.

- **2026-09-24 Application/repository audit.** Created a point-in-time handoff under `docs/audits/Records/` with six evidence-backed findings. A focused Chrome capture reproduced a shared mobile shell failure: at a 390 px viewport, the hidden sidebar computes `position:relative`, consumes 288 px, and leaves the main view 102 px wide. Traced valid legacy history being moved into `corrupt` after a destination vault save failure, the common IPC main-frame option accepting an unavailable `mainFrame`, and a capture runner writing unearned `PASS` notes. Dependabot's esbuild direct/override update conflict was corroborated by hosted run 35999725421 and a disposable npm reproduction. Full local `npm run ci` failed at the pre-existing locale edits with 128 i18n errors after lint, types, segmented tests, audit, and build. Unsigned macOS arm64 packaging and packaged Electron smoke passed. The untracked audit draft and all user-owned locale edits were preserved. See the registered audit for scope limits and remediation sequence.

- **2026-09-24 Audit handoff reconciliation (started).** Compared the untracked 2026-09-24 exhaustive audit handoff with local `main` at `56924240`. `AGENTS.md` and README already link to existing canonical bootstrap and file-tree documents; both i18n commands exist; Apache-2.0 is consistent across root license, package metadata, README, and legal terms; README lists 43 themes consistently; Playwright is installed and used in smoke tests. The audit's license claim did reveal one separate tracked `docs/design/REPOSITORY_TREE.md` label still saying MIT, corrected to Apache-2.0. Current CI and CodeQL both succeeded for the exact local HEAD. The selected audit's assertion that child-safety remains mandatory in Adult Mode conflicts with current `SECURITY.md`, `server.test.ts`, and Electron guard tests, which intentionally skip all local screening when Family Safe Mode is off; that policy conflict remains open. Pre-existing locale edits were preserved; `verify:i18n` reports 128 untranslated-English errors in the current worktree.

- **2026-09-23 Roadmap compaction and remaining-risk closeout.**
  - **Scope:** Finish the risks left by the repository-management revalidation: the roadmap narrated closed tranches, the session ledger had grown to about 650 KB, and the IPC, media, and store boundary had only been spot-checked.
  - **Roadmap:** `docs/ROADMAP.md` now lists only unfinished external acceptance, plus accepted product deferrals that already have decision records. Closed 2026-09 narratives were removed from the live roadmap. Their evidence remains in the archived ledger.
  - **Ledger:** The previous full ledger was copied to `docs/reports/historical/summary-of-work-before-2026-09-23.md` and this file was replaced with the active handoff.
  - **IPC:** Every production `ipcMain.handle` registration goes through `registerPrivilegedIpcChannel`. `registerIpcChannel` has no production caller. `sync:setSyncFolder` accepts only the path already chosen by the main-process folder picker.
  - **Theme:** `--color-border-soft` and `--color-border-faint` already have a single `color-mix` definition in `src/styles/theme.css`. No second declaration remains.
  - **Left open on purpose:** human per-tab accessibility sign-off, qualified native-language review, and external release evidence (signing, notarization, funded provider calls, two-device sync). Those require a person, certificates, a paid account, or a second device.
  - **Publication:** committed and pushed as `6747b0ad`. Hosted CI run `35957327247` and CodeQL run `35957327282` both succeeded.

- **2026-09-23 Repository-management revalidation.** Hygiene delta from the prior turn in this worktree is still uncommitted: `/out/` ignore, removal of unreferenced `assets/ReadMe_Preview.png`, Records archive of `auditsep23.md` and the pet-rotation handoff, README CI wording, and the three reports under `docs/audits/Records/2026-09-23-repository-*.md`.

## Session History

### 2026-09-24 — Pre-push validation and publication to main

- Executed full pre-push validation gates: safety-guard, markdown-links, contracts (including features, release packaging, static), ESLint, TypeScript typechecking, full vitest suite (588 files, 7,055 tests passed), segmented electron/server/ingestion test suites, production build, dist verification, and full local `npm run ci`.
- Committed the audit remediations (mobile sidebar layout, legacy conversation vault migration retry custody, main-frame IPC check hardening, esbuild override spec, acceptance capture runner reporting), point-in-time audit handoff record in `docs/audits/Records/`, and first-pass locale catalog completion.
- Pushed directly to `origin/main` without force flags.

### 2026-09-24 — Six audit remediations and first-pass locale completion

- Preserved the dirty starting worktree, including its locale edits and untracked selected audit. Used red/green regression tests for valid legacy-history retry custody and unavailable IPC main-frame identity. Updated one general IPC test event to supply a matching frame after the stricter boundary exposed its incomplete fixture.
- Reproduced and fixed the 390 px mobile sidebar width defect, then adjusted History search/filter and Privacy controls found by the same eight-tuple History/Privacy capture. The capture script now records limited geometry failures, actual browser version, and pending human review rather than unearned PASS statements.
- Changed esbuild's override to npm's `$esbuild` reference. A disposable direct-dependency update resolved without `EOVERRIDE`; the committed lockfile was not regenerated.
- Cleared 128 standard i18n errors with nine translated UI strings and exact locale-specific technical-value approvals. At the user's direction, filled 594 `__MISSING__` values using existing translations, first-pass translation, and focused manual corrections. Preserved interpolation and product/transport tokens; strict structural verification passes. Qualified language review is still required and production-complete flags remain false.
- Replaced four pre-existing `ZXQ`/`ZXQPH` translation artifacts in Spanish/Swedish copy and added a red/green verifier test so such artifacts fail i18n checks. Updated the Superdesign source fingerprint after changing the tracked sidebar source.
- Built unsigned macOS arm64 DMG/ZIP and ran packaged Electron smoke. No commit, push, signing, notarization, funded provider call, or human per-tab sign-off was performed.

### 2026-09-24 — Application/repository audit and remediation handoff

- Reviewed the current source/IPC/persistence/UI/CI architecture and all four GitHub workflows; produced `docs/audits/Records/2026-09-24-application-repository-audit-handoff.md` and registered it in `docs/DOCS_INDEX.md`. This is point-in-time evidence; unfinished work is in `docs/ROADMAP.md`.
- Reproduced a shared mobile shell defect with eight History/Privacy Chrome captures and an independent DOM measurement: closed drawer position is relative, width 288 px, and main width 102 px in a 390 px viewport. Traced the CSS rule and missing geometry assertion.
- Traced valid legacy conversation migration through save failure, source relocation, and UI result handling; audited the main-frame IPC option and its security tests; verified the capture tool's unconditional review claims; corroborated Dependabot's esbuild failure with hosted run data and a disposable npm manifest outside the repository.
- Ran full local CI, macOS arm64 packaging, and packaged Electron smoke. Preserved pre-existing locale edits and the untracked prior audit draft. No application code, commit, push, or release was made.

### 2026-09-24 — Audit handoff reconciliation

- Verified repository identity and remote `main` at `56924240509f8580b9cee5d9ef31202d35439908`, Node `v22.15.0`, npm `10.9.2`, package `3.1.0`, and the dirty user-owned locale/audit state before editing.
- Rechecked the six headline audit findings against the current checkout. Five are stale as written; the security-document finding is superseded by a policy conflict between the selected audit and the current implementation/tests. Corrected a separately verified MIT label in `docs/design/REPOSITORY_TREE.md`.
- Resolved three audit verification items by static evidence: `verify:i18n-hardcoded-regressions` is part of `verify:contracts:static`, and `.github/workflows/ci.yml` runs `verify:contracts`; `@testing-library/dom` is in `devDependencies`; Playwright is installed and imported by current smoke tests.
- Preserved all existing locale edits and the untracked audit handoff. No commit, push, release, or runtime safety change was made.

### 2026-09-23 — Roadmap compaction and remaining-risk closeout

- Archived the previous session ledger and reduced `docs/ROADMAP.md` to current unfinished work.
- Recorded the IPC registrar check and the single border-token definitions.
- External acceptance items stay open. Details and commands are in the validation matrix below.

## Open TODO Ledger

* **AUDIT-2026-09-24-APPLICATION** — Six evidence-backed items in the registered audit (`UX-P1-001`, `CI-P1-001`, `DATA-P2-001`, `SEC-P2-001`, `CI-P2-002`, `QA-P2-001`) have local remediations, focused validation, and regression tests committed. Headed human QA, signing, funded provider checks, and two-device sync remain separate external acceptance.

* **AUDIT-SAFETY-CONTRACT-2026-09-24** — Resolve the selected handoff's mandatory child-safety assertion against current Adult Mode behavior before changing safety enforcement or its documentation. See `docs/ROADMAP.md`.

* **AUDIT-I18N-WORKTREE-2026-09-24** — The 128 standard errors and 594 `__MISSING__` markers in the locale catalogs are resolved and committed; strict structural verification passes. Qualified native-language review remains `P3-020`.

* **REPO-MANAGEMENT-REAVALIDATION-2026-09-23** — Hygiene delta is in the worktree and uncommitted. Reports: `docs/audits/Records/2026-09-23-repository-audit.md`, `docs/audits/Records/2026-09-23-repository-hygiene-audit.md`, `docs/audits/Records/2026-09-23-repository-hygiene-final-report.md`.

* **ROADMAP-COMPACTION-2026-09-23** — Live roadmap and live ledger compacted. Prior ledger text is `docs/reports/historical/summary-of-work-before-2026-09-23.md`.

* **EXTERNAL-ACCEPTANCE** — `P2-016`, `P3-020`, and `VF-VERIFY-005` stay open. They are not local code defects. See `docs/ROADMAP.md`.

## Validation Matrix

### 2026-09-24 — Pre-push validation and publication to main

- `npm run verify:safety-guard` — PASS.
- `npm run verify:markdown-links` — PASS (443 files checked).
- `npm run verify:contracts` — PASS (all static, feature, and release packaging contracts).
- `npm run lint:eslint` — PASS (0 errors, 0 warnings).
- `npm run typecheck` — PASS (app, electron, electron.test).
- `npm test` — PASS (588 test files, 7,055 tests passed).
- `npm run test:electron` — PASS.
- `npm run test:server` — PASS (92 tests passed).
- `npm run test:ingestion` — PASS (12 test files, 117 tests passed).
- `npm run build && npm run verify:dist` — PASS (web, server, and Electron bundles verified).
- `npm run ci` — PASS (full gate and dist verification).
- `git diff --check` — PASS (0 whitespace errors).
- `npm run verify:archive-clean`, `npm run verify:superdesign-init`, `npm run verify:i18n`, `npm run verify:roadmap-current`, and `npm run verify:repo-handoff-hygiene` — PASS.
- Hosted CI run `36082441197` — PASS, 11/11 jobs (`windows-sensitive-tests`, `contracts`, `lint-and-typecheck`, `unit-and-integration-tests`, `macos-sensitive-tests`, `coverage`, `script-coverage`, `build`, `electron-smoke-windows`, `electron-smoke-macos`, `electron-smoke-linux`), SHA `107e6e12`.
- Hosted CodeQL run `36082441227` — PASS, Analyze actions and Analyze javascript-typescript, SHA `107e6e12`.
- Local `HEAD` matches `origin/main` at `107e6e12a75aa5bc119b633d4117939b90339cb4`.

### 2026-09-24 — Audit remediation and first-pass locale completion

- `npm ci` — PASS (857 packages; zero reported vulnerabilities).
- Focused `electron/services/conversationVault.test.ts` and `electron/ipc/handlers/common.security.test.ts` — PASS (52 tests); general `electron/ipc/handlers.test.ts` — PASS (89 tests) after updating its main-frame fixture.
- Focused Sidebar, Privacy, reference-viewport, and History tests — PASS (56 tests across five files).
- `npm run lint:eslint`, `npm run typecheck`, and `npm run verify:lockfile` — PASS on the remediation worktree before the final locale-only changes; aggregate CI reruns these checks.
- `npm run verify:i18n` — PASS after the initial 128-error correction. `node scripts/verify-i18n.cjs --strict` — PASS after filling all 594 markers; 12 locales and 12 namespaces.
- `npx vitest run scripts/i18n-tooling.test.ts --no-file-parallelism` — PASS (16 tests) after a red test demonstrated that token artifacts were previously accepted. `npm run verify:superdesign-init` — PASS after refreshing the sidebar source fingerprint.
- History/Privacy automated capture — PASS across 8 desktop/mobile and en-US/ar tuples after layout corrections; this is not human visual, keyboard, or screen-reader acceptance.
- `npm run dist:mac:arm64` — PASS after the final locale edits; unsigned DMG/ZIP and checksums generated. The packaged `app.asar` contains the final zh-CN Settings copy. `npm run smoke:electron` — PASS against that package, 3 files / 8 tests. Signing and notarization were not performed.
- Initial full `npm run ci` after locale work — FAIL at `verify:superdesign-init` because the tracked sidebar change invalidated the source fingerprint; all preceding CI stages passed. After refreshing it, the settled-worktree `npm run ci` — PASS through lint, typecheck, segmented tests, dependency audits, build, contracts, release checks, and `verify:dist`.
- `npm run verify:roadmap-current` and `npm run verify:repo-handoff-hygiene` — PASS after the final documentation update.
- `git diff --check` — PASS. No hosted run exists for these uncommitted edits.

### 2026-09-24 — Application/repository audit

- `npm audit --json` — PASS, zero reported vulnerabilities.
- `npm run ci` — FAIL at `verify:i18n` with 128 errors from the pre-existing locale edits. Lint, typecheck, segmented tests, dependency audits, and build ran before that failure.
- `npm run verify:contracts:features` — PASS when run separately after the aggregate stop (chat, image, workflow, RP, research, settings, backup/sync).
- `npm run verify:contracts:release` — PASS, 104 release-packaging checks.
- `npm run dist:mac:arm64` — PASS; unsigned arm64 DMG/ZIP and checksums generated.
- `npm run smoke:electron` — PASS, 3 test files / 8 tests against the packaged executable.
- `npm run verify:dist:mac` — FAIL because the full macOS verifier requires an x64 DMG and this session built only arm64. This does not establish a defect in the arm64 package.
- `npm run verify:per-tab-acceptance` — FAIL, 0/2,700 signed state evaluations; automated screenshots are not human review.
- Focused Chrome capture — 8 History/Privacy tuples completed. Independent 390 px DOM measurement showed sidebar width 288 px and main width 102 px. No screen-reader or qualified visual sign-off claimed.
- Hosted CI and CodeQL — PASS at exact HEAD; older Dependabot esbuild run 35999725421 — FAIL at dependency resolution.

### 2026-09-24 — Audit handoff reconciliation

- `npm ci` — PASS (857 packages added; npm audit reported 0 vulnerabilities).
- `npm run lint:eslint` — PASS.
- `npm run typecheck` — PASS.
- `npm test` — PASS (586 files / 7,048 tests passed; 2 files / 4 tests skipped).
- `npm run build` — PASS (web, server, and Electron bundles).
- `npm run verify:agent-docs`, `npm run verify:markdown-links`, `npm run verify:release-metadata`, `npm run verify:i18n-hardcoded-regressions`, `npm run i18n:verify-hardcoded`, and `npm run verify:safety-guard` — PASS on the current worktree.
- `npm run verify:roadmap-current` and `npm run verify:repo-handoff-hygiene` — PASS after the handoff update.
- `npm run verify:i18n` — FAIL (128 unapproved untranslated-English errors, 594 warnings in the pre-existing locale edits); no locale files were changed by this session.
- `git diff --check` — PASS after the design-tree correction.
- Hosted CI run `36064443092` and CodeQL run `36064443001` — PASS for exact HEAD `56924240`; these runs do not cover the current uncommitted locale edits.
- `npm run ci`, runtime UI QA, platform packaging, and live-provider checks — not run in this session.

### 2026-09-23 — Roadmap compaction and remaining-risk closeout

- Hosted CI run `35957327247` — PASS, 11/11 jobs, SHA `6747b0ad`.
- Hosted CodeQL run `35957327282` — PASS, Analyze actions and Analyze javascript-typescript, SHA `6747b0ad`.
- Local `HEAD` matches `origin/main` at `6747b0ad`.
- `npm ci`, `npm run lint:eslint`, `npm run typecheck`, `npm test`, `npm run build` — not run. This pass did not change application source.
- `npm run verify:markdown-links` — PASS (441 files).
- `npm run verify:repository-identity` — PASS.
- `npm run verify:roadmap-current` — PASS.
- `npm run verify:repo-handoff-hygiene` — PASS.
- `npm run verify:agent-docs` — PASS.

### 2026-09-23 — Repository-management revalidation

- `npm run verify:markdown-links` — PASS (440 files) before this compaction.
- `npm run verify:repository-identity` — PASS.
- `npm run verify:roadmap-current` — PASS.
- `npm run verify:repo-handoff-hygiene` — PASS.
- `npm run verify:image-policy` — PASS.
- `npm run verify:agent-docs` — PASS.
- `git check-ignore -v out/foo` — PASS.
