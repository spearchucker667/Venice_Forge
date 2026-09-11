# Venice Forge Exhaustive Audit TODO — 2026-08-31

Audit target: `spearchucker667/Venice_Forge`

Live baseline: `main` at `f4224cfd9d23f7874ca66ab68968d40c35275039` (`Add audit docs and onboarding sanitization`)

Uploaded snapshot: `/mnt/data/Venice_Forge-main.zip`, extracted and cross-checked against the same current source state for audited files.

Hosted CI evidence: GitHub Actions CI run `33467749047` on the baseline commit.

## Audit scope and interpretation

This TODO reconciles the current live source tree, the uploaded source archive, current GitHub Actions results/logs, the active GitHub repository ruleset, current Playwright documentation, and current electron-builder documentation. Historical audit findings were not copied forward unless the current tree still demonstrates the defect or debt.

No P0 defect was confirmed in this pass. The immediate release/CI blockers are P1. A number of P2/P3 items are release-assurance, security-hardening, reliability, maintainability, or deferred product work rather than active user-facing crashes.

## P1 — Current blockers / high-priority regressions

### [ ] VF-AUD-20260831-P1-001 — Fix Linux release artifact allowlist architecture names

**Evidence**

- Current Linux CI package step succeeds and creates:
  - `Venice-Forge-3.0.0-beta.2-x86_64.AppImage`
  - `Venice-Forge-3.0.0-beta.2-amd64.deb`
  - `Venice-Forge-3.0.0-beta.2-x86_64.rpm`
  - corresponding `.sha256` files.
- The packaged Linux Electron smoke test passes.
- `scripts/verify-dist.cjs` then rejects those files because `buildReleaseAllowlist()` expects `...-x64.AppImage`, `...-x64.deb`, and `...-x64.rpm`.
- `scripts/verify-dist.test.ts` currently locks in the wrong `x64` expectations, so the unit test is green while the real Linux package contract is red.

**Files**

- `scripts/verify-dist.cjs:45-95`
- `scripts/verify-dist.cjs:317-342`
- `scripts/verify-dist.cjs:459-471`
- `scripts/verify-dist.test.ts:104-116`
- `electron-builder.config.cjs:116-136`
- `.github/workflows/ci.yml:266-289`
- `.github/workflows/release.yml:219-284`

**Required fix**

Centralize the mapping between electron-builder logical architecture (`x64`) and target-specific output architecture labels. For the current x64 Linux build, expect `x86_64` for AppImage/RPM and `amd64` for Debian. Do not weaken the top-level allowlist into “accept any file with these extensions.” Preserve fail-closed artifact validation.

Recommended implementation shape:

```js
function linuxArtifactArch(target, arch) {
  if (arch !== "x64") return arch;
  if (target === "deb") return "amd64";
  if (target === "AppImage" || target === "rpm") return "x86_64";
  throw new Error(`Unsupported Linux target: ${target}`);
}

for (const arch of linuxArches) {
  for (const ext of ["AppImage", "deb", "rpm"]) {
    const artifactArch = linuxArtifactArch(ext, arch);
    addSidecar(`Venice-Forge-${version}-${artifactArch}.${ext}`);
  }
}
```

Also remove or actually use the currently returned `linuxArches` value from `getTargets()`; do not leave two divergent architecture concepts.

**Acceptance**

- Unit tests explicitly expect the real x64 Linux filenames.
- `npm run dist:linux` succeeds on the Linux runner.
- `node scripts/verify-dist.cjs --linux` succeeds without broadening the allowlist.
- Release job `build-linux` and final `--all --release-artifacts-only` verification accept the same exact artifacts.

---

### [ ] VF-AUD-20260831-P1-002 — Launch `win-unpacked` Electron binary in Windows Playwright smoke test

**Evidence**

- Windows portable packaging succeeds and creates both:
  - staging app: `release/win-unpacked/Venice Forge.exe`
  - final portable wrapper: `release/Venice-Forge-3.0.0-beta.2-x64-Portable.exe`
- `tests/smoke/electron-smoke.test.ts` currently selects the final `-Portable.exe` wrapper.
- Playwright `_electron.launch({ executablePath })` adds `--inspect=0` and `--remote-debugging-port=0`, then waits for Electron DevTools/Node debugger websocket output.
- The portable wrapper launches but does not behave as the directly instrumented Electron process, and the CI test times out after 30 seconds.
- macOS and Linux already smoke-test unpacked/staging application binaries, so Windows is inconsistent with the cross-platform pattern.

**Files**

- `tests/smoke/electron-smoke.test.ts:12-66`
- `tests/smoke/electron-smoke.test.ts:77-119`
- `.github/workflows/ci.yml:240-263`

**Required fix**

Make Windows discovery prefer the unpacked Electron executable used before cleanup:

```ts
if (platform === "win32") {
  const unpacked = path.join(releaseDir, "win-unpacked");
  if (!fs.existsSync(unpacked)) return undefined;
  const executable = fs.readdirSync(unpacked, { withFileTypes: true })
    .find(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"));
  return executable ? path.join(unpacked, executable.name) : undefined;
}
```

Prefer a stable configured executable name rather than “first .exe” if electron-builder is updated to make that contract explicit.

Do **not** remove verification of the final portable artifact. The intended sequence is:

```text
package portable
→ smoke-test release/win-unpacked/Venice Forge.exe
→ remove win-unpacked staging directory
→ verify final Venice-Forge-...-Portable.exe + checksum
```

**Acceptance**

- Add a Windows resolver unit test using a `win-unpacked` fixture.
- Windows packaged smoke reaches a renderer window and passes.
- `clean-release-staging.cjs` still removes `win-unpacked` after smoke.
- `verify:dist:portable` still verifies the final portable wrapper.

---

### [ ] VF-AUD-20260831-P1-003 — Restore packaged first-run/onboarding + restored-profile bootstrap coverage

**Evidence**

Commit `2d88d47a06b840d3f6b719bf8909fd0fbea9eb1f` explicitly “trimmed smoke test to plan scope (CSP violation assertions only)” and removed a much stronger end-to-end test that:

- crossed the 18+ gate;
- completed all onboarding steps;
- persisted a non-default profile;
- restarted the packaged app;
- verified preload/desktop handshake;
- verified main-authoritative active-profile restoration;
- saved an IPC probe only under `chat-history/profiles/restored-profile/`;
- verified no legacy global chat-history file was written;
- checked CSP on first and restored runs.

Current `docs/ROADMAP.md:15` still describes P1-004 as closed and claims that exact packaged harness exists. It no longer does.

**Files**

- `tests/smoke/electron-smoke.test.ts`
- `docs/ROADMAP.md:15`
- `docs/summary_of_work.md:82-90`

**Required fix**

Restore the removed behavior as a separate packaged acceptance test rather than coupling it to the Meteocon CSP test. Recommended split:

```text
packaged-launch-csp.test.ts
packaged-onboarding-profile-bootstrap.test.ts
packaged-executable-discovery.ts
```

The discovery helper should be shared by both suites. Keep the user-data directory isolated and deterministic. Test the restart against the **same** user-data directory.

**Acceptance**

- First-run gate and onboarding are exercised in a real packaged app.
- Restart does not re-run onboarding.
- Restored profile becomes active through the desktop/main path.
- IPC persistence lands only in the restored profile scope.
- The test runs on all three hosted smoke runners or there is a documented platform-specific split with equivalent coverage.
- Roadmap and summary text exactly match current coverage.

---

### [ ] VF-AUD-20260831-P1-004 — Repair GitHub Rules01 synchronization tooling before applying it

**Evidence**

Live `Rules01` (`21229461`) currently requires:

```text
lint-and-typecheck
unit-and-integration-tests
coverage
contracts
build
windows-sensitive-tests
macos-sensitive-tests
Analyze javascript-typescript
Analyze actions
```

It does **not** yet require `script-coverage` or the three packaged smoke jobs.

The checked-in `scripts/enforce-github-rules.sh` is not a safe “sync” tool:

- it uses `POST /repos/{owner}/{repo}/rulesets`, which creates another ruleset instead of updating `Rules01`;
- it names CodeQL checks as `CodeQL / javascript-typescript` and `CodeQL / actions`, but the actual CodeQL job names are `Analyze javascript-typescript` and `Analyze actions`;
- its pull-request parameters differ from the live ruleset and could silently change policy;
- it does not preserve the live deletion/non-fast-forward/linear-history rules in the same payload.

**Files**

- `scripts/enforce-github-rules.sh`
- `docs/ROADMAP.md:11`
- `.github/workflows/codeql.yml:18-53`
- `.github/workflows/ci.yml`

**Required fix**

Convert the helper into an idempotent update of the existing ruleset. GitHub’s current REST endpoint is:

```text
PUT /repos/{owner}/{repo}/rulesets/{ruleset_id}
```

The script should first GET live state, construct/validate the desired payload, display a diff or summary, then PUT `21229461`. Preserve the intended bypass actor and all unrelated live rules unless deliberately changed.

Use the actual check contexts:

```text
lint-and-typecheck
unit-and-integration-tests
coverage
script-coverage
contracts
build
windows-sensitive-tests
macos-sensitive-tests
electron-smoke-macos
electron-smoke-windows
electron-smoke-linux
Analyze javascript-typescript
Analyze actions
```

**Acceptance**

- Dry-run output shows no duplicate ruleset creation.
- Running the helper twice is idempotent.
- GET of `Rules01` after update shows all intended required checks exactly once.
- Existing bypass/rules are preserved unless the task explicitly changes them.
- Do not apply the live update until P1-001/P1-002 are green, otherwise the repository can be intentionally merge-blocked by known-red smoke jobs.

---

## P2 — Security, release assurance, reliability, and contract debt

### [ ] VF-AUD-20260831-P2-001 — Instrument CSP/page errors before the initial renderer document can emit them

Current smoke instrumentation calls `electronApplication.firstWindow()` first, then installs `exposeFunction`, `addInitScript`, `pageerror`, and console listeners. Initial bootstrap CSP violations or page errors can occur before those handlers exist. This creates a false-negative risk in the security smoke gate.

**Fix guidance**

- Install app/window event listeners as early as Playwright permits.
- After instrumentation is attached, perform a controlled `page.reload()` and assert on the instrumented navigation, or otherwise ensure listeners are active before the document executes.
- Add a negative-control test/fixture that deliberately violates `style-src` and prove the smoke assertion fails.

**Files:** `tests/smoke/electron-smoke.test.ts`.

---

### [ ] VF-AUD-20260831-P2-002 — Remove stale CSP-001 “open” state and strengthen roadmap truth validation

`docs/ROADMAP.md:3` says it contains unfinished work only, yet `CSP-001` is still listed as open at line 9 while `docs/summary_of_work.md:66-93` records its completed implementation and passing validation. `scripts/verify-roadmap-current.cjs` passes because it validates structure, not semantic status consistency.

**Fix guidance**

- Remove CSP-001 from current unfinished work or replace it with the actual residual acceptance item, if any.
- Correct `docs/summary_of_work.md` wording that still says CSP is checked in “first-run and restored-profile” paths unless P1-003 restores them first.
- Extend roadmap verification with an explicit completed-ID denylist generated from authoritative completion markers, or a machine-readable current-work registry with status validation.

---

### [ ] VF-AUD-20260831-P2-003 — Stop publishing/checksumming `builder-debug.yml` as a release asset

`scripts/checksum-release.cjs` checksums all `.yml` files, `verify-dist.cjs` explicitly allowlists `builder-debug.yml`, and release jobs upload/publish `release/*`. That makes electron-builder’s debug manifest a release candidate and checksum asset.

**Fix guidance**

- Delete `builder-debug.yml` during release-staging cleanup, or explicitly exclude it from checksumming/upload.
- Remove it from the public release allowlist.
- Keep it only as a failure/debug artifact if useful.
- Add a verifier test asserting the final publish directory does not contain builder debug metadata.

---

### [ ] VF-AUD-20260831-P2-004 — Add post-build macOS and Windows signature/notarization verification to tag jobs

The release workflow verifies credential presence before packaging, but does not itself prove the produced binaries are signed/notarized. `docs/RELEASE/SIGNED_ARTIFACT_EVIDENCE.md` explicitly states no production signed/notarized artifact has yet been verified.

**Fix guidance**

For signed tag builds, add explicit checks before artifact upload:

```bash
codesign --verify --deep --strict --verbose=4 "release/.../Venice Forge.app"
spctl -a -vv --type execute "release/.../Venice Forge.app"
xcrun stapler validate "release/.../Venice Forge.app"  # or verify the stapled distributed artifact as appropriate
```

On Windows:

```powershell
$sig = Get-AuthenticodeSignature ".\release\Venice-Forge-*-x64-Setup.exe"
if ($sig.Status -ne 'Valid') { throw "Invalid Authenticode signature: $($sig.Status)" }
```

Verify the portable executable too if it remains a signed distribution artifact. Record evidence into the release evidence process.

---

### [ ] VF-AUD-20260831-P2-005 — Close character-cache filesystem TOCTOU gap

`venice-character-cache://` performs `stat(dp)` and later opens the path again with `fs.createReadStream(dp)`. A filesystem object can change between validation and consumption. The TTS protocol already uses `readRegularFileNoFollow()` with `O_NOFOLLOW` and `fstat()` on the same descriptor.

**Files**

- `electron/main.ts:410-461`
- `electron/utils/secureFile.ts`

**Fix guidance**

Reuse/extend the descriptor-safe helper for character cache bytes. For large files, add a descriptor-backed streaming helper rather than reading everything into memory. Apply the same defensive treatment to metadata where practical, and constrain parsed metadata to the expected shape before using `contentType`.

---

### [ ] VF-AUD-20260831-P2-006 — Harden provenance-less custom-protocol requests

`evaluateCustomProtocolAccess()` intentionally allows requests with neither `Origin` nor `Referer`, because Chromium media elements can omit them. This is an acknowledged compatibility/security tradeoff: requests with no browser provenance are treated as renderer initiated.

**Fix guidance**

Do not simply reject all headerless media loads; that will regress playback. Investigate a capability-based design, such as unguessable per-session tokens bound to the active renderer/profile, or an Electron-supported association with the requesting `WebContents`/session. Preserve SHA-256 media identifiers, path containment, profile scoping, and fail-closed behavior for explicit foreign origins.

---

### [ ] VF-AUD-20260831-P2-007 — Remove or implement Google Vertex “full” auth mode exposed in settings

The public type and settings UI offer `authMode: "full"`, project/location/service-account fields, and a selectable “Full Vertex” option. IPC validation and provider adapters then explicitly reject it as unimplemented.

**Files**

- `src/types/provider.ts:54-66`
- `src/components/settings/ProvidersPanel.tsx:90-98`
- `src/components/settings/ProvidersPanel.tsx:372-392`
- `electron/ipc/validation.ts:196-205`
- `electron/services/providerAdapters.ts:186-196`

**Required decision**

Either:

1. fully implement service-account/OAuth custody and token mint/refresh in the main process, **or**
2. remove/disable the full-mode UI and public config branch until implementation authority/resources exist.

Do not leave a selectable configuration that is guaranteed to fail.

---

### [ ] VF-AUD-20260831-P2-008 — Honor `Retry-After` and add bounded jitter/backoff before provider fallback

`performVeniceRequest()` immediately falls through to the next provider on 408/429/5xx if streaming has not started. The response object already preserves safe response headers, including `retry-after`, but the fallback loop does not use them. Background-task polling has a more mature retry-delay implementation and can be used as a design reference.

**Files**

- `electron/services/veniceClient.ts:192-281`
- `electron/services/veniceClient.ts:123-144`
- `src/stores/background-task-store.ts:245-315`

**Fix guidance**

- Parse both delta-seconds and HTTP-date `Retry-After`.
- Apply a bounded delay with jitter.
- Keep abort signals responsive during sleep.
- Decide and document whether 429 should retry the same provider once before cross-provider fallback or immediately delay then fall back.
- Add fake-timer tests proving abort, cap, jitter bounds, and no post-delta retry.

---

### [ ] VF-AUD-20260831-P2-009 — Finish or explicitly narrow Family Safe Mode semantic media classification

`mediaScreener.ts` exposes a real `ClassifierBackend`, but no production backend is registered. With Family Safe Mode on:

- images receive structural heuristics (tracking-pixel/MIME checks), not content semantics;
- audio passes after structural validation;
- video passes after structural validation.

This is already tracked historically as `VF-FSM-003`, but current comments still call phase 2 “semantic classification.”

**Fix guidance**

- Select a privacy-compatible classifier backend if this behavior is required by product scope, or accurately rename/document the current structural-only behavior.
- Do not imply semantic content screening where no semantic model executes.
- Add capability/status diagnostics so the UI can truthfully say whether semantic media classification is active.

---

### [ ] VF-AUD-20260831-P2-010 — Add semantic CI tests that exercise real package filenames and executable discovery

`verify-ci-contract.cjs` passes on the current tree despite two hosted smoke/release failures. The contract verifier mainly checks workflow/script structure; it does not model actual electron-builder output names or Playwright launchability.

**Fix guidance**

- Keep structural verifier checks, but add unit fixtures based on actual target output names.
- Centralize artifact naming logic shared by verifier tests and builder expectations.
- Add Windows `win-unpacked` resolver coverage.
- Add Linux fixture coverage using `x86_64`/`amd64` target names.
- Do not replace hosted platform smoke jobs with static tests; both layers are required.

---

### [ ] VF-AUD-20260831-P2-011 — Preserve and upload packaged-smoke diagnostics on failure

Current smoke jobs provide job logs, but no dedicated failure bundle for renderer console, CSP violations, screenshot, userData log tail, and discovered executable path.

**Fix guidance**

On failure, write sanitized diagnostics under a temporary artifact directory and upload with `if: failure()`. Never upload credentials, full prompts, raw generated media, or unredacted userData. Include platform, arch, chosen executable, app version, renderer errors, CSP messages, and a screenshot when safe.

---

### [ ] VF-AUD-20260831-P2-012 — Complete external release acceptance matrix (`VF-VERIFY-005`)

This is evidence debt, not a local source-code failure. Required external proof still includes signed/notarized release artifacts, clean install/upgrade/uninstall, paid provider operations, multi-device sync, and manual accessibility/headed validation. Keep these fail-closed and do not mark production acceptance complete from unit/CI evidence alone.

---

### [ ] VF-AUD-20260831-P2-013 — Complete qualified human/native review for non-English catalogs

`VF-I18N-NATIVE-REVIEW-001` remains open. Structural key coverage is not equivalent to translation quality. Keep non-English locales marked first-pass/machine until reviewer/date evidence exists.

---

## P3 — Maintainability, dependency hygiene, UX/build polish, and deferred product work

### [ ] VF-AUD-20260831-P3-001 — Set explicit Linux desktop identity and executable naming

Current Linux build warns that `desktopName` is not set with synchronized desktop naming. The Linux smoke test also assumes the executable is named `venice-forge` even though that name currently comes from electron-builder’s sanitized-name default.

**Fix guidance**

- Configure an explicit `linux.executableName: "venice-forge"`.
- Configure the supported desktop-name/synchronization fields for the installed `.desktop` entry so Wayland/X11 task switching and icon association are deterministic.
- Add package-content verification for the resulting desktop entry.

---

### [ ] VF-AUD-20260831-P3-002 — Remove ineffective dynamic imports of `chatTtsController`

`use-chat.ts` dynamically imports `chatTtsController`, but `chat-view.tsx` and `ChatTtsPlayer.tsx` statically import the same module. Vite reports that the dynamic import cannot create a separate chunk.

**Fix guidance**

Prefer a normal static import in `use-chat.ts` unless the entire TTS surface is restructured to be truly lazy. This removes the warning and simplifies error handling.

---

### [ ] VF-AUD-20260831-P3-003 — De-duplicate auto-read TTS post-stream logic and replace raw `console.error`

`use-chat.ts` contains nearly identical auto-read blocks after send and regenerate, each using dynamic import and `.catch(console.error)`. `ChatTtsPlayer.tsx` also logs raw TTS failures with `console.error`.

**Fix guidance**

Extract a helper such as `maybeAutoReadAssistantMessage(conversation)` and route failures through the project logger/redaction path. Add tests for send, regenerate, disabled auto-read, empty text, multipart content, and playback failure.

---

### [ ] VF-AUD-20260831-P3-004 — Move `@testing-library/dom` out of production dependencies

`@testing-library/dom` is listed under `dependencies` but has no source/runtime imports outside package metadata. It is test tooling and is already a peer/transitive dependency of testing-library packages.

**Fix guidance**

Move it to `devDependencies`, run `npm install --package-lock-only`/normal lockfile update under Node 22/npm 10, then run the full test/build/package matrix to prove no runtime bundle depends on it.

---

### [ ] VF-AUD-20260831-P3-005 — Investigate/remove deprecated `@types/libsodium-wrappers` stub

Current npm install warns that `@types/libsodium-wrappers` is a deprecated stub. The app actually uses `libsodium-wrappers-sumo`. Do not remove the package blindly: first verify whether the sumo package exposes sufficient types in the current version.

**Acceptance:** `npm run typecheck` and relevant backup/crypto tests pass without ambient-type regressions.

---

### [ ] VF-AUD-20260831-P3-006 — Track transitive deprecated packages without unsafe forced overrides

Current CI reports deprecated transitive packages such as `inflight`, `glob@7`, `lodash.isequal`, and `boolean`, while `npm audit` reports no current vulnerabilities. Prefer upstream dependency upgrades over npm `overrides` that can violate electron-builder/electron-updater expectations.

---

### [ ] VF-AUD-20260831-P3-007 — Break up oversized UI/bridge/store modules in staged refactors

Major hotspots include:

- `CharacterEditor.tsx` — ~3714 lines
- `desktopBridge.ts` — ~2710
- `image-view.tsx` — ~1828
- `chat-store.ts` — ~1633
- `gallery-view.tsx` — ~1588
- `chat-view.tsx` — ~1509
- `HistoryView.tsx` — ~1374
- `media-inspector.tsx` — ~1329
- `SceneComposerView.tsx` — ~1307
- `electron/preload.ts` — ~907

**Fix guidance**

Do not combine this cleanup with the CI blocker patch. Refactor by stable domain boundaries, keep behavior tests green, and preserve a single hardened `contextBridge` surface while splitting implementation modules underneath it.

---

### [ ] VF-AUD-20260831-P3-008 — Reduce file-level `no-explicit-any` suppressions at trust boundaries

Production file-level suppressions exist in `desktopBridge.ts`, agent tool execution/registry code, `chatFolderService.ts`, `ManagedVideoPlayer.tsx`, and `message-bubble.tsx`. Prioritize IPC/provider/agent boundaries first: replace `any` with `unknown`, discriminated unions, narrow schemas, and type guards.

---

### [ ] VF-AUD-20260831-P3-009 — Audit React exhaustive-deps suppressions for stale closures

Current production suppressions exist in Chat, Scene Composer, Prompt Library, Workspace Tree, Character Creator, and Image Studio. Each suppression should have a test-backed rationale or be removed by stabilizing callbacks/state dependencies. Do this incrementally; indiscriminately adding dependencies can create loops.

---

### [ ] VF-AUD-20260831-P3-010 — Finish Theme Engine V2 visual/semantic polish already tracked by roadmap

Perform visual review of generated companion light/dark variants and continue replacing static/debug categorical colors with semantic theme tokens where justified. Keep this separate from the functional theme-family/YAML engine, which is already implemented.

---

### [ ] VF-AUD-20260831-P3-011 — Keep direct reverse-image matching clearly deferred unless a provider/privacy design is selected

The current product correctly disables query-derived “reverse image” claims. If direct source-image web matching is desired, it requires a provider that accepts image bytes, explicit consent/privacy disclosure, credential custody, main-process network allowlisting, and truthful result semantics. Do not re-enable text-query results under a reverse-image label.

---

### [ ] VF-AUD-20260831-P3-012 — Strip macOS metadata from future source/audit ZIP bundles

The uploaded ZIP contains a parallel `__MACOSX/` tree with AppleDouble `._*` files. These are not present in the live repository and are not a source defect, but they add audit noise and can confuse generic archive scanners. Use the repository’s clean archive process or a metadata-free ZIP command for future handoffs.

---

## Explicitly revalidated as already fixed / not to reopen without new evidence

The following historical items were checked and should **not** be treated as current defects in this handoff:

- Venice-only fields leaking into third-party provider requests: current provider adapters use positive operation/provider field allowlists.
- Image Studio runtime style-reference support: current implementation uses runtime capability resolution and limit enforcement.
- Direct reverse-image search misrepresentation: current UI/docs explicitly disable image-byte matching and identify old text-query records as legacy/query-derived.
- Basic Electron renderer hardening: current BrowserWindow uses isolation/sandbox/no renderer Node integration, blocks untrusted navigation/window creation, and denies permission requests.
- CodeQL itself: the baseline CodeQL run is green; the current red CI state is in Linux/Windows packaged smoke/release jobs.

## Required implementation order

1. P1-001 Linux artifact contract.
2. P1-002 Windows unpacked smoke target.
3. P2-001 CSP instrumentation hardening.
4. P1-003 restore onboarding/profile packaged acceptance.
5. Re-run all hosted CI and confirm Linux/Windows/macOS smoke jobs green.
6. P1-004 repair ruleset updater; only then synchronize live Rules01.
7. P2 release/security/reliability fixes.
8. P3 maintenance/dependency/refactor work in small independent commits.
9. External acceptance (`VF-VERIFY-005`) before production release claims.

## Minimum validation matrix after blocker repairs

```bash
node --version
npm --version
npm ci
npm run lint:eslint
npm run typecheck
npm run test:ci
npm run test:coverage:scripts
npm run verify:contracts
npm run build
npm run ci
```

Platform-hosted gates must additionally pass:

```text
electron-smoke-macos
electron-smoke-windows
electron-smoke-linux
Analyze javascript-typescript
Analyze actions
```

Release-specific validation must include platform package generation, checksum verification, strict release allowlisting, and explicit signing/notarization verification for production tag builds.
