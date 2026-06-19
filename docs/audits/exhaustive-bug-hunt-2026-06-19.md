# Venice Forge v2.1.0 — Exhaustive Bug Hunt & Security Audit

**Date:** 2026-06-19  
**Auditor:** Antigravity (senior automated review pass)  
**Repository:** `Windows-Venice-API-connector` (`spearchucker667/Venice_Forge`)  
**Target version:** `v2.1.0` (working tree)  
**Stack:** Electron 42 + React 19 + Vite + TypeScript strict + Express 4 + Vitest 4

---

## Baseline

| Gate | Result |
|------|--------|
| `npm run verify:contracts` (22+ sub-verifiers) | ✅ PASS |
| `npm run verify:safety-guard` | ✅ PASS |
| `npm run verify:storage-policy` | ✅ PASS |
| `npm run verify:network-boundaries` | ✅ PASS |
| `npm run verify:release-packaging-hardening` | ✅ PASS |
| `npm run verify:ci-contract` | ✅ PASS |
| `npm run verify:theme-tokens` | ✅ PASS |
| `npm run verify:image-policy` | ✅ PASS |
| `npm run verify:web-contents-view` | ✅ PASS |
| `npm run verify:markdown-links` | ✅ PASS |
| `npm run verify:storage-privacy` (VERIFY-050) | ✅ PASS |
| `npm run verify:model-aware-recipes` (VERIFY-043) | ✅ PASS |
| `npm run verify:scene-composer` (VERIFY-047) | ✅ PASS |
| `npm run verify:prompt-library` (VERIFY-046) | ✅ PASS |
| `npm run verify:rp-studio-polish` (VERIFY-048) | ✅ PASS |
| `npm run build` | ✅ PASS |
| `npm run verify:dist` | ✅ PASS |
| `npm test` | ✅ **3305 passed / 1 skipped / 0 failed** (263 test files) |

---

## Confirmed Defects

### BUG-001 — **MEDIUM**: Inconsistent HTTP 451 body shape for Jina/scrape endpoints

**Severity:** Medium — API contract violation; breaks uniform error handling in client code.

**File:** [`server.ts`](file:///Users/super_user/Projects/Windows-Venice-API-connector/server.ts)

**Evidence (line numbers):**
- **Venice proxy** (lines 512–517): `{ error, reasonCode, category, severity }` — all fields present.
- **Jina proxy** (lines 588–589): `{ error: decision.userMessage }` — **missing** `reasonCode`, `category`, `severity`.
- **Scrape proxy** (lines 727–728): `{ error: decision.userMessage }` — **missing** `reasonCode`, `category`, `severity`.

**Canonical shape per AGENTS.md:**
```
{ ok: false, status: 451, body: { error, reasonCode, category, severity } }
```

**Impact:** If a Jina or scrape request triggers a Local Family Safe Mode block, the client receives a structurally different 451 body than for Venice calls. Any renderer code that reads `reasonCode` or `category` on a Jina/scrape 451 will get `undefined`.

**Root cause:** The Venice proxy path was written (or updated) to follow the canonical shape; the Jina and scrape 451 paths were not updated to match.

---

### BUG-002 — **LOW/MEDIUM**: Hardcoded model string `'llama-3.3-70b'` in `chat-view.tsx` diverges from `DEFAULT_CHAT_MODEL` constant

**Severity:** Low–Medium — incorrect last-resort fallback if the canonical constant changes.

**File:** [`src/components/chat/chat-view.tsx`](file:///Users/super_user/Projects/Windows-Venice-API-connector/src/components/chat/chat-view.tsx#L38)

**Evidence (line 38):**
```ts
const model = selectedModel || models?.[0]?.id || 'llama-3.3-70b'
```

**Constants file:** [`src/constants/venice.ts`](file:///Users/super_user/Projects/Windows-Venice-API-connector/src/constants/venice.ts#L122)
```ts
export const DEFAULT_CHAT_MODEL = "venice-uncensored";
```

**Impact:** The `chat-view.tsx` tertiary fallback (`'llama-3.3-70b'`) contradicts the repository-wide `DEFAULT_CHAT_MODEL` constant (`"venice-uncensored"`). If `selectedModels.chat` is empty and the model catalog fails to load, the chat view uses a different model than `CharactersView.tsx` (which does use `DEFAULT_CHAT_MODEL`) and `chat-store.ts`.

**Additional hardcoded occurrences:**
- [`src/components/CharactersView.tsx`](file:///Users/super_user/Projects/Windows-Venice-API-connector/src/components/CharactersView.tsx#L189): `|| "llama-3.3-70b"` — also bypasses `DEFAULT_CHAT_MODEL`
- [`src/stores/media-send-to.ts`](file:///Users/super_user/Projects/Windows-Venice-API-connector/src/stores/media-send-to.ts#L185): `|| "venice-uncensored-1-2"` — an old versioned model ID, not the canonical constant
- [`src/components/workflows/workflows-view.tsx`](file:///Users/super_user/Projects/Windows-Venice-API-connector/src/components/workflows/workflows-view.tsx#L62): Template defaults use `'llama-3.3-70b'` (acceptable as illustrative template data, but undocumented as intentional)

---

### BUG-003 — **LOW**: Circuit breaker does NOT gate multiple concurrent requests during half-open transition

**Severity:** Low — race condition degrades the half-open "single probe request" guarantee; functional impact is limited (overshoot, not silent bypass).

**File:** [`server.ts`](file:///Users/super_user/Projects/Windows-Venice-API-connector/server.ts#L404-L416)

**Evidence:**
```ts
app.use("/api/venice", (req, res, next) => {
  if (Date.now() < circuitOpenUntil) {
    return res.status(503).json({ ... });
  }
  // Enter half-open state if timeout has expired
  if (circuitOpenUntil > 0 && Date.now() >= circuitOpenUntil) {
    circuitHalfOpen = true;
    circuitOpenUntil = 0;   // ← set to 0
  }
  next();
});
```

**Race:** When the cooldown expires, all concurrent requests pass the `Date.now() < circuitOpenUntil` check (which is now `Date.now() < 0 = false`). All set `circuitHalfOpen = true` and all call `next()`. The standard pattern is to let only one probe request through while holding the rest in OPEN state.

**Impact:** Minor — the circuit still re-opens on the next upstream 5xx, and recovers correctly on 2xx. No correctness failure; only the "single probe" property is weakened.

---

### BUG-004 — **LOW**: `meshSurfaceInvariant.test.ts` scans only 6 files; `border-border` violations in ≥10 other components are invisible to the guard

**Severity:** Low — regression guard has incomplete coverage; theme-token violations in newly-added components go undetected.

**File:** [`tests/theme/meshSurfaceInvariant.test.ts`](file:///Users/super_user/Projects/Windows-Venice-API-connector/tests/theme/meshSurfaceInvariant.test.ts)

**Evidence:** `SCAN_FILES` is a hard-coded list of 6 files. Confirmed `border-border` usages exist in at minimum:
- `src/components/research/ResearchWorkspaceView.tsx`
- `src/components/image/generation-view.tsx`
- Others added during Phase 2D–2K development

**`verify:theme-tokens`** uses `SCAN_ROOTS = ["src/App.tsx", "src/components"]` and covers the full component tree, but the mesh invariant test targets a narrower pattern (`border-border` specifically) in a static allowlist. The two tests check different things and the allowlist has not been updated to match the component surface.

**Impact:** The mesh invariant guard PASSES without reflecting actual coverage of border-border usage.

---

### BUG-005 — **INFORMATIONAL**: 8 VERIFY-NNN IDs declared in `AGENTS.md` table have no matching comment tag in their designated test files

**Severity:** Informational — documentation/enforcement gap, no runtime impact.

**Affected IDs:** VERIFY-021, VERIFY-022, VERIFY-023, VERIFY-030, VERIFY-031, VERIFY-032,034, 056

**Evidence:** `comm -23` of all VERIFY IDs extracted from code files vs. AGENTS.md table produces:
```
VERIFY IDs in AGENTS.md NOT in code: VERIFY-021, -022, -023, -030, -031, -032, -034, -056
```
(VERIFY-033 is intentionally retired and documented as such.)

**Impact:** Tests exist and cover the described behaviors, but the comment-level traceability (`// VERIFY-NNN regression guard`) is absent, weakening the audit trail.

---

### BUG-006 — **INFORMATIONAL**: `VERIFY-168` exists in source but is not registered in `AGENTS.md`

**Severity:** Informational — orphaned VERIFY ID.

**Files:**
- [`src/services/storagePrivacyService.test.ts`](file:///Users/super_user/Projects/Windows-Venice-API-connector/src/services/storagePrivacyService.test.ts#L60) — `T-168 / VERIFY-168`
- [`src/services/storagePrivacyService.ts`](file:///Users/super_user/Projects/Windows-Venice-API-connector/src/services/storagePrivacyService.ts#L199) — comment reference

**Impact:** The guard exists and executes. It is simply not registered in the canonical table, so it cannot be audited from the AGENTS.md tracking document.

---

### BUG-007 — **INFORMATIONAL**: Runtime Node.js version (`v26.3.0`) violates `engines` constraint (`>=22.13.0 <23`)

**Severity:** Informational — development environment only; CI enforces Node 22 via `actions/setup-node`.

**Evidence:**
```
package.json: "engines": { "node": ">=22.13.0 <23" }
node --version: v26.3.0
```

**Impact:** Zero CI impact (all jobs use `node-version: 22`). Local development on Node 26 may expose behavioral differences in native modules, `fs.rename` semantics, or `crypto` APIs that do not surface on CI.

---

## Refuted Leads (No Bug Found)

| Lead | Status | Finding |
|------|--------|---------|
| LEAD-004 Workflow tab | **REFUTED** | `WorkflowTemplatesView` is correctly mounted in `App.tsx`. |
| LEAD-006 Duplicate CodeQL | **REFUTED** | `codeql.yml` is the only workflow; no confirmed duplicate. |
| LEAD-007 Jina proxy JSON/non-JSON | **REFUTED** | Response handling correctly distinguishes JSON vs. plaintext. |
| LEAD-008 Prompt contamination | **REFUTED** | Venice-hosted character conversations have `conv.systemPrompt = undefined`; the ternary correctly returns the character's prompt (empty for hosted chars), not the global `systemPrompt`. |
| LEAD-009 Conversation model isolation | **REFUTED** | `createLocalCharacterConversation` sets `conv.systemPrompt = card.systemPrompt` and uses it exclusively; `DEFAULT_SYSTEM_PROMPT` does not leak into character conversations. |
| LEAD-011 Circuit breaker logic | **QUALIFIED** | Core state machine is correct. Half-open recovery works. Only the "single probe" race (BUG-003) is noted. |
| LEAD-012 Jina body cap | **REFUTED** | `express.json()` default (100 KB) is sufficient; only the URL string is consumed from the body. Separate `JINA_MAX_RESPONSE_BYTES` caps the upstream response. |
| LEAD-013 Rate-limit bypass via X-Forwarded-For | **QUALIFIED** | By default `req.ip` uses the socket IP (no spoofing risk). If deployed behind a proxy without `TRUST_PROXY`, the rate limiter keys on the proxy IP (all clients share a bucket). This is a deployment configuration gap, not a code defect. |
| LEAD-015 IPC channel completeness | **REFUTED** | All `ipcRenderer.invoke()` channels declared in `electron/preload.ts` have matching `ipcMain.handle()` / `handleIpc()` registrations across `electron/ipc/handlers.ts`, `configHandlers.ts`, `rpHandlers.ts`, `updates.ts`, and `researchBrowserServer.ts`. |
| LEAD-016 Windows path safety | **REFUTED** | `VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/` blocks path traversal. Temp file is co-located with the target (same device, atomic rename). No Windows reserved name matches the regex. |
| LEAD-014 Safety guard shape | **CONFIRMED → BUG-001** | See BUG-001 above. |
| LEAD-005 Mesh invariant coverage | **CONFIRMED → BUG-004** | See BUG-004 above. |
| LEAD-001 Workflow localStorage | **QUALIFIED** | `asyncStorageAdapter` uses localStorage only for one-time migration shim. Durable state goes to the `visualWorkflows` IndexedDB encrypted store. Pattern is documented. |
| LEAD-003 Sidebar search performance | **QUALIFIED** | `buildConversationSearchText` maps over all messages on every search invocation. For large conversation counts this is O(n × messages). No caching or debounce on the index build. Not a correctness bug but a potential UX regression at scale. |

---

## Security Assessment

### Electron Main Process

| Control | Status |
|---------|--------|
| `contextIsolation: true` | ✅ |
| `nodeIntegration: false` | ✅ |
| `sandbox: true` | ✅ |
| `webSecurity: true` | ✅ |
| `will-navigate` blocked unless `isTrustedExternalUrl` | ✅ |
| `setWindowOpenHandler` blocked unless `isTrustedExternalUrl` | ✅ |
| `shell.openExternal` gated behind native dialog confirmation | ✅ |
| `researchBrowser:openExternal` uses `isTrustedExternalUrl` + dialog | ✅ |
| CSP applied via `session.defaultSession.webRequest.onHeadersReceived` | ✅ |
| API key stored in `safeStorage` (Electron) / encrypted IDB (web) | ✅ |

### Web Proxy (Express)

| Control | Status |
|---------|--------|
| Endpoint allowlist (`isAllowedVeniceRequest`) | ✅ |
| Method allowlist | ✅ |
| Circuit breaker (5 failures / 30s reset) | ✅ (see BUG-003) |
| Request body cap (`MAX_PROXY_BODY_BYTES`) | ✅ |
| Jina host allowlist (`r.jina.ai`, `s.jina.ai`) | ✅ |
| Local Family Safe Mode guard on all routes | ✅ |
| Canonical 451 shape on Venice route | ✅ |
| **Canonical 451 shape on Jina/scrape routes** | ❌ **BUG-001** |
| SSRF DNS resolution check on scrape proxy | ✅ |
| Rate limiting (per-IP, custom implementation) | ✅ (note: single-bucket when behind unset proxy) |

### Renderer / HTML Safety

| Control | Status |
|---------|--------|
| `dangerouslySetInnerHTML` (one usage in `Markdown`) | ✅ — input first passes through `escapeHtml()`, then `sanitizeHtml()` (defense-in-depth) |
| Zero bare inline `style={{...}}` (VERIFY-007) | ✅ |
| No `@ts-ignore` in production paths | ✅ (only in test/mock files) |
| `eslint-disable no-explicit-any` | ✅ — isolated to `use-model-catalog-mock.ts` (never imported in production) |

---

## Storage Correctness

| Check | Status |
|-------|--------|
| All 13 IndexedDB migration steps sequential | ✅ |
| `ENCRYPTED_STORES` matches all sensitive store names | ✅ |
| Conversation write is atomic (temp + `fs.rename`, same device) | ✅ |
| Conversation ID validated by `VALID_ID_RE` before disk access | ✅ |
| Corruption → backup rename | ✅ |
| Model catalog in `localStorage` tagged `localStorage-allowed` | ✅ |
| Prompt rotation state in `localStorage` tagged | ✅ |
| No API key in localStorage | ✅ |

---

## CI / Release Gate Assessment

| Gate | Status |
|------|--------|
| `npm run ci` covers all 22+ sub-verifiers | ✅ |
| SHA-256 checksums generated before artifact upload | ✅ |
| `verify:archive-clean` runs before upload | ✅ |
| Pinned action SHA digests in all workflows | ✅ |
| Node 22 enforced in all CI jobs | ✅ |
| `verify:dist:mac`, `verify:dist:win`, `verify:dist:portable` | ✅ |

---

## Priority Summary

| ID | Severity | File / Location | Short description |
|----|----------|----------------|-------------------|
| BUG-001 | **Medium** | `server.ts` L588, L728 | Jina/scrape 451 body missing `reasonCode`, `category`, `severity` |
| BUG-002 | **Low–Med** | `chat-view.tsx` L38, `CharactersView.tsx` L189, `media-send-to.ts` L185 | Hardcoded model strings diverge from `DEFAULT_CHAT_MODEL` |
| BUG-003 | **Low** | `server.ts` L404–416 | Circuit breaker half-open allows concurrent probe requests |
| BUG-004 | **Low** | `tests/theme/meshSurfaceInvariant.test.ts` | Guard scans 6 files; `border-border` violations in other components are invisible |
| BUG-005 | **Info** | Multiple test files | 8 VERIFY-NNN IDs in AGENTS.md table have no comment tag in test code |
| BUG-006 | **Info** | `storagePrivacyService.test.ts` | VERIFY-168 unregistered in AGENTS.md |
| BUG-007 | **Info** | Local environment | Node v26.3.0 violates `engines: ">=22.13.0 <23"` (CI enforces correctly) |
