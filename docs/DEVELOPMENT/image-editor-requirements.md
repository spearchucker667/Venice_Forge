# Image Editor requirements and API contract

Status: partially implemented. The approved dedicated tab/menu and existing single-image edit workflow are implemented locally; advanced requirements below remain planned. Wire contract reconciled with upstream schema `20260918.184256` (commit `18c329e5`) in commit `76fbc21b`. The [source manifest](../reference/VENICE_API_SOURCE_MANIFEST.md) records provenance and discrepancies. [ROADMAP.md](../ROADMAP.md) is the sole project-wide work ledger (`IMAGE-EDITOR-DEDICATED-TAB-2026-09-26`).

LoRA and a dedicated style-selector requirement were removed at the user’s request on 2026-09-26. Styling can still be described in the ordinary edit prompt.

## Implemented navigation and editing flow

`Image Editor` is a canonical tab (`image-editor`) in the Generate group, available through the sidebar and searchable command menu. Gallery Edit and send-to-edit actions open it with the source and parent lineage; upscale handoffs continue to open Image Studio. The view reuses `ImageTools` in edit-only mode: upload PNG/JPEG/WebP, select an edit model, enter the prompt, preview, then Save to Media Studio or Delete. Save is guarded against duplicate clicks, retains a failed-save preview for retry, and clears the preview only after success. Delete clears the unsaved preview and leaves the source intact.

This approved delivery exposes the existing workflow. Mask editing, crop/reframe, model-aware ratio controls, enhancement controls and cross-model/same-model variation scheduling remain future work. Input ingestion follows the existing attachment pipeline, including its existing downscaling behavior. Unsaved source/preview state remains transient and is released when leaving the tab; restart recovery and navigation confirmation are not implemented. Do not claim the full workflow below is complete.

## Required user workflow

Open a dedicated **Image Editor** tab from its own navigation/menu entry. Upload a PNG, JPEG, or WebP source; crop or reframe it; paint a mask if needed; select eligible edit models and a variation count for each; enter the edit prompt and optionally enable enhancement; generate previews; then explicitly Save selected results to the gallery or Delete unwanted results. Allow multiple variations from one model and comparisons across different models in the same session.

| Requested capability | Required behavior and acceptance |
|---|---|
| Own tab and menu | Register the editor through `src/config/tabs.ts`, app routing, navigation and applicable command/menu surfaces. Supply localized labels and accessible keyboard navigation. Do not hide the workflow solely in a gallery dialog. |
| PNG/JPEG/WebP uploads | Validate decoded MIME/signature, byte size, dimensions and model constraints before a paid call; reject renamed invalid files. Handle orientation consistently. Keep the source unchanged and allow replacement. |
| Mask editing | Brush/erase, brush size, undo, clear and visible mask overlay. Preserve source-resolution coordinates independently of display size; transform source and mask together after crop/reframe. Base image first, mask/layers afterward. Verify selected-model mask conventions before promising exact preservation outside the mask. |
| Same-model and cross-model variations | User selects one or more eligible edit models and a positive count per model. Schedule individual calls, with bounded concurrency, per-result progress/error/cancel handling, and visible request/cost implications. Preserve successful siblings after partial failure. No guarantee that repeated calls yield distinct or reproducible outputs. |
| Save/Delete before gallery | Results enter a private staging area first. Save promotes selected results into durable media storage and gallery metadata exactly once. Delete discards staged results without touching the uploaded original or creating gallery entries. Unsaved-result navigation/close behavior must be explicit; failed saves retain recoverable results and allow retry or Save As. |
| Aspect ratio | Offer only selected-model supported values, including automatic sizing where supported. Revalidate choices per model in mixed-model batches; explain incompatibilities before sending. Do not silently substitute a different ratio. |
| Prompt and enhancement | Require a nonempty prompt within the selected model's character limit and schema ceiling. Optional `enhance_prompt` is off by default. Explain additional time and potential charge; safely decode/display the returned enhanced prompt when present, preserve the original, and handle missing/malformed headers. Do not log either prompt. |
| Crop and reframe | Non-destructive crop with ratio lock/freeform preview, reset/undo and correct coordinate mapping. Reframing expands or repositions the source on a canvas; synthesizing missing areas is a model edit, not a guaranteed dedicated outpaint endpoint. Validate the exported canvas and mask before generation. |

## Wire-contract mapping

Source locations are relative to the selected api-docs checkout: `swagger.yaml` (`EditImageRequest`, `MultiEditImageRequest`, `MultiEditImageMultipartRequest`, `GenerateImageRequest`, `ModelResponse` and the corresponding paths), `guides/media/image-editing.mdx`, and `guides/media/prompt-enhancement.mdx`. The tracked [Swagger snapshot](../reference/Venice_swagger_api.yaml) is the portable wire reference.

- `POST /image/edit`: required `image`, `prompt`; canonical selector `model` (`modelId` is deprecated). Optional schema fields include `aspect_ratio`, `resolution`, `output_format`, `enhance_prompt`, `disable_prompt_optimization_thinking`, and `safe_mode`. This selected single-edit schema does **not** declare `quality`; multi-edit does.
- `POST /image/multi-edit`: required `images`, `prompt`; selector remains `modelId`. Optional `aspect_ratio`, `resolution`, `quality`, `output_format`, `enhance_prompt`, `disable_prompt_optimization_thinking`, and `safe_mode`. Input minimum is one; maximum comes from `/models` → `capabilities.maxInputImages`, not a universal three-image cap. The first input is the base, subsequent inputs are layers/masks; there is no standalone `mask` request property.
- Discover eligible models with `/models?type=inpaint` and validate runtime capabilities/constraints, including input count, ratio, resolution, quality, prompt length and prompt-optimization thinking. Missing metadata must not enable unsupported controls.
- Both edit routes accept JSON base64/URL input and multipart uploads, and return synchronous binary results. The schema declares PNG, JPEG and WebP responses; inspect actual content type and signature. `output_format` enum is `jpeg`, `png`, `webp`; prose also mentions `jpg`, but prefer the schema enum. Do not append `return_binary`.
- Image inputs require at least 65,536 pixels, at most 33,177,600 pixels, and file size less than 25 MB in the selected schema; apply stricter model limits when present. The requested upload formats are product acceptance requirements to validate against chosen models, not a blanket guarantee for every model.
- Neither edit schema declares `seed`, a batch/variation count, or an array of model IDs. Variations require separate requests. Its old `inpaint` field is deprecated and disabled.
- Enhancement uses `enhance_prompt: true`, can add approximately 30 seconds, and may charge for a rewrite. `x-venice-enhanced-prompt` is URL-encoded and may be absent. Do not hardcode the guide's historical price; use verified pricing when presenting costs.
- `safe_mode` remains subject to main-process runtime safety authority; renderer controls or imported editor settings must not bypass existing safety enforcement or the HTTP 451 contract.

## Current implementation evidence and integration boundaries

Baseline static review at Venice Forge `41c77e3ebefb040761637f49483e28a2af5162b1`, with subsequent local implementation status:

| Classification | Evidence | Implication |
|---|---|---|
| Implemented locally | `src/config/tabs.ts`, `TAB_IDS`/registry now includes `image-editor`; `src/App.tsx` lazily renders `ImageEditorView`. | Sidebar and command menu expose the dedicated editor; regression tests cover both and gallery handoffs. |
| Missing feature | `src/components/gallery/InpaintMaskEditor.tsx`, `MAX_DISPLAY_DIMENSION = 520`; mask dimensions use the scaled display width/height. | A source-resolution editor must decouple display size from mask export. Test coordinate fidelity at multiple zoom levels. |
| Missing feature | `src/services/imageDerivedOperations.ts`, `runImageDerivedOperation()` calls `upsertDerivative()` before returning. | This immediate-save path cannot satisfy staging unchanged; separate execution/staging from explicit gallery promotion while preserving existing callers. |
| Contract reconciled | `src/shared/venice-media-contract/payload-builders.ts` and `types.ts` removed single-edit `quality` in commit `76fbc21b`, aligning with `EditImageRequest`. | Completed; single-edit payloads never emit `quality` while multi-edit preserves it. |

All calls must use canonical payload builders and `veniceFetch()` through the existing Electron/preload/IPC or Express path. Keep credentials, privileged file operations, safety authority and recovery custody in their existing trusted boundaries. Stage media using bounded app-managed storage and opaque IDs; do not persist large data URLs in UI stores. Validate binary content before marking completion. Separate staged storage from gallery visibility and preserve lineage when saving derivatives.

## Acceptance evidence required for implementation

1. Focused payload tests prove endpoint-specific selectors, omission/rejection of unsupported batch/seed/quality fields, model limits, and mask input ordering.
2. Upload/canvas tests cover all three requested formats, invalid files, source preservation, orientation, mask alignment, crop/reframe, and limits after transformation.
3. Workflow tests cover one model with multiple variations, several models with independent counts, partial failure, cancellation, and no duplicate paid dispatch on remount/retry.
4. Persistence tests prove no gallery entry before Save, idempotent Save, Delete isolation, failed-save recovery, bounded staging cleanup and the declared restart behavior.
5. Transport tests cover binary PNG/JPEG/WebP, malformed/empty binary, enhanced-prompt headers, normalized errors, and unchanged safety/credential boundaries across desktop and web.
6. Headed keyboard/visual QA covers the dedicated menu/tab and canvas controls; localization structural checks run for visible copy. Native-language approval remains separate.

The initial requirements review performed no UI implementation. A subsequent approved bounded implementation delivered the dedicated tab/menu and single-image workflow described above. Paid provider calls and full advanced editor acceptance have not been performed. Model-specific mask/outpainting guarantees remain unverified as stated above.
