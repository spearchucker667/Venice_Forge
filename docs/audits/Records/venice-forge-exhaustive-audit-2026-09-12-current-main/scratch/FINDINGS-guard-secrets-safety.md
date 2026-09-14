# VF Guard / Secrets / Safety — Verified-Defect Findings

Audit date: 2026-09-12 · Target: HEAD `84cf5bbeb34ce87ab04ac6d6f8f164e549f4f399` (main, v3.0.0-beta.3)
Scope: `electron/services/guardPipeline.ts` + local-family safe-mode pipeline, `providerSettingsStore.ts`, main-process credential handling (`secureStore.ts`), `src/shared/safety/**`, `src/shared/redaction.ts`, main-process Venice network client (`veniceClient.ts`), safety/settings plumbing end-to-end, `server.ts` web proxy safety defaults, `mediaScreener.ts` heuristics, committed-secrets scan.
Method: static taint tracing (source → transform → validation boundary → sink → impact). All snippets verbatim from the checked-out tree. No repository source files were modified.

---

## VF-AUD-20260912-P1-001 — Family Safe Mode response screening is post-hoc for streaming chat; all content deltas are delivered before any 451

Severity P1 | Confidence High | Classification: confirmed defect (safety-filter bypass by ordering; 451 contract shape preserved but protective goal defeated)

Affected files: `electron/services/guardPipeline.ts:271-312`; `electron/services/veniceClient.ts:573-646,681-685`; `electron/ipc/handlers/veniceHandlers.ts:111-126`; `electron/agent/runtime/chat-agent-runner.ts:169-184`; `electron/services/bridgeServer.ts:326-372`; `src/services/veniceClient/stream.ts:73-77,84-105`; `server.ts:684-691` (standardVeniceProxy)

Observed: In `performGuardedVeniceRequest` the upstream response is screened only **after** `performVeniceRequest` fully resolves. For SSE streams, `performVeniceRequest` invokes `options.onDelta` per decoded event while bytes arrive (`veniceClient.ts:596-620`), and the returned body is only `{ text: streamText }` (`veniceClient.ts:681-685`). Every delta is forwarded to the renderer live before `screenUpstreamResponse` runs.

Evidence:
```
// electron/ipc/handlers/veniceHandlers.ts:111-126
const result = await runChatAgentLoop(request, toolExecutionContext, (chunk) => {
  const envelope: VeniceStreamDeltaEnvelope = { signalId: request.signalId!, delta: chunk.content ?? "", ... };
  safeSendToRenderer(event.sender, "venice:streamDelta", envelope, event.senderFrame);   // delivered immediately, per chunk
});
if (result.kind === "blocked") return result.block;   // 451 arrives only after the last chunk
```
```
// src/services/veniceClient/stream.ts:73-77 (renderer side, Electron mode)
const wrappedOnDelta = (chunk) => {
  accumulatedContent += chunk.content;
  onDelta(chunk);        // UI/store updated per delta; no screening of deltas in Electron mode
};
```
```
// src/services/veniceClient/stream.ts:82-85
// In desktop mode the IPC handler also runs the guard, so we skip the renderer check.
if (!isElectron()) {
```
```
// electron/services/bridgeServer.ts:365-371 — streaming 451 written after all content chunks
if (result.kind === "blocked") {
  res.write(`data: ${JSON.stringify({ error: result.block.body })}\n\n`);
  res.write("data: [DONE]\n\n");
```

Expected: While Family Safe Mode is enabled, generated assistant content must not reach the renderer unless the response screen has allowed it; a post-delivery 451 cannot retract streamed content. The web transport has the same gap: `/chat/completions` SSE responses are proxied via `standardVeniceProxy` (`server.ts:684-691`) with no response screening (only media endpoints get `fsmMediaVeniceProxy` buffering/screening, `server.ts:693-702,528-604`).

Root cause: Response screening is architected as a single post-dispatch step over the aggregated body; streaming delivery and response screening are not interlocked (no incremental delta screening, no withhold-until-screened buffering).

Impact: With FSM on, a streaming `/chat/completions` response that violates the response-side filter (e.g. adult-explicit text, unsafe roleplay output) is delivered in full to the chat UI and persisted into conversation state; the late 451 only surfaces an error banner. The response-side family filter is effectively non-functional for streaming — the dominant chat path. (Request-side mandatory child-safety guard is unaffected.)

Recommended remediation: Screen incrementally (bounded rolling window per delta with fail-closed termination of the stream), or buffer streaming deltas in the main process until the aggregated text passes `screenResponseBody`, forwarding only after allow. Apply the same policy in `server.ts` for the web proxy streaming route.

Required regression tests: (1) streaming `/chat/completions` with a guard-triggering final body → renderer receives zero content deltas and a 451; (2) same via bridge server SSE; (3) same via web proxy streaming route; (4) long benign stream (>MAX_SCAN_CHARS) still allowed and complete; (5) FSM-off streaming unaffected.

---

## VF-AUD-20260912-P1-002 — Mandatory child-safety guard silently skips all chat messages beyond the 32nd extracted field

Severity P1 | Confidence High | Classification: confirmed defect (guard coverage gap / safety-boundary bypass)

Affected files: `src/shared/safety/promptPayloadExtractor.ts:41-48,114-146`; `src/shared/safety/childExploitationGuard.ts:656-695`; enforcement boundaries: `electron/services/guardPipeline.ts:282-288`, `server.ts:815-861`

Observed: Extraction stops at `MAX_FIELDS = 32` fields per payload. For `/chat/completions` each non-empty `messages[i].content` consumes one field, so in any conversation with more than 32 non-empty messages, **messages from index ~32 onward are never extracted and never screened**. Those tail messages include the newest user turn on every subsequent send.

Evidence:
```
// src/shared/safety/promptPayloadExtractor.ts:41-48
/** Max characters per extracted field value to prevent excessive processing. */
const MAX_FIELD_CHARS = 8_000;
/** Max number of fields to extract per payload. */
const MAX_FIELDS = 32;
```
```
// src/shared/safety/promptPayloadExtractor.ts:120-126
if (key === "messages" && Array.isArray(val)) {
  for (let i = 0; i < val.length && results.length < MAX_FIELDS; i++) {
    const msg = val[i];
    ...
    if (typeof msg["content"] === "string") {
      const content = msg["content"].slice(0, MAX_FIELD_CHARS);
```
```
// src/shared/safety/childExploitationGuard.ts:657-665 — the guard only ever sees what was extracted
const fields = extractPromptLikeFields(input.payload, input.endpoint);
...
const combinedRaw = fields.map(f => f.value).join(" ");
```

Expected: Every user-controlled message in the outbound payload is subject to the mandatory child-exploitation guard regardless of conversation length (subject only to the documented per-field scan-window truncation, see VF-AUD-20260912-P2-003).

Root cause: A fixed global field-count budget is shared across the messages array; long histories exhaust it before the most recent messages are reached. There is no test coverage for >32 messages (`src/shared/safety/promptPayloadExtractor.test.ts` has no many-messages case).

Impact: In long roleplay/conversational sessions (the common case in this app), the latest user messages transit to Venice with no mandatory child-safety screening at the IPC boundary and at the web-proxy boundary (same extractor, `server.ts:818-821` path via Buffer→JSON→`extractFromObject`). A user or injected document placing disallowed content late in a long history bypasses the guard.

Recommended remediation: For `messages` arrays, always extract the first system message plus the **last N messages** (e.g. all messages from the most recent user turn backward, up to a budget), or raise `MAX_FIELDS` for the messages case with per-endpoint logic; add an explicit guard-side assertion that the final message was included.

Required regression tests: (1) 40-message payload with a blocking signal in message[39] → blocked at IPC boundary and web proxy; (2) 40-message payload with signal in message[0] → blocked; (3) 40 clean messages → allowed; (4) extraction count telemetry includes last-message-processed marker.

---

## VF-AUD-20260912-P2-003 — Per-field 8,000-character pre-slice defeats the normalization layer's tail/middle scan windows

Severity P2 | Confidence High | Classification: confirmed defect (guard coverage gap; test-locked truncation)

Affected files: `src/shared/safety/promptPayloadExtractor.ts:41-42,55,125,136,240,246`; `src/shared/safety/normalization.ts:22-31,158-206`; `src/shared/safety/promptPayloadExtractor.test.ts:235-239`

Observed: Every extracted field value is hard-sliced to `MAX_FIELD_CHARS = 8_000` characters **before** `computeMultiNorm` runs. The normalization layer's stated invariant — "MAX_SCAN_CHARS + TAIL_SCAN_CHARS + MIDDLE_SCAN_CHARS windows must cover every byte of oversized input" (`normalization.ts:12-13`) — is defeated at the extractor boundary: bytes beyond character 8,000 of any single `prompt`/`messages[].content` field are discarded, so the tail (`TAIL_SCAN_CHARS = 8_000`) and middle windows never see them.

Evidence:
```
// src/shared/safety/promptPayloadExtractor.ts:55
function safeStringify(v: unknown): string | null {
  if (typeof v === "string") return v.slice(0, MAX_FIELD_CHARS);
```
```
// src/shared/safety/normalization.ts:22-23
/** Maximum characters scanned per field. Oversized inputs are truncated — not an error. */
export const MAX_SCAN_CHARS = 16_384;
```
```
// src/shared/safety/promptPayloadExtractor.test.ts:235-239 — behavior locked by test
it("handles excessively long plain strings", () => {
  const longString = "x".repeat(11 * 1024 * 1024); // 11MB
  const fields = extractPromptLikeFields(longString, "/chat/completions");
  expect(fields).toContainEqual({ path: "body", value: longString.slice(0, 8000) }); // MAX_FIELD_CHARS
```

Expected: Oversized single fields should be screened by the head+middle+tail machinery (which already exists and is O(1)); truncation to 8,000 chars silently exempts the remainder of any long message or document body sent to `/augment/text-parser`, long RP posts, etc.

Root cause: Two independent truncation layers with mismatched budgets; the lower (extractor) layer caps below the upper layer's own head window (`MAX_SCAN_CHARS = 16_384`), making the upper layer's tail/middle paths unreachable for single fields.

Impact: Disallowed content positioned past character 8,000 of one message/field reaches Venice unscreened by both the mandatory guard and the FSM optional filter.

Recommended remediation: Raise `MAX_FIELD_CHARS` to at least `MAX_SCAN_CHARS + TAIL_SCAN_CHARS + MIDDLE_SCAN_CHARS` (or pass the raw value through and let `computeMultiNorm` own all truncation); update the test at `promptPayloadExtractor.test.ts:235-239` accordingly and add a test asserting a blocking signal at offset >8,000 of a single field is caught via the tail window.

Required regression tests: (1) single 30,000-char prompt with blocking signal at char 20,000 → blocked; (2) same with signal at char 2,000 → blocked; (3) normal-length prompts unaffected.

---

## VF-AUD-20260912-P2-004 — `redactSecrets` blind spots: modern token families unredacted; key-name pattern misses `credential`/`private_key`; quoted env assignments only partially redacted

Severity P2 | Confidence Medium-High | Classification: confirmed defect (defense-in-depth redaction gap; latent credential-leak risk into logs/IPC errors)

Affected files: `src/shared/redaction.ts:4-28,35-43,60-78`; latent sink example: `electron/ipc/handlers/apiKeyHandlers.ts:313-336` (variable named `credential` holding a raw provider key)

Observed: Redaction patterns cover `Bearer …`, `apiKey/token/secret/password=…`, `vn-…`, `venice_…`, `sk-…`, and `WORD_API_KEY/TOKEN/SECRET/PASSWORD=…`. They do **not** cover other common credential shapes (Hugging Face `hf_…`, GitHub `ghp_…`, AWS `AKIA…`, Slack `xox…`), and the object-key pattern `SECRET_KEY_PATTERN` does not match property names like `credential`, `private_key`, `passphrase`, or `session`. A raw `hf_…` string in any error message, or an object such as `{ credential: "<key>" }` passed as log metadata, passes `redactSecrets` unchanged. Additionally, `ENV_ASSIGNMENT_PATTERN` excludes spaces from the value class, so `KEY="token with space"` redacts only the first token.

Evidence:
```
// src/shared/redaction.ts:4,13-24
export const SECRET_KEY_PATTERN = /(authorization|api[-_ ]?key|token|secret|password)/i;
...
const VENICE_KEY_PATTERN = /\bvn-[A-Za-z0-9._~+/=-]{8,}\b/gi;
const VENICE_UNDERSCORE_PATTERN = /\bvenice_[A-Za-z0-9._~+/=-]{8,}\b/gi;
const SK_KEY_PATTERN = /\bsk-[A-Za-z0-9._~+/=-]{8,}\b/gi;
```
```
// src/shared/redaction.ts:69-76 — only key names matching SECRET_KEY_PATTERN are masked
for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
  if (SECRET_KEY_PATTERN.test(key)) {
    redacted[key] = "[REDACTED]";
```

Expected: All provider-credential shapes the app itself stores (the provider registry includes huggingface, anthropic, google, etc.) and generic credential-bearing key names are covered by the central redactor, since `logError(..., meta)` runs `redactSecrets(meta)` (`electron/services/logger.ts:114-120`) and `sanitizeErrorText` runs on error strings.

Root cause: Pattern list was grown per-incident (Venice/OpenAI shapes only); no canonical enumeration of the credential forms the app's own `PROVIDER_REGISTRY` can hold.

Impact: Not exploitable today via a confirmed sink (provider keys are not currently logged), but any future `logError("...", { credential })`-style debugging — a natural pattern given `apiKeyHandlers.ts` names the variable exactly that — writes the raw key to `venice-forge.log` unredacted.

Recommended remediation: Add `hf_[A-Za-z0-9]{20,}`, `ghp_[A-Za-z0-9]{20,}`, `AKIA[0-9A-Z]{16}`, `xox[baprs]-…` patterns; extend `SECRET_KEY_PATTERN` with `credential|private[_-]?key|passphrase|session`; allow quoted multi-word values in `ENV_ASSIGNMENT_PATTERN`; add regression tests mirroring `redaction.test.ts` for each new shape.

Required regression tests: redactSecrets/redactErrorMessage cases for each token family, `{credential: …}` meta objects, and `ENV="two words"` assignments.

---

## VF-AUD-20260912-P3-005 — Two main-process call sites dispatch Venice requests outside `guardPipeline` (no guard pre-check, no textual response screen)

Severity P3 | Confidence High | Classification: confirmed defect (defence-in-depth gap; low direct impact)

Affected files: `electron/agent/runtime/image-model-resolver.ts:48-61`; `electron/services/backgroundTaskManager.ts:656-661`; contrast `electron/services/backgroundTaskManager.ts:941-946` (guarded), `electron/ipc/handlers/veniceHandlers.ts:61` (guarded)

Observed: `fetchLiveImageModels` calls `performVeniceRequest` directly (GET `/models?type=image`), and the music polling loop calls `performVeniceRequest` directly (POST `/audio/retrieve`). Neither passes through `checkLocalFamilyGuard` or `screenUpstreamResponse`. The guard-pipeline file header states every Venice-touching entry point "must route through these helpers" (`guardPipeline.ts:1-10`). Both payloads are internally constructed (no user-controlled prompt text: `buildAudioRetrieveRequest(taskModel, task.queueId)`), and the `/audio/retrieve` binary result is separately screened via `identifyAndValidateGeneratedMedia` (`backgroundTaskManager.ts:697-716`), which limits impact.

Evidence:
```
// electron/services/backgroundTaskManager.ts:656-661
const response = await performVeniceRequest({
  endpoint: "/audio/retrieve",
  method: "POST",
  body: buildAudioRetrieveRequest(taskModel, task.queueId),
  profileId: task.profileId,
});
```
```
// electron/agent/runtime/image-model-resolver.ts:50-54
const response = await performVeniceRequest({
  endpoint: "/models?type=image",
  method: "GET",
  profileId,
});
```

Expected: A single choke point: all Venice dispatches route through `performGuardedVeniceRequest` so policy changes cannot be undermined by direct-call regressions.

Root cause: Two services imported the lower-level `performVeniceRequest` directly; no lint/verifier enforces the choke point.

Impact: Low today (no user taint enters these payloads; media bytes are screened separately; the mandatory guard would likely allow these anyway). The risk is architectural: these paths would not inherit future mandatory-guard changes.

Recommended remediation: Route both call sites through `performGuardedVeniceRequest`; add a contract test/verifier (e.g. `verify:safety-guard` family) that fails CI when `performVeniceRequest(` appears outside `guardPipeline.ts`/test files.

Required regression tests: unit tests asserting both call sites return the canonical 451 shape when the runtime guard blocks; verifier test scanning `electron/` for direct `performVeniceRequest` imports outside the allowlist.

---

## VF-AUD-20260912-P3-006 — Electron runtime safety snapshot fails open (FSM off) before config load and on any config-load failure, diverging from the fail-closed web default

Severity P3 | Confidence Medium | Classification: confirmed defect (fail-open safety default; inconsistent cross-transport contract)

Affected files: `electron/services/runtimeSafetySettings.ts:1-4`; `electron/services/configService.ts:626-627,633-641`; `electron/main.ts:258-268`; contrast `server.ts:83-112` (web proxy defaults ON)

Observed: The runtime snapshot defaults both toggles to `false`, is only set after `initializeConfig()` succeeds, and the failure branch explicitly forces both off even when the on-disk config had them on. The web proxy, by contrast, defaults FSM **ON** when the env var is unset and treats the env var as authoritative. There is a startup window (`app.whenReady` → recovery → `bootstrap()` → `await initializeConfig()`) during which IPC is not yet registered, but the bridge-server/headless path and any future pre-config IPC would run with FSM off.

Evidence:
```
// electron/services/runtimeSafetySettings.ts:1-3
/** Main-process runtime snapshot shared by config loading, IPC, and the bridge server. */
let localFamilySafeModeEnabled = false;
let veniceApiSafeMode = false;
```
```
// electron/services/configService.ts:633-638
} catch (err) {
  logError("Config initialization failed", String(err));
  // Fall back to defaults so the app still boots.
  currentConfig = emptyConfig();
  setRuntimeLocalFamilySafeModeEnabled(false);
  setRuntimeVeniceApiSafeMode(false);
```

Expected: A user who enabled Family Safe Mode should not silently lose it because config.yaml was temporarily unreadable; the fail direction should match the web proxy (fail closed for the optional filter) or at minimum surface a prominent "safety settings could not be loaded" state that gates outbound media/chat.

Root cause: Boot-resilience logic (`emptyConfig()` fallback) prioritizes availability over the user's safety preference; the snapshot has no "unknown/uninitialized" state.

Impact: FSM (the optional family filter) silently disabled during the failure window; the mandatory child-exploitation guard still runs (`localFamilySafeGuard.ts:224-238`), so impact is limited to the optional layer. `venice_api_safe_mode` also forced off, meaning outbound `safe_mode` forced false on image endpoints during the window.

Recommended remediation: Add a tri-state (unset → fail closed for FSM / preserve last-known), re-read the raw `safety:` keys from config.yaml directly in the failure branch before falling back, and surface a status warning consumed by the renderer status cluster.

Required regression tests: config load throws with `safety.local_family_safe_mode_enabled: true` on disk → runtime getter still true (or UI warning flag set); headless bridge started before config init → guarded requests still enforced.

---

## VF-AUD-20260912-P3-007 — `LOCAL_PATH_PATTERN` over-redaction corrupts ordinary diagnostics (dates, URL paths, model ids)

Severity P3 | Confidence High | Classification: confirmed defect (diagnostic-integrity minor)

Affected files: `src/shared/redaction.ts:27-28,50-52`

Observed: The "local path" pattern matches any two-or-more `/segment` sequence, so commonplace diagnostic content such as ISO dates (`2026/09/12`), API path prefixes (`/image/generate` is two segments but single-slash — unaffected; however `/v1/models` style strings), and ratio-like text are replaced with `[REDACTED-PATH]`. Combined with the first alternative (`https?://…` whole-URL redaction), nearly every URL in an error message is fully destroyed, hampering debugging of provider errors.

Evidence:
```
// src/shared/redaction.ts:27-28
const LOCAL_PATH_PATTERN =
  /(?:https?:\/\/|file:\/\/)[^\s"')]+|(?:\/[A-Za-z0-9._ -]+){2,}(?:\.[A-Za-z0-9]+(?::\d+:\d+)?)?|[A-Za-z]:[\\/][^\s"')]+/gi;
```
```
// src/shared/redaction.ts:95-97
export function sanitizeErrorText(value: string): string {
  return redactPaths(redactString(value));
}
```

Expected: Redact machine/user-identifying absolute paths while preserving relative API paths and dates; URLs should keep scheme+host+path with query redaction (cf. the more precise `redactUrl` at `redaction.ts:116-132`).

Impact: Log/diagnostic usability only; no security impact (fail-safe direction).

Recommended remediation: Restrict the relative-path arm to segments with path-like depth (≥2 slashes AND a dotfile or home prefix), or require an absolute start (`/Users/`, `/home/`, `C:\`); route URLs through `redactUrl`-style host+path preservation.

Required regression tests: `sanitizeErrorText("GET https://api.venice.ai/v1/models failed 2026/09/12")` preserves host/path/date; `/Users/name/file.png` still redacted.

---

# Rejected candidates

- **Prior-audit claim "web proxy rewrites `safe_mode` when FSM is on" (docs/audits/venice-forge-exhaustive-audit-2026-09-10/FINDINGS.md:546-549): REMEDIATED.** No `applyVeniceApiSafeMode`/`safe_mode` reference exists in `server.ts` (verified by full-file grep); the proxy forwards client bodies verbatim after the guard middleware. Desktop authority (`guardPipeline.ts:149-162` via `src/shared/veniceSafeMode.ts:78-100`) now overwrites `safe_mode` for exactly the three image endpoints that declare it per the tracked OpenAPI matrix.
- **Renderer-supplied `localFamilySafeModeEnabled` bypass: NOT FOUND.** The field is explicitly dropped at the validation boundary (`electron/ipc/validation.ts:265-273`) and the guard reads only the main-process runtime snapshot (`guardPipeline.ts:103`).
- **Generic config setter bypassing safety policy: NOT FOUND.** `writeSanitizedConfig` merges only known sections and re-validates via `validateConfig` with `clampBool` on both safety flags (`src/config/configSchema.ts:727-739`); secrets patches are stripped before persistence (`configService.ts:700-715`).
- **Web-proxy FSM default: VERIFIED SOUND.** `VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED` is authoritative when set; unset defaults ON; client header honored only under the dev-only `VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE=true` (`server.ts:99-112`); unit-tested (`server.test.ts:830-929`). Case-quirk (`"FALSE"` treated as enabled) fails safe.
- **Committed secrets: NONE FOUND.** Repo-wide scan for `vn-`, `sk-`, `ghp_`, `AKIA`, `xox*` token shapes (excluding node_modules/.git/dist/coverage) returned only synthetic test vectors (e.g. `src/shared/redaction.test.ts:25`, `src/stores/chat-store.test.ts:274`, `electron/services/backgroundTaskManager.test.ts:329`).
- **Credential storage/exposure: VERIFIED SOUND.** safeStorage encryption with throw-on-unavailable on Win/mac; Linux plaintext fallback gated by explicit env opt-in; password-class credentials refuse plaintext on every OS (`secureStore.ts:551-576,606-631,664-680`); PBKDF2-SHA256 310k-iteration verifiers with `timingSafeEqual` and main-process lockout (`secureStore.ts:733-740,880-911`); IPC exposes only `configured` booleans (`apiKeyHandlers.ts:438-448`); bridge token is 32-byte random or strength-validated env token, never logged (`bridgeServer.ts:187-199,422-428`); provider fallback routing never sends the Venice key to third-party hosts (`veniceClient.ts:560-566`, `providerAdapters.ts:336-645`).
- **Venice key in URL query (Google Vertex `?key=`): NOT ELEVATED.** Route path is constructed in main and never logged by the client/telemetry paths reviewed; no sink found.
- **`screenUpstreamResponse` top-level-array bodies: already documented** in-code as VF-AUD-20260912-DR-002 (`guardPipeline.ts:189-191`); Venice currently returns objects, and string bodies still receive the textual screen. Tracked, not re-filed.
- **mediaScreener heuristic weaknesses (IHDR-trusted dimensions, PCM accepted on declaration): NOT ELEVATED.** The heuristic is explicitly documented as structural-only with truthful capability reporting (`mediaScreener.ts:139-213`); callers pass `application/octet-stream`, making the PCM and declared-MIME branches unreachable from the reviewed screening sinks; a semantic backend registration hook exists.
