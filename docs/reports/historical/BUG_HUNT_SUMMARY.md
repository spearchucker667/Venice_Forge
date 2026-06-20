# Venice Forge Bug Hunt Summary

## Audit Metadata
- **Repository:** Windows-Venice-API-connector (Venice Forge)
- **Commit or working tree state:** e36eafa (with 49 modified files and 4 untracked files in working tree)
- **Generated at:** 2026-06-19T05:30:07-0700 (PDT)
- **Platform:** macOS (Darwin)
- **Node:** v24.15.0
- **npm:** 11.12.1
- **Included files:** 4,181
- **Excluded files:** 33,895 (primarily node_modules: 32,872, dist: 12,330, dist-electron: 3, release: 681, coverage: 344, images: 68, lockfiles: 9)

## Baseline Command Results

| Command | Status | Key Output | Notes |
|---|---|---|---|
| `npm run lint:eslint` | ✅ PASS | Zero warnings enforced | |
| `npm run typecheck` | ✅ PASS | Renderer + Electron main both clean | |
| `npm run test:coverage` | ✅ PASS | All thresholds met (branches ≥61, functions ≥68, lines ≥73, statements ≥70) | 3,232+ tests passed |
| `npm run verify:safety-guard` | ✅ PASS | All 7 enforcement checks passed | |
| `npm run verify:markdown-links` | ✅ PASS | 69 Markdown files checked | |
| `npm run verify:theme-tokens` | ✅ PASS | No forbidden hardcoded color classes | |
| `npm run verify:storage-policy` | ✅ PASS | All localStorage references tagged | |
| `npm run verify:network-boundaries` | ✅ PASS | Boundaries intact | |
| `npm run verify:venice-api-docs` | ✅ PASS | Docs verified | |
| `npm run verify:release-packaging-hardening` | ✅ PASS | 102 assertions passed | VERIFY-054 enforces Windows signing isolation |
| `npm run verify:ci-contract` | ✅ PASS | All required gates present | |
| `npm run verify:contracts` | ✅ PASS | All 22+ sub-verifiers passed | |
| `npm run build` | ✅ PASS | dist/, dist-electron/, dist/server.cjs generated | |
| `npm run verify:dist` | ✅ PASS | Build outputs verified | |

## Lead Disposition

| Lead | Status | Confidence | Finding | Evidence |
|---|---|---|---|---|
| **LEAD-001** | Refuted | High | Workflow store uses encrypted IndexedDB (`visualWorkflows` in `ENCRYPTED_STORES`) | `src/stores/workflow-store.ts:9-32`, `src/services/storageService.ts:40` |
| **LEAD-002** | Refuted | High | Chat params dropdown calls `ensureLoaded()` in its own mount `useEffect` | `src/components/chat/venice-params.tsx:8-16` |
| **LEAD-003** | Refuted | High | `searchIndex` useMemo returns `[]` immediately when `!historyExpanded \|\| !deferredSearch.trim()` | `src/components/layout/sidebar.tsx:198-202` |
| **LEAD-004** | Refuted | High | One canonical workflow UX exists (`WorkflowsView`), but stale docs remain | `src/App.tsx:139` (mounts `WorkflowsView`), `WorkflowTemplatesView.tsx` does not exist |
| **LEAD-005** | Refuted | High | Current test recursively scans all `src/components/**/*.tsx` | `tests/theme/meshSurfaceInvariant.test.ts:33` (dirty version covers full tree) |
| **LEAD-006** | Refuted | High | One canonical CodeQL workflow with pinned SHAs | `.github/workflows/codeql.yml` only workflow file |
| **LEAD-007** | Confirmed | High | Scrape proxy unconditionally JSON-wraps upstream body | `server.ts:863` (`res.json({ url, finalUrl, contentType, body })`) |
| **LEAD-008** | Confirmed | High | Hardcoded model strings outside `src/constants/venice.ts` | `src/components/search/SearchScrapeView.tsx:36`, `src/lib/workflow-engine.ts:139`, `src/components/workflows/workflows-view.tsx:62`, `src/lib/workflow-schema.ts:59`, `src/config/configSchema.ts:536,647` |
| **LEAD-009** | Refuted | High | Character conversations never receive global `DEFAULT_SYSTEM_PROMPT` | `src/hooks/use-chat.ts:130-133`, `src/stores/chat-store.ts:226` |
| **LEAD-011** | Confirmed | High | `circuitFailures` not reset on half-open entry; no circuit breaker tests | `server.ts:412` (no reset), `server.ts:555` (only reset on 2xx) |
| **LEAD-012** | Confirmed | High | Jina/scrape use bare `express.json()` with default 100kb limit | `server.ts:576`, `server.ts:720` |
| **LEAD-013** | Confirmed | High | `TRUST_PROXY` creates rate-limit spoofing/over-limiting risk | `server.ts:277-278`, `server.ts:348` |
| **LEAD-014** | Confirmed | High | Synthetic guard exception returns HTTP 500, not canonical 451 shape | `server.ts:494-514` |
| **LEAD-015** | Confirmed | High | `config:initialize` missing from preload/desktopBridge; validation gaps | `electron/ipc/configHandlers.ts:61`, `electron/preload.ts:355-380` (missing), `src/services/desktopBridge.ts:934-977` (missing) |
| **LEAD-016** | Confirmed | High | `VALID_ID_RE` allows Windows reserved filenames (`con`, `prn`, `aux`, `nul`, `com1`, `lpt1`) | `electron/services/chatStorage.ts:23`, `electron/services/chatStorage.ts:47` |
| **LEAD-017** | Refuted | High | Windows signing strictly isolated to `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` | `.github/workflows/release.yml:166-168`, `scripts/verify-release-packaging-hardening.cjs:359-368` |
| **LEAD-018** | Refuted | High | Per-platform jobs run verify → checksum → archive-clean → upload; publish re-verifies | `.github/workflows/release.yml` (all three platforms) |

## Findings by Severity

| Severity | Count |
|---|---:|
| critical | 1 |
| high | 3 |
| medium | 4 |
| low | 3 |

## Findings by Domain

| Domain | Count |
|---|---:|
| safety | 2 |
| storage | 2 |
| api | 2 |
| desktop | 2 |
| config | 1 |
| docs | 1 |
| ci | 1 |

---

## [VF-AUDIT-001] Windows reserved filename vulnerability in chat storage
**Confidence:** Confirmed  
**Severity:** high  
**Domain:** storage/data-loss  
**Status:** resolved

### Location
- `electron/services/chatStorage.ts:VALID_ID_RE` line `23`
- `electron/services/chatStorage.ts:conversationPath()` line `47`

### Problem
The `VALID_ID_RE` regex (`/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/`) does not reject Windows reserved device names. An ID like `con`, `prn`, `aux`, `nul`, `com1`–`com9`, or `lpt1`–`lpt9` passes validation and is used as a filename via `path.join(getChatHistoryDir(), `${id}.json`)`. On Windows, `con.json` is still a reserved device name, causing `fs.writeFile` to fail or redirect to the console device instead of writing to the filesystem.

### Root Cause
`VALID_ID_RE` was designed to prevent path traversal (`..` and `/`) but does not consider Windows reserved filenames. The `conversationPath()` function uses `path.join` which does not sanitize against reserved names.

### Evidence
```text
File: electron/services/chatStorage.ts:23
  const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

File: electron/services/chatStorage.ts:47
  function conversationPath(id: string): string {
    return path.join(getChatHistoryDir(), `${id}.json`);
  }
```
IDs `con`, `prn`, `aux`, `nul`, `com1`, `lpt1` all match `VALID_ID_RE`. On Windows, `fs.writeFile("...\\con.json", data)` writes to the console device instead of the intended file.

### Impact
- **Data loss:** Conversation files with reserved IDs cannot be persisted on Windows.
- **Corruption risk:** Writing to a device name may have unexpected side effects.
- **Atomic write failure:** The temp+rename pattern in `writeConversation()` would fail silently or throw.

### Regression Guard
- **Existing guard:** VERIFY-012 (RP chat storage invariants) — tests atomic writes and ID validation but does not test Windows reserved names.
- **Required guard:** Add a test in `electron/services/chatStorage.test.ts` asserting that `isValidId("con")`, `isValidId("nul")`, `isValidId("com1")` all return `false`, and that `conversationPath("con")` throws or is rejected.

### Proposed Fix
Add a `RESERVED_WINDOWS_NAMES` Set and reject IDs that match (case-insensitive):
```ts
const RESERVED_WINDOWS_NAMES = new Set([
  "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"
]);
function isValidId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id) && !RESERVED_WINDOWS_NAMES.has(id.toLowerCase());
}
```

### Verification
`npx vitest run electron/services/chatStorage.test.ts` — assert that `isValidId("con")` is `false`.

### Missing Artifact
Windows runner to reproduce the actual `fs.writeFile` failure.

---

## [VF-AUDIT-002] Synthetic safety guard exception returns HTTP 500 instead of canonical 451 block
**Confidence:** Confirmed  
**Severity:** high  
**Domain:** security/api  
**Status:** resolved

### Location
- `server.ts:maybeRunLocalFamilyGuard` catch block, lines `494-514`

### Problem
When the safety guard throws an unexpected exception in the web proxy, the catch block returns `res.status(500).json({ error: "Internal server error during safety verification." })`. This breaks the canonical 451 block contract and prevents the client from distinguishing a safety block from a genuine server error.

### Root Cause
The synthetic decision created at line `494` has a `userMessage` of `"Internal server error during safety verification."`, but the HTTP response emitted at line `513` uses `res.status(500)` instead of `res.status(451)`. The canonical 451 shape requires `{ error, reasonCode, category, severity }`, but the 500 response only contains `{ error }`.

### Evidence
```text
File: server.ts:494-514
  const syntheticDecision: SafetyGuardDecision = {
    allow: false,
    action: "block",
    severity: "critical",
    category: "csam_request",
    reasonCode: "GUARD_EXCEPTION",
    userMessage: "Internal server error during safety verification.",
    ...
  };
  recordDecision(syntheticDecision);
  res.status(500).json({ error: "Internal server error during safety verification." });
```

By contrast, the normal guard block path at line `517-523` correctly returns:
```ts
res.status(451).json({
  error: decision.userMessage,
  reasonCode: decision.guardDecision.reasonCode,
  category: decision.guardDecision.category,
  severity: decision.guardDecision.severity,
});
```

### Impact
- **Client confusion:** The renderer cannot distinguish a safety guard failure from a server crash, so it may retry the request or show a generic error instead of the Family Safe Mode block UI.
- **Safety boundary weakening:** The canonical 451 contract is documented in `AGENTS.md` and `VERIFY-015` as the required block shape across all entry points. The 500 response violates this contract.

### Regression Guard
- **Existing guard:** VERIFY-015 (Guarded IPC pipeline) — tests the normal guard block path but does not test the synthetic exception catch block.
- **Required guard:** Add a test in `server.test.ts` that mocks `maybeRunLocalFamilyGuard` to throw, asserts the response status is `451`, and asserts the body contains `reasonCode`, `category`, and `severity`.

### Proposed Fix
Replace the 500 response with the canonical 451 shape:
```ts
res.status(451).json({
  error: syntheticDecision.userMessage,
  reasonCode: syntheticDecision.reasonCode,
  category: syntheticDecision.category,
  severity: syntheticDecision.severity,
});
```

### Verification
Add a test in `server.test.ts`:
```ts
it("returns canonical 451 when safety guard throws", async () => {
  vi.mocked(maybeRunLocalFamilyGuard).mockImplementation(() => { throw new Error("boom"); });
  const res = await request(app).post("/api/venice/chat/completions").send({ ... });
  expect(res.status).toBe(451);
  expect(res.body).toHaveProperty("reasonCode", "GUARD_EXCEPTION");
  expect(res.body).toHaveProperty("category", "csam_request");
  expect(res.body).toHaveProperty("severity", "critical");
});
```

---

## [VF-AUDIT-003] IPC contract drift: `config:initialize` missing from preload and desktopBridge
**Confidence:** Confirmed  
**Severity:** high  
**Domain:** desktop  
**Status:** resolved

### Location
- `electron/ipc/configHandlers.ts:61` — handler registered
- `electron/preload.ts:355-380` — `config` object missing `initialize`
- `src/services/desktopBridge.ts:934-977` — `desktopConfig` missing `initialize`

### Problem
The `config:initialize` IPC handler is registered in `electron/ipc/configHandlers.ts` but is not exposed through `electron/preload.ts` or wrapped in `src/services/desktopBridge.ts`. This means the renderer cannot call the initialization routine through the intended abstraction, leaving the handler effectively dead for renderer code.

### Root Cause
The 5-file IPC contract (`preload.ts`, `handlers.ts`, `validation.ts`, `desktopBridge.ts`, tests) was not updated when `config:initialize` was added. The `registerConfigIpcHandlers()` function is called from `electron/ipc/handlers.ts`, but the preload bridge was not extended.

### Evidence
```text
File: electron/ipc/configHandlers.ts:61
  handleIpc("config:initialize", async () => { ... });

File: electron/preload.ts:355-380
  config: {
    get() { ... },
    reload() { ... },
    getStatus() { ... },
    openFolder() { ... },
    writeSanitized() { ... },
    exportTemplate() { ... },
    loadMergedThemes() { ... },
    resetSecureStoreKeys() { ... },
  }
  // initialize is absent

File: src/services/desktopBridge.ts:934-977
  export const desktopConfig = {
    async get() { ... },
    async reload() { ... },
    async getStatus() { ... },
    async openFolder() { ... },
    async writeSanitized() { ... },
    async exportTemplate() { ... },
    async loadMergedThemes() { ... },
    async resetSecureStoreKeys() { ... },
  }
  // initialize is absent
```

### Impact
- **Dead code:** The `config:initialize` handler can only be called from the main process or via `ipcRenderer.invoke` directly (bypassing the intended abstraction). No renderer code can reach it through the canonical `desktopConfig` API.
- **Contract drift:** Adding or changing IPC surfaces requires coordination across all 5 layers. This drift indicates the process was not followed.

### Regression Guard
- **Existing guard:** None for `config:initialize` specifically.
- **Required guard:** Add a test in `src/services/desktopBridge.test.ts` asserting `desktopConfig.initialize` exists and forwards to `window.veniceForge.config.initialize`.

### Proposed Fix
Add `initialize` to both `preload.ts` and `desktopBridge.ts`:
```ts
// preload.ts
config: {
  initialize(): Promise<{ ok: boolean; status?: unknown; error?: string }> {
    return ipcRenderer.invoke("config:initialize");
  },
  // ... existing methods
}

// desktopBridge.ts
export const desktopConfig = {
  async initialize() {
    if (!isElectron()) return { ok: false, error: "Local config is only available in desktop mode." };
    return window.veniceForge!.config.initialize();
  },
  // ... existing methods
}
```

### Verification
`npx vitest run src/services/desktopBridge.test.ts` — assert that `desktopConfig.initialize` exists and returns the expected stub in web mode.

---

## [VF-AUDIT-004] Hardcoded model strings outside canonical constants file
**Confidence:** Confirmed  
**Severity:** medium  
**Domain:** config  
**Status:** resolved

### Location
- `src/components/search/SearchScrapeView.tsx:36` — `|| "llama-3.3-70b"`
- `src/components/workflows/workflows-view.tsx:62` — `chat: 'llama-3.3-70b'`
- `src/lib/workflow-engine.ts:139` — `model: data.model || 'llama-3.3-70b'`
- `src/lib/workflow-schema.ts:59` — `default: 'llama-3.3-70b'`
- `src/config/configSchema.ts:536,647` — `"venice-uncensored-1-2"`
- `src/services/prompt-enhancer-service.ts:42` — `DEFAULT_ENHANCER_MODEL = "venice-uncensored-1-2"`

### Problem
Multiple production code paths contain hardcoded model strings that are not centralized in `src/constants/venice.ts`. When models are deprecated or renamed, these strings become stale and can cause runtime failures or unexpected fallback behavior.

### Root Cause
Developers inlined model defaults instead of importing from `DEFAULT_CHAT_MODEL` or `FALLBACK_MODELS` constants. The `SearchScrapeView.tsx` fallback uses a literal string instead of the configured default.

### Evidence
```text
File: src/components/search/SearchScrapeView.tsx:36
  const selectedModel = useSettingsStore((s) => s.selectedModels.chat) || "llama-3.3-70b";

File: src/lib/workflow-engine.ts:139
  model: data.model || 'llama-3.3-70b',

File: src/config/configSchema.ts:536
  model: clampString(enhancerRaw.model, 256, "venice-uncensored-1-2"),
```

### Impact
- **Stale defaults:** If `llama-3.3-70b` or `venice-uncensored-1-2` are deprecated by Venice, these components will silently fall back to invalid models.
- **Maintenance burden:** Updating default models requires touching multiple files instead of one constants file.

### Regression Guard
- **Existing guard:** None specifically for model-string consolidation.
- **Required guard:** Add a script (`scripts/verify-model-constants.cjs`) that greps for hardcoded model IDs outside `src/constants/venice.ts` and fails CI.

### Proposed Fix
Replace all hardcoded model strings with imports from `src/constants/venice.ts`:
```ts
import { DEFAULT_CHAT_MODEL } from "@/constants/venice";
// SearchScrapeView.tsx
const selectedModel = useSettingsStore((s) => s.selectedModels.chat) || DEFAULT_CHAT_MODEL;
```

### Verification
`npx vitest run src/components/search/SearchScrapeView.test.tsx` — assert that when `selectedModels.chat` is undefined, the fallback model equals `DEFAULT_CHAT_MODEL`.

---

## [VF-AUDIT-005] Circuit breaker `circuitFailures` not reset on half-open entry
**Confidence:** Confirmed  
**Severity:** medium  
**Domain:** api  
**Status:** resolved

### Location
- `server.ts:398-420` — circuit breaker state machine

### Problem
When the circuit breaker transitions from open to half-open (line `412`), `circuitFailures` is not reset. It remains at its previous value (≥ `CIRCUIT_MAX_FAILURES`). If the half-open probe fails, the condition `circuitFailures >= CIRCUIT_MAX_FAILURES || circuitHalfOpen` (line `549`) immediately re-opens the circuit. While this is semantically safe, it means the failure counter is semantically overloaded and the circuit can never re-close without a successful 2xx response.

### Root Cause
The half-open transition code at line `412` sets `circuitHalfOpen = true` and `circuitOpenUntil = 0` but does not reset `circuitFailures = 0`.

### Evidence
```text
File: server.ts:412
  circuitHalfOpen = true;
  circuitOpenUntil = 0;
  // circuitFailures is NOT reset here

File: server.ts:555
  circuitFailures = 0; // Reset only on successful responses
```

### Impact
- **Unclear semantics:** The failure counter represents both historical failures and half-open state.
- **No test coverage:** Zero tests exist for the circuit breaker state machine, so any future change could break recovery semantics.

### Regression Guard
- **Existing guard:** None.
- **Required guard:** Add a test in `server.test.ts` that sequences: 5 failures → open → wait 30s → half-open → 5xx → re-open → 2xx → closed → assert `circuitFailures === 0`.

### Proposed Fix
Reset `circuitFailures` on half-open entry:
```ts
// server.ts:412
circuitHalfOpen = true;
circuitOpenUntil = 0;
circuitFailures = 0; // Reset for fresh probe evaluation
```

### Verification
Add a test in `server.test.ts` asserting the reset behavior.

---

## [VF-AUDIT-006] Jina and scrape proxy endpoints use bare `express.json()` with implicit 100kb limit
**Confidence:** Confirmed  
**Severity:** medium  
**Domain:** api  
**Status:** resolved

### Location
- `server.ts:576` — `app.post("/api/proxy-jina", express.json(), ...)`
- `server.ts:720` — `app.post("/api/proxy-scrape", express.json(), ...)`

### Problem
Both Jina and scrape proxy endpoints use `express.json()` without an explicit `limit` option. The default Express JSON body limit is 100kb. By contrast, the Venice API proxy uses `express.raw({ limit: MAX_PROXY_BODY_BYTES })` where `MAX_PROXY_BODY_BYTES` defaults to 25 MiB. This inconsistency means a client sending a large scrape request (e.g., a large HTML document for analysis) will receive a 413 Payload Too Large error unexpectedly.

### Root Cause
The Jina and scrape routes were added without explicit body-size configuration. The default 100kb limit was likely unintentional.

### Evidence
```text
File: server.ts:576
  app.post("/api/proxy-jina", express.json(), async (req, res) => { ... });

File: server.ts:720
  app.post("/api/proxy-scrape", express.json(), async (req, res) => { ... });

File: server.ts:464-467
  express.raw({ type: "*/*", limit: MAX_PROXY_BODY_BYTES })  // Venice proxy uses explicit limit
```

### Impact
- **Unexpected 413 errors:** Clients sending large payloads to Jina or scrape proxies will be rejected at the Express layer before the proxy handler runs.
- **DoS vector:** A client could send many 100kb+ requests to exploit the discrepancy, though this is mitigated by rate limiting.

### Regression Guard
- **Existing guard:** VERIFY-039 tests response size caps (2 MiB) but does not test inbound request body limits.
- **Required guard:** Add a test in `server.test.ts` sending a 200kb JSON body to `/api/proxy-jina` and asserting it succeeds (not 413).

### Proposed Fix
Use explicit limits:
```ts
app.post("/api/proxy-jina", express.json({ limit: MAX_PROXY_BODY_BYTES }), async (req, res) => { ... });
app.post("/api/proxy-scrape", express.json({ limit: MAX_PROXY_BODY_BYTES }), async (req, res) => { ... });
```

### Verification
`npx vitest run server.test.ts -t "accepts large jina request body"` — assert 200 for 200kb body.

---

## [VF-AUDIT-007] `TRUST_PROXY` creates rate-limit keying spoofing and over-limiting risk
**Confidence:** Confirmed  
**Severity:** medium  
**Domain:** api  
**Status:** resolved

### Location
- `server.ts:277-278` — `app.set("trust proxy", AppConfig.TRUST_PROXY)`
- `server.ts:348` — `const ip = req.ip || "unknown";`
- `server.ts:933` — `const ip = req.ip || "unknown";`

### Problem
When `TRUST_PROXY` is enabled, Express derives `req.ip` from the `X-Forwarded-For` header. The rate-limit key is `req.ip`. This creates two risks:
1. **Under-limiting (spoofing):** If the server is accessed directly without a reverse proxy, a client can send arbitrary `X-Forwarded-For` values to rotate IPs and bypass rate limits.
2. **Over-limiting (shared bucket):** All clients behind a single corporate proxy share the same `req.ip` and hit the same rate-limit bucket.

### Root Cause
The rate-limit key uses `req.ip` without validating whether the request actually came through a trusted proxy. The `TRUST_PROXY` setting is boolean or string, but there's no secondary validation.

### Evidence
```text
File: server.ts:277-278
  if (AppConfig.TRUST_PROXY) {
    app.set("trust proxy", AppConfig.TRUST_PROXY);
  }

File: server.ts:348
  const ip = req.ip || "unknown";
```

### Impact
- **Rate limit bypass:** Malicious clients can spoof IPs to avoid rate limiting.
- **Denial of service:** Legitimate users behind a shared proxy may be collectively rate-limited.

### Regression Guard
- **Existing guard:** None for `TRUST_PROXY` interaction.
- **Required guard:** Add a test in `server.test.ts` that sets `TRUST_PROXY=true`, sends `X-Forwarded-For: 1.2.3.4` and `X-Forwarded-For: 5.6.7.8` from the same connection, and asserts both requests are counted against the same bucket (or that the limit is enforced correctly).

### Proposed Fix
Add a connection-based fallback or use `req.socket.remoteAddress` when `X-Forwarded-For` is untrusted:
```ts
const ip = (req.headers["x-forwarded-for"] ? req.ip : req.socket?.remoteAddress) || "unknown";
```
Alternatively, use a hashed connection fingerprint instead of IP alone.

### Verification
Add a test asserting rate-limit consistency with spoofed headers.

---

## [VF-AUDIT-008] Scrape proxy unconditionally JSON-wraps upstream body
**Confidence:** Confirmed  
**Severity:** low  
**Domain:** network  
**Status:** complete

### Location
- `server.ts:863` — `res.status(scrapeResult.status).json({ url, finalUrl, contentType, body });`

### Problem
The scrape proxy always returns `res.json({ url, finalUrl, contentType, body })`, even when the upstream response is `text/html` or `text/plain`. This embeds the raw text body as a JSON string value, which changes the content type from `text/plain` to `application/json`.

### Root Cause
The scrape endpoint is designed to return a structured envelope so the client can access metadata (`url`, `finalUrl`, `contentType`) alongside the body. This is intentional but documented as a lead.

### Evidence
```text
File: server.ts:863
  res.status(scrapeResult.status).json({ url, finalUrl, contentType, body });
```

By contrast, the Jina proxy correctly preserves the upstream content type:
```text
File: server.ts:698-702
  if (contentType.includes("application/json")) { return res.status(response.status).json(body); }
  else { res.setHeader("Content-Type", contentType || "text/plain"); return res.status(response.status).send(body); }
```

### Impact
- **Client parsing burden:** Clients receiving the scrape response must extract `body` from the JSON envelope instead of reading the raw text directly.
- **Inconsistency:** Jina and scrape proxies behave differently with respect to content-type preservation.

### Regression Guard
- **Existing guard:** None.
- **Required guard:** Add a test in `server.test.ts` mocking a `text/plain` upstream response for the scrape proxy and asserting `Content-Type: application/json` and a JSON body shape.

### Proposed Fix
Document the scrape proxy's JSON envelope behavior in the API docs, or add a query parameter (`?raw=true`) to allow direct body passthrough.

### Verification
`npx vitest run server.test.ts -t "scrape proxy returns JSON envelope"` — assert JSON body with `url`, `finalUrl`, `contentType`, `body` fields.

---

## [VF-AUDIT-009] AGENTS.md VERIFY-049 references non-existent `WorkflowTemplatesView.tsx`
**Confidence:** Confirmed  
**Severity:** low  
**Domain:** docs  
**Status:** complete

### Location
- `AGENTS.md:218` — VERIFY-049 registry entry

### Problem
The AGENTS.md VERIFY-049 entry claims `src/components/workflows/WorkflowTemplatesView.tsx` is mounted in `App.tsx` for the canonical `workflows` tab. This file was deleted per `docs/summary_of_work.md:832`. The canonical workflow UX is the ReactFlow visual editor (`WorkflowsView`).

### Root Cause
The VERIFY-049 registry entry was not updated when `WorkflowTemplatesView.tsx` was removed.

### Evidence
```text
File: AGENTS.md:218
  | `VERIFY-049` | Phase 2G Workflow Templates — ... `src/components/workflows/WorkflowTemplatesView.tsx` is mounted in `App.tsx` ... |

File: docs/summary_of_work.md:832
  - Deleted stale `WorkflowTemplatesView.tsx` and tests to remove ambiguity; visual workflows are canonical.
```

### Impact
- **Agent confusion:** Future agents reading AGENTS.md may attempt to audit or modify a non-existent file.
- **Handoff drift:** The registry claims capabilities that no longer exist in the codebase.

### Regression Guard
- **Existing guard:** VERIFY-049 itself is the stale registry entry.
- **Required guard:** Update VERIFY-049 to describe the actual `WorkflowsView` (visual workflow editor) and remove references to `WorkflowTemplatesView`. Run `verify:agent-docs` to enforce parity.

### Proposed Fix
Update `AGENTS.md` line 218 to reflect the current canonical workflow tab: `src/components/workflows/workflows-view.tsx` (`WorkflowsView`) mounted in `App.tsx`.

### Verification
`npm run verify:agent-docs` — assert that all referenced files in AGENTS.md exist.

---

## [VF-AUDIT-010] Node engine constraint mismatch with local execution environment
**Confidence:** Confirmed  
**Severity:** low  
**Domain:** ci  
**Status:** complete

### Location
- `package.json:23-25` — `"engines": { "node": ">=22.13.0 <23", "npm": ">=10.0.0" }`

### Problem
The local audit machine is running Node v24.15.0, which is outside the declared engine range (`<23`). The CI workflows correctly pin `node-version: 22`, but local development on Node 24+ will produce `npm install` warnings and may encounter compatibility issues with native dependencies or transitive packages that respect engine constraints.

### Root Cause
The engine range was set to `>=22.13.0 <23` during the Node 22 adoption period. Node 24 has since been released and the codebase appears to run correctly on it (all tests pass), but the engine constraint was not updated.

### Evidence
```text
File: package.json:23-25
  "engines": {
    "node": ">=22.13.0 <23",
    "npm": ">=10.0.0"
  }

Local machine: Node v24.15.0
```

### Impact
- **Developer friction:** `npm install` warns about engine mismatch on Node 24+.
- **CI risk:** If a contributor uses Node 24 locally and commits a lockfile change, the CI (Node 22) may resolve dependencies differently.

### Regression Guard
- **Existing guard:** `.github/workflows/ci.yml` pins Node 22.
- **Required guard:** Add `engine-strict=false` to `.npmrc` or expand the engine range to `>=22.13.0` (remove `<23`) after testing.

### Proposed Fix
Expand the engine range to `>=22.13.0` and add CI matrix testing for Node 22 and 24:
```json
"engines": {
  "node": ">=22.13.0",
  "npm": ">=10.0.0"
}
```

### Verification
`npm run ci` on Node 24 — assert all commands pass.

---

## [VF-AUDIT-011] VERIFY-168 exists outside canonical AGENTS.md registry range
**Confidence:** Confirmed  
**Severity:** low  
**Domain:** docs  
**Status:** complete

### Location
- `src/services/storagePrivacyService.test.ts:60` — `T-168 / VERIFY-168`
- `docs/summary_of_work.md:132` — claims registered in AGENTS.md

### Problem
VERIFY-168 is referenced in tests and service code but does not appear in the AGENTS.md VERIFY-NNN registry table. The registry table ends at VERIFY-058. This creates a gap where an agent reading AGENTS.md cannot discover what VERIFY-168 guards.

### Root Cause
VERIFY-168 was added after the main registry table was established. The `docs/summary_of_work.md` claims it was registered, but the AGENTS.md table was not updated.

### Evidence
```text
File: src/services/storagePrivacyService.test.ts:60
  it("T-168 / VERIFY-168: safe summary redacts user titles and names from issue messages", ...)

File: docs/summary_of_work.md:132
  - **BUG-006**: Registered `VERIFY-168` (Storage Privacy Service data bounds) in `AGENTS.md`.

File: AGENTS.md
  Registry table ends at VERIFY-058 with no VERIFY-168 entry.
```

### Impact
- **Agent handoff gap:** Future agents cannot look up VERIFY-168 in the canonical registry.

### Regression Guard
- **Existing guard:** `verify:agent-docs` checks parity but does not flag missing VERIFY IDs in the registry.
- **Required guard:** Update `verify:agent-docs.cjs` to enumerate all `VERIFY-NNN` IDs in the source and assert they appear in the AGENTS.md registry table.

### Proposed Fix
Add VERIFY-168 to the AGENTS.md registry table with its invariant description.

### Verification
`npm run verify:agent-docs` — assert all VERIFY IDs in source are present in the registry.

---

## Release Gate
**Pass: false**

### Blockers
- **VF-AUDIT-012** — Playground store persists raw messages and node prompts to localStorage (confirmed storage policy violation)
- **VF-AUDIT-013** — Chat store leaks systemPrompt to localStorage (confirmed storage policy violation)
- **VF-AUDIT-014** — Sidebar search index performs O(N) full-history concatenation on every keystroke (confirmed severe performance bottleneck)

- **VF-AUDIT-002** — Synthetic safety guard exception returns HTTP 500 instead of canonical 451 block (confirmed security boundary defect)
- **VF-AUDIT-001** — Windows reserved filename vulnerability in chat storage (confirmed data-loss/storage issue on Windows)

### Non-blocking
- **VF-AUDIT-003** — IPC contract drift (`config:initialize` dead channel)
- **VF-AUDIT-004** — Hardcoded model strings outside constants
- **VF-AUDIT-005** — Circuit breaker half-open failure counter semantics
- **VF-AUDIT-006** — Jina/scrape body-size caps missing
- **VF-AUDIT-007** — TRUST_PROXY rate-limit keying risk
- **VF-AUDIT-008** — Scrape proxy JSON-wraps plain text (by design, inconsistency)
- **VF-AUDIT-009** — Stale AGENTS.md VERIFY-049 entry
- **VF-AUDIT-010** — Node engine range mismatch
- **VF-AUDIT-011** — VERIFY-168 missing from registry

## VERIFY-NNN Guard Gaps

| VERIFY ID | Existing Guard | Gap | Required Change |
|---|---|---|---|
| VERIFY-015 | Tests normal guard 451 block in `guardPipeline.test.ts` | Does not test synthetic exception catch block | Add test for `maybeRunLocalFamilyGuard` throwing → assert 451 with `reasonCode`, `category`, `severity` |
| VERIFY-012 | Tests atomic write and ID validation | Does not test Windows reserved filenames | Add `isValidId("con")` → `false` assertion |
| VERIFY-039 | Tests response size caps (2 MiB) | Does not test inbound request body limits for Jina/scrape | Add test sending 200kb body to `/api/proxy-jina` |
| VERIFY-049 | Registry entry exists | References deleted `WorkflowTemplatesView.tsx` | Update to reference `WorkflowsView` (visual workflows) |
| VERIFY-168 | Test exists in `storagePrivacyService.test.ts` | Not listed in AGENTS.md registry | Add entry to AGENTS.md registry table |
| None | `server.test.ts` has no circuit breaker tests | `circuitFailures` reset on half-open is untested | Add test sequencing open → half-open → 5xx → 2xx → assert counter resets |
| None | `desktopBridge.test.ts` does not cover `desktopConfig` | `config:initialize` missing from bridge wrapper | Add test asserting `desktopConfig.initialize` exists |

## Stale or Obsolete Files

| File | Reason | Action |
|---|---|---|
| `docs/audits/exhaustive-bug-hunt-2026-06-19.md` | References deleted `WorkflowTemplatesView.tsx` and contains outdated "REFUTED" findings from a previous audit | Update or archive |
| `AGENTS.md:218` | VERIFY-049 claims `WorkflowTemplatesView.tsx` is mounted | Update to `WorkflowsView` |

## Recommended Repair Order

1. **VF-AUDIT-002** — Fix synthetic guard exception to return canonical 451 shape (security boundary)
2. **VF-AUDIT-001** — Add Windows reserved filename rejection to `VALID_ID_RE` (storage/data-loss)
3. **VF-AUDIT-003** — Add `config:initialize` to preload and desktopBridge (IPC contract)
4. **VF-AUDIT-006** — Add explicit `limit` to Jina/scrape `express.json()` (API consistency)
5. **VF-AUDIT-004** — Consolidate hardcoded model strings into `src/constants/venice.ts` (maintenance)
6. **VF-AUDIT-005** — Reset `circuitFailures` on half-open and add circuit breaker tests (reliability)
7. **VF-AUDIT-007** — Harden rate-limit keying against `X-Forwarded-For` spoofing (API security)
8. **VF-AUDIT-009** — Update AGENTS.md VERIFY-049 and add VERIFY-168 (docs hygiene)
9. **VF-AUDIT-010** — Expand Node engine range after CI matrix validation (CI hygiene)

---

## [VF-AUDIT-012] Playground store persists raw messages and node prompts to localStorage
**Confidence:** Confirmed  
**Severity:** high  
**Domain:** storage  
**Status:** resolved

### Location
- `src/stores/playground-store.ts:90`

### Problem
The `usePlaygroundStore` partializes its `messages` array (the last 40) and `draft` (the visual nodes) into `createSafeStorage()`, which writes directly to `window.localStorage`. This violates the strict storage policy that raw conversation content, node prompts, or any PII/secrets must never be stored in localStorage.

### Root Cause
The store configures `persist` using `createJSONStorage(() => createSafeStorage())` and explicitly saves `messages` and `draft` state without using the encrypted IndexedDB adapter (`ENCRYPTED_STORES`) like `workflow-store.ts` does.

### Impact
- **Privacy/Security:** If a user pastes an API key or sensitive data into the playground chat or node prompts, it is persisted in plaintext `localStorage`, accessible to any XSS exploit.

### Proposed Fix
Switch `usePlaygroundStore` to use the `asyncStorageAdapter` that persists to `visualWorkflows` (or a new `playground` store in `ENCRYPTED_STORES`).

---

## [VF-AUDIT-013] Chat store leaks systemPrompt to localStorage
**Confidence:** Confirmed  
**Severity:** high  
**Domain:** storage  
**Status:** resolved

### Location
- `src/stores/chat-store.ts` (partialize configuration)

### Problem
The `useChatStore` persists `systemPrompt` through `createSafeStorage()`. The `systemPrompt` contains user-defined text which might include sensitive custom instructions or secrets, violating the storage policy.

### Root Cause
While `chat-store` correctly handles `conversations` via IPC or IndexedDB, the `partialize` configuration for the Zustand `persist` middleware still explicitly includes `systemPrompt`.

### Impact
- **Privacy/Security:** Sensitive custom instructions are stored in plaintext localStorage.

### Proposed Fix
Remove `systemPrompt` from the `partialize` array in `chat-store.ts` and persist it via the secure IPC configuration path or `ENCRYPTED_STORES`.

---

## [VF-AUDIT-014] Sidebar search index performs O(N) full-history concatenation on every keystroke
**Confidence:** Confirmed  
**Severity:** high  
**Domain:** desktop  
**Status:** resolved

### Location
- `src/components/layout/sidebar.tsx:198-202`

### Problem
The `searchIndex` uses `useMemo` with `conversations` and `deferredSearch` in its dependency array. Whenever `deferredSearch` changes, it recalculates `buildConversationSearchText(conversation)` for EVERY conversation in the history. This involves mapping over all messages and concatenating them.

### Root Cause
The `searchIndex` memoization includes `deferredSearch` as a dependency instead of just `conversations`. Additionally, when the user is chatting, the `conversations` array identity changes on every message tick, forcing a full rebuild of the search index for ALL conversations across the entire history.

### Impact
- **Performance:** Severe main-thread blocking (UI freeze) during typing in the search box or when receiving streaming messages if the history is large.

### Proposed Fix
Memoize the `searchIndex` so it ONLY recalculates the concatenated string for the specific conversation that changed (e.g. by using a `useMemo` mapping `conversation.id` -> `searchText` with a stable map, or moving the index generation to a web worker / IndexedDB query).
