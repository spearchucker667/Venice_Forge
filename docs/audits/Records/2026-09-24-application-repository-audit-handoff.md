# Venice Forge application and repository audit — 2026-09-24

**Status:** Point-in-time audit evidence and implementation handoff. The canonical live task ledger is [`docs/ROADMAP.md`](../../ROADMAP.md); this report is not a second roadmap.
**Repository:** `spearchucker667/Venice_Forge`, `main` at `56924240509f8580b9cee5d9ef31202d35439908`; package `3.1.0`; Node `v22.15.0`; npm `10.9.2`.
**Scope:** Local macOS arm64 worktree, four GitHub workflows, recent Actions runs, representative end-to-end source paths, static checks, tests, build, packaging, and focused browser captures. The worktree was already dirty with user-owned locale edits and an untracked 2026-09-24 audit draft. No application source, locale, or existing untracked audit file was changed for this report.
**Finding inventory:** 6 actionable findings: P0 0, P1 2, P2 4, P3 0. Four are direct runtime/static/tooling defects, one is a current-worktree release gate failure, and one is a confirmed dependency automation failure. No demonstrated remote exploit or secret leak was found. Confidence and environment limits are stated per finding.

## Executive summary

The most visible confirmed defect is shared shell layout on mobile. A 390 px browser viewport gives the hidden sidebar 288 px of flex space and leaves `main` 102 px wide. History and Privacy screenshots show unusable, clipped content. An independent DOM measurement confirms that the sidebar computes to `position: relative` despite its `fixed` utility, because `.shell-region` sets `position: relative`.

The full local `npm run ci` fails at `verify:i18n` on 128 unapproved entries in user-owned locale edits. This is **not** a failure of the published HEAD: hosted CI and CodeQL passed for the exact HEAD. A separate recent Dependabot run failed when updating direct `esbuild` while an exact-spec override remained behind. Legacy conversation migration treats a vault save error as a corrupt source and moves valid input away from automatic retry. The common IPC wrapper fails open when a channel requires the main frame but `sender.mainFrame` is unavailable; this is a defense-in-depth defect, with no proven exploit path. Finally, the UI capture tool writes unconditional `PASS` review statements even for the visibly broken mobile captures; its unsigned stubs do not count as human acceptance.

This is a deep, evidence-led **sampled audit**, not a claim that every line of 2,223 tracked files was manually read. The review prioritized trust boundaries, migration/recovery, current failures, workflows, and executable user surfaces. Areas requiring funded provider calls, a second sync device, qualified native-language review, signing credentials, or human accessibility assessment remain explicitly unverified.

## Validation baseline and coverage

| Surface | Result and evidence |
|---|---|
| Repository | `main`, SHA above; 2,223 tracked files. Dirty before audit: locale JSON edits and an untracked audit draft; prior session also changed `docs/design/REPOSITORY_TREE.md`, `docs/ROADMAP.md`, and `docs/summary_of_work.md`. `git status --short` and diff inspected before documentation edits. |
| Dependencies | `npm ci` passed, 857 packages added; `npm audit --json` reported zero vulnerabilities. `npm outdated --json` listed 36 available updates, which alone are not defects. |
| Lint/types/tests | `npm run lint:eslint`, `npm run typecheck`, `npm test` passed. `npm test`: 586 files and 7,048 tests passed; 2 files/4 packaged-smoke tests skipped before packaging. |
| Build | `npm run build` and `npm run verify:dist` passed before the aggregate run. |
| Aggregate CI | `npm run ci` exited 1 at `verify:i18n`: **128 errors** after lint, typecheck, segmented tests, dependency audits, and build. The failing command is in `verify:contracts:static` (`package.json:123`). |
| Remaining contracts | Run separately after the aggregate stop: `npm run verify:contracts:features` passed across chat, image, workflow, RP, research, settings, and backup/sync; `npm run verify:contracts:release` passed 104 release-packaging checks. This does not make the aggregate CI green. |
| Focused verifiers | `verify:agent-docs`, `verify:markdown-links`, `verify:release-metadata`, `verify:i18n-hardcoded-regressions`, `i18n:verify-hardcoded`, `verify:safety-guard`, `verify:roadmap-current`, and `verify:repo-handoff-hygiene` passed before this report. `verify:i18n` failed with 128 errors and 594 allowed missing-marker warnings. |
| UI | Playwright/Chrome captured History and Privacy at 1280×720 and 390×844, `en-US` and `ar`, dark theme (8 tuples). Independent Chrome DOM inspection at 390×844 measured `aside` x=−288, width=288, computed `position:relative`; `main` x=288, width=102. Screenshots are ignored local capture evidence under `docs/design/per-tab-acceptance/evidence/`. Human acceptance verifier remains 0/2,700 signed state evaluations. |
| Hosted checks | CI run [36064443092](https://github.com/spearchucker667/Venice_Forge/actions/runs/36064443092) and CodeQL run [36064443001](https://github.com/spearchucker667/Venice_Forge/actions/runs/36064443001) succeeded for exact HEAD. They do not validate uncommitted locale edits. Dependabot run [35999725421](https://github.com/spearchucker667/Venice_Forge/actions/runs/35999725421) failed for older SHA `68bd0a07`; see CI-P2-002. |
| Packaging | Unsigned macOS arm64 `npm run dist:mac:arm64` passed, producing DMG/ZIP and checksums. `npm run smoke:electron` passed with the packaged executable (3 files, 8 tests). `npm run verify:dist:mac` exited 1 because it expects the x64 DMG as well; only the arm64 target was built. This is an incomplete local artifact set, not a proven packaging defect. No signed/notarized or Windows/Linux local package is claimed here. |

### Architecture map and traced paths

`src/main.tsx` starts the React/Vite renderer. `src/App.tsx` provides the shell, lazy tab surfaces, and `src/components/layout/sidebar.tsx`/`header.tsx`; Zustand stores coordinate UI state. `src/services/veniceClient.ts` exposes `veniceFetch()` and `veniceStreamChat()` and `src/services/desktopBridge.ts` selects Electron versus web transport. Desktop requests and privileged operations cross `electron/preload.ts` into registered handlers under `electron/ipc/handlers/`, then main-process services such as `electron/services/veniceClient.ts`, the conversation vault, media custody, document agent, and backup/sync. The web path goes through `server.ts` and its Express proxy. Renderer data spans IndexedDB, versioned records, and main-process encrypted files. `electron/main.ts` creates a sandboxed, context-isolated window, restricts navigation, and applies CSP. Background task and media paths were sampled for central request boundaries and durable custody; no additional defect was established from that sample.

The focused cross-layer traces were: **mobile tab navigation → shell CSS → rendered History/Privacy DOM**; **Memory panel migration action → preload/IPC → `vaultMigration` → `saveConversation` → source relocation → UI completion**; **privileged IPC registration → sender validation → main-frame check → file handlers**; **locale edits → `verify:i18n` → `verify:contracts:static` → local CI**; and **Dependabot update → package direct dependency/override → npm resolver**. The bundled Venice OpenAPI (`docs/reference/Venice_swagger_api.yaml`) and local API reference were checked for the audited client boundary; no new provider-schema mismatch is claimed from this pass.

## Confirmed findings

### [UX-P1-001] Hidden mobile sidebar consumes most of the viewport
Severity: P1
Confidence: Confirmed
Category: UI / responsive layout

#### Location
- `src/components/layout/sidebar.tsx:467-478`
- `src/styles/components.css:173-176`
- Symbol: `Sidebar`, `.shell-region`

#### Summary
The mobile drawer remains a 288 px flex item when closed. Every tab's main content is squeezed into the remaining 102 px at a 390 px viewport.

#### Evidence
`Sidebar` assigns both `fixed` and `shell-region`. The latter declares `position: relative`; in a running Chrome page the computed sidebar position is `relative`, x=−288, width=288. `main` starts at x=288 and has width=102. Captured History and Privacy pages at 390×844 visibly clip headings, controls, and content. Desktop 1280×720 captures do not show this failure. `tests/accessibility/reference-viewport.test.tsx` checks DOM classes/affordances in jsdom, not computed CSS geometry.

#### Root Cause
The shared `.shell-region` rule overrides the mobile positioning utility, so `translate-x` moves the sidebar visually but does not remove its flex width. The root shell's `overflow-hidden` then hides the truncated page.

#### Impact
Common web/mobile navigation and content interactions are unusable below the `md` breakpoint. The shared shell affects more than the two sampled tabs.

#### Reproduction
1. Run the renderer in Chrome at 390×844 and open History or Privacy with onboarding complete.
2. Keep the mobile drawer closed; inspect `aside` and `main` rectangles and computed positioning.

Expected: `aside` is fixed/out of flow and `main` occupies roughly the viewport width.
Actual: `aside` computes `relative`, takes 288 px; `main` is 102 px wide and content is clipped.

#### Recommended Fix
Remove positioning from the generic `.shell-region` decoration or give the sidebar a dedicated rule whose mobile fixed positioning wins. Confirm open and closed drawer behavior in LTR and RTL, and preserve desktop resizable width and overlay layering.

#### Example Implementation
Keep `position` owned by the sidebar breakpoint classes; let `.shell-region` provide only the intended stacking treatment, or move its relative positioning to the specific non-sidebar components that need it.

#### Regression Protection
Add a Playwright geometry assertion at 390 px and 1280 px for sidebar open/closed: closed mobile `main.width` should be near viewport width, open drawer overlays rather than resizes `main`. Include History and Privacy screenshots in review.

#### Validation
`npm run test:ui:layout`; focused Playwright mobile/desktop LTR/RTL geometry; `npm run build`; qualified per-tab visual review.

#### Dependencies / Related Findings
`QA-P2-001` masks this failure in generated notes.

---

### [CI-P1-001] Current locale edits fail the release contract gate
Severity: P1
Confidence: Confirmed
Category: Localization / current-worktree CI

#### Location
- `src/i18n/resources/*/{common,media,settings}.json` (pre-existing edited files; examples `src/i18n/resources/es/settings.json:619`, `src/i18n/resources/ar/settings.json:801`)
- `package.json:107,123`
- Symbol: `verify:i18n`, `verify:contracts:static`

#### Summary
The current dirty worktree cannot pass its aggregate CI or release contract gate because the localization verifier finds 128 unapproved entries. This does not describe the published HEAD.

#### Evidence
`npm run verify:i18n` and `npm run ci` both exit 1. Aggregate output: `i18n Verification Failed (128 errors)`. Examples include untranslated UI prose and also invariant-looking tokens such as `USD`, `Solana`, `2×`, and an encoded signature placeholder. The verifier additionally reports 594 **allowed** missing-marker warnings. `verify:contracts:static` invokes `verify:i18n`. Hosted CI succeeded for HEAD before these uncommitted edits.

#### Root Cause
The locale-editing work has not yet reconciled every new/changed value with the canonical source catalog and the verifier's approved intentional-invariant mechanism. Individual values require review; a technical token must not be translated merely to silence the checker.

#### Impact
Any publication of the present locale delta will fail contract CI and release readiness. App users may see untranslated prose where entries are real UI strings.

#### Reproduction
1. Preserve the current locale edits and run `npm run verify:i18n`.
2. Run `npm run ci` to see the same verifier stop the aggregate sequence.

Expected: zero unapproved entries.
Actual: 128 errors; aggregate CI exits 1.

#### Recommended Fix
Have the owner of the locale edits classify the 128 entries against `en-US`: translate visible prose, preserve interpolation and protocol identifiers exactly, and use the existing narrowly reviewed invariant mechanism for non-translatable values. Do not raise a blanket allowlist or overwrite the user-owned edits. Re-run strict release checks and retain non-English `isProductionComplete:false` pending native review.

#### Regression Protection
The existing `verify:i18n` contract gate is appropriate; maintain it. Add a targeted fixture only if a confirmed verifier false positive needs a narrow rule.

#### Validation
`npm run verify:i18n`; `npm run verify:i18n:release`; `npm run ci`; native review remains separate.

#### Dependencies / Related Findings
None. This is scoped to the current worktree, not the green hosted HEAD.

---

### [DATA-P2-001] Vault save failure removes valid legacy history from automatic retry
Severity: P2
Confidence: Confirmed
Category: Migration / recovery

#### Location
- `electron/services/vaultMigration.ts:220-238`
- `electron/services/conversationVault.ts:638-715`
- `src/components/layout/memory-panel.tsx:153-165`
- Symbol: `migrateLegacyHistory`, `saveConversation`, `handleMigrate`

#### Summary
An encryption, disk, manifest, or index failure while saving a valid legacy conversation is classified as source corruption. The valid original is moved into `corrupt`, omitted from the next migration scan, and the UI treats the batch as complete even when `failed > 0`.

#### Evidence
`saveConversation()` returns `{ok:false}` on storage/index exceptions. For every such result, `migrateLegacyHistory()` increments `failed`, renames the original into `CONVERSATIONS_DIR/corrupt`, then returns `{ok:true,migrated,failed}`. `detectLegacyHistory()` only scans JSON files in `LEGACY_DIR`; `handleMigrate()` shows a success toast and clears `hasLegacy` whenever `res.ok` is true. Existing migration tests cover successful moves and ID sanitization, not a vault write failure.

#### Root Cause
The migration conflates malformed source data with destination persistence failure, and its top-level `ok` means loop completion rather than complete migration success. The renderer uses that weak result as proof that no legacy files remain.

#### Impact
Users can temporarily lose access to valid history after a transient write failure, and retrying from the UI will not pick up the moved source. The original remains recoverable manually, so this is not proven irreversible deletion.

#### Reproduction
1. Place a structurally valid legacy JSON conversation in the legacy directory.
2. Make the vault save fail (for example, mock `saveConversation()` or simulate a denied destination write).
3. Run migration and retry detection.

Expected: original remains in a retryable location; UI reports partial failure and offers retry.
Actual: original moves to `corrupt`; response `ok:true, failed:1`; UI clears the legacy indicator.

#### Recommended Fix
Move files to `corrupt` only after parsing/schema rejection. Preserve valid originals on destination failures, return an explicit partial-failure state, surface the count as an error/warning, and re-detect retryable files. Ensure the source is archived only after durable record, manifest, and index success. Review partial-write cleanup when `saveConversation()` fails after its first write.

#### Regression Protection
Inject vault write, manifest, and index failures in an integration test; verify source retention, second-attempt success, UI retry state, and no duplicate record after recovery.

#### Validation
Focused `electron/services/conversationVault.test.ts` migration cases; Memory panel test; `npm run test:electron`; `npm run typecheck`.

#### Dependencies / Related Findings
None.

---

### [SEC-P2-001] Shared main-frame gate accepts an unavailable main-frame identity
Severity: P2
Confidence: High
Category: Security defense in depth / IPC

#### Location
- `electron/ipc/handlers/common.ts:46-55`
- `electron/ipc/handlers/fileHandlers.ts:311-421` (representative main-frame-required dialogs/imports)
- Symbol: `registerPrivilegedIpcChannel`

#### Summary
For a `requireMainFrame` channel, the common wrapper rejects only when both frame objects exist and differ. If `event.sender.mainFrame` is unavailable, the privileged handler still runs. A live exploit path has **not** been established; normal Electron events may supply this identity, and several sensitive media handlers repeat stricter checks internally.

#### Evidence
The exact predicate is `if (frame && mainFrame && frame !== mainFrame)`, followed by the handler call. `validateIpcSender()` requires a trusted sender-frame URL, not equality with `mainFrame`. Dialog/import handlers rely on `requireMainFrame:true` without the media recovery handlers' repeated identity comparison. Existing `common.security.test.ts` exercises absent `senderFrame` and untrusted URLs but not absent `mainFrame` under this option.

#### Root Cause
The wrapper is fail-open for incomplete identity data while the option name promises an affirmative main-frame check.

#### Impact
If Electron supplies an event with a trusted sender-frame URL but no resolvable `mainFrame`, channels protected only by this option could execute a privileged UI/file operation. This is a boundary weakness, **not** a demonstrated arbitrary-file read or confirmed external vulnerability.

#### Reproduction
1. Register a test channel with `{requireMainFrame:true}`.
2. Invoke the captured wrapper with a trusted `senderFrame` and `sender.mainFrame = null`.

Expected: the wrapper rejects the call.
Actual: the code proceeds to `rateLimitedHandler()`.

#### Recommended Fix
Require both identities to exist and to be the same frame before dispatch. Keep the existing trusted-origin check first and preserve rate limiting. Audit each `requireMainFrame` caller for independent validation, then add focused tests for null, destroyed, differing, and matching frames.

#### Regression Protection
Extend `electron/ipc/handlers/common.security.test.ts` with direct captured-handler tests for the four frame states; add a representative file-dialog handler test.

#### Validation
Focused IPC security tests; `npm run test:electron`; `npm run verify:ipc-parity`; packaged Electron smoke where available.

#### Dependencies / Related Findings
No proven exploit chain; inspect Electron frame lifecycle before security severity is raised.

---

### [CI-P2-002] Dependabot esbuild updates conflict with the direct-dependency override
Severity: P2
Confidence: Confirmed
Category: Dependency automation / CI

#### Location
- `package.json:20-22,250`
- `.github/dependabot.yml:7-13`
- Symbol: npm `overrides.esbuild`, direct `devDependencies.esbuild`

#### Summary
A normal Dependabot bump of the direct `esbuild` spec can leave the override spec behind; npm then rejects the proposed manifest with `EOVERRIDE` before lockfile resolution.

#### Evidence
Dependabot run [35999725421](https://github.com/spearchucker667/Venice_Forge/actions/runs/35999725421) failed in **Dependabot / Run Dependabot** on SHA `68bd0a07`, reporting `dependency_file_not_resolvable` and `Override for esbuild@0.28.2 conflicts with direct dependency`. The current manifest specifies both direct and override as `^0.28.1`; `esbuild` is in the security-critical update group. A temporary manifest **outside the repository** with direct `^0.28.2`, override `^0.28.1`, and offline `npm install --package-lock-only --ignore-scripts` reproduced `EOVERRIDE` (exit 1). Current `npm ci` is healthy; this is update automation drift.

#### Root Cause
The same package's independent direct and override ranges must remain compatible under npm's override rules; Dependabot updates only one declaration in this attempted run.

#### Impact
Automated `esbuild` updates can fail to open a usable dependency PR. It does not currently break local install or the main CI SHA.

#### Reproduction
1. In a disposable manifest, set direct `esbuild` to `^0.28.2` and override to `^0.28.1`.
2. Run `npm install --package-lock-only --ignore-scripts --offline`.

Expected: update bot generates a resolvable lockfile.
Actual: npm exits `EOVERRIDE`.

#### Recommended Fix
Determine whether the override is still needed by inspecting the dependency tree. Remove it if redundant, or use npm's direct-dependency reference mechanism so one spec is authoritative. Change `package.json` and regenerate `package-lock.json` intentionally with npm, then simulate the next direct-dependency bump. Do not indiscriminately update the other 35 outdated packages.

#### Regression Protection
Add a package-script/CI check that direct dependencies with overrides remain npm-resolvable under an update scenario, or encode the single-spec relationship and test `npm ci` plus a disposable bump.

#### Validation
`npm ci`; disposable esbuild bump with lockfile generation; `npm run verify:lockfile`; next Dependabot run.

#### Dependencies / Related Findings
None. The historical CI failure on older SHA `088acd0d` was a separate repository-identity document path issue and is resolved at current HEAD.

---

### [QA-P2-001] Capture tool writes unverified PASS statements into review notes
Severity: P2
Confidence: Confirmed
Category: QA evidence integrity

#### Location
- `scripts/capture-per-tab-acceptance.mjs:286-364`
- Symbol: `runCaptureForTuple`, `notesContent`

#### Summary
The automated capture template asserts that visual layout, contrast, keyboard, screen-reader semantics, and i18n all pass without measuring those criteria. It even produced a layout `PASS` note for the demonstrably clipped 390 px History and Privacy screens.

#### Evidence
The runner captures screenshots, checks only whether one focus selector exists, and then writes hard-coded `PASS` lines at 347–352 and `(none)` defects at 358–359. In the same eight-tuple run, its mobile screenshots show the `UX-P1-001` failure and independent DOM measurements show `main.width=102`. The manifest leaves reviewer signature/contact empty, so `npm run verify:per-tab-acceptance` correctly rejects these stubs; the defect is the misleading generated notes, not a bypass of the sign-off gate.

#### Root Cause
An evidence collection script is presenting unperformed human and automated assessments as completed review results.

#### Impact
Reviewers can mistake template text for observations and overlook defects. The generated files are unsigned and ignored, so they do not currently prove release acceptance.

#### Reproduction
1. Run `node scripts/capture-per-tab-acceptance.mjs --tabs history,privacy --viewports mobile-390x844 --themes venice-dark --locales en-US`.
2. Compare screenshots with generated `notes.md` lines labelled `PASS`.

Expected: unreviewed criteria remain `PENDING` and measured failures are recorded.
Actual: each criterion is pre-filled `PASS`, even when layout is visibly broken.

#### Recommended Fix
Generate neutral `PENDING HUMAN REVIEW` placeholders. Only output a pass when a specified automated assertion actually ran and passed, with metrics attached. Do not synthesize screen-reader or contrast success from DOM presence. Keep signatures and qualified review manual.

#### Regression Protection
Add a capture-tool test that checks unsigned output contains no unearned `PASS`; add a geometry failure fixture that records a defect instead of `(none)`.

#### Validation
Focused script test; sample mobile capture; `npm run verify:per-tab-acceptance` must continue to fail until genuine signed reviews exist.

#### Dependencies / Related Findings
`UX-P1-001` supplies a real counterexample to the tool's claim.

---

## GitHub Actions and dependency review

All four workflows were inspected: `.github/workflows/ci.yml`, `release.yml`, `codeql.yml`, and `dependency-review.yml`. CI uses `npm ci` with the declared Node line, runs lint/types, segmented tests and coverage, contract verification, build/dist checks, and Windows/macOS sensitive jobs. Release checks readiness, refuses unsigned tag artifacts without an explicit draft exception, and has signature/notarization verification steps. CodeQL runs both Actions and JavaScript/TypeScript analysis. Dependency Review runs on pull requests. The reviewed third-party actions are pinned by SHA. Exact-HEAD hosted CI and CodeQL succeeded. No current workflow syntax or permission failure was confirmed.

The only live automation finding is `CI-P2-002` (Dependabot). Its run/job/step/error are documented above. An older CI run [35933936610](https://github.com/spearchucker667/Venice_Forge/actions/runs/35933936610) failed `verify:repository-identity` because a historical audit document contained a private absolute path; that path was subsequently removed/archived and current CI passed. Do not re-open the old failure as current. Local `npm run ci` failure `CI-P1-001` is from dirty locale files absent from hosted HEAD. Release signing, notarization, Windows artifacts, funded Venice calls, and a two-device sync recovery were not executed in this session.

## Security review and false-positive control

`electron/main.ts` was checked for `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, `webSecurity:true`, restricted navigation/window creation, default permission denial, and CSP injection. Production `ipcMain.handle` sites use the shared privileged registrar. The registrar validates the exact initiating frame URL; missing sender frame is rejected by existing security tests. The fail-open **main-frame** predicate is therefore separately documented as `SEC-P2-001`, and no confirmed exploit is asserted. Repository scans found no verified committed credential or active unsanitized export path. `npm audit` found zero known advisories in the installed dependency graph.

Current Adult Mode behavior and tests intentionally skip the local child-safety guard when Family Safe Mode is disabled. The user-selected untracked audit draft asserts a different intended policy. That is a **policy-contract question**, not proof of a current-code bypass; do not change safety behavior until the intended product contract is established and tested across Electron and web proxy.

## UI, performance, tests, and investigated but not defective

- **UI:** `UX-P1-001` is a reproduced shared mobile defect. The 8 automated captures do not equal the required 2,700 signed state reviews. No other visual defect was promoted from the sampled screenshots without reproduction.
- **Tests:** 7,048 unit/integration tests pass, but jsdom viewport tests assert classes rather than browser-computed geometry, so they miss `UX-P1-001`. Migration success tests miss destination write failure. IPC tests miss null main-frame identity. Packaged smoke was skipped by `npm test` until an executable existed.
- **Performance:** Production file-size and catch/ignore inventories were sampled, and the bundle budget verifier ran during aggregate contracts before i18n; no measurable new bottleneck was established. “Large component” or “many dependencies” is not itself a finding.
- **Provider integration:** The central renderer client, Electron transport, Express proxy, and bundled OpenAPI were checked at their boundaries. No malformed request/response claim is made without a focused live or contract mismatch. Paid Venice operations were not sent.
- **Investigated but not defective:** Existing root `AGENTS.md` references the actual `docs/DEVELOPMENT/agents/AGENT_REINITIALIZATION.md`; README references `docs/DEVELOPMENT/FILE_TREE.md`; both hardcoded i18n npm aliases exist; package/root legal metadata consistently say Apache-2.0; README theme count is 43; Playwright and `@testing-library/dom` are installed. These disprove five headline findings in the user-owned untracked audit draft. The old design-tree MIT label was corrected in the prior session. Media handlers that repeat main-frame checks were not counted as exposed merely because of `SEC-P2-001`.

## Needs verification

1. **Safety policy:** Decide whether Adult Mode must still enforce a local child-safety guard. The selected draft says yes; current security docs/tests say no. Evidence needed: authoritative product/security decision, then cross-transport behavioral tests. Do not call the current documented behavior an exploit on the evidence here.
2. **Actual null-main-frame reachability:** Confirm whether Electron can deliver a trusted subframe invoke with `sender.mainFrame` unavailable in supported versions and whether any `requireMainFrame` caller lacks independent protection. The wrapper's fail-open predicate itself is statically established.
3. **External acceptance:** Funded Venice calls; signed/notarized macOS and signed Windows artifacts; two-device sync; qualified native-speaker review; and full headed keyboard/screen-reader/visual review require credentials, devices, or people not present in this run.
4. **Unsampled code:** A full manual line-by-line review of all 2,223 tracked files, all generated asset forms, every tab state, and Windows/Linux runtime behavior remains outside this point-in-time evidence. Reproduce any future claim against current HEAD rather than promoting historical audit entries.

## Remediation sequence and regression test plan

| Phase | Findings and files | Dependency and proof |
|---|---|---|
| 1. Restore current release gate | `CI-P1-001`; locale JSON, canonical catalog/invariant rules | Preserve the existing user-owned edits; classify each of 128 entries; pass `verify:i18n`, strict release check, then `ci`. Do not claim native review. |
| 2. Repair shared mobile shell | `UX-P1-001`; `sidebar.tsx`, `components.css`, browser geometry test | Fix shared positioning before per-tab layout review. Assert 390 px closed/open and 1280 px desktop, LTR/RTL; inspect History and Privacy captures. |
| 3. Preserve migration recovery | `DATA-P2-001`; `vaultMigration.ts`, `memory-panel.tsx`, vault tests | Keep valid source retryable on destination failure; test write/manifest/index failure and second attempt. Verify no partial duplicate. |
| 4. Close IPC fail-open case | `SEC-P2-001`; common registrar, file-handler/security tests | Reject absent/different main frame; recheck caller-specific guards and legitimate main-frame flows. |
| 5. Restore evidence/update hygiene | `QA-P2-001`, `CI-P2-002`; capture script/tests, manifest/lockfile | Remove unearned `PASS` text before human QA; resolve direct/override spec coupling and rerun Dependabot simulation. |

The missing regression tests are: browser-computed shell geometry, migration destination-failure recovery, null/different main-frame IPC invocation, unsigned capture notes neutrality, and a disposable direct-dependency override bump. Existing i18n and contract gates already cover the localization state; they should stay strict.

## Final acceptance criteria

At the **future remediation** commit, require `npm ci`, lint, typecheck, serialized test suites, `npm run verify:contracts`, `npm run build`, `npm run ci`, and platform-specific package verification to pass on that exact tree. Browser smoke must demonstrate an operable 390 px shell and desktop shell. A failed migration must leave valid source recoverable and a retry must complete once. Main-frame-required IPC must reject missing/mismatched identities. Capture notes must not assert human results without human review. Confirm the next Dependabot esbuild update can resolve. Hosted CI, CodeQL, and required security/release checks must pass on the published SHA if publication is authorized. Do not mark the separate human, signing, provider, or two-device acceptance tasks complete without their own evidence.
