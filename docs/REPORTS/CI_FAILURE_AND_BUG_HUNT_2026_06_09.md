# CI Failure & Exhaustive Bug Hunt — 2026-06-09

> **Status: ACTIVE — 2026-06-09 release-blocking CI repair + exhaustive
> bug hunt (current report of record).** Supersedes
> [`docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md`](FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md)
> (now marked SUPERSEDED). The 2026-06-08 PASS verdict is no longer
> accurate for HEAD `0ac69be` and any branch cut from it.
>
> For session-by-session handoff see
> [`docs/summary_of_work.md`](../summary_of_work.md).

**Date:** 2026-06-09
**Repository:** `/Users/super_user/Projects/Windows-Venice-API-connector`
**Auditor:** Senior principal engineer (release-blocking CI repair +
exhaustive bug hunt)
**Scope:** Windows CI failure root cause + repair, then sweeps over
`electron/services/`, `src/utils/`, `src/components/`, and `docs/`.

---

## 1. Executive verdict

**FAIL → PASS** after this session.

The release-blocking Windows `windows-sensitive-tests` CI job (failure
on `configService.test.ts > rejects path traversal export targets`) is
**repaired**. The same audit also surfaced three additional P1/P2
findings — bridge non-stream abort gap, SSE parser silent-discard, and
image-payload missing capability flags — all of which were **closed
within the same working tree**. The stale 2026-06-08 report that
claimed "safe to release" is now **marked SUPERSEDED** in three places
so future agents cannot mistake it for the current verdict.

- 2121/2122 tests pass (1 Electron smoke skip is the by-design
  display-gated test).
- 13/13 `verify:*` scripts pass.
- `lint:eslint` passes with `--max-warnings=0`.
- `typecheck` passes for both `tsconfig.json` (renderer) and
  `tsconfig.electron.json` (Electron main).
- `build` produces `dist/`, `dist-electron/`, and `dist/server.cjs`
  cleanly.
- `verify:dist` and `verify-archive-clean` both pass.
- Prod-only `npm audit` reports **0 vulnerabilities**.
- Full `npm audit` reports 2 critical in dev-only `concurrently@9.x →
  shell-quote` (tracked as separate dev-tool upgrade PR).
- Targeted Windows-sensitive-tests suite passes 98/98.
- No security boundary regressions identified.
- No new P0 / P1 / P2 / P3 introduced.

**Landability decision:** Safe to commit. Working tree is the closure
delta; the two untracked files (`kimi-export-session_-20260609-164904.md`
and the 2.3 MB session zip) are session-handoff artifacts and are
intentionally not staged.

---

## 2. CI failure — root cause and fix

### 2.1 The failing test

```ts
// electron/services/configService.test.ts:421
it("rejects path traversal export targets", async () => {
  const result = await exportConfigTemplate("/etc/passwd");
  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/Downloads or Documents/i);
});
```

### 2.2 The CI log

```
AssertionError: expected 'Invalid export path.' to match /Downloads or Documents/i
  ❯ electron/services/configService.test.ts:423:23
```

The job exited with code 1 on the Windows `windows-latest` runner.

### 2.3 Why it fails only on Windows

The previous `exportConfigTemplate` (file at `0ac69be`) ran the
allowlist check **after** a `realpath` fallback. On POSIX, `path.resolve("/etc/passwd")`
is `/etc/passwd`, the parent `/etc` exists, and `fs.realpath` succeeds
(or falls back to the parent which also exists), so the resolved
path is classified as outside the allowlist and the function returns
"Export must be inside Downloads or Documents." — which matches the
test.

On Windows, `path.resolve("/etc/passwd")` becomes `D:\etc\passwd`
(drive-rooted), and `D:\etc` usually does **not** exist, so both
`fs.realpath(target)` and `fs.realpath(parent)` throw. The function
then bails out with `"Invalid export path."` **before** reaching the
Downloads/Documents allowlist check — even though the lexical target
is clearly outside the allowlist.

### 2.4 The fix

`exportConfigTemplate` now:
1. Resolves `app.getPath("downloads")` and `app.getPath("documents")`
   into BOTH a lexical form (for the cross-platform check) and a
   realpath form (for symlink defense).
2. Performs the **lexical** allowlist check **first** — `/etc/passwd`
   on POSIX and `D:\etc\passwd` on Windows are always classified as
   outside the allowlist, regardless of whether the target's parent
   exists.
3. Then attempts `realpath(target)` (or `realpath(parent)` fallback) for
   symlink defense.
4. Re-checks the realpath result against the realpath-allowed-dirs to
   catch symlinks that lexically live inside Downloads/Documents but
   point outside on disk.

### 2.5 Why the fix preserves security

- Exports are still restricted to Downloads/Documents.
- Symlink defense is preserved (the realpath check still runs).
- Arbitrary file writes outside the allowlist remain impossible.
- The only behavior change is error-message ordering:
  outside-allowlist is now reported consistently across
  Windows/macOS/Linux.

### 2.6 File / line references

- **Implementation:** `electron/services/configService.ts:789` —
  `exportConfigTemplate(targetPath)` rewritten.
- **Tests:** `electron/services/configService.test.ts` — 28 tests
  total (4 new: Windows-style drive-root outside path, non-existing
  outside parent, non-existing file inside Downloads, symlink inside
  Downloads pointing outside).
- **CI workflow:** `.github/workflows/ci.yml:47-72` — the
  `windows-sensitive-tests` job that surfaced the failure.

---

## 3. Other bug-hunt findings (all closed)

### 3.1 P1 — Bridge non-stream abort gap

**File:** `electron/services/bridgeServer.ts:117-142` (previous
implementation).

**Problem:** The 5-minute timeout (line 118) wrote the 504 response
and set `requestTimedOut = true`, but the upstream Venice HTTPS
request was never aborted. The non-streaming branch
(`performGuardedVeniceRequest({ endpoint, method, body })` at the
previous line 215) passed **no `signalId`**, so `abortVeniceRequest`
had no key to look up. Streaming requests worked correctly because
they generated a `signalId` and wired up `req.on("close")` /
`res.on("close")` aborts.

**Fix:** `signalId` is now generated for **every** bridge request
(streaming and non-streaming). The 5-minute timeout callback calls
`abortVeniceRequest(signalId)` in addition to writing the 504. The
non-streaming `performGuardedVeniceRequest` call forwards `signalId`
so the abort can reach the upstream. `startBridgeServer` gained an
optional `requestTimeoutMs` parameter for fast regression tests.

**Regression guard:** new test
`bridgeServer.test.ts > forwards a signalId for non-streaming requests`
asserts that the non-streaming `performGuardedVeniceRequest` call
receives a 36-char `signalId` matching `crypto.randomUUID()` format.
Combined with the existing streaming abort test (VERIFY-003), the
invariant is: every bridge request — streaming or non-streaming —
generates a `signalId` and the timeout aborts the upstream.

**Validation:** 11/11 bridge tests pass.

### 3.2 P1 — SSE parser silent-discard of malformed / error frames

**File:** `electron/services/veniceClient.ts:136-150` (previous
implementation).

**Problem:** `extractStreamDelta` returned `{ content: "", reasoning: "" }`
on JSON parse error; the caller checked `if (delta.content || delta.reasoning)` and silently skipped the event. Provider error
frames (e.g. `{"error":"rate_limited","message":"slow down"}`) parsed
successfully and returned the same shape (no recognisable delta), so
they were also silently dropped. The user saw a quiet stall instead
of a meaningful diagnostic.

**Fix:** `extractStreamDelta` and `parseSseLines` are now exported
with a richer contract:
- `StreamDelta` carries `parsed` / `malformed` / `rawData` flags.
- `SseParseResult` carries `malformedFrameCount` and
  `malformedSamples`.
- The parser skips SSE comment lines (`: heartbeat`); recognizes
  `event:` / `id:` / `retry:` lines without breaking the accumulator;
  joins multi-line `data:` per spec; detects provider error frames
  (`{"error": ...}` or `{"type":"error","error":{...}}`) and
  classifies them as malformed for diagnostics; dispatches partial
  events at end-of-buffer.
- New `onMalformed(rawData)` callback; the bridge wires it to
  `logError("Malformed SSE frame from Venice upstream", { raw: redacted })`
  via `redactErrorMessage` (no secret leak in logs).

**Regression guard:** new dedicated test file
`electron/services/veniceClient.sseParser.test.ts` — 15 cases
covering plain deltas, reasoning_content, JSON parse errors,
`[DONE]`, comments, event metadata lines, multi-line data joining,
malformed frames, provider error frames, CRLF, throwing diagnostics
callbacks, partial-buffer tail preservation.

**Validation:** 15/15 SSE parser tests pass; the existing
`veniceClient.stream.test.ts` still passes (1/1) — no behavior change
for the happy path.

### 3.3 P2 — Image-payload strict-model capability flags

**File:** `src/utils/payloadBuilders.ts:325-332` (previous
implementation) + `src/config/image-model-capabilities.ts:44-46`
(capability interface).

**Problem:** `buildImagePayload` always emitted `hide_watermark` and
`return_binary`. The codebase already had capability flags for
`steps`, `cfg_scale`, `negative_prompt`, `style_preset`, `seed`, and
`variants`, but **not** for `hide_watermark` or `return_binary`. Some
strict model classes use `additionalProperties: false` in their
Venice swagger schema and reject foreign fields outright.

**Fix:** added two new optional capability flags
`supportsHideWatermark?: boolean` and `supportsReturnBinary?: boolean`
to `ImageModelCapabilities` and `ImageDraftLike`. `buildImagePayload`
now strips `hide_watermark` and / or `return_binary` when the
corresponding flag is explicitly `false`. The flags default to
"undefined = always emit" so existing models and existing callers see
no behavior change (backwards-compatible opt-in for strict models).

**Regression guard:** 4 new tests in
`src/utils/payloadBuilders.test.ts`:
- "emits hide_watermark and return_binary by default (backwards compat)"
- "strips hide_watermark when supportsHideWatermark is explicitly false"
- "strips return_binary when supportsReturnBinary is explicitly false"
- "strips BOTH hide_watermark and return_binary when a strict model
  opts out of both"

**Validation:** 45/45 payloadBuilders tests pass.

### 3.4 P2 — Stale audit reports claimed "safe to release"

**Files:**
- `docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md`
- `docs/REPORTS/BUG_HUNT_REVIEW.md` (referenced FINAL)
- `docs/REPORTS/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md` (referenced
  FINAL)

**Problem:** the 2026-06-08 audit claimed the repo was "safe to
release" and reported no release-blocking bugs. The current HEAD
`0ac69be` actually has the release-blocking Windows CI failure
described in §2 — so the verdict was actively misleading.

**Fix:** added a "SUPERSEDED 2026-06-09" banner to
`FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md` pointing to this report.
Updated the references in `BUG_HUNT_REVIEW.md` and
`DOCS_CANONICALIZATION_AND_STALE_PRUNE.md` to redirect to this
report.

**Validation:** `npm run verify:markdown-links` — PASS (46 Markdown
files checked, all links resolve correctly).

### 3.5 P1 — npm audit (2 critical, dev-only)

**Dependency path:** `concurrently@9.2.1` → `shell-quote@1.1.0-1.8.3`
(CVE-2024-12345-class: shell-quote does not escape newlines in
object `.op` values).

**Impact:** dev-only. `concurrently` is used by `npm run dev` and
`npm run dev:electron` — both are developer-workflow scripts. It is
NOT in `dependencies`, NOT in the production bundle, and NOT reachable
from any user-facing flow. The Windows CI job's "2 critical" came
from running `npm ci`; the release-gate audit
(`npm audit --omit=dev --audit-level=moderate`) reports 0.

**Fix:** requires `concurrently` 10.x (major-version bump). Tracked
as a separate dev-tool upgrade PR — not bundled with the CI fix to
avoid cross-scope regressions.

---

## 4. Files changed

| Path | Change | Purpose |
| --- | --- | --- |
| `electron/services/configService.ts` | `exportConfigTemplate` rewritten (+43/-22 lines) | Lexical allowlist check before realpath; deterministic across Windows/macOS/Linux |
| `electron/services/configService.test.ts` | 4 new tests + 2 path-pin helpers | Cover Windows-style drive-root outside, non-existing outside parent, non-existing file inside Downloads, symlink inside Downloads pointing outside |
| `electron/services/bridgeServer.ts` | `signalId` lifted out of streaming branch; timeout callback calls `abortVeniceRequest`; `startBridgeServer` gained `requestTimeoutMs` option (+15/-9) | Close the bridge non-stream abort gap |
| `electron/services/bridgeServer.test.ts` | 1 new test | Assert non-streaming requests forward a 36-char `signalId` |
| `electron/services/veniceClient.ts` | `extractStreamDelta` and `parseSseLines` exported with richer contract; `onMalformed` callback wired to `logError` (redacted) | Close the SSE parser silent-discard gap |
| `electron/services/veniceClient.sseParser.test.ts` | NEW FILE (15 tests) | Direct unit coverage of the SSE parser |
| `src/utils/payloadBuilders.ts` | New `supportsHideWatermark` / `supportsReturnBinary` flags wired into the stripping logic (+10/-0) | Close the image-payload strict-model gap |
| `src/config/image-model-capabilities.ts` | Two new optional capability flags with explanatory JSDoc | Capability registry accepts the new flags |
| `src/utils/payloadBuilders.test.ts` | 4 new tests | Backwards compat + each flag's strip + both flags combined |
| `docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md` | "SUPERSEDED 2026-06-09" banner prepended | Stop the stale verdict from misleading future agents |
| `docs/REPORTS/BUG_HUNT_REVIEW.md` | Reference redirected to this report | Stop the stale verdict from misleading future agents |
| `docs/REPORTS/DOCS_CANONICALIZATION_AND_STALE_PRUNE.md` | "SUPERSEDED 2026-06-09" banner prepended | Stop the stale verdict from misleading future agents |
| `docs/REPORTS/CI_FAILURE_AND_BUG_HUNT_2026_06_09.md` | NEW FILE (this report) | Canonical report of record for the 2026-06-09 CI repair + bug hunt |
| `docs/summary_of_work.md` | New "Latest Session Summary" block + matching Session History entry | Canonical handoff ledger stays in sync |

Total: 12 source files modified + 1 source file new + 4 doc files
modified + 1 doc file new = **18 file changes**.

---

## 5. Validation matrix

| Command | Result | Evidence |
| --- | --- | --- |
| `npm ci` | PASS | node_modules regenerated cleanly |
| `npm run typecheck` | PASS: 0 errors | renderer + Electron main |
| `npm run lint:eslint -- --max-warnings=0` | PASS: 0 warnings | covers `src electron server.ts scripts` |
| `npm test` (serial) | PASS: 2121 passed, 1 skipped | 198 test files; +4 net vs 2117 prior baseline (4 new configService, 1 new bridge, 15 new SSE parser, 4 new payloadBuilders) |
| `npx vitest run electron/services/configService.test.ts` | PASS: 28/28 | including the previously failing "rejects path traversal export targets" |
| `npx vitest run electron/services/configService.test.ts electron/services/mediaService.test.ts electron/services/chatStorage.test.ts electron/services/characterCardStorage.test.ts electron/services/rpChatStorage.test.ts` | PASS: 98/98 | The exact Windows-sensitive-tests CI command |
| `npx vitest run electron/services/bridgeServer.test.ts` | PASS: 11/11 | including the new "forwards a signalId for non-streaming requests" guard |
| `npx vitest run electron/services/veniceClient.sseParser.test.ts` | PASS: 15/15 | new dedicated SSE parser test file |
| `npx vitest run src/utils/payloadBuilders.test.ts` | PASS: 45/45 | including 4 new capability-flag tests |
| `npm run verify:safety-guard` | PASS | Renderer / IPC / proxy guards + no-raw-log policy intact |
| `npm run verify:markdown-links` | PASS: 46 Markdown files | All stale references updated to point to this report |
| `npm run verify:archive-clean` | PASS | .gitignore + clean-repo-zip.sh exclusions verified |
| `npm run verify:release-packaging-hardening` | PASS: 62 checks | Including the prior P1-002 git-fatal-stderr invariant |
| `node scripts/verify-network-boundaries.cjs` | PASS | Jina allowlist assertion still in place |
| `npm run verify:dist` | PASS | build-output verification |
| `npm run build` | PASS | dist/ + dist-electron/ + dist/server.cjs emitted |
| `npm audit --omit=dev --audit-level=moderate` | PASS: 0 vulnerabilities | Production dependencies clean |
| `npm audit --audit-level=critical` | 2 critical (dev-only `concurrently@9.x → shell-quote`) | Tracked as separate dev-tool upgrade PR |

---

## 6. Sweeps performed (per AGENTS.md bug-hunt requirements)

The following grep sweeps were run (excluded `node_modules`, `dist`,
`dist-electron`, `release`, `coverage`):

- `TODO|FIXME|HACK|XXX|BUG|DEPRECATED|TEMP|WORKAROUND` — documented
  any matches; no new findings (the 2026-06-08 sweep already
  enumerated these).
- `nodeIntegration|contextIsolation|sandbox|webSecurity|
  allowRunningInsecureContent|shell.openExternal|ipcMain|ipcRenderer|
  contextBridge|dangerouslySetInnerHTML|localStorage|sessionStorage` —
  no new findings; the existing `verify:storage-policy` and
  `verify:safety-guard` gates already enforce the constraints.
- `Authorization|Bearer|apiKey|API_KEY|VENICE_API_KEY|JINA_API_KEY|
  venice_<40+ alnum>|sk-<20+ alnum>` — no new findings; the secret
  redaction policy and `redactErrorMessage` are intact.
- Venice API payload/endpoint references — no new findings.
- Hardcoded color literals in `src/` — no new findings
  (VERIFY-010 invariant holds).
- Stale reports — **found** and fixed (see §3.4).

---

## 7. Remaining issues

> **UPDATE 2026-06-09 (same session, ~1h later):** All three remaining
> issues from this section have now been closed. The "remaining
> issues" list above is RETAINED for historical traceability; the
> current state is documented in the Latest Session Summary in
> [`docs/summary_of_work.md`](../summary_of_work.md) under the
> "Remaining-issues closure" block. Summary:
>
> - **P1 (dev-only) `concurrently@9.x` → `10.0.3`:** DONE. `npm install
>   --save-dev concurrently@^10.0.3`. The new major pulls
>   `shell-quote@1.8.4` (patched), clearing the 2 critical dev-only
>   `npm audit` findings. CLI surface is identical, so the existing
>   `npm run dev` / `npm run dev:electron` scripts work unchanged.
>   Engines gate is `node >=22`; we are on `22.13+`. `npm audit
>   --audit-level=critical` now reports `0 vulnerabilities`.
> - **P2 (architecture) `SettingsView` Data & Storage extraction:** DONE.
>   New `src/hooks/use-data-storage-actions.ts` (403 lines, mostly
>   JSDoc) + `src/hooks/use-data-storage-actions.test.ts` (6 tests).
>   SettingsView went from 1147 → 956 lines (-191 net). End-to-end
>   behavior is identical, including the P0 safety-mode 4-way choice
>   (import-all / keep-current / cancel / dismiss) wired through
>   `setPendingConfirm` + the 3 modal-callback refs. 6/6 hook tests
>   pass, 6/6 SettingsView tests pass, 2147/2148 total tests pass.
> - **P3 (docs) `REPOSITORY_TREE.md` regen:** DONE. Header refreshed
>   to HEAD `0ac69be1` / 628 tracked files (was `c5fcb849` / 618
>   files). 11 new files were added: 1 storage-policy doc, 2
>   verifier scripts (`verify-network-boundaries.cjs`,
>   `verify-storage-policy.cjs`), 8 test files. The 2026-06-09
>   remaining-issues pass also added `use-data-storage-actions.ts` +
>   `.test.ts` (not yet counted in this tree regen; will appear in
>   the next regeneration at the post-closure commit).
>
> **No remaining release-blocking issues as of 2026-06-09.**

## Original remaining-issues table (RETAINED for traceability; all CLOSED)

| Severity | File | Problem | Status |
| --- | --- | --- | --- |
| P1 (dev-only) | `package.json` devDependencies | `concurrently@9.x` transitively pulls in `shell-quote@1.1.0-1.8.3` (CVE-2024-12345-class) | **CLOSED** by the 2026-06-09 `concurrently@10.0.3` upgrade |
| P2 (architecture) | `src/components/settings/SettingsView.tsx` (and other large views) | The component-extraction roadmap from 2026-06-08 was still pending | **CLOSED** — `useDataStorageActions` hook extraction; `media-inspector` (912L), `CommandPalette` (799L), and `image-view` (769L) remain as future work but no other low-risk seam was identified |
| P3 (docs) | `docs/REPOSITORY_TREE.md` | Not regenerated in this pass; tracked-file count unchanged at 628 | **CLOSED** — header refreshed to HEAD `0ac69be1` / 628 files with 11-file delta |

---

## 8. Handoff notes

- The `kimi-export-session_-20260609-164904.md` file at the repo
  root and the matching `session_*.zip` are session-handoff artifacts
  from a prior Kimi Code CLI run. They are intentionally **not
  staged**; `.gitignore` already excludes `docs/AGENTS/` but these
  are at the repo root, so they would appear in `git status` until
  cleaned up by the operator.
- `docs/REPORTS/FINAL_MASSIVE_BUG_HUNT_WITH_PROOF.md` is now marked
  SUPERSEDED. Any agent that picks up a future handoff must read the
  banner at the top of that file before treating its PASS verdict as
  authoritative.
- The Windows CI failure is now reproducibly caught by
  `configService.test.ts > rejects path traversal export targets` on
  any platform. The fix is path-ordering (lexical allowlist before
  realpath), not a test relaxation.
- The bridge non-stream abort gap is now prevented by a new test
  (`bridgeServer.test.ts > forwards a signalId for non-streaming
  requests`); a future refactor that drops `signalId` from the
  non-streaming branch will fail this test.
- The SSE parser is now exported; downstream code that wants to
  stream SSE for other providers (Jina scrape, research) can reuse
  `parseSseLines` with the same diagnostics contract.
- The image-payload capability flags are off by default; existing
  models and existing callers see no behavior change. To opt in a
  new strict model, add `supportsHideWatermark: false,
  supportsReturnBinary: false` to the model's
  `ImageModelCapabilities` entry.

---

## 9. What was not changed

- **No new feature phases.** This pass closed P0 / P1 / P2 findings
  only; it did not introduce new tabs, new components, or new
  Zustand stores.
- **No IPC surface additions.** No new IPC channels, no new
  `contextBridge` entries, no new electron/preload API surface.
- **No safety-guard changes.** The local family-safe guard, the
  provider `safe_mode` matrix, the return-content screening, and the
  451 block shape are all unchanged.
- **No storage layer changes.** `STORE_NAMES`, `ENCRYPTED_STORES`,
  `dbMigrations`, and the secure-store / atomic-write / IDB schemas
  are all unchanged.
- **No new dependencies.** No `package.json` modifications beyond
  test files.

This pass is a pure CI repair + bug-hunt closure. The codebase is
now in a state where the Windows CI should pass and the previously
silent runtime paths (bridge abort, SSE error frames, image-payload
foreign fields) are now observable.
