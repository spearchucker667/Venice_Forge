# Venice API Contract Findings

- **Audit ID prefix:** `VF-AUD-20260910-API-NNN`
- **Date:** 2026-09-10
- **Baseline SHA:** `c3ae21af2f723111d92b43c7888a60930226d213`
- **Branch:** `main`
- **Package:** `venice-forge@3.0.0-beta.3`
- **Authoritative Swagger:** `docs/reference/Venice_swagger_api.yaml` (`info.version` / `x-venice-forge-provenance.content_version`: `20260821.193530`)
- **Method:** static source-vs-Swagger review. No live Venice calls, no test execution.
- **Scope:** renderer `src/services/veniceClient/**`, shared SSE decoder, Electron main client, Family Safe Mode vs `safe_mode`, media contract, payload builders, image capabilities, workflow image/video nodes.

This file is scratch evidence for the 2026-09-10 exhaustive audit. Historical 2026-08-15 findings were treated as hypotheses and revalidated against the current tree; they were not copied.

---

## Finding counts

| Bucket | Count |
|---|---|
| New confirmed defects | 8 |
| New missing features / architecture gaps | 2 |
| New documentation / contract-drift items | 3 |
| Historical P1-001..004 revalidated | 4 (3 fully repaired, 1 partially repaired) |
| **Total new findings (`VF-AUD-20260910-API-*`)** | **13** |

Severity mix of new findings: **P1 = 5**, **P2 = 5**, **P3 = 3**.

---

## Historical revalidation (VF-AUDIT-20260815-P1-001..004)

These IDs are not reissued. Status is against SHA `c3ae21af2f723111d92b43c7888a60930226d213` and Swagger `20260821.193530`.

### VF-AUDIT-20260815-P1-001 — provider `safe_mode` injected into undeclared schemas

**Status:** **fully repaired** for the original defect (foreign `safe_mode` on audio/embeddings/augment/chat/video).

**Current evidence:**

- Swagger declares `safe_mode` only on `GenerateImageRequest` (line 2676), `EditImageRequest` (3027), `MultiEditImageRequest` (3118), and `MultiEditImageMultipartRequest` (3216). `CreateSpeechRequestSchema`, `CreateTranscriptionRequestSchema`, `CreateEmbeddingRequestSchema`, `QueueVideoRequest`, `QuoteVideoRequest`, `ChatCompletionRequest`, and augment schemas do not declare it; several set `additionalProperties: false`.
- `src/shared/veniceSafeMode.ts` `ENDPOINTS_WITH_SAFE_MODE` is only `/image/generate`, `/image/edit`, `/image/multi-edit` (lines 41–45). `applyVeniceApiSafeMode()` no-ops elsewhere.
- `tests/safety/veniceSafeMode.test.ts` asserts omission for speech, transcriptions, embeddings, search, scrape, text-parser, audio/video queue/retrieve/quote/complete, and chat.
- Electron `withFamilySafeProviderOverride` (`electron/services/guardPipeline.ts:149–161`) applies the helper with `getRuntimeVeniceApiSafeMode()`, not Family Safe Mode.

**Residual (new, not the original P1-001):** web proxy still *forces* `safe_mode: true` on those supported image endpoints when local Family Safe Mode is on. See `VF-AUD-20260910-API-001`.

### VF-AUDIT-20260815-P1-002 — SSE event / UTF-8 / error-frame violations

**Status:** **partially repaired**.

**Repaired:**

- Shared `SseDecoder` in `src/shared/sseStreamDecoder.ts` does incremental UTF-8 (`TextDecoder` fatal+stream), blank-line event boundaries, multiline `data:` join, comment/unknown-field ignore, `[DONE]`, and EOF flush.
- Web (`src/services/veniceClient/stream.ts:250–330`) and Electron (`electron/services/veniceClient.ts:517–586`) both consume that decoder.
- `src/shared/sseStreamDecoder.test.ts` covers split multibyte code points, CRLF/CR, comments, malformed JSON, provider error frames, `[DONE]`, and truncated UTF-8.

**Still present (new IDs below):**

- Electron `flush()` truncated UTF-8 is logged and the stream still resolves success (`VF-AUD-20260910-API-003`).
- Provider error / malformed frames are warned, not failed (`VF-AUD-20260910-API-004`).
- Abort is not a canonical `AbortError` on either transport (`VF-AUD-20260910-API-002`).

### VF-AUDIT-20260815-P1-003 — video duration optional; unsupported quote/queue fields

**Status:** **fully repaired** for the original builder/workflow-default defect.

**Current evidence:**

- `buildCanonicalVideoQuotePayload` / `buildCanonicalVideoQueuePayload` require non-empty `duration` (`src/shared/venice-media-contract/payload-builders.ts:235–274`).
- Quote no longer emits `prompt` / `audio_prompt`. Queue no longer emits `audio_prompt`, `seed`, `cfg_scale`, `motion_score`, or `fps` (asserted in `payload-builders.test.ts`).
- Workflow schema `videoDuration` is required with default `"5s"` (`src/lib/workflow-schema.ts:497–508`). Engine refuses empty duration before dispatch (`src/lib/workflow-engine.ts:259–270`).

**Related residual (new):** Video Studio still omits `duration` when runtime metadata advertises no duration list (`VF-AUD-20260910-API-010`). Missing Swagger fields `omni_reference_task_type`, `elements`, `keyframes`, `reference_document_urls` are product gaps, not the original foreign-field bug.

### VF-AUDIT-20260815-P1-004 — `reference_image_urls` on image generate; invented `venice-character-reference-v1`

**Status:** **fully repaired**.

**Current evidence:**

- `buildImagePayload()` emits `style_references: [{ image, strength }]` and never `reference_image_urls` (`src/utils/payloadBuilders.ts:464–485`). Matches `GenerateImageRequest.style_references` (Swagger 2752–2783).
- Static registry test: `src/config/image-model-capabilities.test.ts` “removed the invented venice-character-reference-v1 production entry”.
- Character scene generation resolves support from runtime `/models` via `resolveStyleReferenceCapabilities()` (`src/services/characterSceneGenerationService.ts:141–149`).
- `reference_image_urls` remains video-only (`QueueVideoRequest` Swagger 3720; canonical video builder 309–311).

---

## New findings

### VF-AUD-20260910-API-001

**Severity:** P1  
**Confidence:** High  
**Classification:** Confirmed defect  

**File:line:** `server.ts:631–633`; `server.ts:170–176`; `src/shared/veniceSafeMode.ts:1–8`; `electron/services/guardPipeline.ts:149–161`

**Symbol:** `forceProviderSafeModeInJsonBody`, `isLocalFamilySafeModeEnabled`

**Observed:** After the local Family Safe Mode guard allows a POST, the Express proxy does:

```ts
if (familySafeModeEnabled && Buffer.isBuffer(req.body)) {
  req.body = forceProviderSafeModeInJsonBody(endpoint, req.body);
}
```

That helper calls `applyVeniceApiSafeMode(endpoint, parsed, true)`. On `/image/generate`, `/image/edit`, and `/image/multi-edit` this overwrites the wire `safe_mode` to `true` whenever the proxy considers Family Safe Mode on.

Web proxy Family Safe Mode defaults **on** when `VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED` is unset (`server.ts:84–112`). The renderer header is ignored unless `VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE=true`.

Electron does **not** do this: `withFamilySafeProviderOverride` uses `getRuntimeVeniceApiSafeMode()` only.

**Expected:** Local Family Safe Mode and provider `safe_mode` remain independent on every transport. `applyVeniceApiSafeMode` should receive the user’s Venice API Safe Mode boolean, not `true` because FSM is on.

**Root cause:** Web proxy still couples the two controls. Renderer `veniceFetch` applies `useSettingsStore.veniceApiSafeMode` first; the proxy then forces `true` on the outbound body for FSM-on (the default).

**Impact:** On the web/dev-proxy transport, turning provider Safe Mode off does not produce `safe_mode: false` for image generate/edit/multi-edit while Family Safe Mode is on (the default). Adult-mode image requests are still blurred/filtered by Venice. Electron honors the independent toggle. `server.test.ts` has no assertion on `forceProviderSafeModeInJsonBody`.

**Remediation:** Stop forcing `true` from FSM. If a fail-closed web default is required, document it as a proxy policy and do not claim independence. Prefer applying `applyVeniceApiSafeMode(endpoint, body, veniceApiSafeModeFromConfig)` the same way Electron does.

**Tests:** Proxy test: FSM on + `venice_api_safe_mode: false` + POST `/image/generate` body `{model,prompt,safe_mode:false}` must leave `safe_mode: false` (or match the explicit config). FSM off + provider on must still inject `true` only on declared endpoints. Chat/audio/video bodies must still lack `safe_mode`.

---

### VF-AUD-20260910-API-002

**Severity:** P1  
**Confidence:** High  
**Classification:** Confirmed defect  

**File:line:** `src/services/veniceClient/stream.ts:206–209, 280–294`; `electron/services/veniceClient.ts:638–650`; `electron/ipc/handlers/veniceHandlers.ts:36–44, 129–136`; `src/stores/chat-stream-manager.ts:40–41, 272–288`

**Symbol:** `veniceStreamChat`, `abortVeniceRequest`, `startStream` / `stopStream`

**Observed:**

- Web stream converts user abort into `throw new Error("Aborted")`, not `DOMException`/`AbortError`.
- Electron destroy uses `new Error("Request aborted")`. The IPC handler catches it and returns `{ ok: false, status: 0, body: { error: "<redacted message>" } }` via `transportErrorResponse`. Renderer `veniceStreamChat` then throws a generic `VeniceApiError` with `status: 0`.
- `startStream()` only treats `err instanceof DOMException && err.name === "AbortError"` as a clean stop. Otherwise it appends `[Error: Sorry, something went wrong. Please try again.]`.

Focused tests mock `veniceStreamChat` to reject with `AbortError` (`src/stores/chat-stream-manager.test.ts`), so they never see the real transport error type.

**Expected:** User `stopStream()` / AbortSignal abort is a cancellation: no assistant error text, `aborted: true`, no retry.

**Root cause:** Three abort encodings (`Error("Aborted")`, `Error("Request aborted")`, `status: 0` IPC body) and one consumer that only accepts `DOMException AbortError`.

**Impact:** Stop Generation on both web and Electron looks like a provider failure. Partial assistant text already flushed stays, plus a fake error suffix. `isRetryableError` does not treat these as abort (status `0` is not in `RETRYABLE_STATUSES`), so a status-0 abort is at least not retried; it is still shown as an error.

**Remediation:** Throw `DOMException("Request aborted", "AbortError")` (or a shared `isAbortError()` covering message `Aborted` / `Request aborted` and IPC status 0 with that body) from web stream, Electron client, and IPC. `startStream` should use the same helper. Do not append `SAFE_STREAM_ERROR_MESSAGE` on cancel.

**Tests:** Web: abort during `reader.read()` yields `AbortError` and no inspector 500. Electron: `venice:abort` during stream does not append the safe error string. Manager test against the real throw shapes, not only mocked `AbortError`.

---

### VF-AUD-20260910-API-003

**Severity:** P1  
**Confidence:** High  
**Classification:** Confirmed defect  

**File:line:** `electron/services/veniceClient.ts:574–603`; contrast `src/services/veniceClient/stream.ts:315–326`

**Symbol:** `performSingleVeniceRequest` `res.on("end")` SSE `flush()`

**Observed:** Mid-stream invalid UTF-8 destroys the request (`push` catch → `req.destroy("Venice returned invalid stream data.")`). At EOF, `sseDecoder.flush()` throwing `SseDecodeError("truncated_utf8")` is only `logError`’d. The handler still `resolve()`s `{ ok: true, status: 2xx, body: { text: streamText } }` when the HTTP status was successful.

Web `veniceStreamChat` throws `"Venice stream ended with a truncated data sequence."` on the same `flush()` failure.

**Expected:** Identical byte streams produce identical success/error outcomes on both transports. Truncated UTF-8 at EOF is a failed stream.

**Root cause:** Electron `end` handler treats decode errors as log-only so it can still assemble a 2xx IPC response.

**Impact:** A cut-off multibyte sequence at EOF (connection drop, proxy timeout, idle socket timeout) can persist a silently truncated assistant message on Electron while web fails closed.

**Remediation:** On `flush()` `SseDecodeError`, reject or return `ok: false` with a generic stream-decode error. Do not resolve success. Align with web.

**Tests:** Feed a valid `data:` prefix then a truncated UTF-8 tail (`0xC3` only) through the Electron read loop; assert non-ok / thrown error. Web already throws in unit tests of the decoder; add a transport-level Electron test.

---

### VF-AUD-20260910-API-004

**Severity:** P1  
**Confidence:** High  
**Classification:** Confirmed defect  

**File:line:** `src/shared/sseStreamDecoder.ts:229–258, 308–357`; `src/services/veniceClient/stream.ts:257–276, 332–336`; `electron/services/veniceClient.ts:525–545`

**Symbol:** `extractStreamDelta`, `applyStreamSseEvent`, `consumeSseEvents`

**Observed:** JSON provider error frames (`{"error":"..."}`, `{"type":"error",...}`) are `malformed: true`. Both transports log a redacted warning and continue. If a later `[DONE]` or EOF arrives, the stream completes as HTTP 200 / IPC ok. Inspector logs success. `extractStreamDelta` additionally treats an error object that also carries `choices[0].delta.content` as a normal delta (`isErrorFrame && !content && !reasoning`).

**Expected:** A provider error frame fails the stream (typed error, no false-success persistence). Harmless non-JSON comments are already ignored by the decoder; malformed JSON and `error` frames are not benign.

**Root cause:** P1-002 remediation promoted frames to logs (“never silently dropped”) but did not fail the consumer.

**Impact:** Rate-limit / quota / moderation error frames can yield a successful-looking chat with missing or empty assistant text. Users retry blindly; paid tokens may already have been consumed.

**Remediation:** If `outcome.malformed && outcome.errorMessage`, throw a `VeniceApiError` (status 4xx/5xx if parseable). Do not mark inspector success. Keep redacted logging.

**Tests:** `data: {"error":{"message":"quota exceeded"}}\n\n` then `data: [DONE]\n\n` must reject, not call success telemetry. Cover error+content mixed frame.

---

### VF-AUD-20260910-API-005

**Severity:** P1  
**Confidence:** High  
**Classification:** Confirmed defect (timeout contract; live cut not executed)

**File:line:** `src/shared/configSchema.ts:46`; `electron/services/veniceClient.ts:504–510, 651–653`; `server.ts:651–655`; `src/services/veniceClient/stream.ts:169–183`

**Symbol:** `VENICE_API_TIMEOUT_MS`, `https.request({ timeout })`, proxy `timeout` / `proxyTimeout`, `STREAM_TIMEOUT_MS`

**Observed:**

| Layer | Limit | Semantics in code |
|---|---|---|
| `AppConfig.VENICE_API_TIMEOUT_MS` | default **60_000**, clamp 1s–300s | shared |
| Electron `https.request({ timeout })` | that value | Node idle-socket timeout; `req.on("timeout")` destroys |
| Express proxy `timeout` and `proxyTimeout` | same 60s | http-proxy-middleware request/response timeout |
| Web `veniceStreamChat` | **300_000** absolute | covers fetch + SSE read |
| Web `veniceFetch` | `resolveTimeoutMs(timeoutMs) ?? 60000` | 60s unless caller overrides |
| Electron `veniceFetchDesktop` | `resolveTimeoutMs(undefined) === null` | no renderer deadline; only socket timeout |

Reasoning chat can emit no tokens for tens of seconds. Web renderer allows 5 minutes; the proxy in front of it is 60s. Electron chat streams share the 60s idle timeout.

**Expected:** Stream lifetime matches the documented 5-minute renderer contract (or a single documented value) on both transports. Idle vs overall timeout must be explicit.

**Root cause:** One 60s env default reused for non-stream HTTP, proxy, and streaming sockets, while the renderer stream path independently chose 300s.

**Impact:** Long-thinking `/chat/completions` streams can die at ~60s on web-proxy and Electron even though the renderer is prepared to wait 5 minutes. Failure mode then collides with API-002/003 (abort/timeout vs success).

**Remediation:** Separate stream vs unary timeouts. Raise proxy/Electron stream idle or overall timeout to the 300s renderer deadline (or lower the renderer to the proxy). Add SSE comment keep-alives only if the provider actually sends them (not assumed here).

**Tests:** Not run. Add a fake stream that sends the first byte at 61s; Electron/proxy must not destroy if the product contract is 300s.

---

### VF-AUD-20260910-API-006

**Severity:** P2  
**Confidence:** High  
**Classification:** Confirmed defect  

**File:line:** `src/services/veniceClient/fetch.ts:194, 348, 427–438`; `src/services/characterSceneGenerationService.ts:186`; `src/services/rp/sceneGenerationService.ts:137–141`

**Symbol:** `veniceFetch` default `retry = true`

**Observed:** `_veniceFetch` / `veniceFetchDesktop` retry HTTP **429, 500, 503** up to 3 attempts. `veniceFetch` default `retry: true`.

Paid `/image/generate` callers that do **not** pass `retry: false`:

- Character scene generation
- RP scene generation (`timeoutMs: 120_000` but retry left default)

Image Studio uses `venice()` → `veniceFetch(..., { retry: false })`. Video/music queue hooks pass `retry: false`. Workflow image uses `venice()` (no retry).

Electron may additionally Retry-After-retry a 429 once (`electron/services/veniceClient.ts:360–388`), so a desktop 429 can be: renderer attempt 1 → main Retry-After retry → renderer attempts 2–3 with backoff. Nested retries.

**Expected:** Non-idempotent paid POSTs default to `retry: false`. 429 may wait-and-retry once with cap; 500 on image generate must not be blindly replayed.

**Root cause:** Unary fetch retry policy is global; paid vs read endpoints are not distinguished.

**Impact:** A 500 after Venice accepted an image job can dispatch a second paid generate. Character/RP scene paths are exposed; Image Studio is not.

**Remediation:** Default `retry: false` for POST `/image/*`, `/video/queue`, `/audio/queue`, `/audio/speech`. Or require an explicit `retryPaid: false` allowlist. Keep GET `/models` retry.

**Tests:** `veniceFetch("/image/generate", { method: "POST", body })` must not refetch after 500. Scene services must pass `retry: false`.

---

### VF-AUD-20260910-API-007

**Severity:** P2  
**Confidence:** High  
**Classification:** Confirmed defect  

**File:line:** `src/shared/venice-media-contract/payload-builders.ts:35–43, 82`; `docs/reference/Venice_swagger_api.yaml:2656–2662` (`GenerateImageRequest.prompt.maxLength: 7500`); `src/utils/payloadBuilders.ts:21–22` (`IMAGE_PROMPT_MAX_CHARS = 7500`); `src/lib/workflow-engine.ts:115–127`

**Symbol:** `MAX_PROMPT_CHARS`, `buildCanonicalImageGeneratePayload`

**Observed:** Canonical generate builder slices prompts to **32768**. Swagger `GenerateImageRequest.prompt` maxLength is **7500** (negative_prompt also 7500). Edit/multi-edit prompts are 32768, so the constant matches edit, not generate.

Workflow `imageGen` is a production caller of the canonical generate builder and does not apply the 7500 UI cap.

**Expected:** Generate payloads enforce 7500 (or the live `promptCharacterLimit` when smaller). Edit may keep 32768.

**Root cause:** One `MAX_PROMPT_CHARS` shared across generate and edit.

**Impact:** Workflow (and any other canonical-generate caller) can send a schema-invalid prompt and get a 400 after the user already ran the graph. Image Studio is protected by `payloadBuilders.ts`.

**Remediation:** Split generate vs edit limits; optionally clamp to `model_spec.constraints.promptCharacterLimit`. Fail locally with a clear error.

**Tests:** `buildCanonicalImageGeneratePayload({ prompt: "x".repeat(7501) })` throws or truncates to 7500. Edit 7501 still allowed up to 32768.

---

### VF-AUD-20260910-API-008

**Severity:** P2  
**Confidence:** High  
**Classification:** Confirmed defect  

**File:line:** `src/services/veniceClient/fetch.ts:529–538`; contrast `src/services/veniceClient/stream.ts:47–56`

**Symbol:** `veniceFetch` chat `metadata` strip

**Observed:** For `/chat/completions`, `veniceFetch` mutates the caller’s `options.body` in place: clones each message shallowly, `delete msg.metadata`, writes back `payloadRecord.messages`. `veniceStreamChat` instead `structuredClone`s before stripping.

**Expected:** Transport may not mutate caller-owned message objects. Internal `metadata` (injected context, generated media) must be stripped only on the outbound copy.

**Root cause:** Strip was added on the shared fetch path without cloning.

**Impact:** Any caller that passes live store messages through `veniceFetch` (non-stream chat, character-card AI, workflow if it reused objects) permanently loses `metadata`. Main streaming chat is safe because it uses `veniceStreamChat`. This is a footgun in the canonical unary path.

**Remediation:** Clone like `veniceStreamChat`. Never assign back into the input object.

**Tests:** Pass `{ messages: [{ role, content, metadata: { injectedContext: "x" } }] }`; after `veniceFetch` the original `metadata` is intact; the JSON body sent to fetch/IPC has none.

---

### VF-AUD-20260910-API-009

**Severity:** P2  
**Confidence:** High  
**Classification:** Missing feature / architecture gap  

**File:line:** `src/lib/workflow-engine.ts:115–127`; `src/config/image-model-capabilities.ts`; `src/shared/venice-media-contract/payload-builders.ts:84–104, 110–116`

**Symbol:** workflow `imageGen`, `buildCanonicalImageGeneratePayload`

**Observed:** Workflow image nodes always send `steps` (default 20), `hide_watermark: true`, `return_binary: false`, `format: "png"`, and either `aspect_ratio` or width/height rounded to **64**. They do not call `getImageModelCapabilities` or live `/models` constraints (`supportsSteps`, `supportsCfgScale`, `widthHeightDivisor`, `promptCharacterLimit`, variants, style references).

Image Studio does consume live capabilities via `buildImagePayload` + `getImageModelCapabilities`.

**Expected:** One capability-aware generate path. Workflow should drop unsupported fields and honor live divisors/limits, or refuse models it cannot parameterize.

**Root cause:** Workflow still uses generic static defaults; Image Studio was upgraded independently.

**Impact:** Strict models or non-64 divisors can 400 from a default workflow even when Image Studio works for the same model. Residual of the 2026-09-01 handoff note; still true on this SHA.

**Remediation:** Route workflow imageGen through the same capability-aware builder as Image Studio, with runtime catalog input. Do not add per-model name checks.

**Tests:** Workflow generate for a fixture model with `supportsSteps: false` and `widthHeightDivisor: 16` must not emit `steps` and must snap to the live divisor.

---

### VF-AUD-20260910-API-010

**Severity:** P2  
**Confidence:** High  
**Classification:** Confirmed defect  

**File:line:** `src/components/video/video-view.tsx:209–226`; `docs/reference/Venice_swagger_api.yaml:3819–3822` (`QueueVideoRequest` required: `model`, `prompt`, `duration`)

**Symbol:** `handleGenerate` duration spread

**Observed:** If `durationOpts.length === 0`, generate still runs and **omits** `duration`:

```ts
...(effectiveDuration ? { duration: effectiveDuration } : {}),
```

Comment claims “the server falls back to the model default”. Swagger `QueueVideoRequest` lists `duration` as required with a closed enum (`1s`…`30s`, `"-1"`, `1 gen`, `auto`, `Auto`). Canonical builders throw if duration is empty. Video Studio bypasses those builders and posts `VideoQueueRequest` directly.

**Expected:** Never POST `/video/queue` without `duration`. If runtime metadata has no durations, fail closed in UI (or send a documented default such as `5s` / `auto` only when the model’s live enum includes it).

**Root cause:** Studio special-cased “no advertised durations” instead of aligning with the required field + canonical builder.

**Impact:** Models missing `constraints.durations` (stale catalog, unknown type, metadata gap) reproduce the original empty-duration 400.

**Remediation:** Always set `duration` from live enum, schema default, or block Generate. Reuse `buildCanonicalVideoQueuePayload`.

**Tests:** Fixture model with empty `durations` must not call `veniceFetch` / paid queue without `duration`.

---

### VF-AUD-20260910-API-011

**Severity:** P3  
**Confidence:** Medium  
**Classification:** Contract drift (undocumented wire field)

**File:line:** `src/stores/chat-stream-manager.ts:122–125`; `docs/reference/Venice_swagger_api.yaml:1474–1553` (`venice_parameters` properties)

**Symbol:** `enable_document_tools`

**Observed:** Every streamed chat body sets `venice_parameters.enable_document_tools` from the document-agent preset. Swagger `venice_parameters` lists `character_slug`, thinking flags, web search/scraping/citations, E2EE, x-search, etc. It does **not** list `enable_document_tools`. Nested `venice_parameters` does not set `additionalProperties: false` (parent `ChatCompletionRequest` does, at line 1683). OpenAPI 3.0 therefore allows extra nested keys; live Venice may still reject or ignore them.

No live probe was run.

**Expected:** Provider `venice_parameters` contains only declared keys. Document-agent enablement is a Forge preset, not a Venice field.

**Root cause:** Local tool-gating flag was placed on the outbound Venice object.

**Impact:** If Venice validates nested objects strictly, chat with document tools enabled 400s. If ignored, the field is harmless noise. UI also exposes a `venice-params` toggle that is overwritten by the preset on send.

**Remediation:** Strip `enable_document_tools` before dispatch. Keep it on Forge state only.

**Tests:** `buildStreamBody` wire snapshot has no `enable_document_tools`. Schema-validate `venice_parameters` keys against the Swagger property list.

---

### VF-AUD-20260910-API-012

**Severity:** P3  
**Confidence:** High  
**Classification:** Confirmed defect (local allowlist vs live max)

**File:line:** `src/shared/venice-media-contract/payload-builders.ts:184`; `src/shared/venice-media-contract/types.ts:96–99`; `docs/reference/Venice_swagger_api.yaml:3093–3096`

**Symbol:** `buildCanonicalImageMultiEditPayload`

**Observed:** Multi-edit slices `images` to **3**. Swagger: minimum 1; maximum is `capabilities.maxInputImages` from GET `/models`. Hardcoded 3 both under- and over-constrains by model.

**Expected:** Clamp to live `maxInputImages` (fail closed if metadata missing).

**Remediation:** Pass runtime max into the builder; default conservative 1 if unknown.

**Tests:** Fixture `maxInputImages: 2` rejects 3 images locally; `maxInputImages: 4` allows 4.

---

### VF-AUD-20260910-API-013

**Severity:** P3  
**Confidence:** High  
**Classification:** Documentation drift  

**File:line:** `src/shared/veniceSafeMode.ts:17–18`; `src/shared/venice-media-contract/types.ts:3`; `src/utils/payloadBuilders.ts:5–6`; `docs/reference/Venice_swagger_api.yaml:1–13`

**Observed:** Comments still cite Swagger **`20260814.194349`**. Tracked snapshot is **`20260821.193530`**. Image generate `safe_mode` / `style_references` and video `duration` enums in the current file match the implementation; the stale version string is wrong even though the field set used here did not obviously regress.

**Expected:** Comments cite `docs/reference/Venice_swagger_api.yaml` version `20260821.193530` (or “current tracked snapshot”) without a stale date.

**Impact:** Future audits/agents will trust the wrong schema generation when reconciling drift.

**Remediation:** Replace version literals with the tracked `info.version`. Prefer generating the safe-mode matrix from the snapshot.

**Tests:** Existing `verify:venice-contract-drift` / comment-grep if present; otherwise a small assertion in `veniceSafeMode` tests that the comment version matches `info.version` is optional.

---

## What was checked and is not a current defect

- **Safe-mode matrix vs Swagger (undeclared endpoints):** repaired (historical P1-001).
- **Image `style_references` vs video `reference_image_urls`:** repaired (historical P1-004).
- **Edit uses `model`, not deprecated `modelId`; upscale is `{image, scale, creativity?}`; background-remove is `image` or `image_url`:** `payload-builders.ts` and `media-request-adapter.ts` match Swagger.
- **Upscale dimension preflight:** 65536 source pixels / 16777216 projected pixels (`media-request-adapter.ts`) match `UpscaleImageRequest` text.
- **Transcription allowlist:** `VENICE_TRANSCRIPTION_MODELS` matches `CreateTranscriptionRequestSchema.model.enum`.
- **Chat `stream_options.include_usage`:** declared at Swagger 1387–1392; manager maps `prompt_tokens` / `completion_tokens` / `total_tokens`.
- **GET `/models?type=all`:** `type` enum includes `all` (Swagger 8497–8498).
- **Rate-limit headers:** proxy forwards `Retry-After` and `x-ratelimit-reset-requests`; renderer `computeRateLimitWait` honors seconds, HTTP-date, and `x-ratelimit-reset-requests`.
- **Family Safe Mode vs Electron provider `safe_mode`:** independent in `guardPipeline.ts` (tests in `electron/services/guardPipeline.test.ts` and `tests/safety/guardPipeline.test.ts`).
- **SSE blank-line / Unicode / `[DONE]` decoder:** shared implementation is spec-correct; remaining bugs are transport consumption (API-002..004).

---

## Commands executed

None beyond repository bootstrap (`git rev-parse`, `git status`, `node`/`npm` version, `package.json` identity). No `vitest`, live API, or `verify:*` runs. All claims above are static.

## Manual QA

Not run.

## Open questions (not filed as confirmed)

- Whether live Venice rejects undeclared `venice_parameters.enable_document_tools` (API-011).
- Whether Venice SSE sends comment keep-alives that would prevent the 60s idle timeout (API-005).
- Whether a 500 from `/image/generate` can occur after billing (API-006 impact magnitude).
- Quote/queue Swagger fields not exposed by Forge (`omni_reference_task_type`, `elements`, `keyframes`, `reference_document_urls`): missing product surface, not a broken existing path.
