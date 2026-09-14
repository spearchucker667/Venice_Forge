# Runtime Test Results — Venice Forge Exhaustive Audit (2026-09-13)

**Audit baseline SHA:** `2f672682d57f82e5cd2d0ecefa42a4a525a9504c`  
**Platform:** macOS Darwin 25.3.0 arm64

---

## 1. Packaged Application Launch & Smoke Validation

### 1.1 Packaged CSP Verification (`tests/smoke/packaged-launch-csp.test.ts`)
- **Background:** The prior audit (`c6d9bed3`) discovered that `packaged-launch-csp.test.ts` probed eval-blocking via `new Function()` inside `page.evaluate`, which Chromium exempts from page CSP via CDP, causing deterministic failure. Commit `cd27ebc2` replaced the probe with a real page-context inline event-handler attribute (`<button onclick="...">`) listening for `securitypolicyviolation`.
- **Runtime Execution:**
  - Tested against local packaged macOS arm64 binary (`release/mac-arm64/Venice Forge.app`).
  - Command: `RUN_ELECTRON_SMOKE=true npx vitest run tests/smoke/packaged-launch-csp.test.ts`
  - Result: **3/3 PASS** (launch without style violations, negative control violation, inline-script block).
  - Confirming: The CSP probe defect (`VF-AUD-20260912-C6-P1-001`) is **fully resolved** at HEAD.

### 1.2 Packaged Onboarding & Profile Bootstrap (`tests/smoke/packaged-onboarding-profile-bootstrap.test.ts`)
- **Runtime Execution:**
  - Launches packaged application into an isolated temporary user-data directory.
  - Verifies first-run splash modal, default profile creation, and clean window initialization.
  - Result: **PASS** across clean bootstrap.

---

## 2. Reproduction of New Audit Findings

### 2.1 Runtime Reproduction of `VF-AUD-20260913-P1-001` (Strict i18n Release Gate)
- **Command:** `node scripts/verify-i18n.cjs --strict`
- **Result:** Terminated with status code 1.
- **Diagnostics:**
  - 55 missing-marker leaves across 11 non-English catalogs.
  - Discovered that the 5 newly added strings (`searchVault`, `profileNameCannotBeEmpty`, `maximumProfileLimitReached`, `replicateQueued`, `replicateQueuedDetail`) have not been translated.
  - Direct blocker for `.github/workflows/release.yml`.

### 2.2 Runtime Reproduction of `VF-AUD-20260913-P1-003` (Remote Tombstone Rejection)
- **Harness:** Simulated incoming sync packet in test environment.
- **Execution:**
  1. `syncFolderWatcher` receives tombstone for `recordId = "conv_123"`, `storeName = "tombstones"`.
  2. Issues grant: `{ operationId: "op_1", storeName: "tombstones", recordId: "conv_123" }`.
  3. Renderer receives packet and calls `applyRemoteMutation({ storeName: "conversations", id: "conv_123", delete: true, remoteApplyToken })`.
  4. IPC handler calls `validateMutationAuthority("remote-sync", token, "conversations", "conv_123")`.
  5. `validateMutationAuthority` checks `grant.storeName === "conversations"`.
  6. `grant.storeName` is `"tombstones"`. Check evaluates to `false`.
  7. Mutation rejected with error: `"Remote mutation authority rejected."`.
- **Verdict:** Confirmed defect in production sync authority logic.

### 2.3 Runtime Reproduction of `VF-AUD-20260913-P1-004` (SSE CRLF Chunk Split)
- **Harness:** Direct execution against `SseStreamDecoder` (`src/shared/sseStreamDecoder.ts`).
- **Execution:**
  - Push chunk 1: `Buffer.from("event: message\rdata: {\"test\":1}\r")`
  - Chunk 1 terminates on `\r`. `findLineEnd` consumes line up to `\r` and sets `lineEnd.length = 1`.
  - Push chunk 2: `Buffer.from("\nevent: message\r\ndata: {\"test\":2}\r\n\r\n")`
  - Chunk 2 starts with `\n`. `findLineEnd` sees `\n` at index 0 and extracts `""` (empty line).
  - In SSE, an empty line triggers `dispatchEvent()`, prematurely dispatching an event before the data block is finished.
- **Verdict:** Confirmed streaming chunk boundary defect.
