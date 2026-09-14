# Media-generation findings

**Auditor:** principal media-generation (static, current-tree)  
**Date:** 2026-09-10  
**Baseline SHA:** `c3ae21af2f723111d92b43c7888a60930226d213`  
**Branch:** `main`  
**Package:** `venice-forge@3.0.0-beta.3`  
**Mode:** read-only except this file  
**Live paid generation:** not run (no provider spend in this session)

Tracked Swagger snapshot: `docs/reference/Venice_swagger_api.yaml` `info.version` / `x-venice-forge-provenance.content_version` = `20260821.193530` (retrieved 2026-08-23, upstream commit `601b7bb19921f0e31bc805d51322085cd6fc4ac5`).

---

## Counts

| Bucket | Count |
|---|---|
| Findings filed (`VF-AUD-20260910-MED-NNN`) | **12** |
| Confirmed defects | **9** |
| Missing features | **1** |
| Documentation / contract lag | **1** |
| Design risk (latent) | **1** |
| Independently verified-correct contracts | **11** |
| 2026-09-01 generation-contract items revalidated | **8** (4 still fixed, 3 still open, 1 external not retested) |
| False positives / not reproducible | **0** |

Severity among the 12 findings: P1 × 3, P2 × 5, P3 × 4.

---

## 2026-09-01 generation-contract revalidation

Source of the historical claims: `docs/ROADMAP.md` `VF-GENERATION-CONTRACT-PARITY-2026-09-01` and `docs/summary_of_work.md` session “End-to-end generation API/UI audit and remediation”. Historical text is hypothesis only; each row is a current-tree fact.

| Historical item | 2026-09-01 claim | Current-tree verdict | Evidence |
|---|---|---|---|
| HQE-REL-001 Unicode paid-queue fingerprints | `btoa(JSON)` replaced by SHA-256 | **STILL FIXED** | `src/shared/logicalRequestFingerprint.ts:8-20` hashes UTF-8 canonical JSON via Web Crypto; `src/hooks/use-video.ts:54` and `src/hooks/use-music.ts:51` call it. |
| HQE-PRIV-001 reversible prompt-bearing fingerprints | journal value is opaque `video-sha256:` / `audio-sha256:` | **STILL FIXED** | fingerprint prefix `${operation}-sha256:${hex}`; durable journal strips prompts via `sanitizePersistedMetadata` (`src/types/background-task.ts:132-147`). |
| HQE-UX-001 unconditional variants UI | Image Studio must respect `caps.supportsVariants` | **STILL FIXED** | `src/components/image/image-view.tsx:807` passes `supportsVariants: caps.supportsVariants`; slider gated at `:1581`. `wai-Illustrious` remains `supportsVariants: true` in `src/config/image-model-capabilities.ts`. |
| HQE-REL-002 lost upstream string `details` | Electron `readResponseError` must append distinct string details | **STILL FIXED** | `electron/services/veniceClient.ts:668-684`; regression `electron/services/veniceClient.error.test.ts:29-40`; paid queue uses that reader at `electron/services/backgroundTaskManager.ts:970`. |
| Workflow image nodes vs Image Studio resolver | open architecture gap | **STILL OPEN** → MED-005, MED-006 | `src/lib/workflow-engine.ts:115-127` vs `src/components/image/image-view.tsx:152-217,786-818`. |
| Tracked Swagger refresh | snapshot `20260821.193530` vs official `20260826.105305` | **STILL OPEN** → MED-011 | provenance header still `20260821.193530`. |
| Optional video enhancement/upscaling fields | product-parity, not invalid existing bodies | **STILL OPEN** → MED-012 | tracked `QueueVideoRequest` already has `upscale_factor`, `omni_reference_task_type`, `keyframes`, `elements`, reference URL arrays; Video Studio does not emit them. |
| `wai-Illustrious` 500 | external Venice worker failure | **NOT RETESTED LIVE** | no paid replay this session. Static: payload builder still schema-valid; not reclassified as a Forge defect. |

---

## Findings

### VF-AUD-20260910-MED-001 — Video/music poll timeout is 120s; Swagger P80 example is 145s

- **Severity:** P1
- **Confidence:** High
- **Classification:** confirmed defect
- **Path / symbols:**
  - `electron/services/backgroundTaskManager.ts:53-54,600-611` (`MAX_VIDEO_GENERATION_MS`, `MAX_NON_VIDEO_GENERATION_MS`, `runPoll`)
  - `src/stores/background-task-store.ts:20,294-299` (`MAX_GENERATION_MS`)
  - `docs/reference/Venice_swagger_api.yaml:11990-11994` (`/video/retrieve` `average_execution_time` example `145000`)
- **Observed:** both Electron and web pollers abort with `"Status checks stopped. Resume checking or try again."` when `Date.now() - startedAt > 120_000`. `MAX_ATTEMPTS = 200` (~10 min at 3s) is unreachable because the wall-clock cap fires first.
- **Expected:** polling must outlive documented provider P80 queue time. The tracked retrieve schema’s own example is 145 seconds; Seedance jobs commonly exceed two minutes.
- **Static proof:** `145000 > 120000`. Timeout is applied to video and music equally.
- **Impact:** paid video/music jobs that are still `PROCESSING` at 120s are locally marked `timeout` even if the provider later completes. Electron restart will resume polling only if the persisted status is still non-terminal; a timeout is terminal (`isTerminalStatus`).
- **Correction / tests this session:** none (read-only).

### VF-AUD-20260910-MED-002 — VPS `download_url` is memory-only; retrieve JSON is not specified to re-issue it

- **Severity:** P1
- **Confidence:** High
- **Classification:** confirmed defect
- **Path / symbols:**
  - `electron/services/backgroundTaskManager.ts:57-62,992-1018` (`ephemeralSecrets`, persist `queueDownloadUrlPresent` not the URL)
  - `electron/services/videoRetrieveService.ts:278-288` (`normalizeVideoRetrieveResult` + `queueDownloadUrl`)
  - `src/services/video-retrieve-normalizer.ts:83-89`
  - Swagger queue 200: `docs/reference/Venice_swagger_api.yaml:11743-11749` (`download_url` optional, “retrieve endpoint returns JSON status only”)
  - Swagger retrieve JSON: `docs/reference/Venice_swagger_api.yaml:11979-12003` (COMPLETED JSON properties are `status`, `average_execution_time`, `execution_duration` — no `download_url`)
- **Observed:** Electron correctly refuses to persist the signed URL to `tasks.json` (privacy). It keeps the URL only in `ephemeralSecrets` (30 min, process-local). After restart the map is empty. Resume polling calls `/video/retrieve`. For VPS-backed models the tracked contract says retrieve returns JSON status, not `video/mp4`. COMPLETED JSON without `download_url` and without a retained queue URL becomes `{ kind: 'failed', error: 'Video completed without a playable video response.' }`.
- **Expected (AGENTS.md §11):** background generation must survive recoverable restarts; expiring provider URLs must be downloaded by the trusted main process, not treated as durable renderer state. Restart recovery must still be able to finish the download.
- **Static proof:** queue schema documents retrieve-as-JSON-only when `download_url` was issued; retrieve JSON schema omits `download_url`; main process does not persist a restart-safe handle besides the queue id.
- **Impact:** a paid VPS video that completes after an app restart can be locally failed even though the provider still holds the file for 24 hours.
- **Note:** if a given model’s retrieve actually returns `video/mp4` or re-issues `download_url` despite the snapshot, restart works. That is not what the tracked contract specifies for the VPS path.

### VF-AUD-20260910-MED-003 — Web video completion stores expiring HTTPS URLs and/or data URLs as gallery state

- **Severity:** P1
- **Confidence:** High
- **Classification:** confirmed defect
- **Path / symbols:**
  - `src/stores/background-task-store.ts:314-334` (web poller)
  - `src/services/veniceClient/fetch.ts:390-403` (binary `image/`/`audio/`/`video/` → `FileReader` data URL)
  - `src/services/taskMediaCatalog.ts:38-72` (`image: task.resultUrl`, `downloadUrl: task.resultUrl`)
  - `src/components/video/video-view.tsx:616-634` (manual save copies `videoUrl` into Media Studio `downloadUrl`)
  - `src/hooks/use-video.ts:101` (web queue success stores `queueDownloadUrl: data.download_url` in renderer task metadata)
- **Observed:**
  1. Web `kind === 'download'` sets `resultUrl` to the provider signed URL and stops polling. No main-process download exists on web.
  2. Web `kind === 'completed'` can be a `data:video/mp4;base64,...` produced by `veniceFetch` buffering the entire MP4.
  3. `persistCompletedTaskMedia` writes that `resultUrl` into IndexedDB `images` as both `image` and `downloadUrl`.
- **Expected (AGENTS.md §11):** do not persist large media as task/store data URLs; do not treat expiring provider URLs as durable renderer state; expiring URLs are downloaded by the trusted main process.
- **Static proof:** web poller has no `downloadGeneratedVideo` equivalent; catalog upsert uses `task.resultUrl` verbatim.
- **Impact:** web Media Studio records expire (signed URL, 24h) or bloat IndexedDB with full video bytes. Renderer also holds the signed URL in Zustand metadata.

### VF-AUD-20260910-MED-004 — Several generation surfaces still persist data URLs instead of durable media IDs

- **Severity:** P2
- **Confidence:** High
- **Classification:** confirmed defect
- **Path / symbols:**
  - Image tools save: `src/components/image/image-tools.tsx:211-256` (`blobToDataUrl` → `useMediaStore.upsert`, no `desktopMedia.persistGeneratedImage`)
  - Character-scene: `src/services/characterSceneGenerationService.ts:196-242` (`processBase64Image` result stored as `mediaItem.image`)
  - Workflow imageGen: `src/lib/workflow-engine.ts:133-139` returns `[image:data:${mime};base64,...]`
  - Workflow music (web): `src/lib/workflow-engine.ts:253` `[audio:data:${mime};base64,...]`
  - Web music poller: `src/stores/background-task-store.ts:350-360` builds a data URL then `persistCompletedTaskMedia`
- **Observed:** Image Studio *generate* on Electron is the only first-class path that replaces the preview with `venice-media://<sha256>` before IDB upsert (`src/components/image/image-view.tsx:860-868`). Edit / upscale / background-remove “Save to Media”, character-scene, workflow nodes, and web music still store `data:` payloads (or blob URLs wrapping them).
- **Expected:** persist binaries in the canonical content store; gallery metadata holds stable IDs/URLs, not source bytes.
- **Static proof:** image-tools save path has no `isElectron()` persist branch; character-scene never calls `desktopMedia.persistGeneratedImage`.
- **Contrast (verified correct):** Image Studio generate Electron path + recovery UI (`pendingImageSaves` / `retryGeneratedImage`) in `image-view.tsx:475-498,843-987`.

### VF-AUD-20260910-MED-005 — Workflow `imageGen` does not use the Image Studio runtime capability resolver

- **Severity:** P2
- **Confidence:** High
- **Classification:** confirmed defect (also open ROADMAP `VF-GENERATION-CONTRACT-PARITY-2026-09-01` item 1; independently confirms parent `VF-AUD-20260910-API-001`)
- **Path / symbols:**
  - Workflow dispatch: `src/lib/workflow-engine.ts:115-127` (`buildCanonicalImageGeneratePayload` with `steps: data.steps ?? 20`, `width/height: 1024` unless aspect ratio, `hideWatermark: true`)
  - Workflow schema defaults: `src/lib/workflow-schema.ts:173-237` (static `DEFAULT_IMAGE_MODEL`, steps 20, width/height)
  - Image Studio: `src/components/image/image-view.tsx:152-217,786-818` (live `/models` constraints for aspect/resolution/steps max/prompt limit + `getImageModelCapabilities` flags + `resolveStyleReferenceCapabilities`)
- **Observed:** workflow never reads `model_spec.constraints` or the static capability registry before dispatch. Seedream t2i in the registry is `dimensionMode: "aspectRatio"` and `supportsNegativePrompt: false` (`src/config/image-model-capabilities.ts:320-334`); a workflow node can still emit `width`/`height`, `steps`, and `negative_prompt`.
- **Expected:** one canonical owner for image wire construction; unsupported fields dropped at the network boundary the same way Image Studio does.
- **Static proof:** `grep` shows `buildCanonicalImageGeneratePayload` used by workflow; `getImageModelCapabilities` is not imported by `src/lib/workflow-engine.ts`.

### VF-AUD-20260910-MED-006 — Two image payload builders with different contracts

- **Severity:** P2
- **Confidence:** High
- **Classification:** confirmed defect (architecture)
- **Path / symbols:**
  - Studio/character-scene: `src/utils/payloadBuilders.ts:385-487` (`buildImagePayload`)
  - Canonical/workflow: `src/shared/venice-media-contract/payload-builders.ts:78-145` (`buildCanonicalImageGeneratePayload`)
- **Observed:** `buildImagePayload` honors `supportsSteps` / `supportsCfgScale` / `supportsVariants` / `supportsNegativePrompt` / `supportsReturnBinary` / `supportsReferences`. Canonical builder always emits `return_binary` (default false), `format: 'png'`, `hide_watermark`, and `steps`/`cfg_scale` whenever supplied — no capability flags.
- **Expected (AGENTS.md §10):** one canonical adapter; do not let multiple paths construct incompatible versions of the same provider request.
- **Static proof:** Image Studio and character-scene import `../utils/payloadBuilders`; workflow imports `../shared/venice-media-contract`. Tests exist for both, independently.

### VF-AUD-20260910-MED-007 — Failed-persistence recovery custody is Image Studio IPC only

- **Severity:** P2
- **Confidence:** High
- **Classification:** confirmed defect
- **Path / symbols:**
  - Custody implementation: `electron/services/generatedMediaRecoveryQueue.ts:1-94` (8 items, 128 MiB, 30 min TTL, opaque UUID, no prompt/URL)
  - Only production retain call: `electron/ipc/handlers/fileHandlers.ts:114-127` (`app:media:persist-generated-image`)
  - Not used: `electron/services/backgroundTaskManager.ts:717` (music `persistGeneratedMedia`), `electron/services/videoRetrieveService.ts:264-325` (`persistGeneratedMp4Stream` / `persistGeneratedMedia`), `electron/agent/runtime/approved-media-executor.ts:214-228` (`persistAccepted` after HTTP 200)
- **Observed:** Image Studio generate on Electron retains validated bytes on persist failure and exposes main-frame-only retry / Save As (`fileHandlers.ts:131-172`, `image-view.tsx:432-498`). Video/audio queue completion and approved `media.generateImage` throw on persist failure. Agent `persistAccepted` failure is classified `acceptance_unknown` (`paidSubmissionManager.ts:169-186`) even after a successful 200 body containing the only copy of the image.
- **Expected (AGENTS.md §11):** a generated-image persistence failure must not silently destroy the only successful provider result; recovery custody is main-owned, bounded, opaque-ID, no prompts/credentials/signed URLs.
- **Static proof:** `grep retainGeneratedMediaForRecovery` hits the recovery module, its tests, and `fileHandlers.ts` only.

### VF-AUD-20260910-MED-008 — `stripPng` drops `tRNS` (indexed/grayscale transparency)

- **Severity:** P3
- **Confidence:** High
- **Classification:** confirmed defect
- **Path / symbols:** `src/utils/imageProcessor.ts:288-354` (`CRITICAL_CHUNKS = IHDR, PLTE, IDAT, IEND, sRGB, gAMA`); used by Image Studio generate and character-scene via `processBase64Image`.
- **Observed:** ancillary `tRNS` is discarded. No test mentions `tRNS` (`src/utils/imageProcessor.test.ts` PNG cases only cover `tEXt` stripping).
- **Expected (AGENTS.md §11):** preserve PNG alpha/transparency for background-removal output. RGBA truecolor+alpha (color type 6) keeps alpha in `IDAT`, so typical Venice bg-remove bytes survive **if they never pass `stripPng`**.
- **Mitigating fact:** background-remove save uses `blobToDataUrl` on the raw `image/png` blob (`image-tools.tsx:218`, `use-image-tools.ts:27-32` with `validateImageBlob(..., 'image/png')`) and does **not** call `processBase64Image`. RGBA bg-remove → gallery is intact. The defect is: any later `processBase64Image` pass, and any indexed/grayscale PNG with `tRNS`.
- **Static proof:** `CRITICAL_CHUNKS` set; `grep tRNS` over `*.ts,*.tsx` is empty.

### VF-AUD-20260910-MED-009 — Image Studio journals every generate under queue ID `sync-request`

- **Severity:** P3
- **Confidence:** High
- **Classification:** design risk (latent contract break)
- **Path / symbols:** `src/hooks/use-image.ts:6-18`; consumer `src/components/image/image-view.tsx:13,536`.
- **Observed:** `registerQueueTask(taskId, 'image', 'sync-request', { request: req })`. Comment admits image generate has no provider queue id. `persistCompletedTaskMedia` (`src/services/taskMediaCatalog.ts:11-28`) dedupes by `item.queueId === task.queueId`. Image generate currently updates status without `resultUrl`, so the catalog helper returns null today — but any later `resultUrl` assignment would collapse all image-task catalog rows onto the first `sync-request` record. Task ids use `image-${Date.now()}`, which can collide in the same millisecond.
- **Expected:** dedupe by real queue ID or by unique generation ID; never reuse a sentinel queue id across jobs.
- **Static proof:** literal `'sync-request'` in `use-image.ts:11`; catalog equality on `queueId`.

### VF-AUD-20260910-MED-010 — Approved agent image persist has no byte custody after HTTP 200

- **Severity:** P2
- **Confidence:** High
- **Classification:** confirmed defect (agent path of MED-007)
- **Path / symbols:** `electron/agent/runtime/approved-media-executor.ts:75-94,214-228`; `electron/services/paidSubmissionManager.ts:164-186`.
- **Observed:** `persistAccepted` decodes the 200 JSON `images[]` and calls `persistGeneratedMedia`. On throw, `submitDurablePaidTask` records `acceptance_unknown` and does not call `retainGeneratedMediaForRecovery`. The in-memory base64 from the response is dropped with the stack.
- **Expected:** after a successful paid generate, persist failure must retain bytes in main-process custody (same contract as Image Studio IPC).
- **Static proof:** no recovery import in `approved-media-executor.ts`; persist is inside `persistAccepted`, which is after `dispatch()` returned.

### VF-AUD-20260910-MED-011 — Tracked Swagger snapshot is still `20260821.193530`

- **Severity:** P3
- **Confidence:** High
- **Classification:** documentation / contract lag (ROADMAP item 2)
- **Path / symbols:**
  - `docs/reference/Venice_swagger_api.yaml:1-13`
  - `docs/reference/VENICE_API_SOURCE_MANIFEST.md:5-8` (also `20260821.193530`; internally still describes an older `20260814.194349` as “Tier 1” — additional drift inside the manifest)
- **Observed:** ROADMAP states official `veniceai/api-docs` `main` at `569091e99d8f03c8866dbfb691893f77552a4f56` is `20260826.105305`. This tree has not been refreshed.
- **Expected:** tracked snapshot matches the declared upstream refresh process (`npm run docs:venice:sync`) before claiming wire parity.
- **Static proof:** provenance header vs ROADMAP text. Not evidence that current Forge bodies are invalid.

### VF-AUD-20260910-MED-012 — Video Studio does not expose `QueueVideoRequest` fields already in the tracked Swagger

- **Severity:** P3
- **Confidence:** High
- **Classification:** missing feature (ROADMAP item 3, but the fields are already in `20260821.193530`, not only `20260826.105305`)
- **Path / symbols:**
  - Swagger `QueueVideoRequest`: `docs/reference/Venice_swagger_api.yaml:3528-3824` (`upscale_factor`, `omni_reference_task_type`, `consents.seedance`, `reference_video_urls`, `reference_audio_urls`, `reference_document_urls`, `elements`, `keyframes`, `end_image_url`, `audio_url`, `video_url`)
  - App type: `src/types/venice.ts:335-349` (`VideoQueueRequest` omits those keys)
  - UI builder: `src/components/video/video-view.tsx:209-237` (model, prompt, negative, duration, resolution, aspect, optional `image_url`, optional `audio`)
  - Canonical builder already accepts several of them: `src/shared/venice-media-contract/payload-builders.ts:267-342`
- **Observed:** Video Studio never sends `upscale_factor` / R2V references / keyframes / Seedance consents except whatever 409 challenge path exists elsewhere. Workflow video similarly sends only model/prompt/aspect/duration/resolution (`workflow-engine.ts:271-277`).
- **Expected:** product decision, not a 400 on current bodies. Recorded because the tracked snapshot already documents the fields; waiting on `20260826` is not required to notice the gap.
- **Static proof:** UI `handleGenerate` object vs swagger required/optional property list.

---

## Independently verified-correct contracts

These were re-read against Swagger + implementation. They are **not** findings.

1. **Image edit uses `model`, not deprecated `modelId`.** `buildImageEditRequest` (`src/services/media-request-adapter.ts:199-212`); test `src/services/media-request-adapter.test.ts:27-32`.
2. **Image upscale sends only `image`, `scale`, optional `creativity`.** Same adapter `:215-237`; hook test `src/hooks/use-image-tools.test.ts:25-28`. No model selector.
3. **Background-remove sends `image` or `image_url`; expects PNG.** Adapter `:239-245`; hook `:27-34` with `validateImageBlob(..., 'image/png')`. Swagger `BackgroundRemoveImageRequest` (`yaml:3243-3259`) has those two fields, `additionalProperties: false`.
4. **Edit / upscale / bg-remove do not append `return_binary`.** Tests assert `not.toHaveProperty('return_binary')`.
5. **Electron Image Studio generate persists binaries, not data URLs.** `image-view.tsx:860-868` + `fileHandlers.ts:114-115` + `generatedMediaStore.persistGeneratedMedia` (magic-byte check `electron/services/mediaFormat.ts:33-38`, atomic temp+rename).
6. **Electron video signed-URL download is main-process, HTTPS, public-DNS, MP4-only.** `electron/services/generatedVideoDownload.ts:56-94`.
7. **Paid video/music queue write-ahead + fingerprint idempotency.** `submitPaidQueueTaskInMain` (`backgroundTaskManager.ts:856-1048`); restart scavenges `pending_finalize` (`:239-283`). Prompts are not written to `tasks.json` (`sanitizePersistedMetadata`).
8. **Audio retrieve JSON-vs-binary.** Electron `parseBody` returns `{ dataBase64 }` for non-JSON (`electron/services/veniceClient.ts:242-252`); `normalizeAudioRetrieveResponse` accepts `audio/mpeg|wav|flac` (`src/services/audio-retrieve-normalizer.ts:21-29`, tests `:11-13`). Matches swagger retrieve 200 content types (`yaml:12753-12789`).
9. **Video queue optional `download_url` is parsed.** `normalizeVideoQueueResponse` / paid-queue test `backgroundTaskManager.paidQueue.test.ts:58-96` (ephemeral, not journaled).
10. **Queue-ID Media Studio dedupe for video UI.** `video-view.tsx:147-159,586-607` (`savedQueueIdsRef` + `items.some(media => media.queueId === queueId)`).
11. **Recovery custody design (when used) matches AGENTS.md.** Opaque UUID, 8/128MiB/30min, main-frame-only IPC, no prompt/URL in the entry (`generatedMediaRecoveryQueue.ts`).

---

## Out of scope / not claimed

- Live paid generate/edit/upscale/bg-remove/video/music/TTS against Venice.
- Hosted CI / CodeQL.
- Semantic Family Safe Mode classifiers (deferred `VF-FSM-CLASSIFIER-2026-08-31`).
- Custom-protocol capability tokens (deferred `VF-CAPABILITY-PROVENANCE-2026-08-31`).
- Whether official `20260826.105305` adds fields beyond those already in this tree’s `QueueVideoRequest` (snapshot not fetched this session).

---

## Trace coverage (this audit)

```
Image Studio generate UI → useImageGenerate → buildImagePayload → veniceClient
  → Electron persistGeneratedImage → generatedMediaStore / recovery queue
Image tools edit/upscale/bg-remove → media-request-adapter → veniceBlob
  → blob preview → IDB data URL (Electron too)
Video Studio → useVideo → submitPaidQueue (Electron) / veniceFetch (web)
  → backgroundTaskManager poll → videoRetrieveService / generatedVideoDownload
Music Studio → useMusic → same paid-queue / web poll → audio retrieve normalizer
TTS → useTTS / chatTtsController → /audio/speech blob (no durable media store)
Workflow image/video/music/tts → canonical builders; image/music web remain data URLs
Agent media.generateImage → approval plan → paidSubmissionManager → persistGeneratedMedia
Swagger: generate/edit/upscale/bg-remove/video queue+retrieve/audio queue+retrieve
```
