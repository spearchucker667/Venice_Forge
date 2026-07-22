# 07 — Empirical Validation Results

**Audit Date:** 2026-07-20 (Executed: 2026-07-22)  
**Target Repository:** `spearchucker667/Venice_Forge` (`main` branch)  

---

## 1. Environment & Runtime Context

```text
Platform:        Darwin Kernel Version 27.0.0 (macOS arm64 Apple Silicon)
Node.js:         v26.5.0
npm:             11.17.0
Git:             2.55.0
Package Version: 3.0.0-beta.1
Lockfile:        package-lock.json (lockfileVersion 3)
```

---

## 2. Command Execution Summary

| Command | Category | Working Dir | Exit Code | Result | Key Observations / Output Snippet |
| ------- | -------- | ----------- | --------- | ------ | --------------------------------- |
| `npm run typecheck` | Static Typing | `/` | `0` | **PASS** | `tsc --noEmit && tsc --noEmit --project tsconfig.electron.json` completed cleanly with zero type errors. |
| `npm run lint:eslint` | Static Lint | `/` | `0` | **PASS** | `eslint src electron server.ts scripts --max-warnings=0` completed cleanly with zero lint warnings/errors. |
| `npm run build` | Build Bundle | `/` | `0` | **PASS** | Vite renderer bundle built in `dist/`, Express server built in `dist/server.cjs`, Electron main/preload bundled in `dist-electron/`. |
| `npm run verify:contracts` | Contract Gate | `/` | `1` | **FAIL** | `[verify:release-metadata] FAIL - AGENTS.md version must match package.json.` (P1-01). |
| `npm run test:ci` | Test Suite | `/` | `1` | **FAIL** | `test:server` (59 passed), `test:electron` (753 passed), `test:ingestion` (65 passed). `test:unit:stores:chat` failed 1 test in `src/stores/chat-store.test.ts` (P1-02). |
| `npm run ci` | Aggregate Gate | `/` | `1` | **FAIL** | Fails at contract verification and test suite steps. |

---

## 3. Focused Test Suite Breakdown

### 3.1 `npm run test:server`
- **Executed:** `vitest run server.test.ts --exclude 'electron/**/*'`
- **Status:** **PASS**
- **Test Results:** 1 file passed, 59 tests passed (131ms).

### 3.2 `npm run test:electron`
- **Executed:** `vitest run electron --exclude 'tests/smoke/**/*' --exclude 'tests/electron/**/*'`
- **Status:** **PASS**
- **Test Results:** 70 files passed, 753 tests passed (26.76s). Includes `chatFolderBackupService.test.ts`, `chatFolderLockService.test.ts`, `chatFolderStorage.test.ts`, `agent-tool-executor.test.ts`, `chat-agent-runner.test.ts`, `trusted-agent-request.test.ts`, `videoRetrieveService.test.ts`, `backupCrypto.test.ts`.

### 3.3 `npm run test:ingestion`
- **Executed:** `vitest run src/services/ingestion --no-file-parallelism`
- **Status:** **PASS**
- **Test Results:** 9 files passed, 65 tests passed (4.84s). Includes `pdfIngestion.test.ts`, `docxIngestion.test.ts`, `attachmentAssembler.test.ts`.

### 3.4 `npm run test:unit:stores`
- **Executed:** `node scripts/run-bounded-test-shards.cjs test:unit:stores:core test:unit:stores:chat test:unit:stores:features test:unit:stores:integration`
- **Status:** **FAIL**
- **Shards:**
  - `test:unit:stores:core`: 16 files passed, 379 tests passed (7.80s).
  - `test:unit:stores:chat`: 1 failed, 8 passed (98 tests total, 1 failure).
    - **Failure:** `src/stores/chat-store.test.ts > chat-store desktopBridge routing > falls back to desktopChat.list when conversations returns an error`. `AssertionError: expected false to be true`.

### 3.5 Contract Verifiers (`npm run verify:contracts`)
- **Static Verifiers Executed:**
  - `verify:lockfile` — OK
  - `verify:repository-identity` — OK
  - `verify:roadmap-current` — OK
  - `verify:release-metadata` — **FAIL** (`AGENTS.md` format mismatch)

---

## 4. Empirical Verdict Based on Command Evidence

While core compilation (`typecheck`), linting (`lint:eslint`), production bundling (`build`), Electron backend tests (`test:electron`), and server tests (`test:server`) pass cleanly, the repository fails aggregate release gates due to:
1. `npm run verify:contracts` failure (`verify:release-metadata`).
2. `npm run test:ci` failure (`chat-store.test.ts`).

Therefore, the snapshot cannot be classified as release-ready.
