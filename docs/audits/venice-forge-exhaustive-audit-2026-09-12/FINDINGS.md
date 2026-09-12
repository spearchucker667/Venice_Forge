# Findings — Venice Forge Exhaustive Audit (2026-09-12)

This file re-verifies each prior finding against the current `main` working tree and records new independent findings discovered by this re-pass.

## Status legend

- **Fully repaired** — the remediation is present in the working tree and the relevant tests pass.
- **Partially repaired** — only part of the fix is present, or the fix depends on additional work.
- **Regressed** — a prior fix was undone by a later change.
- **Obsolete** — the contract changed; the finding no longer applies.
- **Unable to reproduce** — the documented reproduction no longer triggers the failure.

## Prior findings — re-verification

---

### VF-AUD-20260912-P0-001 — SSE decoder applies UTF-8 outside JSON branch

**Severity:** P0
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/veniceClient.ts:275-288`

**Evidence of remediation (current):**

`electron/services/veniceClient.ts:275-288`

```typescript
export function parseBody(buffer: Buffer, contentType: string): unknown {
  if (contentType.includes("application/json")) {
    const text = buffer.toString("utf-8");
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { text: "Venice returned malformed JSON." };
    }
  }
  if (contentType.startsWith("text/") || contentType.includes("event-stream")) {
    return buffer.toString("utf-8");
  }
  return { dataBase64: buffer.toString("base64") };
}
```

The UTF-8 decode is now scoped to the `text/*` and `event-stream` branches only. Binary branches return `dataBase64` without lossy text decoding. The shared `SseDecoder` (`src/shared/sseStreamDecoder.ts`) drives incremental streaming decoding so both transports produce identical events/errors.

**Regression coverage:** `electron/services/veniceClient.stream.test.ts` (response-cap and UTF-8 truncation cases pass).

---

### VF-AUD-20260912-P0-002 — Provider fallback may run for explicit-prefix requests

**Severity:** P0
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/veniceClient.ts`

**Evidence of remediation (current):**

`electron/services/veniceClient.ts:320-330` — the renderer-supplied fallbackConfig is now retained only for wire compatibility, and the fallback loop only engages when the request is **not** an explicit-prefix provider (`together:...`, `groq:...`).

```typescript
const fallbackConfig = getProviderSettings(request.profileId);
// If the request targets a specific provider via prefix (e.g. together:...), don't auto-fallback.
const isExplicitProvider = ...;
if (!isExplicitProvider && fallbackConfig.autoFallbackEnabled && originalModel) {
  ...
}
```

Provider ordering, consent, and provider-native model selection are now main-process authority.

---

### VF-AUD-20260912-P0-003 — Tool injection leaks renderer-side gating into provider request

**Severity:** P0
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `src/stores/chat-stream-manager.ts`
- `src/agent/registry/tool-registry.ts`

**Evidence of remediation (current):**

`src/stores/chat-stream-manager.ts:123-137`

```typescript
// P1-005: tool injection is gated on explicit runtime metadata only.
const docAgentState = useDocumentAgentStore.getState();
const availableTools = resolveAvailableTools(modelInfo, docAgentState.preset);
if (availableTools.length > 0) {
  baseBody.tools = baseBody.tools ? [...(baseBody.tools as ProviderToolSchema[]), ...availableTools] : availableTools;
}
baseBody.venice_parameters = { ...veniceParamsForRequest };
if (baseBody.venice_parameters && typeof baseBody.venice_parameters === "object") {
  delete (baseBody.venice_parameters as { enable_document_tools?: boolean }).enable_document_tools;
}
```

`enable_document_tools` is stripped from `venice_parameters` before dispatch, and tool injection is gated on the explicit `useDocumentAgentStore.getState().preset` rather than renderer-supplied body flags.

---

### VF-AUD-20260912-P0-004 — API safe mode provider override not applied for all endpoints

**Severity:** P0
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/guardPipeline.ts`
- `src/shared/veniceSafeMode.ts`

**Evidence of remediation (current):**

`electron/services/guardPipeline.ts:149-162`

```typescript
function withFamilySafeProviderOverride(rawRequest: unknown, endpoint: string): unknown {
  // Provider-side safe_mode is driven solely by the Venice API Safe Mode
  // runtime setting. Local Family Safe Mode is an independent filter that
  // runs before dispatch and on responses; it must not force safe_mode on.
  const veniceApiSafeMode = getRuntimeVeniceApiSafeMode();
  ...
  return {
    ...rawRequest,
    body: applyVeniceApiSafeMode(endpoint, body, veniceApiSafeMode),
  };
}
```

The override is now centralized through `applyVeniceApiSafeMode(endpoint, body, veniceApiSafeMode)` and is driven solely by the runtime snapshot — never by the renderer-supplied `localFamilySafeModeEnabled` flag.

---

### VF-AUD-20260912-P0-005 — writeSanitizedConfig accepts secret-bearing patch

**Severity:** P0
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/configService.ts:684-720`

**Evidence of remediation (current):**

`electron/services/configService.ts:684-720`

```typescript
export async function writeSanitizedConfig(patch: unknown): Promise<WriteSanitizedResult> {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return { ok: false, error: "Patch must be an object.", redactedFields: [] };
  }
  const sanitized = sanitizeConfig(currentConfig);
  const merged = mergeSanitized(sanitized, patch as Record<string, unknown>);
  // Re-validate the merged config to make sure we don't write back invalid values.
  const result = validateConfig(merged);
  ...
  // Strip secrets.* values back to empty.
  const finalConfig: YamlConfig = {
    ...result.config,
    secrets: { ...result.config.secrets, venice_api_key: "", jina_api_key: "" },
  };
  ...
}
```

`finalConfig.secrets.venice_api_key` and `finalConfig.secrets.jina_api_key` are force-cleared to `""` before any write to disk. The function additionally records `redactedFields` for any patch that arrived with non-empty plaintext keys.

---

### VF-AUD-20260912-P0-006 — Family Safe Mode is read from renderer-supplied payload

**Severity:** P0
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/guardPipeline.ts`
- `electron/services/runtimeSafetySettings.ts`

**Evidence of remediation (current):**

`electron/services/guardPipeline.ts:88-104`

```typescript
export function checkLocalFamilyGuard(input: SafetyGuardInput): GuardedBlock | null {
  ...
  const enabled = getRuntimeLocalFamilySafeModeEnabled();
  const decision = maybeRunLocalFamilyGuard(input, enabled);
  ...
}
```

The runtime snapshot (`runtimeSafetySettings`) is the sole source of truth. The `VeniceRequest` type still accepts an optional `localFamilySafeModeEnabled` for wire compatibility, but the main process never reads it.

---

### VF-AUD-20260912-P1-001 — Provider fallback race condition

**Severity:** P1
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/veniceClient.ts:315-475` (the fallback loop in `performVeniceRequest`)

**Evidence of remediation (current):**

The fallback loop in `performVeniceRequest` now serializes per-provider attempts via `releaseVeniceSlot()` and tracks `lastError` / `lastResponse` consistently. Provider selection is main-process authority; the loop only advances when the current provider returns a recoverable failure and the next provider in the configured chain is available.

---

### VF-AUD-20260912-P1-002 — Streaming delta envelope dropped appendedMessages

**Severity:** P1
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/veniceClient.ts`
- `electron/ipc/handlers/veniceHandlers.ts`
- `src/shared/veniceStreamDelta.ts`

**Evidence of remediation (current):**

The streaming delta envelope now includes `appendedMessages` (tool-result media/document metadata) end-to-end. Both transports share the same envelope shape and the same incremental decoder (`SseDecoder` / `applyStreamSseEvent`) so emitted events are byte-identical.

`electron/ipc/handlers/veniceHandlers.ts` and `electron/agent/runtime/agent-tool-executor.ts` now use the same canonical envelope, and the preload boundary validates with `sanitizeStreamDeltaEnvelope` before forwarding to the renderer.

---

### VF-AUD-20260912-P1-003 — Abort signal from external not wired to in-flight request

**Severity:** P1
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/veniceClient.ts`
- `electron/ipc/handlers/veniceHandlers.ts`

**Evidence of remediation (current):**

The abort path is now wired end-to-end. The preload's `streamChat` constructs a `signalId`, registers a `beforeunload` + `pagehide` fallback that calls `venice:abort`, and the main process maintains `activeRequests: Map<string, { destroy: () => void }>` so an external `abort(signalId)` call cleanly destroys the in-flight request.

`abortVeniceRequest(signalId)` returns `{ ok: true }` when the signal ID is registered and `{ ok: false }` otherwise.

---

### VF-AUD-20260912-P1-004 — Provider fallback order is main-process authority

**Severity:** P1
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/veniceClient.ts`
- `electron/services/providerAdapters.ts`

**Evidence of remediation (current):**

The fallback order is read from main-process `providerSettingsStore`; the renderer-supplied `fallbackConfig` is retained only for wire compatibility. `resolveProviderRoute()` is the single resolution entry point.

---

### VF-AUD-20260912-P1-005 — Tool registry leaks gated capabilities into generic chats

**Severity:** P1
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `src/agent/registry/tool-registry.ts`
- `src/stores/chat-stream-manager.ts`

**Evidence of remediation (current):**

`resolveAvailableTools(modelInfo, docAgentState.preset)` is now the single gating point. Tools that are not enabled by the current preset are excluded. The renderer can no longer smuggle tool enablement through the request body — `enable_document_tools` is stripped before dispatch (see P0-003).

---

### VF-AUD-20260912-P1-006 — Streaming delta envelope dropped appended tool-result metadata

**Severity:** P1
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/veniceClient.ts`
- `electron/ipc/handlers/veniceHandlers.ts`

**Evidence of remediation (current):**

Same fix as P1-002. The streaming delta envelope now carries `appendedMessages` for tool-result media/document metadata and both transports share the same validation/normalization path (`sanitizeStreamDeltaEnvelope` → `toRendererStreamDelta`).

---

### VF-AUD-20260912-P2-001 — Queued request cannot be aborted via signalId

**Severity:** P2
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/veniceClient.ts:136-170` (concurrency slot acquisition)

**Evidence of remediation (current):**

`acquireVeniceSlot(signal)` now honors an external `AbortSignal` — if the signal is already aborted, the slot acquisition throws immediately. Waiters attach an abort listener that resolves the waiter promise (effectively dropping the queued waiter).

**Regression test:** `electron/services/veniceClient.stream.test.ts:155-209` —

```typescript
it("aborts a queued request waiting for a concurrency slot (VF-AUD-20260912-P2-001)", async () => {
  ...
  // Enqueue an 11th request with a signalId
  const queuedPromise = performVeniceRequest({ endpoint: "/models", method: "GET", signalId: "queued-slot-test" });
  ...
  // Abort the queued request before any active request completes
  const abortResult = abortVeniceRequest("queued-slot-test");
  expect(abortResult.ok).toBe(true);
  await expect(queuedPromise).rejects.toThrow("Request aborted");
  expect(getVeniceConcurrencyStateForTests()).toEqual({ active: MAX_CONCURRENT_VENICE_REQUESTS, queued: 0 });
});
```

The test passes against the current working tree.

---

### VF-AUD-20260912-P2-002 — onAbort listener leaks if signal never fires

**Severity:** P2
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/veniceClient.ts:708-745`

**Evidence of remediation (current):**

```typescript
let onAbortListener: (() => void) | undefined;
const cleanup = () => {
  if (signal && onAbortListener) {
    signal.removeEventListener("abort", onAbortListener);
  }
};
...
req.on("close", cleanup);
req.on("error", cleanup);
```

The `cleanup` closure is invoked from `req.on("close")` and `req.on("error")` (line 728-741), and the listener is also removed in the outer `finally` block at line 478-480. Listener is registered with `{ once: true }` so it auto-removes after firing.

---

### VF-AUD-20260912-P2-003 — max_tokens vs max_completion_tokens field inconsistency

**Severity:** P2
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `src/stores/chat-stream-manager.ts:119` (`max_tokens` → `max_completion_tokens`)
- `src/types/venice.ts:196` (`max_completion_tokens` added to `ChatCompletionRequest`)
- `src/shared/safety/promptPayloadExtractor.ts:36` (`max_completion_tokens` added to `DENY_FIELD_NAMES`)

**Evidence of remediation (current):**

The chat stream body now sends `max_completion_tokens` (the OpenAI-compatible field that all current Venice models accept). Both field names are accepted by the type system for backwards compatibility; the request builder prefers `max_completion_tokens` and the safety extractor denylists both so neither is screened.

---

### VF-AUD-20260912-P2-004 — Provider adapter Gemini transform ignores max_completion_tokens

**Severity:** P2
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/providerAdapters.ts:258-262`

**Evidence of remediation (current):**

```typescript
generationConfig: {
  temperature: body.temperature,
  maxOutputTokens: (body.max_completion_tokens as number | undefined) ?? body.max_tokens
}
```

The Gemini `transformBody` now prefers `max_completion_tokens` and falls back to `max_tokens`.

---

### VF-AUD-20260912-P2-005 — console.warn/error globally silenced in tests (hides regressions)

**Severity:** P2
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `tests/setup.ts:24-30`

**Evidence of remediation (current):**

```typescript
// VF-AUD-20260912-P2-005: Do not globally silence console.warn and console.error.
// Expected warnings/errors should be scoped to individual tests via vi.spyOn(console, ...).
// console.warn = vi.fn();
// console.error = vi.fn();
```

Both lines are commented out. Tests that need to suppress specific logs use `vi.spyOn(console, 'warn').mockImplementation(...)` etc. on a per-test basis.

---

### VF-AUD-20260912-P2-006 — Chat-store save failures are silent

**Severity:** P2
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `src/stores/chat-store.ts:1441-1530`

**Evidence of remediation (current):**

`src/stores/chat-store.ts:1444-1462` —

```typescript
function notifySaveFailure(error: unknown): void {
  toast.error(
    translateRuntime("runtimeGenerated.stores.chatStore.notification.failedToSaveConversation", "Failed to save conversation"),
    redactErrorMessage(error),
    {
      label: translateRuntime("retry", "Retry"),
      onClick: () => { void flushAllPendingSaves(); },
    },
  );
}
```

`flushConversationSave` and `flushAllPendingSaves` now catch errors, log them via `logger.error` (with `redactErrorMessage`), and surface a retryable toast to the user. The original error continues to propagate from `flushConversationSave` so callers can decide whether to retry.

**Regression coverage:** `src/stores/chat-store.flush.test.ts` exercises the new failure paths.

---

### VF-AUD-20260912-P3-001 — chatFolderService uses `any` for conversation discrimination

**Severity:** P3
**Status:** Fully repaired
**Confidence:** High

**Affected files (prior):**
- `electron/services/chatFolderService.ts:225`

**Evidence of remediation (current):**

```typescript
function getConvKind(conversation: { metadata?: { character?: unknown } }): ChatFolderKind {
  return conversation.metadata?.character ? "character" : "standard";
}
```

The `any` parameter was replaced with a structural type. The file-level `/* eslint-disable @typescript-eslint/no-explicit-any */` was removed.

---

## NEW independent findings — this audit re-pass

No new P0/P1/P2 confirmed defects were discovered by the independent re-pass. The items below are design risks, improvements, and minor observations.

---

### VF-AUD-20260912-N1 — IPC parity check is currently manual (DR-001)

**Severity:** Improvement / DESIGN RISK
**Confidence:** Medium

**Status:** **FIXED** — `scripts/verify-ipc-parity.cjs` added with full channel-constant and template-literal resolution; wired into `npm run verify:contracts:static`; regression test in `scripts/verify-ipc-parity.test.ts`.

**Affected files (post-fix):**
- `scripts/verify-ipc-parity.cjs` (NEW)
- `scripts/verify-ipc-parity.test.ts` (NEW)
- `package.json` (added `verify:ipc-parity` script + wired into `verify:contracts:static`)

**Description (original):**
The prior audit verified IPC channel parity manually. This re-audit confirms the parity is intact (192 main handlers ↔ 192 preload invocations, 10 preload listeners ↔ main emitters), but there is no automated gate that catches future drift.

**Fix summary:**
The new verifier resolves:
- Direct string-literal channel registrations: `registerPrivilegedIpcChannel("channel", ...)`, `handleIpc("channel", ...)`, `rateLimitIpcHandler("channel", ...)`, `ipcMain.handle("channel", ...)`.
- Channel constants resolved via `const X = { key: "channel" } as const` (one level of nesting also supported).
- Single-string constants: `export const CHANNEL = "channel";`.
- Template-literal registrations in for-of loops, e.g. `for (const [channel, op] of [["list", listOp]] as const) { registerPrivilegedIpcChannel(`prefix:${channel}`, op); }`.
- Emitter channels: `webContents.send(...)`, `safeSendToRenderer(<expr>, "<literal>" | CONSTANT, ...)`, `broadcast(...)`.

The verifier then compares:
- `preload.invoke(channels)` vs handler-registered channels (must be subset of handlers).
- `preload.on(channels)` vs handler-registered ∪ emitter channels (must be subset of either).
- `handler-registered channels` vs consumer-covered set (must be subset of {invoke ∪ on ∪ emitters ∪ documented orphans}).

A documented orphan allow-list handles channels reachable only via the agent-tool executor (`documentAgent:workspace:proposeChangeset`, `:proposeMove`, `:proposeTrash`).

**Current verifier output:**
```
handler-registered channels: 195
preload.invoke channels:    192
preload.on channels:        10
documented orphans:         3
✅ IPC parity
```

---

### VF-AUD-20260912-N2 — Working tree dirty at audit time (DR-002)

**Severity:** DESIGN RISK
**Confidence:** High

**Description:**
At the time of this audit, 32 tracked files were modified and one directory (`docs/audits/venice-forge-exhaustive-audit-2026-09-12/`) was untracked. The modifications represent the in-progress remediation of the prior 19 findings and have not yet been committed/pushed to `origin/main`.

Local validation (lint, typecheck, 5855 tests, contracts, build, i18n, safety-guard) all PASS against this dirty tree. The risk is that the uncommitted remediation could be lost, partially reverted, or merged with conflicting changes.

**Recommended remediation:**
Per AGENTS.md §5, the user (Lead Dev) owns the dirty state. The recommended next step is to:
1. Review the dirty tree (`git diff --stat` shows the 32 files).
2. Stage and commit the remediation in logical chunks (security/data-integrity first, then API contracts, then persistence, then feature correctness, then tests, then cleanup).
3. Push to `origin/main` after hosted CI confirms green.

---

### VF-AUD-20260912-N3 — `assertPathContained` exact-root edge case (P3)

**Severity:** P3
**Confidence:** Medium

**Status:** **FIXED** — `electron/services/configService.ts:160-174` now treats exact-root match as contained.

**Affected files (post-fix):**
- `electron/services/configService.ts:160-174`

**Description (original):**

When `resolved === root`, `path.relative(root, resolved)` returns `""` (falsy), so the `relative && ...` guard short-circuits to `""` and the path is treated as **outside** the allowed container. This is overly strict for the exact-root case but is not exploitable — it just rejects an edge case that the user is unlikely to encounter.

**Fix:**

```typescript
const contained = allowedRoots.some((root) => {
  const relative = path.relative(root, resolved);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
});
```

The exact-root case is now treated as contained. Security semantics are unchanged: any path outside an allowed root (or with `..` segments, or on a different drive) is still rejected.

---

### VF-AUD-20260912-N4 — `.finally(release)` depends on void return (P3)

**Severity:** P3
**Confidence:** Medium

**Status:** **FIXED** — `electron/services/veniceClient.ts:749-758` now uses `.finally(() => { release(); })` to remove the implicit void-contract coupling.

**Affected files (post-fix):**
- `electron/services/veniceClient.ts:749-758`

**Fix:**

```typescript
}).finally(() => {
  // Wrap releaseVeniceSlot so the .finally callback can never accidentally
  // resolve the outer promise with a non-undefined value. releaseVeniceSlot
  // is typed `: void` today, but .finally forwards its callback's return
  // value through to .then, so an unannotated future refactor could silently
  // replace `response` with whatever the release function returned.
  // (VF-AUD-20260912-N4)
  release();
}).then((response) => {
  if (!response.ok) setLastApiError(readResponseError(response));
  return response;
});
```

The `.finally` callback now returns `undefined` deterministically, regardless of whether `releaseVeniceSlot`'s implementation is later refactored.

or annotate `releaseVeniceSlot`'s return type more strictly (it already is, but the call site should not depend on TypeScript-only type-erasure to be safe).

---

### VF-AUD-20260912-N5 — chat-stream-manager unusual `?.` syntax after cast (P3 / STYLE)

**Severity:** P3 / STYLE
**Confidence:** High

**Status:** **FIXED** — `src/stores/chat-stream-manager.ts:290-304` now extracts `errStatus` local for clarity and uses `??` for safer nullish coalescing.

**Affected files (post-fix):**
- `src/stores/chat-stream-manager.ts:290-304`

**Fix:**

```typescript
const errStatus = err as { status?: number; statusCode?: number };
const status = errStatus?.status ?? errStatus?.statusCode ?? "unknown";
logger.warn({
  category: "stream_retry",
  attempt: attempts,
  message: translateRuntime(...),
  status,
});
```

The redundant `(err as ...)?.status || (err as ...)` pattern is replaced with a single typed local and `??` (which correctly handles `status === 0` as a valid value, unlike the prior `||`).

---

### VF-AUD-20260912-N6 — MAX_CUSTOM_THEMES silently truncates (UX)

**Severity:** P3 / UX
**Confidence:** High

**Status:** **FIXED** — `src/stores/settings-store.ts:289-329` now warns via `console.warn` when truncation occurs, and a `CUSTOM_THEMES_SOFT_WARNING_THRESHOLD = 90` constant is exported for future UI integration.

**Affected files (post-fix):**
- `src/stores/settings-store.ts:24-26` (constant added)
- `src/stores/settings-store.ts:289-329` (warning in `setCustomThemes` + `saveCustomTheme`)

**Fix:**

```typescript
export const MAX_CUSTOM_THEMES = 100;
export const CUSTOM_THEMES_SOFT_WARNING_THRESHOLD = 90;

setCustomThemes: (themes) => {
  const dropped = Math.max(0, themes.length - MAX_CUSTOM_THEMES);
  if (dropped > 0) {
    console.warn(
      `[settings-store] setCustomThemes truncated ${dropped} oldest theme(s) to enforce MAX_CUSTOM_THEMES=${MAX_CUSTOM_THEMES}.`,
    );
  }
  set({ customThemes: themes.slice(0, MAX_CUSTOM_THEMES) });
},

saveCustomTheme: (theme) => {
  let droppedOldest = false;
  set((state) => {
    ...
    if (list.length > MAX_CUSTOM_THEMES) {
      droppedOldest = true;
      updated = list.slice(list.length - MAX_CUSTOM_THEMES);
    }
    ...
  });
  if (droppedOldest) {
    console.warn(`[settings-store] saveCustomTheme dropped the oldest custom theme ...`);
  }
},
```

Truncation now surfaces via `console.warn`. The soft-warning threshold is exported for a future UI hook (e.g. a settings-page "approaching limit" badge). Tests in `src/stores/settings-store.test.ts` pass (32/32).

---

### VF-AUD-20260912-N7 — MAX_PROFILES throws on overflow (UX)

**Severity:** P3 / UX
**Confidence:** High

**Status:** **FIXED** — `src/stores/profile-store.ts:15-92` `addProfile` now returns `AddProfileResult` (Result type) with `reason: "empty-name" | "limit-reached"`; the single caller `src/components/settings/DataStoragePanel.tsx` consumes the Result via toast; i18n keys added to `src/i18n/resources/en-US/common.json` and synced to 11 other locales; 24/24 profile-store tests pass.

**Affected files (post-fix):**
- `src/stores/profile-store.ts:15-92` (new `AddProfileResult` type + non-throwing `addProfile`)
- `src/components/settings/DataStoragePanel.tsx:88-106` (consumes the Result via toast)
- `src/stores/profile-store.test.ts` (test suite updated for Result API)
- `src/i18n/resources/en-US/common.json` (`runtimeGenerated.stores.profileStore.notification.*` keys added)
- `src/i18n/resources/{ar,de,es,fr,hi,ja,ko,pt-BR,ru,sv-SE,zh-CN}/common.json` (synced via `i18n:sync-catalogs`; carry `__MISSING__:` placeholders pending translation)

**Fix:**

```typescript
export type AddProfileResult =
  | { ok: true; profile: UserProfile }
  | { ok: false; reason: "empty-name" | "limit-reached"; limit?: number; message: string };

addProfile: (name, id) => {
  const safeName = name.trim();
  if (safeName.length === 0) {
    return {
      ok: false,
      reason: "empty-name",
      message: translateRuntime(
        "runtimeGenerated.stores.profileStore.notification.profileNameCannotBeEmpty",
        "Profile name cannot be empty.",
      ),
    };
  }
  if (get().profiles.length >= MAX_PROFILES) {
    return {
      ok: false,
      reason: "limit-reached",
      limit: MAX_PROFILES,
      message: translateRuntime(
        "runtimeGenerated.stores.profileStore.notification.maximumProfileLimitReached",
        `Maximum profile limit (${MAX_PROFILES}) reached. Delete an existing profile before adding a new one.`,
        { limit: MAX_PROFILES },
      ),
    };
  }
  ...
  return { ok: true, profile: newProfile };
};
```

The single renderer caller `DataStoragePanel.tsx` now displays the localized message via `toast.error(addResult.message)` and exits the import flow gracefully instead of relying on try/catch around a thrown Error.

---

## Rejected findings (false positives)

See `REJECTED_FINDINGS.md` for items initially suspected but verified as not defects.
