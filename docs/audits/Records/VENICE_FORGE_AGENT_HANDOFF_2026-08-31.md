# Venice Forge — Exhaustive Audit Remediation & CI Recovery Agent Handoff

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:systematic-debugging` for every failing test/workflow and `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` for task execution. Before declaring completion, use `superpowers:verification-before-completion` and attach concrete command/run evidence.

## Mission

Bring Venice Forge back to a fully green, truthful, release-defensible state at the audited `main` baseline, then remediate the confirmed security/reliability/maintainability debt without reopening already-fixed historical findings.

Repository:

```text
spearchucker667/Venice_Forge
```

Audited live baseline:

```text
branch: main
commit: f4224cfd9d23f7874ca66ab68968d40c35275039
message: Add audit docs and onboarding sanitization
```

Audited hosted CI:

```text
workflow: CI
run: 33467749047
conclusion: failure
```

Current red jobs:

```text
electron-smoke-linux
electron-smoke-windows
```

Current green domains include lint/typecheck, unit/integration tests, aggregate coverage, script coverage, contracts, build, macOS-sensitive tests, Windows-sensitive tests, macOS packaged smoke, and both CodeQL jobs. Do not treat this as a general compilation failure.

## Non-negotiable execution rules

- Diagnose root cause before patching symptoms.
- Work from the current `main`; do not blindly reapply historical audit patches.
- Preserve Electron trust boundaries: renderer must not gain direct filesystem, shell, credential, or unrestricted network authority.
- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Do not weaken CSP (`style-src 'self'`) to make tests pass.
- Do not weaken release artifact allowlisting to `*.deb`/`*.rpm`/`*.AppImage` wildcards; make the naming contract accurate instead.
- Do not remove the Windows portable artifact merely to make Playwright happy; test the unpacked application and independently verify the final portable wrapper.
- Do not run the current `scripts/enforce-github-rules.sh` against GitHub as written. It creates a new ruleset and uses incorrect CodeQL check names.
- Do not mark external acceptance complete without actual signed/paid/two-device/headed evidence.
- Do not expose API keys, provider credentials, prompts, raw generated media, or unredacted userData in CI artifacts/logs.
- Keep resolved historical findings closed unless a new reproducer proves regression.

## Immediate evidence: why CI is red

### Linux

Observed sequence:

```text
Package Linux app                         PASS
Run packaged Electron smoke test          PASS
Remove packaging staging directories      PASS
Verify Linux artifact                     FAIL
```

Observed package filenames:

```text
release/Venice-Forge-3.0.0-beta.2-x86_64.AppImage
release/Venice-Forge-3.0.0-beta.2-amd64.deb
release/Venice-Forge-3.0.0-beta.2-x86_64.rpm
```

Verifier currently expects:

```text
...-x64.AppImage
...-x64.deb
...-x64.rpm
```

This is a verifier/package-contract mismatch, not a packaging failure.

### Windows

Observed sequence:

```text
Package Windows portable app              PASS
Run packaged Electron smoke test           FAIL
cleanup / artifact verification            SKIPPED after failure
```

Packaging creates:

```text
release/win-unpacked/Venice Forge.exe
release/Venice-Forge-3.0.0-beta.2-x64-Portable.exe
```

The smoke resolver chooses the second file. Playwright launches it with Electron debugging switches and waits for debugger/DevTools websocket output. The portable wrapper is not the correct directly-instrumented Electron process, so `_electron.launch()` times out after 30 seconds.

Current Playwright behavior relevant to this root cause:

```text
_electron.launch({ executablePath }) launches the specified Electron application.
Playwright injects --inspect=0 and --remote-debugging-port=0 and waits for Electron debugger/DevTools websocket output.
```

Use `win-unpacked/Venice Forge.exe` for smoke automation, then clean staging and verify the portable wrapper separately.

---

# Implementation Work Plan

## Task 1 — Repair Linux artifact-name contract

**Primary files:**

```text
scripts/verify-dist.cjs
scripts/verify-dist.test.ts
electron-builder.config.cjs
```

### 1.1 Write the failing regression first

Replace the incorrect Linux x64 expectations in `scripts/verify-dist.test.ts` with the filenames electron-builder actually emits on the supported x64 Linux targets:

```ts
it("includes electron-builder Linux artifact names for x64", () => {
  const allowed = buildReleaseAllowlist(version, {
    checkWin: false,
    checkMac: false,
    checkLinux: true,
    targetArches: ["x64"],
    isPortableOnly: false,
  });

  expect(allowed.has(`Venice-Forge-${version}-x86_64.AppImage`)).toBe(true);
  expect(allowed.has(`Venice-Forge-${version}-amd64.deb`)).toBe(true);
  expect(allowed.has(`Venice-Forge-${version}-x86_64.rpm`)).toBe(true);

  expect(allowed.has(`Venice-Forge-${version}-x64.AppImage`)).toBe(false);
  expect(allowed.has(`Venice-Forge-${version}-x64.deb`)).toBe(false);
  expect(allowed.has(`Venice-Forge-${version}-x64.rpm`)).toBe(false);
});
```

### 1.2 Make architecture mapping target-aware

Recommended implementation:

```js
function linuxArtifactArch(target, arch) {
  if (arch === "x64") {
    if (target === "deb") return "amd64";
    if (target === "AppImage" || target === "rpm") return "x86_64";
  }
  return arch;
}
```

Then:

```js
if (checkLinux) {
  const linuxArches = targetArches.includes("x64") ? ["x64"] : targetArches;
  for (const arch of linuxArches) {
    for (const ext of ["AppImage", "deb", "rpm"]) {
      const artifactArch = linuxArtifactArch(ext, arch);
      addSidecar(`Venice-Forge-${version}-${artifactArch}.${ext}`);
    }
  }
  for (const file of ["latest-linux.yml", "latest-linux-arm64.yml", "latest-linux-x64.yml"]) {
    addSidecar(file);
  }
}
```

Export the mapping helper for tests if useful. Do not relax the final unexpected-artifact rejection.

### 1.3 Eliminate architecture-model drift

`getTargets()` currently returns both `targetArches` and `linuxArches`, while downstream code largely operates on `targetArches`. Choose one explicit model:

```text
logical architecture: x64 | arm64
artifact architecture: target-specific label derived at the naming boundary
```

Do not carry multiple partially-used architecture arrays.

### 1.4 Validate

```bash
npx vitest run scripts/verify-dist.test.ts
node scripts/verify-ci-contract.cjs
```

Hosted acceptance must include:

```text
Linux package step PASS
Linux packaged smoke PASS
clean-release-staging PASS
verify-dist --linux PASS
```

The release workflow’s Linux job and final cross-platform publish verifier must also pass with the same files.

---

## Task 2 — Fix Windows packaged smoke executable discovery

**Primary file:**

```text
tests/smoke/electron-smoke.test.ts
```

### 2.1 Add a failing resolver test

```ts
test("finds the unpacked Windows Electron executable produced by electron-builder", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "venice-forge-smoke-"));
  temporaryDirectories.push(root);
  const executable = path.join(root, "release", "win-unpacked", "Venice Forge.exe");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, "fixture");

  expect(findPackagedExecutable(root, "win32", "x64")).toBe(executable);
});
```

Also add a fixture containing both `win-unpacked/Venice Forge.exe` and the final `-Portable.exe`, and assert the unpacked executable wins.

### 2.2 Replace portable-wrapper discovery

Preferred robust form if `electron-builder.config.cjs` is updated to declare a stable executable name:

```ts
if (platform === "win32") {
  const executable = path.join(releaseDir, "win-unpacked", "Venice Forge.exe");
  return fs.existsSync(executable) ? executable : undefined;
}
```

If avoiding product-name duplication, discover a top-level `.exe` in `win-unpacked`, but reject installer/helper executables and assert exactly one candidate.

### 2.3 Preserve CI ordering

Do not change this intended order:

```yaml
- name: Package Windows portable app
  run: npm run dist:portable

- name: Run packaged Electron smoke test
  run: npx vitest run tests/smoke/electron-smoke.test.ts
  env:
    RUN_ELECTRON_SMOKE: 'true'

- name: Remove packaging staging directories
  run: node scripts/clean-release-staging.cjs

- name: Verify Windows portable artifact
  run: npm run verify:dist:portable
```

### 2.4 Validate on Windows runner

The smoke must reach `firstWindow()` and `window.veniceForge.isDesktop === true`; do not “fix” the timeout by simply increasing it.

---

## Task 3 — Make the CSP smoke assertion capable of seeing initial violations

The current test attaches violation listeners only after `firstWindow()` resolves. That can miss first-document CSP violations.

### Required behavior

Instrument before the navigation under test, or deliberately reload after instrumentation:

```ts
const page = await electronApplication.firstWindow({ timeout: 30_000 });

await page.exposeFunction("__reportCspViolation", (message: string) => {
  cspViolations.push(message);
});

await page.addInitScript(() => {
  document.addEventListener("securitypolicyviolation", event => {
    // report sanitized directive/URI data
  });
});

page.on("pageerror", ...);
page.on("console", ...);

// Ensure the tested document is instrumented from document start.
await page.reload({ waitUntil: "domcontentloaded" });
```

If reload would alter first-run behavior, split bootstrap and CSP tests so the CSP-specific test can safely reload while onboarding acceptance uses a separate instrumentation mechanism.

### Negative control

Add a test fixture/build variant or isolated Playwright test that injects a known inline-style violation and prove the collector detects it. A security gate without a known-failing control is not strong evidence.

---

## Task 4 — Restore the removed packaged onboarding/restored-profile acceptance harness

Do not reinsert 90 lines into the CSP test. Extract common launch/discovery utilities and create a dedicated acceptance suite.

Recommended structure:

```text
tests/smoke/packagedExecutable.ts
tests/smoke/electron-csp-smoke.test.ts
tests/smoke/electron-onboarding-profile-smoke.test.ts
```

The restored flow must:

1. Launch with isolated `userData`.
2. Observe the 18+ warning.
3. Click the age acknowledgment.
4. Complete all onboarding screens.
5. Reach the Venice connection UI.
6. Persist a sanitized profile store containing a non-default restored profile and `globalOnboardingCompleted: true`.
7. Remove the routing key so startup must recover it through the supported hydration/activation path.
8. Close the first app instance.
9. Relaunch with the same `userData`.
10. Verify onboarding does not reappear.
11. Verify `window.veniceForge.isDesktop === true`.
12. Save a harmless chat-history probe through the preload/IPC bridge.
13. Assert it exists under:

```text
chat-history/profiles/restored-profile/<probe>.json
```

14. Assert it does not exist under the legacy global chat-history root.
15. Close cleanly.

Historical evidence for the removed implementation is in commit:

```text
2d88d47a06b840d3f6b719bf8909fd0fbea9eb1f
```

Use it as behavioral reference only; rebase the implementation onto the current tree and current UI selectors.

---

## Task 5 — Re-run hosted CI before touching live ruleset enforcement

Required green checks at the audited stage:

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

If any fails, inspect its exact job log. Do not re-run repeatedly before identifying whether the failure is deterministic, flaky, environment-specific, or introduced by the patch.

---

## Task 6 — Replace the broken ruleset “enforcement” script with an idempotent Rules01 updater

**Do not execute the current script against GitHub.**

Current defects:

```text
POST creates a new ruleset instead of updating Rules01 21229461.
CodeQL context strings are wrong.
Payload does not faithfully preserve live Rules01 semantics.
```

### Required design

Use:

```text
GET /repos/spearchucker667/Venice_Forge/rulesets/21229461
PUT /repos/spearchucker667/Venice_Forge/rulesets/21229461
```

The current GitHub REST contract uses PUT for repository ruleset updates.

A safer shell flow:

```bash
set -euo pipefail
OWNER=spearchucker667
REPO=Venice_Forge
RULESET_ID=21229461

current="$(gh api "/repos/$OWNER/$REPO/rulesets/$RULESET_ID")"
# Build desired payload while preserving intended bypass/rule policy.
# Validate the check names against current workflow job names.
# Print a summary/diff.
# Then, only in apply mode:
gh api \
  --method PUT \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  "/repos/$OWNER/$REPO/rulesets/$RULESET_ID" \
  --input desired-ruleset.json
```

Expected check names:

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

Preserve the intentional bypass actor unless separately authorized to change it. Preserve deletion, non-fast-forward, linear-history, review-count, last-push approval, and thread-resolution semantics unless explicitly changing governance.

### Add verification mode

The script should support something like:

```bash
./scripts/enforce-github-rules.sh --check
./scripts/enforce-github-rules.sh --apply
```

`--check` exits non-zero on drift without mutating GitHub. CI can safely use check mode if credentials/permissions are appropriate; do not put admin write credentials in ordinary PR CI.

---

## Task 7 — Reconcile roadmap and completion evidence

Current contradiction:

```text
docs/ROADMAP.md: current unfinished work only
CSP-001: open

docs/summary_of_work.md: CSP-001 remediation completion + PASS evidence
```

Additionally, summary text says the CSP smoke covers “first-run and restored-profile packaged smoke paths,” but the current test no longer does.

### Required fix

After Tasks 3/4 establish the actual end state:

- remove completed CSP-001 from current unfinished work;
- update P1-004 wording to exactly describe the restored acceptance test;
- keep historical completion evidence in `summary_of_work.md`;
- strengthen `verify-roadmap-current.cjs` beyond format-only checks.

A durable direction is a machine-readable current-work registry:

```json
{
  "id": "CSP-001",
  "status": "closed",
  "closedAt": "2026-08-31",
  "evidence": "docs/summary_of_work.md#..."
}
```

Then generate/validate the human roadmap from explicit status data. If that is too large a change, at minimum add regression assertions for known closed IDs incorrectly appearing as open.

---

## Task 8 — Remove builder debug metadata from the public release surface

Current chain:

```text
builder-debug.yml emitted by electron-builder
→ checksum-release treats .yml as checksummable
→ verify-dist allowlists builder-debug.yml
→ release workflow uploads release/*
→ GitHub draft release publishes release/*
```

Make `builder-debug.yml` a diagnostic artifact, not a release asset.

Recommended cleanup addition:

```js
const FILE_ALLOWLIST = Object.freeze(["builder-debug.yml"]);
```

Delete the exact known file during cleanup, with the same path-safety rules used for staging directories. Alternatively exclude it in checksum/upload logic. Whichever route is chosen, the final publish directory must be explicit and testable.

Add regression:

```ts
expect(finalReleaseEntries).not.toContain("builder-debug.yml");
expect(finalReleaseEntries).not.toContain("builder-debug.yml.sha256");
```

---

## Task 9 — Add explicit production signature/notarization verification

Credential presence is not artifact proof.

### macOS tag build

After packaging and before upload, verify the unpacked app before cleanup and/or validate the final distributed artifacts according to signing/notarization strategy:

```bash
codesign --verify --deep --strict --verbose=4 "release/mac*/Venice Forge.app"
spctl -a -vv --type execute "release/mac*/Venice Forge.app"
xcrun stapler validate "release/mac*/Venice Forge.app"
```

If notarization/stapling occurs at DMG/ZIP level instead, validate the exact distribution object and document it.

### Windows tag build

```powershell
$setup = Get-ChildItem .\release\Venice-Forge-*-x64-Setup.exe | Select-Object -First 1
$sig = Get-AuthenticodeSignature $setup.FullName
if ($sig.Status -ne 'Valid') {
  throw "Setup signature invalid: $($sig.Status)"
}
```

Do the same for portable if it is shipped as signed production media.

Record version/commit/verifier/evidence in `SIGNED_ARTIFACT_EVIDENCE.md` only after an actual production artifact passes.

---

## Task 10 — Close character-cache TOCTOU with descriptor-safe consumption

Current unsafe sequence:

```ts
await fs.promises.stat(dp);
...
const stream = fs.createReadStream(dp);
```

Validation and use operate on different opens.

Current safe precedent:

```ts
const handle = await fs.promises.open(
  filePath,
  fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
);
const stat = await handle.stat();
if (!stat.isFile()) throw new Error("Not a regular file");
const bytes = await handle.readFile();
```

For cache images, either use `readRegularFileNoFollow()` if bounded memory size is already guaranteed, or introduce a descriptor-backed stream helper that keeps validation and streaming on the same open descriptor. Add symlink swap/race-oriented tests where the platform supports them.

Also schema-check metadata:

```ts
const parsed: unknown = JSON.parse(metaRaw);
if (
  parsed &&
  typeof parsed === "object" &&
  "contentType" in parsed &&
  typeof (parsed as { contentType?: unknown }).contentType === "string"
) {
  // validate against ALLOWED_CONTENT_TYPES
}
```

---

## Task 11 — Harden custom-protocol authorization without breaking media tags

Do not remove the current headerless-load compatibility path until a replacement is proven on packaged Chromium media elements.

Preferred design investigation:

```text
renderer asks trusted preload/main for media URL
→ main emits venice-media://<opaque-id>?cap=<short-lived capability>
→ protocol validates capability + profile + object id
→ one active renderer/session/profile can use it
→ expiration/revocation on profile switch/app shutdown
```

The capability must be unguessable, local-only, and never persisted in diagnostics. Existing origin/referrer checks remain useful defense-in-depth.

---

## Task 12 — Resolve Vertex full-auth guaranteed-failure UI

Current UI offers full mode, while validation/adapter throws “not implemented.” Pick one path.

### Preferred near-term if no service-account implementation is authorized

Remove the selectable full option and narrow the public type:

```ts
export interface GoogleVertexConfig {
  authMode: "express";
  apiKey: string;
}
```

Preserve a roadmap/deferred design document for full OAuth.

### If implementing full mode

Requirements include:

- main-process-only service-account credential parsing/custody;
- no raw credentials in renderer/localStorage/logs;
- OAuth access-token mint/refresh with bounded lifetime;
- project/location validation;
- correct Vertex endpoint selection;
- token refresh concurrency control;
- revoke/delete behavior;
- live credentialed acceptance;
- provider-specific tests and sanitized diagnostics.

Do not implement only the UI half.

---

## Task 13 — Add Retry-After-aware fallback/backoff

The Electron response object already exposes sanitized headers. Implement a shared parser:

```ts
function parseRetryAfterMs(value: string | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const when = Date.parse(trimmed);
  if (!Number.isFinite(when)) return null;
  return Math.max(0, when - now);
}
```

Cap delays, add jitter, and make waiting abortable:

```ts
await abortableDelay(delayMs, request.signal);
```

Required tests:

```text
429 + Retry-After seconds
429 + Retry-After HTTP-date
invalid header
cap enforcement
jitter bounds
abort during delay
no fallback after streamed delta
fallback ordering unchanged
```

Do not retry 4xx authentication/schema errors.

---

## Task 14 — Make semantic media-screening claims truthful

Current `ClassifierBackend` is optional and unregistered in production. The fallback heuristic is structural, not semantic. Audio/video semantics are pass-through after structure checks.

Short-term acceptable outcome:

- rename comments/UI/status to “structural generated-media validation” when no classifier is registered;
- expose a diagnostic capability like:

```ts
{
  semanticImageClassifier: "unavailable" | "local" | "provider",
  semanticAudioClassifier: "unavailable" | ...,
  semanticVideoClassifier: "unavailable" | ...
}
```

Long-term outcome requires an explicitly selected local or remote classifier with privacy/cost/performance acceptance. Do not silently upload generated media to a third party.

---

## Task 15 — Strengthen CI semantics and diagnostics

### 15.1 Add real-output fixture coverage

Cover:

```text
Linux x64 => x86_64 AppImage/RPM + amd64 deb
Windows portable build => smoke uses win-unpacked app
final portable wrapper => artifact verifier only
```

### 15.2 Upload sanitized smoke diagnostics on failure

Create e.g.:

```text
artifacts/electron-smoke/<platform>/summary.json
artifacts/electron-smoke/<platform>/renderer-errors.txt
artifacts/electron-smoke/<platform>/csp-violations.txt
artifacts/electron-smoke/<platform>/screenshot.png
```

Redact credentials/tokens/prompts/absolute sensitive paths. Upload only on failure.

### 15.3 Keep hosted smoke tests

Static contract checks are complementary; they cannot prove packaged binary launchability.

---

## Task 16 — Linux packaging identity cleanup

Make the Linux executable contract explicit:

```js
linux: {
  executableName: "venice-forge",
  // configure supported desktop-name synchronization fields per current electron-builder schema
}
```

Follow the actual electron-builder warning for `desktopName`/`syncDesktopName`; verify the generated `.desktop` file rather than assuming the config worked.

Acceptance should inspect package contents or unpacked resources and verify desktop icon/window association in headed Linux acceptance where feasible.

---

## Task 17 — TTS build-warning and duplication cleanup

Because `chatTtsController` is already statically imported elsewhere, replace dynamic imports in `use-chat.ts` with a static import unless all consumers are made lazy.

Extract:

```ts
async function maybeAutoReadAssistantMessage(conversation: Conversation): Promise<void> {
  // resolve auto-read flag
  // find assistant message
  // normalize multipart text
  // skip blank text
  // await/play through chatTtsController
  // log sanitized failure through project logger
}
```

Use it from both send and regenerate. Replace `.catch(console.error)` in both `use-chat.ts` and `ChatTtsPlayer.tsx` with the project logger/redaction path.

---

## Task 18 — Dependency classification/hygiene

### `@testing-library/dom`

No runtime import was found. Move it from `dependencies` to `devDependencies`, update lockfile, validate build/package.

### `@types/libsodium-wrappers`

Deprecated stub. Determine whether current `libsodium-wrappers-sumo` supplies sufficient types before removing. Do not introduce hand-written unsafe ambient declarations just to silence typecheck.

### Transitive deprecations

Track upstream upgrades for `inflight`, `glob@7`, `lodash.isequal`, `boolean`, etc. Current audit evidence did not show an npm vulnerability requiring a forced override. Avoid unsafe override churn in the blocker fix.

---

## Task 19 — Staged maintainability refactors

Do this only after CI is green.

Priority decomposition targets:

```text
src/services/desktopBridge.ts            ~2710 lines
src/components/rp-studio/CharacterEditor.tsx ~3714
src/stores/chat-store.ts                 ~1633
src/components/chat/chat-view.tsx        ~1509
src/components/image/image-view.tsx      ~1828
electron/preload.ts                      ~907
```

Recommended boundaries:

```text
desktopBridge/
  chat.ts
  media.ts
  files.ts
  providers.ts
  sync.ts
  settings.ts
  index.ts          # composes stable public API
```

For React views, extract feature hooks/state adapters and cohesive child components; do not split by arbitrary line count.

---

## Task 20 — Type and React-hook suppression cleanup

Prioritize file-level `no-explicit-any` at IPC/agent boundaries:

```text
src/services/desktopBridge.ts
electron/agent/runtime/agent-tool-executor.ts
src/agent/registry/tool-registry.ts
electron/services/chatFolderService.ts
```

Pattern:

```ts
function isExpectedPayload(value: unknown): value is ExpectedPayload {
  // explicit structural validation
}
```

For `react-hooks/exhaustive-deps` suppressions, inspect one component at a time. Add regression tests for stale-closure behavior before changing dependencies. Do not “fix” suppressions by blindly adding unstable functions and causing render loops.

---

## Task 21 — Deferred release/product work that remains intentionally open

These are part of the handoff because they are current TODOs, but they are not the cause of the red CI run:

```text
VF-VERIFY-005       signed/paid/two-device/manual accessibility acceptance
VF-I18N-NATIVE-REVIEW-001 qualified human review for non-English catalogs
VF-FSM-003          semantic media classifier backend decision/implementation
Theme Engine V2     generated companion visual review + semantic-color polish
VF-IMAGE-SEARCH-001 direct image-byte web matching provider/privacy decision
Google Vertex full  OAuth/service-account mode (or remove from UI until implemented)
```

Keep each fail-closed. Do not convert deferred product scope into misleading “implemented” status through documentation-only changes.

---

# Required validation matrix

## Fast, task-local gates

Run the narrowest test first after each change, e.g.:

```bash
npx vitest run scripts/verify-dist.test.ts
npx vitest run tests/smoke/electron-smoke.test.ts
npx vitest run electron/utils/customProtocolAccess.test.ts
npx vitest run electron/services/providerAdapters.test.ts
```

## Full local gate before publishing changes

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

Node must satisfy the repository engine contract (`>=22.15 <23`).

## Hosted acceptance

All of the following must pass on the exact final commit:

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

## Release acceptance

Before a production release claim:

```text
macOS signed/notarized verification evidence
Windows Authenticode verification evidence
clean-install/upgrade/uninstall proof
portable Windows launch proof
paid provider/media operation proof as applicable
multi-device sync proof
manual accessibility/headed QA
native-language review status truthfulness
```

---

# Completion report format

When finished, produce a report containing:

```markdown
## Baseline
- Starting SHA:
- Ending SHA:
- Branch:

## Findings closed
- VF-AUD-... — summary — files — tests

## Findings remaining
- ID — reason — blocker/authority/resource needed

## Validation
- command — PASS/FAIL — concise evidence
- hosted workflow URL/run ID — all job conclusions

## Release evidence
- signing/notarization evidence
- external/manual acceptance evidence

## Repository state
- git status --short
- git log -1 --oneline
- remote/main parity result
```

Do not say “all fixed,” “production ready,” or “CI green” without exact final-command and hosted-workflow evidence from the final commit.

---

# Full Exhaustive Finding Ledger

The following ledger is authoritative for this handoff. Every item must be dispositioned as **fixed**, **deferred with explicit reason**, or **not applicable with new evidence**. Do not silently omit lower-severity items.

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

---

# Final agent checklist

- [ ] P1-001 Linux artifact-name contract fixed with real filename tests.
- [ ] P1-002 Windows smoke uses unpacked Electron app, not portable wrapper.
- [ ] P2-001 CSP listener timing hardened and negative-control validated.
- [ ] P1-003 packaged onboarding/restored-profile acceptance restored.
- [ ] Hosted CI green on exact final SHA before governance mutation.
- [ ] P1-004 ruleset tool converted from POST/create to PUT/update and real check names.
- [ ] Live Rules01 updated only after smoke jobs are green.
- [ ] Roadmap/summary reflect current implementation, not stale closure/open claims.
- [ ] builder-debug metadata excluded from public release assets.
- [ ] Production tag workflow explicitly verifies signatures/notarization.
- [ ] Character-cache descriptor race closed.
- [ ] Custom protocol provenance hardening investigated/implemented without media regression.
- [ ] Vertex full mode implemented or removed from selectable UI.
- [ ] Provider fallback honors bounded Retry-After/backoff policy.
- [ ] Semantic media classification status is truthful.
- [ ] Smoke failure diagnostics are sanitized and artifacted.
- [ ] Linux desktop/executable identity is explicit.
- [ ] TTS dynamic import warning/duplication/raw console errors cleaned up.
- [ ] Runtime/dev dependency classification corrected.
- [ ] Large module/type/hook debt split into separate safe refactor commits.
- [ ] External release-acceptance matrix remains fail-closed until real evidence exists.
- [ ] Final local matrix passes.
- [ ] Final hosted CI and CodeQL pass on exact final commit.
- [ ] Completion report records unresolved/deferred items honestly.
