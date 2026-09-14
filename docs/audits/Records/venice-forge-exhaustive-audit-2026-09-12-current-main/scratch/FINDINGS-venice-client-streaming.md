# VF-AUD-20260912 — Venice Client + Streaming Verified-Defect Findings

Domain: the single Venice request boundary and streaming — `src/services/veniceClient/**`,
`src/services/desktopBridge.ts`, `electron/services/veniceClient.ts`, `electron/services/guardPipeline.ts`,
`electron/ipc/validation.ts`, `electron/ipc/handlers/veniceHandlers.ts`, `electron/preload.ts`,
`electron/services/chatTtsBridge.ts`, `server.ts`, `src/shared/sseStreamDecoder.ts`,
`src/shared/validation.ts`, `src/shared/veniceSafeMode.ts`, payload builders, vs
`docs/reference/Venice_swagger_api.yaml` (Schema Version 20260814.194349).

Audit HEAD: `84cf5bbeb34ce87ab04ac6d6f8f164e549f4f399` on `main` (3.0.0-beta.3). Static line-by-line
review plus targeted test execution (`sseStreamDecoder.test.ts`, `veniceClient.sseParser.test.ts`,
`chatTtsBridge.test.ts` — all pass at HEAD) plus a runtime reproduction of the binary-body shape.
No repository source files were modified.

---

## VF-AUD-20260912-P1-001 — Desktop TTS always fails: chatTtsBridge expects a raw Buffer body the canonical client never produces

P1 | High | Confirmed defect

Affected files: `electron/services/chatTtsBridge.ts:183-191`; `electron/services/veniceClient.ts:275-288, 681-685`; `electron/services/chatTtsBridge.test.ts:36`

Observed: `synthesizeSpeech()` (the `tts:synthesize` IPC entry, used by chat read-aloud
`src/services/chatTtsController.ts:119-151` and the settings panel `src/components/settings/AudioSpeechPanel.tsx`)
extracts audio bytes only when `result.body` is a `Buffer`/`ArrayBuffer`/`Uint8Array`:

```ts
const audioBuffer = Buffer.isBuffer(result.body)
  ? result.body
  : result.body instanceof ArrayBuffer || result.body instanceof Uint8Array
    ? Buffer.from(result.body)
    : null;
if (!audioBuffer || audioBuffer.length === 0 || ...) { ... "Speech provider returned invalid audio." }
```

But the canonical main-process client `parseBody()` returns `{ dataBase64: <string> }` for every
non-JSON, non-text content type — which is exactly what `/audio/speech` returns (`audio/mpeg`):

```ts
export function parseBody(buffer: Buffer, contentType: string): unknown {
  if (contentType.includes("application/json")) { ... }
  if (contentType.startsWith("text/") || contentType.includes("event-stream")) { ... }
  return { dataBase64: buffer.toString("base64") };   // ← audio/mpeg lands here
}
```

Verified at runtime by executing the real `parseBody` logic against `audio/mpeg` bytes: it returns
`{ dataBase64: "..." }`, `Buffer.isBuffer(...) === false`, so `synthesizeSpeech` always returns
`{ ok: false, error: "Speech provider returned invalid audio." }`.

Expected: the bridge should read `result.body.dataBase64` (the documented `VeniceIpcResponse`
binary envelope produced by `parseBody`), mirroring how `src/services/veniceClient/fetch.ts:750-758`
(`veniceBlob` desktop path) already consumes `dataBase64`.

Evidence:
- `electron/services/veniceClient.ts:275-288` — binary branch returns `{ dataBase64 }`; the only
  non-`parseBody` body shapes are `{ text: streamText }` for SSE (`:683-684`) and JSON.
- `electron/services/chatTtsBridge.ts:183-191` — raw-Buffer expectation; fall-through to error.
- `electron/services/chatTtsBridge.test.ts:36` — the unit test mocks
  `performGuardedVeniceRequest` with `body: Buffer.from("audio")`, a shape the real pipeline never
  produces, so the suite is green while production is broken (test/impl divergence).

Root cause: the TTS bridge was written against an assumed raw-`Buffer` IPC body; the canonical
client binary contract (`{ dataBase64 }`) was not consulted. The test mocks the assumption instead
of the real dependency.

Impact: 100% failure of Electron TTS (chat message read-aloud + Audio Speech settings preview);
users on desktop always get "Speech synthesis failed". Web mode is unaffected (uses `veniceBlob`
directly, `chatTtsController.ts:154+`).

Recommended remediation: in `synthesizeSpeech`, accept `{ dataBase64: string }`:
`const b64 = (result.body as { dataBase64?: string })?.dataBase64` → `Buffer.from(b64, "base64")`;
keep raw-Buffer support only if some adapter genuinely produces it. Fix the test to mock the real
`{ dataBase64 }` shape (and add a regression case asserting the real `parseBody` output flows
through).

Required regression tests:
1. `chatTtsBridge.test.ts`: mock `performGuardedVeniceRequest` with
   `{ ok: true, status: 200, body: { dataBase64 }, contentType: "audio/mpeg" }` → expect
   `audioBase64` returned / cache file written.
2. Integration-style test wiring the real `parseBody("audio/mpeg")` output into the bridge.

---

## VF-AUD-20260912-P1-002 — Web-transport streamed chat output is never screened by Family Safe Mode (two-transport safety parity break)

P1 | High | Confirmed defect (safety / transport-parity)

Affected files: `src/services/veniceClient/stream.ts:164-368` (web path); `server.ts:864-871`
(proxy media-only response screening); `src/services/veniceClient/fetch.ts:66-159` (non-stream
screening for comparison); `electron/services/guardPipeline.ts:185-263` (Electron screening for comparison)

Observed:
- In **web mode**, `veniceStreamChat` runs the request-side guard (`stream.ts:84-105`) but the
  accumulated `accumulatedContent`/`accumulatedReasoning` is used only for the inspector log
  (`:343-362`). There is no call to `screenVeniceResponse`, `screenResponseBody`, or
  `maybeRunLocalFamilyGuard` on streamed output (grep for `screen` in `stream.ts` returns only
  request-guard/telemetry lines).
- The Express proxy (`server.ts:864-871`) only response-screens media endpoints
  (`/image|/video|/audio` via `fsmMediaVeniceProxy`); `/chat/completions` SSE flows through
  `standardVeniceProxy` (`server.ts:684-691`) which pipes bytes through untouched
  (`standardProxyRes` only copies retry-after headers and updates the circuit breaker).
- In **Electron mode**, streamed output *is* screened — but only after the stream completes:
  `performSingleVeniceRequest` accumulates `streamText` (`electron/services/veniceClient.ts:592,605,684`)
  and `performGuardedVeniceRequest` screens `{ text: streamText }` via
  `screenUpstreamResponse` (`guardPipeline.ts:185-263`).

Expected: per AGENTS.md §9 ("Keep validation, normalization, capability behavior, and error
semantics contract-compatible across supported transports") and the safety-authority contract,
FSM-on output screening must apply to streamed chat on **both** transports. Web mode currently has
no output enforcement at all: any inappropriate streamed model output renders in full in the
browser with Family Safe Mode enabled.

Evidence:
- `src/services/veniceClient/stream.ts:236-241` — `!response.ok` handling only; no success-path screening.
- `server.ts:864-871` — `isMedia = req.path.startsWith("/image/") || ... "/audio/"`; chat SSE excluded.
- `src/services/veniceClient/fetch.ts:66-159` — `screenVeniceResponse` exists but is only invoked
  from `veniceFetch`/`veniceBlob`/`veniceFormData` (non-streaming).
- `electron/services/guardPipeline.ts:185-263` — post-hoc stream screening exists only on the
  Electron path (and see VF-AUD-20260912-P1-004 for its delivery-ordering flaw).

Root cause: response screening was implemented for the non-streaming `veniceFetch` surface and for
the Electron main-process dispatcher, but the renderer's web-mode SSE read loop was never given an
equivalent output screen; the proxy only buffers/screens media responses.

Impact: With `localFamilySafeModeEnabled = true` in web mode, streamed assistant output bypasses
the Family Safe Mode filter entirely — the exact content class the filter exists to block reaches
the UI and conversation store. Silent bypass (no error, no telemetry patch with `guardOutcome: "block"`).

Recommended remediation: screen the accumulated stream text in `veniceStreamChat`'s web path after
the read loop (mirroring the Electron post-hoc screen): run `screenResponseBody` on
`accumulatedContent` (+ `accumulatedReasoning`), and on block emit the 451 inspector patch and
throw `SafetyGuardBlockedError`. Longer term, screen incrementally (per event) so blocked content
is never rendered. Add a proxy-side SSE screen only if buffering is acceptable; renderer-side
post-hoc screening is the minimal parity fix.

Required regression tests:
1. Web-mode `veniceStreamChat` with FSM on and a stream whose deltas contain blocked content →
   expect `SafetyGuardBlockedError`, 451 inspector patch, and no committed assistant text.
2. Same byte stream through Electron main-process path → identical outcome (parity test).
3. FSM off → stream completes normally (no false positive).

---

## VF-AUD-20260912-P1-003 — RpChatView passes an IPC-envelope shape to veniceStreamChat: invented `endpoint` wire field, missing `stream: true`

P1 | High | Confirmed defect (API contract)

Affected files: `src/components/rp-studio/RpChatView.tsx:274-283`; `src/services/veniceClient/stream.ts:46-56,107-118,200-204`; `docs/reference/Venice_swagger_api.yaml` `ChatCompletionRequest` (`components.schemas.ChatCompletionRequest`, `additionalProperties: false`)

Observed: the RP studio chat view calls:

```ts
await veniceStreamChat(
  { endpoint: "/chat/completions", model: chat.modelId, messages },
  { signal: ctrl.signal, onDelta: ... },
);
```

`veniceStreamChat(payload)` treats the first argument as the **request body** — it forwards
`requestPayload` (a clone of the payload, with only per-message `metadata` stripped,
`stream.ts:48-56`) verbatim as the outbound JSON body on both transports (`stream.ts:112` Electron,
`stream.ts:203` web). Two contract violations result:

1. **Invented field**: the wire body contains `"endpoint": "/chat/completions"`.
   `ChatCompletionRequest` declares `additionalProperties: false` (verified by parsing the bundled
   Swagger at HEAD). Per the project's own `src/shared/veniceSafeMode.ts:18-23` note, Venice
   "returns 400 on unknown payload fields for some endpoints" — the live API is expected to reject
   this body before feature logic runs.
2. **Missing `stream: true`**: the payload never sets `stream`, so Venice returns a non-streaming
   JSON completion. Consequences diverge by transport:
   - Electron: `performSingleVeniceRequest` only decodes SSE when `content-type` includes
     `event-stream` (`electron/services/veniceClient.ts:629`); the JSON completion is buffered and
     returned with **zero `onDelta` calls** — the RP view accumulates an empty reply.
   - Web: chunks are fed to `SseDecoder`; the whole JSON body is flushed as one "line" and
     `extractStreamDelta`'s `choice.delta ?? choice.message` fallback
     (`src/shared/sseStreamDecoder.ts:241-243`) accidentally yields the full text in a single
     delta — behavior that only works by accident and breaks if that fallback is ever tightened.

No other `veniceStreamChat` caller does this (`chat-stream-manager.ts:266` builds a proper body;
`researchSynthesis.ts:128-136` sets `stream: !!onDelta`).

Expected: `veniceStreamChat` accepts a body only; the RP view should pass
`{ model, messages, stream: true }` and no `endpoint`. The type signature
(`payload: unknown`) permits this misuse — tightening to a body-shaped type (or stripping a
leading `/` path key defensively) would prevent recurrence.

Evidence:
- `src/components/rp-studio/RpChatView.tsx:274-283` — envelope-shaped payload.
- `src/services/veniceClient/stream.ts:107-118` — `body: requestPayload` (Electron);
  `:200-204` — `body: JSON.stringify(requestPayload)` (web).
- Swagger `ChatCompletionRequest` property set (parsed at HEAD): `model`, `messages`, `stream`,
  `stream_options`, `temperature`, `top_p`, `max_completion_tokens`, `venice_parameters`, `tools`,
  … — no `endpoint`; `additionalProperties: false`.

Root cause: caller confusion between the IPC request envelope (`{endpoint, method, body}`) and the
chat-body contract of `veniceStreamChat`; the `payload: unknown` signature cannot catch it.

Impact: RP Studio multi-character chat streaming is broken against the live API (400 from the
invented field, or silent empty replies on Electron if the field is ignored). Feature shipped in
this state means RP streaming is either fully or partially non-functional.

Recommended remediation: fix `RpChatView` to pass `{ model: chat.modelId, messages, stream: true }`;
change `veniceStreamChat`'s parameter type from `unknown` to a declared body interface
(`{ model: string; messages: unknown[]; stream?: boolean; [k: string]: unknown }`) or explicitly
reject/ignore reserved transport keys (`endpoint`, `method`, `headers`, `signalId`) before
dispatch. Add a contract test asserting the exact wire body keys for the RP path.

Required regression tests:
1. `veniceStreamChat` wire-body test: body contains no `endpoint`/`method` keys and includes
   `stream: true` for the RP caller.
2. Transport-parity test: same mocked non-stream upstream JSON on Electron and web paths produces
   identical `onDelta` sequences (or an explicit error), not divergent silent-empty vs full-text behavior.

---

## VF-AUD-20260912-P1-004 — Partial streamed content is committed to the conversation even when the stream is then blocked (451) or fails mid-way

P1 | High | Confirmed defect

Affected files: `src/stores/chat-stream-manager.ts:264-315, 154-162, 318-321`; `src/services/veniceClient/stream.ts:107-161` (Electron ordering); `electron/services/guardPipeline.ts:185-263` (post-hoc stream screen)

Observed: deltas are buffered per conversation and flushed into the chat store by a 40 ms timer
(`bufferStreamDelta`/`flushStreamDelta`, `chat-stream-manager.ts:154-189`). On any stream error the
catch block **first commits the pending deltas** and only then inspects the error:

```ts
} catch (err) {
  flushStreamDelta(convId);              // ← partial (possibly blocked) text committed
  if (isAbortError(err)) { return { aborted: true }; }
  const retryable = isRetryableError(err);
  ...
  useChatStore.getState().appendAssistantStreamDelta(convId, { content: `\n\n[Error: ${SAFE_STREAM_ERROR_MESSAGE}]` });
```

On the Electron path this ordering is compounded by the main process: deltas are delivered to the
renderer **during** streaming (`veniceHandlers.ts:111-126`), and the Family Safe Mode response
screen runs only **after** the stream ends (`guardPipeline.ts:292`, screening `{ text: streamText }`).
A 451 block therefore arrives at the renderer only after all partial content was already streamed
and buffered — and `flushStreamDelta` commits it into the assistant message. The finalizer
(`chat-stream-manager.ts:318-321`) then persists the conversation, so blocked/error partial output:

1. is rendered and durably stored in chat history, and
2. is re-sent to the provider as conversation context on the next turn (compounding exposure and
   re-triggering request-side screens).

Expected: when a stream terminates in a block or hard failure, uncommitted deltas belonging to that
generation must be discarded (or the assistant turn marked failed/removed), and the error must be
handled before any flush. `SafetyGuardBlockedError` (451) must never result in persisted blocked
content.

Evidence:
- `src/stores/chat-stream-manager.ts:284-285` — `flushStreamDelta(convId)` precedes error classification.
- `src/stores/chat-stream-manager.ts:318-321` — final `flushStreamDelta` + `flushConversationSaveNow`.
- `electron/ipc/handlers/veniceHandlers.ts:111-126` — deltas forwarded live; `guardPipeline.ts:292` —
  screening after `performVeniceRequest` returns.
- `src/services/veniceClient/stream.ts:135-140` — renderer throws only after the blocked response arrives.

Root cause: stream bookkeeping conflates "user aborted" (commit partial turn) with "provider/Guard
terminated the stream" (discard the turn); there is no generation-scoped rollback. Combined with
P1-002's delivery-before-screen ordering, blocked content always lands in the store.

Impact: FSM-blocked or mid-stream-failed assistant text persists in the user's chat history and is
re-transmitted to Venice on subsequent turns; error text (`[Error: …]`) is appended to the same
message, corrupting the turn.

Recommended remediation: track the generation's committed state; in the catch path, drop
`pendingStreamDeltas` (do not flush) unless `isAbortError(err)` and the product decision is to keep
user-stopped partial turns; on `SafetyGuardBlockedError` remove/revert the partial assistant
message for that turn. Add a `finally`-safe flush only for the success path.

Required regression tests:
1. Stream that delivers deltas then terminates with a 451 block → assistant turn contains no
   blocked content; conversation store has no partial text.
2. Stream failing mid-way with 500 → partial deltas discarded, error marker present, no persistence
   of partial content.
3. User abort → existing behavior preserved (partial turn kept), proving no over-correction.

---

## VF-AUD-20260912-P2-005 — Electron chat streams have no absolute lifetime; a trickling stream can run forever (web enforces a 300 s absolute deadline)

P2 | Medium-High | Confirmed defect (transport parity / resource)

Affected files: `electron/services/veniceClient.ts:573-581, 742-744`; `src/shared/apiConfig.ts:14-15`; `src/services/veniceClient/stream.ts:169-195`

Observed: the web renderer path enforces "a single absolute 5-minute deadline covering both the
initial fetch and the SSE read loop" (`stream.ts:169-183`, `VENICE_API_STREAM_TIMEOUT_MS`). The
Electron main process instead passes `timeout: VENICE_API_STREAM_TIMEOUT_MS` to `https.request`
(`electron/services/veniceClient.ts:580`), which in Node is a **socket inactivity** timeout that
resets on every received chunk; on fire it destroys the request (`:742-744`). A provider sending a
few bytes every <300 s keeps an Electron stream open indefinitely. The shared constant's own
docstring claims "Chat SSE lifetime shared by Electron, Express proxy, and renderer"
(`src/shared/apiConfig.ts:14`) — this is not true for Electron.

Expected: both transports bound total stream lifetime to ~300 s, matching REL-001's stated intent.

Evidence:
- `electron/services/veniceClient.ts:580` — `timeout: isSseStream ? VENICE_API_STREAM_TIMEOUT_MS : VENICE_API_TIMEOUT_MS`.
- `electron/services/veniceClient.ts:742-744` — `req.on("timeout", () => req.destroy(...))` (inactivity semantics).
- `src/services/veniceClient/stream.ts:178-183` — absolute deadline via `AbortController` (web only).
- `electron/preload.ts:46-77` — no deadline added at the preload layer either.

Root cause: reliance on Node's socket `timeout` option where an absolute end-to-end deadline was
specified; the renderer's deadline controller was only implemented in the web branch of
`veniceStreamChat`.

Impact: hung/trickling paid chat streams hold IPC listeners, the concurrency slot
(`MAX_CONCURRENT_VENICE_REQUESTS`), and renderer state indefinitely on desktop; behavior differs
between web (terminates at 300 s) and desktop (never).

Recommended remediation: in `veniceHandlers.ts`/`runChatAgentLoop` or `performVeniceRequest`, arm
an absolute timer equal to `VENICE_API_STREAM_TIMEOUT_MS` that aborts the shared `abortController`
when it fires (mirroring `stream.ts:178-183`), independent of socket activity.

Required regression tests:
1. Electron stream test: chunks arriving every 250 s never stop → stream aborted at ~300 s with a
   timeout error.
2. Healthy fast stream unaffected; user abort still wins.

---

## VF-AUD-20260912-P2-006 — Default retry policy replays billable POSTs (e.g. /image/generate) after 429/500/503, risking double-billing

P2 | Medium | Confirmed defect (economics / policy)

Affected files: `src/services/veniceClient/fetch.ts:194, 348, 427-439, 480-488`; `src/services/characterSceneGenerationService.ts:186`; contrast `src/hooks/use-video.ts:70-76`, `src/hooks/use-music.ts:67-72`, `src/lib/workflow-engine.ts:239-243, 346-350` (all `retry: false`)

Observed: `veniceFetch` defaults `retry: true` (3 attempts) and retries any POST on 429/500/503
unless the caller opts out. The paid queue endpoints (`/video/queue`, `/audio/queue`) correctly
pass `retry: false` at every call site, but `/image/generate` via
`characterSceneGenerationService` does not:

```ts
const { data } = await deps.veniceFetch('/image/generate', { method: 'POST', body: payload, signal: options.signal });
```

An image generation that Venice accepts and bills but whose response is lost (500/503/429 at the
edge) will be re-submitted up to two more times, each a separately billable generation. The same
holds for any other paid POST that omits `retry: false`.

Expected: billable one-shot operations must not be auto-retried unless the caller has established
the request is idempotent or the first attempt provably never reached the provider. AGENTS.md §10
forbids "retry malformed 400s as a substitute for correcting the schema" and expects deliberate
retry policy; billing-blind retries violate that spirit.

Evidence:
- `src/services/veniceClient/fetch.ts:194` — `const maxAttempts = retry ? 3 : 1;` (desktop), `:348` (web).
- `src/services/veniceClient/fetch.ts:427-439` — retryable `[429, 500, 503]` on POST bodies.
- `src/services/characterSceneGenerationService.ts:186` — no `retry` flag.

Root cause: retry policy is opt-out while the endpoint mix includes non-idempotent paid calls; the
queue endpoints were fixed individually instead of making retry opt-in for paid generation.

Impact: duplicate charges on flaky networks for character-scene images; user-visible duplicate
assets when both attempts succeed.

Recommended remediation: default `retry: false` for `/image/generate`, `/image/edit`,
`/image/upscale`, `/image/background-remove`, `/video/queue`, `/audio/queue` (or introduce an
`idempotency` classification per endpoint in one place), keeping retries for chat and GET catalog
calls.

Required regression tests:
1. `/image/generate` returning 503 → exactly one upstream request recorded.
2. `/chat/completions` non-stream returning 429 → retry behavior preserved (or explicitly
   re-decided and documented).

---

## VF-AUD-20260912-P3-007 — Deduplicated veniceFetch callers leave a permanent "pending" inspector row

P3 | Medium | Confirmed defect (telemetry correctness)

Affected files: `src/services/veniceClient/fetch.ts:540-557, 592-657`

Observed: every `veniceFetch` call adds an inspector log row with `callOutcome: "pending"`
(`:544-554`). When `dedupe: true` and an identical request is in flight, the second caller
immediately returns the shared in-flight promise (`:592-595`) — but only the first caller's
`execute()` patches its own `logId` with the outcome (`:603-613`, `:636-645`). The deduped
caller's row stays `pending` forever (the only `dedupe: true` production caller is
`src/services/modelService.ts:128`, so the catalog row set accumulates stuck rows on concurrent
model refreshes).

Expected: deduped callers either share the same log row or have their row patched with the shared
outcome (plus a `deduplicated: true` marker).

Root cause: log lifecycle is keyed per call site, but dedupe short-circuits before the outcome
patch wiring exists for the shadow row.

Impact: misleading Inspector UI/telemetry; unbounded growth of stuck rows on refresh storms.

Recommended remediation: register the deduped `logId` on the shared promise's outcome patch, or
skip adding a row when returning an in-flight promise (recording a lightweight `deduplicated`
event instead).

Required regression tests:
1. Two concurrent identical `dedupe: true` requests → one upstream call; zero permanent
   `pending` rows.

---

## VF-AUD-20260912-P3-008 — Proxy has no JSON error handler: body-limit (413) and JSON-parse errors escape as HTML/text via finalhandler

P3 | Medium | Confirmed defect (error-contract consistency)

Affected files: `server.ts:264-298, 774-780, 874`; whole of `createServerApp` (no `app.use(errorHandler)`)

Observed: `createServerApp` registers no Express error-handling middleware. When
`express.raw({ limit: MAX_PROXY_BODY_BYTES })` (`:777-780`) rejects an oversized Venice POST, or
`express.json({ limit: "2kb" })` on `/api/session-key` (`:264`) sees malformed JSON, body-parser
passes an error to Express's default `finalhandler`, which returns the status with an HTML/plain
stack-styled body and `content-type: text/html`. The renderer copes (`fetch.ts:404-411` falls back
to `{ text }`), but the app's documented error shape is JSON (`{ error }`), and `server.test.ts`
never exercises these branches.

Expected: a JSON error handler mapping `entity.too.large` → 413 `{ error: "Payload too large" }`
and JSON parse failures → 400 `{ error: "Malformed JSON" }`, consistent with the rest of the
proxy's error contract.

Root cause: missing four-argument error middleware; body-parser errors were only considered for
the happy path.

Impact: inconsistent client-visible error bodies; harder debugging; potential HTML rendered into
error surfaces that assume JSON.

Recommended remediation: add `app.use((err, req, res, next) => { ... })` before the Vite/static
fallback, normalizing `PayloadTooLargeError`/`SyntaxError` to JSON.

Required regression tests:
1. POST `/api/venice/chat/completions` with `Content-Length > MAX_PROXY_BODY_BYTES` → 413 JSON.
2. POST `/api/session-key` with invalid JSON → 400 JSON.

---

## VF-AUD-20260912-P3-009 — Web stream leaves the upstream connection open after [DONE] (no cancel; only releaseLock)

P3 | Low | Confirmed defect (resource hygiene)

Affected files: `src/services/veniceClient/stream.ts:314-318, 363-368`

Observed: when `[DONE]` terminates the read loop, the code `break`s and the `finally` block runs
`reader.releaseLock()` without `reader.cancel()`. The fetch body stream (and underlying
connection through the dev proxy) remains open until the server closes it or GC finalizes; the
absolute-deadline controller is cleared (`clearTimeout(deadlineId)`), so nothing else will close
it. The abort path does cancel via `cancelReader`, but the success path does not.

Expected: on successful `[DONE]`, `reader.cancel()` (or `response.body.cancel()`) should be invoked
best-effort before releasing the lock, matching common SSE client hygiene and freeing the proxy
connection.

Root cause: cleanup asymmetry between the abort and success paths.

Impact: connection pool pressure during long sessions with many short streams; idle sockets held
against the dev server.

Recommended remediation: call `cancelReader()` on the success path too (idempotent,
catch-swallowed), then `releaseLock()`.

Required regression tests:
1. Stream ending with `[DONE]` → `reader.cancel` invoked; promise resolves normally.

---

## Verified-non-defect highlights (invariants that HOLD at HEAD)

- **§10 image-edit `model` (not `modelId`)**: `buildImageEditRequest` (`media-request-adapter.ts:199-213`)
  and `buildCanonicalImageEditPayload` (`payload-builders.ts:147-173`) emit `model`. `modelId`
  appears only in the multi-edit schema (`MultiEditImageRequest`), which is where Swagger puts it.
- **§10 upscale sends only `image`/`scale`/optional `creativity`**: `buildImageUpscaleRequest`
  (`media-request-adapter.ts:215-237`), `buildCanonicalImageUpscalePayload`
  (`payload-builders.ts:201-217`) — matches `UpscaleImageRequest`.
- **§10 background-remove sends `image` or `image_url` only**: `buildBackgroundRemoveRequest`
  (`media-request-adapter.ts:239-245`), `buildCanonicalBackgroundRemovePayload`
  (`payload-builders.ts:219-229`) — matches `BackgroundRemoveImageRequest`.
- **§10 no `return_binary` on edit/upscale/background-remove**: `return_binary` is emitted only for
  `/image/generate` (`payloadBuilders.ts:397`, `payload-builders.ts:88`) where Swagger declares it.
- **§10 audio/video queue+retrieve canonical model/queue contract**:
  `buildAudioRetrieveRequest`/`buildVideoRetrieveRequest` (`media-request-adapter.ts:247-259`) and
  the canonical builders emit `{model, queue_id, delete_media_on_completion:false}`, matching
  `RetrieveAudioRequest`/`RetrieveVideoRequest` required fields.
- **§10 video `download_url` preserved**: `normalizeVideoRetrieveResult`
  (`video-retrieve-normalizer.ts:86-95`) prefers response `download_url`, falls back to the
  journaled `queueDownloadUrl`, and models the `needs-binary` completed variant; expiring URLs are
  downloaded by the main process (`electron/services/videoRetrieveService.ts:310-320`).
- **safe_mode endpoint matrix**: `src/shared/veniceSafeMode.ts:41-45` allows only
  `/image/generate|/image/edit|/image/multi-edit`, consistent with the Swagger snapshot (only the
  four image request schemas declare `safe_mode`); applied on both transports
  (renderer web path `fetch.ts:339-345`, Electron `guardPipeline.ts:149-162`).
- **SSE decoder** (`src/shared/sseStreamDecoder.ts`): spec-conformant incremental UTF-8 (fatal,
  split-surrogate safe), CRLF/LF/CR framing, blank-line dispatch, multi-`data:` join, comment/field
  handling, `[DONE]` surfacing, EOF flush, typed `SseDecodeError`. 36 focused tests pass at HEAD
  (`sseStreamDecoder.test.ts`, `veniceClient.sseParser.test.ts`).
- **Endpoint allowlist** (`src/shared/validation.ts`): exact-path + method matrix plus the
  parameterized `/characters[/{slug}]` family; consumed by both the IPC validator
  (`electron/ipc/validation.ts:215-245`, origin-pinned to `VENICE_API_HOST`, query ≤512 chars,
  body ≤ 25 MiB, blocked header set incl. `authorization`/`x-forwarded-*`) and the proxy
  (`server.ts:722-758`, 403/405 split, key gate after allowlist).
- **Prompt limits** enforced at both request boundaries (renderer IPC validator
  `validation.ts:295-299`, proxy `server.ts:798-813`) with the §12 constants
  (6,144 warn / 8,192 max / 24,576 / 32,768 — `src/shared/promptLimits.ts:5-10`).
- **Binary validation before durable persistence**: `validateImageBlob`
  (`media-request-adapter.ts:261-269`) enforces allowlisted MIME + non-zero size for
  image edit/upscale/background-remove responses; TTS audio byte-checked
  (`chatTtsBridge.ts:188` modulo P1-001); generated-media persistence is main-owned
  (`desktopBridge.ts:1039-1057`).

---

## Rejected candidates

- **`data: [DONE]` with trailing whitespace would miss the terminator** — Venice emits the exact
  terminator per the OpenAI convention the decoder documents; adding a trim would accept
  non-conformant frames. Not a defect at this contract.
- **Proxy forwards the renderer's `X-Venice-Forge-Family-Safe-Mode` header upstream** — harmless
  custom header; no confidentiality or integrity impact; removing it is cosmetic.
- **GET responses are not screened by `screenVeniceResponse`** — explicit, documented design (GETs
  carry no user content; `fetch.ts:76` comment).
- **Electron `MAX_VENICE_RESPONSE_BYTES` (25 MiB) also counts SSE bytes** — protective memory cap;
  25 MiB of tokens is far beyond configured `max_completion_tokens`; acceptable.
- **`parseEndpoint` URL normalization of `/characters/../models`** — resolves to `/models`, which
  is allowlisted; no boundary crossing (path stays on `VENICE_API_HOST` origin by construction).
- **`fsmMediaProxyRes` branch for `proxyRes` without `.on`** — dead branch in practice;
  http-proxy-middleware always supplies an `IncomingMessage`.
- **Multipart transcription bodies screened as printable-prefix text** — extractor's
  fail-safe direction only (over-screening risk, never under-screening); bounded by
  `MAX_FIELD_CHARS`.
- **`veniceFetch` mutates the caller's `options.body` when stripping chat `metadata`** — shallow
  copies of messages; documented intent; no caller depends on post-send body identity.
- **Web `veniceStreamChat` has no retry** — standard SSE practice; checkpoint retry lives in
  `chat-stream-manager.ts:264-310` and is gated on `hasCommittedStreamState`.
- **`performVeniceRequest` returns the failed 429-retry response instead of falling through to the
  next provider** — explicitly documented one-retry policy (`veniceClient.ts:415-451`,
  VF-AUD-20260831-P2-008); not drift.
