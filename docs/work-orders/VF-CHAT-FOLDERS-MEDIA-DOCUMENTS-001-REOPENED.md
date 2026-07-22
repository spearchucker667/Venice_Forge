# Venice Forge — Reopened 9-Phase Work Order Ledger

**Work Order ID:** `VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001-REOPENED`  
**Reopen Date:** 2026-07-20 (Executed: 2026-07-22)  
**Target Branch:** `main`  
**Base Commit:** `ae1db1badf7d08ca32daf9c47ebc1181e3a288b9`  
**Canonical Owner Document:** `docs/work-orders/VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001-REOPENED.md`  

---

## Architectural Prohibitions (Mandatory Governance)

All tasks in this work order MUST obey these negative constraints without exception:

1. **No Direct Venice Network Construction:** Agent runtime modules, tools, components, and stores MUST NOT make direct `fetch()` or `axios` calls to `api.venice.ai`. All outbound Venice requests must use `performGuardedVeniceRequest()` or `veniceFetch()`.
2. **No Parallel Request Builders:** Each Venice API endpoint family must have exactly ONE canonical request construction and guarded transport adapter.
3. **No Renderer Filesystem Access:** Renderer processes must not read or write arbitrary OS filesystem paths, access OS secure storage, or manage encryption keys directly.
4. **No Renderer-Selected Profile Identities:** Main process IPC handlers must validate profile IDs and profile storage directory paths.
5. **No False-Success Toasts:** UI must not emit success notifications before durable storage write operations complete successfully.
6. **No Unsupported Backup Claims:** Folder export files must not claim to contain media or full conversation records unless serialized in the encrypted payload.
7. **No Misleading Encryption Terminology:** Folder Lock must be labeled as an "IPC Access Control / Privacy Gate" in UI and documentation, not as an "Encrypted Vault at Rest".
8. **No Premature Phase Closure:** Work order closure must be based on clean test runs (`npm run ci`), contract verifications (`npm run verify:contracts`), and 100% completed checklist items.

---

## 1. Reopened Remediation Backlog

## REOPENED-001 — Fix Release Metadata Contract Verifier

**Priority:** P1  
**Release gate:** beta  
**Status:** open  
**Subsystem:** Contract Verifiers (`scripts/verify-release-metadata.cjs`)  
**Evidence:** `npm run verify:contracts` fails with `[verify:release-metadata] FAIL - AGENTS.md version must match package.json.`  
**Problem:** `AGENTS.md` line 6 contains `> **Declared version:** 3.0.0-beta.1` while `verify-release-metadata.cjs` expects `**Version:** 3.0.0-beta.1`.  
**Required implementation:** Update `AGENTS.md` line 6 to include `**Version:** 3.0.0-beta.1` so the verifier checks string equality cleanly.  
**Do not:** Delete or bypass the `verify-release-metadata.cjs` check.  
**Acceptance criteria:**
- [ ] `AGENTS.md` line 6 contains `**Version:** 3.0.0-beta.1`.
- [ ] `npm run verify:release-metadata` completes with exit code 0.
- [ ] `npm run verify:contracts` passes cleanly.

**Validation:**
```bash
npm run verify:release-metadata
npm run verify:contracts
```

**Supersedes:** `VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001` Phase 9.1

---

## REOPENED-002 — Fix `chat-store.test.ts` Unit Test Failure

**Priority:** P1  
**Release gate:** beta  
**Status:** open  
**Subsystem:** Chat Store & Desktop Bridge (`src/stores/chat-store.ts`)  
**Evidence:** `npm run test:ci` fails 1 unit test in `src/stores/chat-store.test.ts` (`falls back to desktopChat.list when conversations returns an error`).  
**Problem:** Async hydration timing or mock resolution in `chat-store.test.ts` fails to catch `desktopConversations.list` error and fall back to `desktopChat.list`.  
**Required implementation:** Align `chat-store.ts` error handling and fallback routing so `desktopChat.list` fallback resolves reliably during initial load.  
**Do not:** Skip, comment out, or remove the failing test assertion.  
**Acceptance criteria:**
- [ ] `src/stores/chat-store.test.ts` passes 32/32 tests cleanly.
- [ ] `npm run test:ci` completes with zero test failures across all shards.

**Validation:**
```bash
npx vitest run src/stores/chat-store.test.ts
npm run test:ci
```

**Supersedes:** `VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001` Phase 9.2

---

## REOPENED-003 — Complete Itemized Verification Checklist for Chat Folders & Media

**Priority:** P1  
**Release gate:** release candidate  
**Status:** open  
**Subsystem:** Chat Folders & Work Order Audit  
**Evidence:** 577 unchecked checklist items in `docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md`.  
**Problem:** The 9-phase work order was prematurely declared closed despite incomplete checklist items across drag-drop, folder lock UI, limited document agent, and keyboard navigation.  
**Required implementation:** Systematically verify and execute each itemized checklist entry across Phases 1 through 9.  
**Do not:** Declare phases complete based solely on backend code existence.  
**Acceptance criteria:**
- [ ] Keyboard navigation for folder reordering verified and accessible.
- [ ] Folder Lock UI tooltips accurately identify feature as a Privacy Access Gate.
- [ ] Document Agent multi-file changeset execution preview verified.
- [ ] All 600 checklist items verified against live code and checked.

**Validation:**
```bash
grep -c "\[ \]" docs/work-orders/VENICE_FORGE_CHAT_FOLDERS_MEDIA_DOCUMENTS_2026-07-19.md
npm run verify:work-orders
```

**Supersedes:** `VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001` Phases 1.3-9.5

---

## REOPENED-004 — Full Aggregate CI Release Gate Validation

**Priority:** P0  
**Release gate:** final release  
**Status:** open  
**Subsystem:** CI & Release Packaging  
**Evidence:** `npm run ci` fails due to contract and test failures.  
**Problem:** Aggregate release command `npm run ci` cannot pass cleanly until P1-01 and P1-02 are remediated.  
**Required implementation:** Run and verify clean zero-error exit code for `npm run ci`.  
**Do not:** Disable strict audit or contract verifiers in `package.json`.  
**Acceptance criteria:**
- [ ] `npm run lint:eslint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run test:ci` passes (100% test pass rate).
- [ ] `npm run build` passes.
- [ ] `npm run verify:contracts` passes.
- [ ] `npm run ci` returns exit code 0.

**Validation:**
```bash
npm run ci
```

**Supersedes:** `VF-CHAT-FOLDERS-MEDIA-DOCUMENTS-001` Phase 9.9
