# P1 Findings

## VF-AUDIT-20260815-P1-001

**ID:** VF-AUDIT-20260815-P1-001
**Severity:** P1
**Status:** CONFIRMED
**Area:** Venice request safety/schema
**File:** `src/shared/veniceSafeMode.ts`; `src/services/veniceClient/fetch.ts`; `electron/services/guardPipeline.ts`
**Lines:** `34-45`; `336-345, 814-820`; `142-149, 233`
**Symbol:** `ENDPOINTS_WITH_SAFE_MODE`, `applyVeniceApiSafeMode`, `withFamilySafeProviderOverride`
**Evidence:** The helper lists audio speech/transcription, embeddings, and all augment endpoints as accepting top-level/form `safe_mode`; both Web and Electron paths inject it. Current Swagger defines no such property for those request schemas and sets `additionalProperties: false`. Provider safe mode defaults enabled.
**Expected:** Add `safe_mode` only where the endpoint schema declares it; preserve explicit `false` where supported.
**Actual:** Default requests to six strict endpoints receive an undocumented foreign field.
**Impact:** TTS, STT, embeddings, search, scrape, and text-parser requests can fail with schema-validation errors before feature logic runs.
**Root cause:** A hand-maintained endpoint matrix based on historical live observations displaced the authoritative current wire schema.
**Related occurrences:** Tests in `tests/safety/veniceSafeMode.test.ts` protect the incorrect endpoint set.
**Authoritative Venice reference:** `swagger.yaml` schemas `CreateSpeechRequestSchema`, `CreateTranscriptionRequestSchema`, `CreateEmbeddingRequestSchema`, `WebSearchRequest`, scrape and text-parser request schemas.
**Remediation:** Generate/maintain endpoint field support from the canonical spec; restrict injection to declared request schemas and keep local Family Safe Mode independent.
**Tests required:** Field-by-field request tests for every endpoint, including explicit true/false and multipart forms; schema validation against current Swagger.
**Validation:** Run affected client/guard tests, `verify:venice-contract-drift`, `verify:safety-guard`, typecheck, and bounded live non-paid calls when authorized.
**Compatibility impact:** behavioral but backward-compatible.

## VF-AUDIT-20260815-P1-002

**ID:** VF-AUDIT-20260815-P1-002
**Severity:** P1
**Status:** CONFIRMED
**Area:** Streaming transport
**File:** `electron/services/veniceClient.ts`; `src/services/veniceClient/stream.ts`; `electron/services/veniceClient.sseParser.test.ts`
**Lines:** `262-329, 538-568`; `234-305`; `71-201`
**Symbol:** `parseSseLines`, Electron read loop, `veniceStreamChat`
**Evidence:** Electron calls `dispatch()` at function end even without the blank line terminating an SSE event and decodes each Buffer independently with `toString("utf-8")`, corrupting a code point split across chunks. Web decodes incrementally but parses each `data:` line as a complete JSON event, silently ignores parse errors, does not reliably promote provider error frames, and does not flush a trailing event at EOF. An Electron test explicitly treats a single newline as event completion.
**Expected:** Incremental UTF-8 decode; blank-line event boundaries; multiline `data:` joining; explicit `[DONE]`; surfaced malformed/provider-error frames; EOF flush according to the stream contract.
**Actual:** Both implementations violate different parts of SSE framing and error semantics.
**Impact:** Unicode corruption, premature JSON errors, lost multiline events, false-success streams, and incomplete persisted assistant output.
**Root cause:** Two independent partial SSE state machines plus tests coupled to implementation behavior instead of the SSE contract.
**Related occurrences:** `src/services/veniceClient.web.test.ts`, edge tests, and chat-stream tests lack adversarial network chunking.
**Authoritative Venice reference:** Chat streaming response in `swagger.yaml`; standard SSE blank-line/data-line framing referenced by the API stream implementation.
**Remediation:** Share a transport-neutral incremental SSE decoder with a streaming `TextDecoder`; preserve incomplete event state and produce typed error events.
**Tests required:** Split every byte boundary of multibyte content; CRLF; comments; multiline data; malformed/error frames; `[DONE]`; EOF without terminator; abort mid-event.
**Validation:** Focused parser tests in both environments, full chat/agent tests, real streamed chat with Unicode when authorized.
**Compatibility impact:** behavioral but backward-compatible.

## VF-AUDIT-20260815-P1-003

**ID:** VF-AUDIT-20260815-P1-003
**Severity:** P1
**Status:** CONFIRMED
**Area:** Video generation contract
**File:** `src/shared/venice-media-contract/payload-builders.ts`; `src/shared/venice-media-contract/types.ts`; `src/lib/workflow-engine.ts`; `src/lib/workflow-schema.ts`
**Lines:** `235-327`; `241-278`; `194-216`; `497-506`
**Symbol:** `buildCanonicalVideoQuotePayload`, `buildCanonicalVideoQueuePayload`, workflow `videoDuration`
**Evidence:** Swagger requires `duration` for quote and queue. Builders make it optional; workflow defaults `videoDuration` to empty and sends `undefined`. Quote sends unsupported `prompt`/`audio_prompt`; queue can send unsupported `audio_prompt`, `seed`, `cfg_scale`, `motion_score`, and `fps`.
**Expected:** Required authoritative fields and only declared wire keys.
**Actual:** The default workflow creates an invalid queue body and builders advertise foreign fields as canonical.
**Impact:** Default video workflows fail; optional UI settings can cause strict-schema rejection; quote and submission can disagree.
**Root cause:** Logical feature options were copied into wire types without field-by-field Swagger validation.
**Related occurrences:** Builder tests assert the local abstraction rather than validate against Swagger.
**Authoritative Venice reference:** `POST /video/quote` and `POST /video/queue` request schemas in Swagger `20260814.194349`.
**Remediation:** Require a validated duration, remove unsupported wire properties, add supported audio/upscale fields, and make workflow schema constraints derive from runtime model data where applicable.
**Tests required:** Schema-validation tests for minimal/full quote and queue bodies; workflow default rejection before any paid request; quote/queue parity.
**Validation:** Media-contract tests, workflow core tests, contract drift verifier, approval-flow tests, authorized quote-only probe.
**Compatibility impact:** behavioral but backward-compatible; exported incorrect optional fields should be deprecated before removal if externally consumed.

## VF-AUDIT-20260815-P1-004

**ID:** VF-AUDIT-20260815-P1-004
**Severity:** P1
**Status:** CONFIRMED
**Area:** Character scene/image references
**File:** `src/utils/payloadBuilders.ts`; `src/services/characterSceneGenerationService.ts`; `src/config/image-model-capabilities.ts`; `src/types/venice.ts`
**Lines:** `442-446`; `132-165`; `278-291`; model capability types
**Symbol:** `buildImagePayload`, `generateCharacterScene`, `venice-character-reference-v1`
**Evidence:** Image generation emits `reference_image_urls`, which is not an image-generate property. Swagger uses `style_references: [{image,strength}]`. Capability code hard-codes `venice-character-reference-v1`; that ID is absent from current official docs/static model data. Runtime types do not consume current `supportsStyleReferences` and `maxStyleReferences`.
**Expected:** Use runtime model metadata and serialize the documented style-reference object array.
**Actual:** The scene path selects an invented model capability and sends a video-only field to image generation.
**Impact:** Character-reference scene generation is rejected or references are ignored, defeating the feature’s core identity-preservation promise.
**Root cause:** A testability stub became production capability policy and the image/video reference contracts were conflated.
**Related occurrences:** Scene service tests mock the builder; Scene Composer tests use the invented ID.
**Authoritative Venice reference:** image-generate `style_references`; `/models` `supportsStyleReferences` and constraint metadata.
**Remediation:** Remove the invented production model entry, extend runtime capability types, and build documented style references with limits/strength validation.
**Tests required:** Current model fixture with provenance; exact wire assertions; no-capability fail-closed behavior; reference count/strength limits; end-to-end scene request.
**Validation:** Scene/reference verifiers, model catalog tests, schema validation, authorized live image request if budget approved.
**Compatibility impact:** behavioral but backward-compatible.

## VF-AUDIT-20260815-P1-005

**ID:** VF-AUDIT-20260815-P1-005
**Severity:** P1
**Status:** CONFIRMED
**Area:** Chat model capabilities/tool calling
**File:** `src/stores/chat-stream-manager.ts`; `src/components/playground/playground-chat.tsx`
**Lines:** `73-143`; `163`
**Symbol:** `buildChatStreamBody`, playground `useTools`
**Evidence:** Normal chat loads model info but unconditionally adds media tools and conditionally adds document/workspace tools without testing `supportsFunctionCalling`. Playground correctly gates tools on that runtime capability.
**Expected:** Only send `tools`/tool choice for a model whose runtime metadata explicitly supports function calling.
**Actual:** Normal chat can send tools to unsupported models.
**Impact:** Chat requests can be rejected or behave unpredictably solely because built-in tool registries are enabled.
**Root cause:** Capability enforcement exists at one UI call site rather than the canonical chat body builder.
**Related occurrences:** Chat-stream tests do not exercise an unsupported runtime model with tool registries active.
**Authoritative Venice reference:** `/models` capability metadata; chat request tool fields.
**Remediation:** Centralize capability gating in the transport-independent request builder and show a truthful unavailable-tools state.
**Tests required:** Supported/unsupported/missing metadata; document/media/workspace combinations; runtime catalog refresh.
**Validation:** Chat store tests, playground tests, model-catalog tests, full type/lint.
**Compatibility impact:** behavioral but backward-compatible.

## VF-AUDIT-20260815-P1-006

**ID:** VF-AUDIT-20260815-P1-006
**Severity:** P1
**Status:** CONFIRMED
**Area:** Electron agent IPC/persistence
**File:** `electron/agent/runtime/chat-agent-runner.ts`; `electron/ipc/handlers/veniceHandlers.ts`; `electron/preload.ts`; `src/services/desktopBridge.ts`; `src/stores/chat-stream-manager.ts`
**Lines:** `258-301`; `85-95`; `41-46`; `streamChat callback type`; `35-36, 189-191`
**Symbol:** `appendedMessages` stream envelope
**Evidence:** The agent runner creates tool result messages with generated-media/document metadata and the IPC handler sends them. Preload’s payload/callback type omits `appendedMessages` and reconstructs the callback object without it. The renderer manager expects the field for persistence.
**Expected:** The typed envelope and runtime forwarding preserve all agent-appended messages across main → preload → renderer.
**Actual:** Preload discards the field.
**Impact:** Electron chats lose tool-result records and generated-media/document references, breaking conversation integrity and downstream persistence/rendering.
**Root cause:** The stream envelope is duplicated structurally across layers without a shared contract or end-to-end test.
**Related occurrences:** Main-agent tests stop before preload; renderer tests inject the field directly.
**Authoritative Venice reference:** Not applicable; internal IPC contract.
**Remediation:** Define one shared serializable delta type, forward every property explicitly, validate at IPC boundaries, and persist message batches atomically.
**Tests required:** Main → handler → preload → desktop bridge → store integration with tool result and generated-media metadata; no-tool delta regression.
**Validation:** Electron IPC/preload tests, agent multi-turn tests, chat-store persistence/restart test.
**Compatibility impact:** additive backward-compatible.

## VF-AUDIT-20260815-P1-007

**ID:** VF-AUDIT-20260815-P1-007
**Severity:** P1
**Status:** CONFIRMED
**Area:** Streaming retry/concurrency/billing
**File:** `src/stores/chat-stream-manager.ts`
**Lines:** `39-55, 267-299`
**Symbol:** `startStream`, `MAX_STREAM_RETRIES`, `isRetryableError`
**Evidence:** Deltas are appended/flushed before completion. On a retryable transport/status failure the manager resends the same body up to two times without clearing partial text, a continuation cursor, or an idempotency key. The test covers only failure before any delta.
**Expected:** Never automatically replay a potentially billable stream after observable output unless the provider supplies safe resume/idempotency semantics; otherwise require explicit user retry and preserve the partial result.
**Actual:** A partial request can be replayed while its content remains in the same assistant message.
**Impact:** Duplicate text, conflicting tool calls, and up to three provider generations/charges for one user action.
**Root cause:** Generic request retry policy was applied after the side-effect/observable-output boundary.
**Related occurrences:** Retry timing UI and abort races are not tested with partial output.
**Authoritative Venice reference:** Chat streaming request semantics; no audited provider resume/idempotency contract justifies replay.
**Remediation:** Retry only pre-header/pre-delta failures proven unsent, or stop with a partial-state marker and explicit user action; deduplicate tool execution and assistant persistence.
**Tests required:** Partial text/reasoning/tool call before 429/5xx/network close; abort during backoff; concurrent retry; exact request-count and billing-warning assertions.
**Validation:** Deterministic fake-stream tests plus authorized request-count observation if available.
**Compatibility impact:** behavioral but backward-compatible.

## VF-AUDIT-20260815-P1-008

**ID:** VF-AUDIT-20260815-P1-008
**Severity:** P1
**Status:** CONFIRMED
**Area:** Research/search API contract
**File:** `src/components/search/SearchScrapeView.tsx`; `src/research/providers/veniceResearchProvider.ts`; `src/research/providers/veniceResearchProvider.test.ts`
**Lines:** `153-159`; `87-101`; `10-60`
**Symbol:** direct search request, `VeniceResearchProvider.search`
**Evidence:** Production sends `provider` and `maxResults`. Swagger accepts `search_provider` and `limit` (1..20). Tests explicitly expect the incorrect `provider` field.
**Expected:** Send `{query, search_provider, limit}` with validated values.
**Actual:** User-selected provider and result limit use undocumented names.
**Impact:** Search requests can be rejected by strict validation or silently ignore user configuration, invalidating research result expectations.
**Root cause:** Domain option names were forwarded directly instead of translated by a wire-contract builder.
**Related occurrences:** Both direct Search UI and orchestrated research provider duplicate the drift.
**Authoritative Venice reference:** Swagger `WebSearchRequest`.
**Remediation:** Add one schema-derived search builder/normalizer and migrate both call sites.
**Tests required:** Exact request body; provider enum; limit bounds/default; error response; both UI and provider paths.
**Validation:** Research/search unit/UI tests, schema validation, authorized live search.
**Compatibility impact:** behavioral but backward-compatible.
