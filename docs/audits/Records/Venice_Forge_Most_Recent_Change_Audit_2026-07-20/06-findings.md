# 06 — Detailed Audit Findings

**Audit Date:** 2026-07-20 (Executed: 2026-07-22)  
**Target Repository:** `spearchucker667/Venice_Forge` (`main` branch)  

---

## 1. P0 Findings (Critical Integration & Boundary Defects)

### P0-01 — Folder Import Conversation and Message Restoration (Remediated / Verified Fixed)

**Status:** `stale finding` (Verified Fixed in Code)  
**Subsystem:** Chat Folders & Backup Service  
**Claim Source:** Historical Audit Hypothesis P0-01  
**Current Evidence:**
- `electron/services/chatFolderBackupService.ts:451-487` — `importBackup()` iterates through `manifest.conversations`, validates fields with `prepareImportedConversation()`, saves conversations via `saveConversation()`, and performs atomic rollback of created conversations on error.
- `electron/services/chatFolderBackupService.test.ts:45-120` — Test validates conversation restoration and rollback on failure.

**Expected Behavior:**  
Folder import must restore all conversations, messages, and attachment references contained in the encrypted `.vfbackup` payload.

**Observed Behavior:**  
The code was updated to perform full conversation iteration and atomic rollback on failure. Hypothesis P0-01 was remediated in `d21e9fd`.

**Impact:**  
High data integrity confidence for folder backup import.

**Root Cause:**  
Remediated initial stub logic.

**Required Acceptance Test:**  
Maintain `chatFolderBackupService.test.ts` import roundtrip assertions.

**Dependencies:** None  
**Confidence:** High  

---

### P0-02 — Default Profile Folder Import Path Resolution (Remediated / Verified Fixed)

**Status:** `stale finding` (Verified Fixed in Code)  
**Subsystem:** Chat Folders & Backup Service  
**Claim Source:** Historical Audit Hypothesis P0-02  
**Current Evidence:**
- `electron/services/chatFolderBackupService.ts:445-449` — Uses canonical `saveChatFolder(newFolder, profileId)` instead of hand-built filesystem paths.

**Expected Behavior:**  
Default profile imports land in `<userData>/chat-folders/<id>.json`, non-default profile imports land in `<userData>/chat-folders/profiles/<profileId>/<id>.json`.

**Observed Behavior:**  
Code delegates to `saveChatFolder()`, which uses `getChatFoldersDir(profileId)`.

**Impact:** Profile path isolation enforced.

**Root Cause:** Remediated manual path building.

**Required Acceptance Test:** `chatFolderStorage.test.ts` profile path verification.

**Dependencies:** None  
**Confidence:** High  

---

### P0-03 — Agent Generated Media Reference Contract (Remediated / Verified Fixed)

**Status:** `stale finding` (Verified Fixed in Code)  
**Subsystem:** Agent Runtime & Media Tools  
**Claim Source:** Historical Audit Hypothesis P0-03  
**Current Evidence:**
- `electron/agent/runtime/chat-agent-runner.ts:45-86` — `extractCanonicalChatMediaReferences()` validates and outputs a canonical `ChatMediaReferenceContract[]`.
- `src/components/chat/message-bubble.tsx:120-145` — Consumes `metadata.generatedMedia` as `ChatMediaReference[]`.

**Expected Behavior:**  
Agent-generated media must output a canonical `ChatMediaReference[]` attached to assistant message metadata.

**Observed Behavior:**  
Canonical reference extraction and bubble rendering active.

**Impact:** Prevents media display regressions in chat UI.

**Root Cause:** Remediated stub `{ mediaId, mimeType }` shape.

**Required Acceptance Test:** `chat-agent-runner.test.ts` media attachment assertions.

**Dependencies:** None  
**Confidence:** High  

---

### P0-04 — Tool-Runtime-First System Prompt Layering (Remediated / Verified Fixed)

**Status:** `stale finding` (Verified Fixed in Code)  
**Subsystem:** Agent Runtime Composition  
**Claim Source:** Historical Audit Hypothesis P0-04  
**Current Evidence:**
- `electron/agent/runtime/trusted-agent-request.ts:50-63` — `buildTrustedRuntimeLayer()` creates layer at priority 0 (`immutable: true`).
- `electron/agent/runtime/trusted-agent-request.ts:113-119` — Enforces `TRUSTED_PRIORITY_FLOOR = 0` (no layer can precede priority 0).

**Expected Behavior:**  
The trusted tool-runtime layer must be index 0, immutable, and immune to user prompt overrides.

**Observed Behavior:**  
Floor check and priority 0 ordering enforced during request composition.

**Impact:** Secures trusted date/time and tool availability context.

**Root Cause:** Remediated abstract unused helper.

**Required Acceptance Test:** `trusted-agent-request.test.ts` layer order assertions.

**Dependencies:** None  
**Confidence:** High  

---

### P0-05 — Agent Image Generation Request Path (Remediated / Verified Fixed)

**Status:** `stale finding` (Verified Fixed in Code)  
**Subsystem:** Agent Tool Execution & Security Pipeline  
**Claim Source:** Historical Audit Hypothesis P0-05  
**Current Evidence:**
- `electron/agent/runtime/agent-tool-executor.ts:268-273` — `media.generateImage` delegates to `performGuardedVeniceRequest({ endpoint: "/image/generate", ... })`.

**Expected Behavior:**  
All agent media tool executions must pass through the canonical guarded Venice request pipeline.

**Observed Behavior:**  
Uses `performGuardedVeniceRequest()`, enforcing Family Safe Mode and secret redaction.

**Impact:** Prevents unmonitored API calls or bypass of safe mode controls.

**Root Cause:** Remediated direct `fetch` in tool runner.

**Required Acceptance Test:** `agent-tool-executor.test.ts` guard pipeline delegation test.

**Dependencies:** None  
**Confidence:** High  

---

## 2. P1 Findings (Major Defects, Contract Failures & Architectural Gaps)

### P1-01 — Release Metadata Contract Verifier Failure (`verify:release-metadata`)

**Status:** `broken`  
**Subsystem:** Contract Verifiers & Release Automation  
**Claim Source:** Direct Execution Evidence (`npm run verify:contracts`)  
**Current Evidence:**
- `scripts/verify-release-metadata.cjs:17` — `if (!agents.includes("**Version:** " + version)) failures.push(...)`
- `AGENTS.md:6` — Line 6 contains `> **Declared version:** 3.0.0-beta.1` instead of `**Version:** 3.0.0-beta.1`
- `npm run verify:contracts` output:
  ```text
  [verify:release-metadata] FAIL
  - AGENTS.md version must match package.json.
  ```

**Expected Behavior:**  
`npm run verify:contracts` must pass cleanly across all static contract verifiers.

**Observed Behavior:**  
`verify:release-metadata` fails due to string format mismatch in `AGENTS.md`.

**Impact:** Blocks CI/pre-PR validation script (`npm run verify:contracts` exit code 1).

**Root Cause:** `AGENTS.md` line 6 updated label to `Declared version:` without updating `verify-release-metadata.cjs`.

**Required Correction:** Update `AGENTS.md` line 6 to include `**Version:** 3.0.0-beta.1` or adjust `verify-release-metadata.cjs` regex to accept both formats.

**Required Acceptance Test:** `npm run verify:release-metadata` returns `[verify:release-metadata] OK`.

**Dependencies:** None  
**Confidence:** High  

---

### P1-02 — Store Unit Test Failure (`src/stores/chat-store.test.ts`)

**Status:** `broken`  
**Subsystem:** Chat Store & Desktop Bridge Integration  
**Claim Source:** Direct Execution Evidence (`npm run test:ci`)  
**Current Evidence:**
- `src/stores/chat-store.test.ts:154` — Assertion `expect(state.conversations.some((c) => c.id === 'legacy-1')).toBe(true)` fails.
- `npm run test:ci` output:
  ```text
  FAIL src/stores/chat-store.test.ts > chat-store desktopBridge routing > falls back to desktopChat.list when conversations returns an error
  AssertionError: expected false to be true
  ```

**Expected Behavior:**  
When `desktopConversations.list` fails or returns an error, `chat-store` must fall back to `desktopChat.list` and populate legacy conversations.

**Observed Behavior:**  
The unit test assertion fails because state hydration timing or fallback mock setup in `chat-store.test.ts` returns `false`.

**Impact:** `npm run test:ci` fails (exit code 1), blocking CI release gate.

**Root Cause:** Mismatch between async module initialization in Vitest mock environment and store hydration logic.

**Required Correction:** Align `chat-store.ts` fallback error catching with `chat-store.test.ts` async mock resolution.

**Required Acceptance Test:** `npx vitest run src/stores/chat-store.test.ts` passes all 32 tests.

**Dependencies:** None  
**Confidence:** High  

---

### P1-03 — Premature 9-Phase Work Order Closure (577 Unchecked Checklist Items)

**Status:** `verified`  
**Subsystem:** Project Management & Quality Audit  
**Claim Source:** Work Order `VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001` (`docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md`)  
**Current Evidence:**
- `docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md` — 23 checked items vs 577 unchecked items (`grep -c "\[ \]"` = 577).
- `docs/reports/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_REPORT_2026-07-19.md` — Declared work order closed.

**Expected Behavior:**  
A work order may be marked closed only when code, UI, end-to-end integration, and checklist items are verified and checked.

**Observed Behavior:**  
Work order was marked closed despite 577 unchecked verification checklist items.

**Impact:** Conceals remaining technical debt, untested edge cases, and accessibility gaps.

**Root Cause:** Premature narrative closure without completing itemized work-order verification.

**Required Correction:** Reopen `VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001` via consolidated work order `VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001-REOPENED.md`.

**Required Acceptance Test:** All itemized acceptance criteria in reopened work order verified and checked against live tests.

**Dependencies:** P1-01, P1-02  
**Confidence:** High  

---

### P1-04 — Folder Lock Storage Model Ambiguity (Privacy Gate vs Encrypted Vault)

**Status:** `partial`  
**Subsystem:** Chat Folder Security & Persistence  
**Claim Source:** Historical Audit Hypothesis P1-03  
**Current Evidence:**
- `electron/services/chatFolderLockService.ts:116-120` — `lockFolder()` wraps folder key in `secureStore` and sets `folder.lockState = "locked"`.
- `electron/services/chatFolderStorage.ts:30` — Stored conversation files on disk remain plain unencrypted JSON (`conversations/<id>.json`).

**Expected Behavior:**  
Documentation and UI must clearly state whether folder lock is an access control / privacy gate or per-folder encrypted storage at rest.

**Observed Behavior:**  
The implementation acts as an access control / privacy gate in UI/IPC. Conversation files on disk are not encrypted by the folder key.

**Impact:** Potential user misunderstanding regarding threat model (privacy gate vs at-rest encryption).

**Root Cause:** Architecture choice to implement IPC access gating without rewrite of on-disk storage format.

**Required Correction:** Document folder lock explicitly as an IPC Access Control / Privacy Gate in UI tooltips and security docs.

**Required Acceptance Test:** UI modal states "Privacy Gate / Access Lock" rather than "Encrypted Vault".

**Dependencies:** None  
**Confidence:** High  

---

## 3. P2 & P3 Findings (Hygiene, Documentation & Secondary Gaps)

### P2-01 — Stack Fact Documentation Drift

**Status:** `verified`  
**Subsystem:** Repository Documentation  
**Claim Source:** `docs/DEVELOPMENT/`, `docs/AGENTS/`  
**Current Evidence:**
- Historical text in documentation references `Electron 42`, `Vite 6`, `Express 4`.
- `package.json` uses Electron `^34.0.0`, Vite `^6.0.7`, Express `^4.21.2`.

**Expected Behavior:**  
Documentation must reflect active `package.json` version ranges.

**Observed Behavior:**  
Stale version mentions exist in secondary docs.

**Impact:** Minor developer confusion.

**Required Correction:** Sync secondary docs with `package.json`.

---

### P2-02 — Keyboard Accessibility for Folder Reordering

**Status:** `partial`  
**Subsystem:** Chat Folder UI (`HistoryView.tsx`)  
**Current Evidence:**
- `src/components/chat/HistoryView.tsx:350-420` — Drag-and-drop works; ARIA menu move present, but arrow-key reorder lacks keyboard listener.

**Expected Behavior:**  
Full keyboard accessibility for folder reordering and move operations.

**Observed Behavior:**  
Menu-based move present; direct keyboard drag-reorder absent.

**Impact:** Minor accessibility gap for power users.

**Required Correction:** Add keyboard event handler for folder list item reorder.
