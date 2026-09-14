# Findings — 2026-09-12 audit of `main` @ `c6d9bed3`

IDs use `VF-AUD-20260912-C6-*` (C6 = audit of commit `c6d9bed3`). Severity model and
finding format follow the work order (§33–§34). Duplicate control: one root cause → one
primary finding; affected call sites listed beneath.

---

## VF-AUD-20260912-C6-P1-001 — Packaged-launch CSP smoke probe is methodologically invalid; all three hosted packaged-smoke CI jobs fail on every commit

Severity: P1
Confidence: High
Classification: CONFIRMED DEFECT (test infrastructure with CI-blocking impact; introduced by remediation commit `bb29350e`)

Affected files:
- `tests/smoke/packaged-launch-csp.test.ts:70-93` (the "packaged renderer CSP blocks inline scripts" test)
- Introduced in `bb29350e` ("fix: remediate 2026-09-12 current-main audit findings"), alongside the auto-run gate in `tests/smoke/smoke-utils.ts:18-21`

Affected subsystem:
CI / Release acceptance / Electron CSP verification

Observed behavior:
The test launches the packaged app, then probes CSP enforcement with:

```ts
const inlineScriptAllowed = await page.evaluate(() => {
  try {
    // eslint-disable-next-line no-new-func -- CSP probe
    new Function('return 1')();
    return true;
  } catch {
    return false;
  }
});
expect(inlineScriptAllowed).toBe(false);
```

`page.evaluate` executes through Playwright's CDP `Runtime.evaluate`, which Chromium
exempts from page CSP (eval inside CDP evaluation is host-driven, not page-driven).
`new Function('return 1')()` therefore succeeds regardless of the page's `script-src`
policy, `inlineScriptAllowed` is always `true`, and the assertion fails — deterministically,
on every platform, for every future commit. All three hosted jobs
(`electron-smoke-linux`, `electron-smoke-windows`, `electron-smoke-macos`) fail on
baseline SHA `c6d9bed3` (GitHub Actions run 34743024816, 2026-09-13T06:52Z).

Expected behavior:
The packaged smoke should verify actual page-context script blocking — the renderer CSP
(`electron/utils/rendererCsp.ts:39`: production `script-src 'self'`, no `unsafe-eval`)
must be verified through a vector that CSP genuinely governs and that does not run
through CDP evaluation.

Evidence:
1. Local reproduction against the freshly packaged macOS arm64 build
   (`npm run dist:mac:arm64` from the baseline tree, then
   `npx vitest run tests/smoke/packaged-launch-csp.test.ts`): `expected true to be false`
   at `packaged-launch-csp.test.ts:88`, identical to the hosted log.
2. Decisive differential diagnostic (temporary script under gitignored `scratch/`,
   deleted after the run) against the same packaged binary:
   - `new Function()` via `page.evaluate` → **succeeds** (`true`) — CDP path exempt.
   - Inline event-handler attribute (`button.setAttribute('onclick', …)` then click)
     → **blocked** (handler never ran) — real page-context CSP enforcement works.
   - DOM-injected inline `<script>` element → **did not execute** — also blocked.
   - `securitypolicyviolation` events fired for the blocked page-context vectors.
   The negative control in the same suite ("deliberately violating CSP style-src fails
   the assertion") passes, independently confirming a CSP is present and enforced.
3. Hosted run 34743024816 job conclusions:
   `electron-smoke-linux: failure`, `electron-smoke-windows: failure`,
   `electron-smoke-macos: failure`; all eight other CI jobs `success`. Preceding SHA
   `84cf5bbe` (before the probe was added) had CI `success`, proving the probe is the
   regression. `bb29350e`'s own run was `cancelled` (superseded), so the breakage went
   unnoticed until the next push.

Reproduction:
1. `git checkout c6d9bed3 && npm ci && npm run build`
2. `npm run dist:mac:arm64` (or `dist:portable` / `dist:linux`)
3. `RUN_ELECTRON_SMOKE=true npx vitest run tests/smoke/packaged-launch-csp.test.ts`
4. Observe `AssertionError: expected true to be false` at line 88 on every platform.

Root cause:
The remediation that added the inline-script probe (to close SEC-P3-004 from the prior
audit) chose a probe vector (`new Function` inside `page.evaluate`) that is outside the
enforcement scope of the very policy it claims to verify. Playwright's CDP evaluation is
host-privileged and CSP-exempt, so the test asserts an impossible outcome. The smoke
suite was validated only in its skipped state (`npm test` skips without a packaged
binary or `RUN_ELECTRON_SMOKE`), so the failure never surfaced locally before publication.

Impact:
- Hosted `main` CI is permanently red: every future commit inherits failing
  packaged-smoke jobs, so any *real* packaged regression would be indistinguishable from
  the known failure (alert fatigue / "cry-wolf" effect).
- The release pipeline's gate (`ci` job chain) cannot be used as a green signal until fixed.
- The prior audit's SEC-P3-004 remediation claim ("packaged CSP smoke auto-runs …
  including an inline-script probe") is materially inaccurate: the probe runs and always
  fails; it verifies nothing about page-context script blocking.

Recommended remediation:
Replace the probe with a page-context vector. Preferred (matches existing assertion
shape and adds a `securitypolicyviolation` signal):

```ts
const inlineAttrAllowed = await page.evaluate(() => {
  const b = document.createElement('button');
  b.setAttribute('onclick', 'window.__vfProbeRan = true');
  document.body.appendChild(b);
  b.click();
  return window.__vfProbeRan === true;
});
expect(inlineAttrAllowed).toBe(false);
expect(cspViolations.some((v) => /script-src|securitypolicyviolation/i.test(v))).toBe(true);
```

Also fix the eslint-disable comment placement (it currently annotates the probe line
inside `page.evaluate`, where it has no effect). Add a local gate instruction to
`docs/DEVELOPMENT/testing.md`: run the packaged smoke with `RUN_ELECTRON_SMOKE=true`
against a locally built package *before* pushing changes that touch it.

Required regression tests:
- Keep the packaged smoke (fixed probe) as the regression test; on a packaged build it
  must pass within the existing 60 s budget on all three platforms.
- No additional unit test can cover this (the defect is in the interaction between CDP
  and CSP); the fix must be validated by actually running the packaged smoke once per
  platform in CI after the fix lands.

Dependencies / related findings:
- Supersedes the SEC-P3-004 "FIXED" claim in
  `docs/audits/venice-forge-exhaustive-audit-2026-09-12-current-main/REMEDIATION_STATUS.md`.
- Related design finding: VF-AUD-20260912-C6-DR-001 (atomic-replace fragmentation) is
  independent.

---

## VF-AUD-20260912-C6-P3-001 — Expired capability tokens are never reaped; unverified tokens accumulate for the app lifetime

Severity: P3
Confidence: High
Classification: CONFIRMED DEFECT (minor resource-management defect)

Affected files:
- `electron/utils/customProtocolAccess.ts:315-321` (`verify()` deletes an expired token only when it is presented again)
- `electron/utils/customProtocolAccess.ts:270-305` (`issue()` inserts without any cap or reaping)

Affected subsystem:
Electron main process / custom-protocol capability tokens (`venice-media:`, `venice-tts:`, `venice-character-cache:`)

Observed behavior:
`issue()` stores every issued token in the manager's in-memory `Map` with
`expiresAt = issuedAt + ttlMs` (default 5 min). `verify()` deletes a token only when
that specific token is presented *after* expiry. A token that is never verified again
(e.g., the renderer navigated away, revoked only on profile switch / reload / shutdown,
or simply superseded by a re-issued URL for the same media) remains in the map forever
within the running app. Nothing bounds the map: no periodic sweep, no size cap, and
`revokeSession`/`revokeProfile`/`revokeAll` fire only on lifecycle events.

Expected behavior:
Expired tokens should be removed on a bounded schedule or bounded opportunistically on
`issue()` (e.g., sweep expired entries when `tokens.size` crosses a threshold, or a
`setInterval` timer owned by the manager, cleared by `revokeAll`), so steady-state memory
is proportional to live tokens, not cumulative issuance.

Evidence:
Read of `createCustomProtocolCapabilityManager` (`electron/utils/customProtocolAccess.ts:270-345`):
the only deletion paths are expired-`verify()`, the three `revoke*` methods, and map
replacement of the same token value (which cannot recur — tokens are 256-bit random).
`metrics()` computes ages but never prunes.

Reproduction:
1. In a main-process test harness, issue N tokens with `ttlMs: 1`.
2. Advance `now` beyond expiry without calling `verify` on them.
3. `manager.metrics().issuedCount` still returns N (revoke* not called).

Root cause:
Expiry is enforced lazily at lookup time; no eager reaping path exists.

Impact:
Bounded by usage rate (media element loads; each `<img>`/`<audio>` URL issue adds one
entry). In an RP/media-heavy session this is plausibly thousands of entries/day at
~0.5–1 KB each — minor but genuine unbounded growth in a long-lived main process. No
security impact (expired tokens already fail verification).

Recommended remediation:
In `issue()`, after inserting, run an inline sweep when `tokens.size > 512`: delete all
entries with `expiresAt <= now()` (O(n), amortized negligible). Alternatively add
`setInterval(sweep, 60_000).unref()` created lazily on first `issue` and cleared in
`revokeAll`. Add a unit test asserting `issuedCount` returns to a bounded value after
expiry without any `verify` calls.

Required regression tests:
- `customProtocolAccess.test.ts`: "expired tokens are reaped without verify" (fake `now`,
  issue 600 tokens with 1 ms TTL, advance, issue one more, assert `issuedCount <= 1`).

Dependencies / related findings:
None.

---

## VF-AUD-20260912-C6-DR-001 — DESIGN RISK: Windows-safe `atomicReplaceFile` exists but most durable main-process writers still use raw temp+rename

Severity: — (design risk, not a defect)
Classification: DESIGN RISK

Affected files (representative raw temp+rename writers at HEAD):
- `electron/services/conversationVault.ts:157,336` (vault key + encrypted record writes)
- `electron/services/chatTtsBridge.ts:211-213` (TTS cache write — still `fs.rename` onto possibly-existing destination)
- `electron/services/chatStorage.ts:294`, `electron/services/chatFolderStorage.ts:189`, `electron/services/configService.ts:36,481`, `electron/services/providerSettingsStore.ts:120`, `electron/services/secureStore.ts:109`, `electron/services/backgroundTaskManager.ts:115`, `electron/services/mediaService.ts:295`, `electron/services/chatFolderOperationJournal.ts:48`, `electron/services/syncOutbox.ts:50,76`, `electron/services/characterImageCache.ts:346`, `electron/services/chatFolderBackupService.ts:325`

Affected subsystem:
Main-process storage / durability

Observed behavior:
Commit `c6d9bed3` correctly identified that Windows cannot `rename` onto an existing
destination and added `electron/utils/atomicFileReplace.ts` with a copy+unlink fallback,
wiring it into 5 writers (`characterCardStorage`, `rpChatStorage`, `rpSingleFileStore`,
`syncConfig`, plus the vault-adjacent `chatFolderStorage` partially). Roughly a dozen
other durable writers perform the identical temp+rename pattern with unique temp names
but *without* the Windows fallback.

Root cause / risk:
The Windows rename-failure mode that `c6d9bed3` fixed for five stores applies verbatim to
the others whenever a destination already exists (ordinary overwrite-on-save), with an
operating-system-dependent failure that the project already judged worth fixing once.
This is not a confirmed user-visible defect at HEAD (concurrent-write timing is rare and
`EPERM`-on-rename is only one of several outcomes), but it is a latent divergence of
identical logic across 15+ sites — the exact duplicate-implementation shape that
AGENTS.md §29 flags for maintenance impact.

Recommended remediation:
Migrate all durable main-process writers to `atomicReplaceFile()` (it is already the
canonical utility with tests); keep domain-specific steps (fsync, backup-rotation,
displace-and-restore) layered around it. Verify with the Windows-sensitive CI job.

Required regression tests:
Existing `atomicFileReplace.test.ts` plus one writer-level assertion per migrated store
(temp name uniqueness + Windows fallback path), mirroring
`conversationVault.test.ts` `[P1-003]`.

Dependencies / related findings:
None.

---

## Rejected / subsumed candidates

See `REJECTED_FINDINGS.md` for candidates investigated and dismissed (with reasons), and
`TEST_GAPS.md` / `IMPROVEMENTS.md` for non-defect items deliberately not classified as
findings.
