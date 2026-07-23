# Image Inspector Architecture

Image Inspector turns a bounded local image into a structured visual analysis and a reusable image-generation prompt. Its optional source-discovery step is a text web search derived from the analysis; it is not pixel-based reverse image search.

## Supported Inputs

The desktop application accepts:

- a user-selected PNG, JPEG, or WebP file;
- a PNG, JPEG, or WebP image from the clipboard;
- an existing app-managed image attachment or media record resolved by media ID.

Input validation is owned by `electron/services/imageInspectorInput.ts`. The service:

- rejects empty inputs and files larger than 18 MiB;
- verifies PNG, JPEG, or WebP magic bytes rather than trusting an extension;
- decodes the image through Electron `nativeImage`;
- requires both dimensions to be at least 64 pixels;
- rejects images above 33,177,600 decoded pixels;
- persists accepted bytes through the generated-media store;
- returns only bounded metadata and a `venice-media://` identifier to the renderer.

The renderer cannot submit arbitrary paths or remote URLs. Remote URL fetching was deliberately removed from this feature so untrusted renderer input cannot turn the main process into an unrestricted network fetcher.

## Electron Boundary

`electron/ipc/handlers/imageInspectorHandlers.ts` registers four implemented channels:

1. `imageInspector:chooseImage`
2. `imageInspector:ingestClipboardImage`
3. `imageInspector:resolveMediaInput`
4. `imageInspector:readMediaDataUrl`

The matching preload and renderer types expose only those four operations. UI code accesses them through `desktopImageInspector` in `src/services/desktopBridge.ts`, not through direct `window` access.

`readMediaDataUrl` is intentionally narrow. It accepts one validated media ID, resolves app-managed storage in the main process, revalidates the stored MIME type, byte size, signature, and dimensions, and returns the data URL only for the immediate provider request. Session persistence retains the stable media ID and protocol URL, not the large base64 payload.

## Model Selection and Analysis Request

`src/components/image-inspector/ImageInspectorView.tsx` obtains the live model catalog and filters it through `modelSupportsVision()`. Live `model_spec.capabilities.supportsVision` metadata takes precedence over static fallback knowledge.

`src/stores/image-inspector-store.ts` sends the analysis through the canonical `veniceFetch("/chat/completions", ...)` path with:

- the selected vision-capable model;
- an app-authored system prompt from `buildImageInspectorSystemPrompt()`;
- bounded user instructions;
- one validated `image_url` data URL;
- temperature `0.2`.

The bundled Venice API reference permits base64 data URLs for multimodal `image_url` content. Local validation also enforces the provider's 64-pixel minimum before the request is made.

## Response Contract and Error Semantics

`src/services/imageInspectorAnalysis.ts` owns the response contract. The model is instructed to return one versioned JSON object containing the summary, subjects, visual attributes, visible text, source clues, replication prompt, search queries, confidence, and warnings.

The runtime parser:

- bounds the model response and every nested string/list;
- requires `schemaVersion: 1` and every mandatory field;
- validates prompt targets and confidence range;
- rejects secret-like output;
- distinguishes a provider-authored non-JSON failure from a malformed structured response.

For example, an HTTP 200 response whose assistant content is `Unable to fetch it` is recorded as `ANALYSIS_REQUEST_FAILED` with that redacted provider message. It is not mislabeled as a browser or network fetch failure. Valid JSON that does not satisfy the schema is recorded as `ANALYSIS_PARSE_FAILED`.

The failed session and its safe error message are persisted and displayed in the workspace, allowing the user to select another live vision model or input without losing the diagnostic.

## Source Discovery

After a successful analysis, the user may run Google- or Brave-backed research search using a generated or edited text query. Search results are stored as ranked `potential-source` records under the `text-source-discovery` mode.

Only valid HTTP or HTTPS result URLs are rendered. Missing, malformed, or non-web schemes are discarded rather than replaced with a fabricated fallback destination.

The feature does not upload the source image to a reverse-image-search engine, compare perceptual hashes, or calculate visual similarity. It therefore does not display fabricated similarity percentages or claim that a result is an exact or near image match.

## Telemetry and Privacy

Traffic Inspector sanitization replaces image data URLs with length-only summaries. `sanitizeInspectorPayload()` is idempotent, so re-exporting an already-sanitized trace does not turn `[data URL: N chars]` into a misleading generic text marker.

Diagnostics may retain endpoint, model, status, timing, MIME type, byte count, dimensions, and normalized error class. They must not retain raw image bytes, base64 payloads, prompts, credentials, signed URLs, or private filesystem paths.

## Regression Coverage

Focused coverage is provided by:

- `electron/services/imageInspectorInput.test.ts`
- `electron/ipc/handlers/imageInspectorHandlers.test.ts`
- `src/services/imageInspectorAnalysis.test.ts`
- `src/stores/image-inspector-store.test.ts`
- `src/components/image-inspector/ImageInspectorView.test.tsx`
- `src/services/inspectorTelemetry.test.ts`

These suites cover signature/dimension validation, durable persistence, IPC registration and redaction, schema enforcement, preservation of provider-authored failure text, narrow media resolution, truthful source-discovery labels, and telemetry idempotence.

## External Acceptance

A paid live-provider run remains manual release evidence under `VF-VERIFY-005`. It must verify at least one current vision-capable model with a valid PNG, JPEG, and WebP input while ensuring Traffic Inspector exports contain no raw image payloads. No provider-acceptance result should be inferred from mocked tests or an HTTP 200 response containing a provider-authored failure.
