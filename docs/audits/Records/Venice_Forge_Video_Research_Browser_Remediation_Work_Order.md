# Venice Forge Video Pipeline and Research Browser Deactivation Work Order

## Role

Act as a senior Electron, React, TypeScript, media-pipeline, persistence, and application-security engineer.

Work against the current checked-out Venice Forge repository. The expected local checkout is:

```text
/Users/super_user/Projects/Venice_Forge
```

The snapshot inspected for this work order was:

```text
Venice_Forge-clean-20260718-154553.zip
```

Do not assume the local checkout is identical to the snapshot. Re-run discovery and verify every cited symbol before editing.

## Primary Objectives

Correct the video-generation pipeline so that:

1. Five-second and other-duration text-to-video and image-to-video jobs progress to a durable completed state.
2. Completed MP4 responses are not rejected by the generic Venice response-size limit.
3. Generated videos render and remain playable in Video Studio and Media Studio after restart.
4. The Download action saves a durable video outside the application through a secure native save flow.
5. Progress UI does not imply that a five-second output is being measured against a ten-second output duration.
6. Failed completion/persistence steps become explicit, actionable failures instead of indefinitely retaining stale processing progress.

Also deactivate the in-app Research Browser from all active UI and runtime paths while preserving its implementation in a non-active source archive for possible future restoration. This includes the browser embedded in the Research Workspace.

## Supplied Runtime Evidence

The supplied queue request succeeds:

```json
{
  "endpoint": "/video/queue",
  "method": "POST",
  "status": 200,
  "requestBody": {
    "model": "kling-2.5-turbo-pro-image-to-video",
    "duration": "5s",
    "image_url": "[data URL omitted]"
  },
  "responseBody": {
    "model": "kling-2.5-turbo-pro-image-to-video",
    "queue_id": "019f7761-83c5-7e60-bf56-9b7f833eced0"
  }
}
```

This proves the initial queue submission is not the failing stage. The failure is downstream in retrieval, durable persistence, completion propagation, catalog ingestion, or export.

The queue response contains no `download_url`, so this job must be capable of completing through the `/video/retrieve` binary `video/mp4` response path.

## Verified Static Findings

Treat these as verified against the uploaded snapshot but re-check them against the live checkout before editing.

### Finding 1 — Queue metadata is preserved correctly

`src/hooks/use-video.ts` queues `/video/queue`, obtains `queue_id`, stores the selected model, and preserves optional `download_url` in task metadata.

The supplied HTTP 200 response therefore reaches the app through a structurally valid queue contract.

### Finding 2 — Inline completed MP4s use the generic 25 MiB buffered-response path

`electron/services/veniceClient.ts` defines:

```ts
const MAX_VENICE_RESPONSE_BYTES = 25 * 1024 * 1024;
```

All non-streaming Venice responses are accumulated in memory. Once the accumulated body reaches the cap, the request is destroyed with `Response too large`.

`electron/services/backgroundTaskManager.ts` retrieves video through this generic request function. For binary completion, it receives a base64-backed result, decodes it, then persists it.

A completed MP4 can exceed 25 MiB even for a five-second output depending on model, resolution, bitrate, and provider encoding. When this happens, the completed media is rejected before the durable media store sees it.

Do not solve this by globally raising the generic API response limit. Large binary media requires a dedicated bounded streaming path.

### Finding 3 — The apparent 50% stall is not a hardcoded ten-second duration

`src/services/video-retrieve-normalizer.ts` derives processing progress from provider fields such as:

```text
execution_duration / average_execution_time
```

Those fields describe current provider execution time relative to an estimated generation time. They do not represent requested output playback duration.

If binary retrieval or persistence fails after the final processing response, the background polling code can retain the previous progress value and retry. The UI then appears stuck around the last provider estimate, such as 50%.

The remediation must separate:

- requested output duration, such as `5s`;
- provider generation estimate;
- retrieval stage;
- local persistence stage;
- completed state.

### Finding 4 — Video export uses renderer `fetch()` against `venice-media://`

`src/utils/download.ts` implements generated audio/video export by calling:

```ts
fetch(url)
```

then converting the result to a Blob and triggering an anchor download.

Completed generated videos use durable custom-protocol URLs such as:

```text
venice-media://<media-id>
```

Production CSP permits this scheme in `media-src`, allowing `<video>` playback, but not in `connect-src`. Therefore a renderer fetch can fail with the observed `Failed to fetch` behavior even though media playback is permitted.

Do not loosen `connect-src` merely to make export work. Saving an app-owned file belongs in the Electron main process behind narrow typed IPC.

### Finding 5 — No completed task means no Media Studio catalog record

`src/services/taskMediaCatalog.ts` creates catalog records only from completed background tasks that have a durable `resultUrl`.

If retrieval or persistence never reaches `status: "completed"`, no Media Studio record is created. The missing Media Studio video is therefore a downstream symptom of the completion failure.

### Finding 6 — Existing tests miss the production failure modes

The snapshot’s focused video, task, normalizer, download, and Research Browser tests pass, but they use small fixtures and mocked fetch behavior. They do not prove:

- packaged production CSP behavior for `venice-media://` fetch;
- completed MP4 retrieval larger than 25 MiB;
- interrupted binary writes;
- native Save As export from the durable media store;
- catalog reconciliation after restart.

### Finding 7 — The Research Browser is active across multiple layers

The feature is not limited to one React component. Active references include:

```text
src/components/search/SearchScrapeView.tsx
src/components/research/ResearchBrowserView.tsx
src/components/research/ResearchWorkspaceView.tsx
src/services/researchBrowserBridge.ts
electron/services/researchBrowserHome.ts
electron/services/researchBrowserServer.ts
electron/main.ts
electron/preload.ts
src/styles/components.css
tests/smoke/research-browser.test.ts
scripts/verify-research-browser.cjs
scripts/verify-web-contents-view.cjs
scripts/verify-browser-traffic-contained.cjs
package.json
AGENTS.md
README.md
docs/DEVELOPMENT/research-browser.md
```

`SearchScrapeView` exposes a Browser subtab and routes search results into it. `ResearchWorkspaceView` embeds a resizable browser column. Merely hiding one tab would leave browser IPC, WebContentsView creation, session setup, policies, and contract verifiers active.

## Mandatory Discovery Before Editing

Run and record:

```bash
cd /Users/super_user/Projects/Venice_Forge

git status --short
git branch --show-current
git rev-parse --show-toplevel
git rev-parse HEAD
node --version
npm --version
```

Inspect at minimum:

```text
package.json
electron/main.ts
electron/preload.ts
electron/ipc/**
electron/services/veniceClient.ts
electron/services/backgroundTaskManager.ts
electron/services/generatedMediaStore.ts
electron/services/downloadGeneratedVideo.ts
electron/utils/rendererCsp.ts

src/hooks/use-video.ts
src/services/video-retrieve-normalizer.ts
src/services/taskMediaCatalog.ts
src/stores/background-task-store.ts
src/stores/media-store.ts
src/types/background-task.ts
src/types/desktop.ts
src/services/desktopBridge.ts
src/utils/download.ts
src/components/video/video-view.tsx
src/components/media/**

src/components/search/SearchScrapeView.tsx
src/components/research/ResearchBrowserView.tsx
src/components/research/ResearchWorkspaceView.tsx
src/services/researchBrowserBridge.ts
electron/services/researchBrowserHome.ts
electron/services/researchBrowserServer.ts
electron/security/researchBrowserNetworkPolicy.ts
src/styles/components.css
scripts/verify-research-browser.cjs
scripts/verify-web-contents-view.cjs
scripts/verify-browser-traffic-contained.cjs
scripts/verify-ci-contract.cjs
```

Map and record:

1. The exact `/video/retrieve` transport path.
2. How binary responses are represented across main/renderer boundaries.
3. How generated media is hashed, written, registered, and served.
4. How background task updates reach the renderer after restart.
5. How Media Studio reconciles completed background tasks.
6. Every active import or initialization path for the Research Browser.
7. Every CI verifier that requires the browser feature to remain active.

## Phase 1 — Add a Dedicated Streaming Video Retrieval Path

Create a video-specific main-process retrieval service. Proposed location:

```text
electron/services/videoRetrieveService.ts
```

Use current repository naming conventions if another location is more appropriate.

The service must accept only validated internal values:

```ts
interface RetrieveVideoInput {
  model: string;
  queueId: string;
  profileId?: string;
  signalId?: string;
}
```

Return a discriminated result:

```ts
type RetrieveVideoResult =
  | {
      kind: "processing";
      status: "PROCESSING";
      progress?: number;
      averageExecutionTimeMs?: number;
      executionDurationMs?: number;
    }
  | {
      kind: "completed";
      mediaId: string;
      mediaUrl: string;
      mimeType: "video/mp4";
      sizeBytes: number;
      sha256: string;
    }
  | {
      kind: "failed";
      error: string;
      retryable: boolean;
    };
```

### Transport requirements

1. POST the canonical body to `/video/retrieve`:

```ts
{
  model,
  queue_id: queueId,
  delete_media_on_completion: false
}
```

2. Reuse the existing secure API-key, provider-routing, endpoint allowlist, request-guard, timeout, and redacted logging infrastructure.
3. Inspect status code and `content-type` before deciding how to consume the body.
4. For JSON:
   - enforce a conservative JSON body cap;
   - parse `PROCESSING`, `COMPLETED`, and `FAILED` safely;
   - preserve provider timing metadata;
   - never log raw prompt or media content.
5. For `video/mp4`:
   - stream directly to a temporary file in the app-managed media area;
   - do not accumulate the entire response in JavaScript arrays;
   - do not convert the MP4 to base64;
   - enforce a dedicated maximum, such as 256 MiB, configurable for tests;
   - hash bytes incrementally with SHA-256;
   - track byte count incrementally;
   - verify a valid MP4 `ftyp` signature before committing;
   - fsync where appropriate;
   - atomically rename into the content-addressed blob location;
   - create/update media metadata only after the write is durable;
   - clean up the temporary file on cancellation, timeout, overflow, invalid MIME, invalid signature, or write failure.
6. Reject empty bodies and unsupported content types with explicit errors.
7. Keep the existing queue-level `download_url` completion path for VPS-backed models.
8. Do not expose raw response bytes or absolute local paths to the renderer.

### Generated media store changes

Extend `electron/services/generatedMediaStore.ts` with a streaming or finalized-temp-file API rather than duplicating its metadata and protocol rules.

A suitable contract is:

```ts
interface PersistGeneratedMediaFileInput {
  temporaryPath: string;
  mimeType: "video/mp4";
  sha256: string;
  sizeBytes: number;
}

async function commitGeneratedMediaFile(
  input: PersistGeneratedMediaFileInput,
): Promise<GeneratedMediaRecord>;
```

The store must remain the single authority for:

- allowed MIME types;
- media ID derivation;
- content-addressed path creation;
- metadata shape;
- custom protocol URL generation;
- duplicate-content handling;
- atomic commit behavior.

## Phase 2 — Correct Background Task Completion Semantics

Update `electron/services/backgroundTaskManager.ts` to consume the dedicated video retrieval service.

Requirements:

1. Do not route completed MP4 bytes through the generic `performVeniceRequest` response buffer.
2. Keep one poll loop per queue ID/task.
3. Persist queue metadata sufficient for restart recovery:

```ts
{
  queueId,
  model,
  queueDownloadUrl?,
  requestedDuration?,
  requestedResolution?,
  requestedAspectRatio?,
  status,
  stage?,
  pollAttempts,
  consecutiveFailures,
  createdAt,
  updatedAt
}
```

4. Introduce a stage field or equivalent structured status:

```ts
type VideoTaskStage =
  | "queued"
  | "generating"
  | "retrieving"
  | "saving"
  | "completed";
```

5. When the provider returns processing data, update provider-estimated progress without coupling it to output duration.
6. When binary completion begins, transition to `retrieving`; when local persistence begins, transition to `saving`.
7. Mark `completed` only after the media record is durable and resolves through `venice-media://`.
8. Set progress to `1` at completion.
9. Classify failures:
   - transient HTTP/network/provider-processing errors may retry with bounded backoff;
   - invalid MP4, unsupported MIME, oversized media, local disk failure, or completed-without-media must become explicit task failures rather than endless processing retries.
10. Preserve cancellation and application-restart recovery.
11. Deduplicate completion by queue ID and media ID.
12. Never persist a large video data URL in task JSON.

## Phase 3 — Make Video Progress Accurate and Non-Misleading

The UI must distinguish provider generation progress from requested playback duration.

Requirements:

1. Keep the user-selected `duration: "5s"` as request metadata and display it as output duration, not as a progress denominator.
2. Label ratio-based progress as an estimate, for example:

```text
Estimated generation progress
```

3. When no trustworthy provider ratio exists, use an indeterminate progress animation instead of fabricating percentage completion.
4. During `retrieving` show:

```text
Retrieving completed video…
```

5. During `saving` show:

```text
Saving video locally…
```

6. Do not leave the progress bar at a previous percentage after a terminal failure.
7. Surface a redacted actionable error with Retry/Resume where appropriate.
8. Confirm five-second and ten-second output requests use the same stage model without duration-specific hardcoding.

## Phase 4 — Add Secure Main-Process Save As Export

Do not use renderer `fetch()` for app-owned `venice-media://` resources.

Add a narrow typed IPC action. Proposed channel:

```text
app:media:save-generated
```

Proposed renderer-facing contract:

```ts
interface SaveGeneratedMediaRequest {
  mediaId: string;
  suggestedFilename?: string;
}

interface SaveGeneratedMediaResult {
  canceled: boolean;
  filename?: string;
  sizeBytes?: number;
}
```

### Main-process requirements

1. Validate the IPC sender using the repository’s existing trusted-renderer policy.
2. Validate request shape and length.
3. Accept a durable app media ID only; do not accept arbitrary source paths or arbitrary URLs.
4. Resolve the media ID through `generatedMediaStore`.
5. Verify that the record exists and is an allowed media type.
6. Derive the extension from trusted MIME metadata.
7. Sanitize the suggested filename and prevent extension confusion.
8. Show `dialog.showSaveDialog` from the main process with the correct video filter.
9. On cancel, return `{ canceled: true }` without error toast.
10. Copy through a temporary sibling file and atomic rename where practical.
11. Handle overwrite, permission denial, disk full, and source disappearance explicitly.
12. Never expose the source absolute path to the renderer.
13. Return only safe presentation metadata.
14. Redact destination paths from normal diagnostics; allow the user-selected basename where useful.

### Preload and renderer requirements

Expose one narrow method through `contextBridge`, for example:

```ts
saveGeneratedMedia(input: SaveGeneratedMediaRequest): Promise<SaveGeneratedMediaResult>
```

Update:

```text
electron/preload.ts
src/types/desktop.ts
src/services/desktopBridge.ts
src/components/video/video-view.tsx
Media Studio video actions
```

Electron behavior:

- For a durable `venice-media://` result, invoke main-process Save As using `resultMediaId`.
- Do not fetch the custom protocol from the renderer.

Web-only fallback behavior:

- A normal `https:` or `blob:` URL may continue using a safe browser download path where Electron services are unavailable.
- Keep the fallback protocol-allowlisted and explicit.

Do not add `venice-media:` to renderer `connect-src` as the primary fix.

## Phase 5 — Guarantee Media Studio Reconciliation

The Media Studio catalog must be a durable projection of completed generated media, not a fragile one-time UI side effect.

Requirements:

1. Preserve deterministic catalog IDs based on queue ID or media ID.
2. On task completion, upsert exactly one catalog record containing:

```ts
{
  mediaType: "video",
  resultMediaId,
  mediaUrl,
  queueId,
  model,
  promptSummary,
  requestedDuration,
  requestedResolution,
  requestedAspectRatio,
  createdAt
}
```

3. On application startup or renderer subscription initialization, reconcile completed tasks that have a durable media ID but no catalog entry.
4. Ensure rerender, tab switches, task replay, and application restart cannot create duplicates.
5. Ensure a catalog video uses `<video>` rendering, not image-only assumptions.
6. If catalog metadata is present but the durable blob is missing, show a recoverable missing-media state instead of a broken player.
7. Make the Download action available from both Video Studio output and Media Studio detail/card controls through the same secure export API.

## Phase 6 — Deactivate the Research Browser Completely

### Archive location

Move preserved source into a non-active top-level archive outside `src/` and `electron/`, for example:

```text
inactive-features/
  research-browser/
    README.md
    renderer/
      ResearchBrowserView.tsx
      ResearchBrowserView.test.tsx
      researchBrowserBridge.ts
      browser-styles.css
    electron/
      researchBrowserHome.ts
      researchBrowserServer.ts
      researchBrowserServer.test.ts
      researchBrowserNetworkPolicy.ts
      researchBrowserNetworkPolicy.test.ts
    tests/
      research-browser.smoke.test.ts
    verifiers/
      verify-research-browser.cjs
      verify-web-contents-view.cjs
      verify-browser-traffic-contained.cjs
    docs/
      research-browser.md
```

Use `git mv` so history remains traceable.

The archive must not be imported, compiled, packaged, instantiated, or run by normal CI.

`inactive-features/research-browser/README.md` must document:

- why the feature was deactivated;
- original file locations;
- dependencies and IPC channels;
- security assumptions;
- the exact steps required to reactivate it safely;
- the last validation state before archival;
- a warning that archived code may drift from current Electron APIs and must be re-audited before reuse.

### Remove the Search/Research Browser UI

In `src/components/search/SearchScrapeView.tsx`:

1. Remove the Browser subtab.
2. Remove `ResearchBrowserView` imports.
3. Remove `researchBrowserBridge` imports used solely for the embedded browser.
4. Remove `pendingBrowserUrl` state and mount-navigation behavior.
5. Remove the primary “Open in Browser” action that routes into the embedded browser.
6. Preserve Search, Scrape with Venice, Scrape with Jina, AI Research, and Profile Discovery.
7. For source URLs, choose one explicit active behavior:
   - an existing config-gated, confirmed “Open in system browser” action; or
   - copy URL / scrape URL controls only.
8. Do not silently reroute links externally without confirmation or existing policy gates.
9. Update labels and subtitles that currently advertise browsing.

### Remove the Research Workspace browser pane

In `src/components/research/ResearchWorkspaceView.tsx`:

1. Remove `ResearchBrowserView` import and rendering.
2. Remove browser column width state.
3. Remove browser refs, resize handlers, and resizer element.
4. Remove `handleOpenInBrowser` and browser-navigation coupling.
5. Reflow Sources and Findings to use the full workspace width.
6. Preserve capture/scrape/Jina actions that do not depend on WebContentsView.
7. Give source rows explicit safe actions such as View metadata, Copy URL, Scrape again, or config-gated Open externally.
8. Update accessibility labels and tests after removing the split pane.

### Remove active Electron runtime wiring

From active code:

1. Remove Research Browser service initialization from `electron/main.ts`.
2. Remove creation and attachment of the browser `WebContentsView`.
3. Remove the isolated `persist:venice-forge-research-browser` session initialization.
4. Remove Research Browser-specific IPC registration.
5. Remove the Research Browser preload API.
6. Remove active renderer bridge/type declarations.
7. Remove browser-only CSS from the active bundle.
8. Remove runtime imports of the archived network policy and home page.
9. Ensure application shutdown no longer manages a hidden browser view.
10. Preserve general external-link security policy that is used elsewhere.

### Update tests, scripts, docs, and CI contracts

1. Remove browser-active expectations from:

```text
scripts/verify-research-workspace.cjs
scripts/verify-theme-tokens.cjs
scripts/verify-ci-contract.cjs
AGENTS.md
README.md
docs/DOCS_INDEX.md
```

2. Remove these active package scripts or replace them with archive checks:

```text
verify:research-browser
verify:web-contents-view
verify:browser-traffic-contained
```

3. Remove them from `verify:contracts:static` and `verify:contracts:features:rp`.
4. Add a verifier such as:

```text
verify:inactive-feature-archive
```

It should assert:

- the archive exists;
- no file in `src/`, `electron/`, or active scripts imports it;
- no Research Browser IPC channel is registered;
- no `WebContentsView` is instantiated for Research;
- no `persist:venice-forge-research-browser` partition is initialized;
- inactive files are excluded from production packaging and typecheck inputs.

5. Update product documentation to state that embedded browsing is temporarily inactive while Search, Scrape, AI Research, and Workspace data management remain available.
6. Historical reports may retain historical references, but mark them as historical where confusion is likely.

## Phase 7 — Tests

### Video retrieval unit tests

Add tests for:

- canonical `/video/retrieve` request body;
- JSON processing response;
- JSON failed response;
- inline `video/mp4` completion;
- completed MP4 larger than the old 25 MiB cap;
- exactly-at-limit behavior;
- dedicated 256 MiB maximum enforcement using configurable test limits;
- invalid content type;
- empty body;
- invalid MP4 signature;
- interrupted stream cleanup;
- cancellation cleanup;
- hash calculation;
- duplicate content commit;
- atomic finalization;
- disk write failure;
- queue-level `download_url` completion;
- completed JSON without bytes or URL becoming an explicit failure.

Avoid committing giant fixtures. Use configurable limits and generated chunk streams with a minimal valid MP4 signature.

### Background task tests

Add tests for:

- five-second request metadata preserved;
- provider progress not derived from output duration;
- stage transitions: queued → generating → retrieving → saving → completed;
- terminal persistence failure does not remain at stale 50%;
- transient polling retry;
- non-retryable invalid-media failure;
- application restart recovery;
- tab-switch independence;
- one poll loop per task;
- one completion update per queue ID;
- no large data URL persisted.

### Export tests

Add tests for:

- renderer uses IPC for `venice-media://` instead of `fetch`;
- native save dialog cancel;
- successful MP4 copy;
- invalid media ID;
- missing source blob;
- malicious suggested filename;
- extension normalization;
- permission failure;
- disk full/write failure;
- IPC sender rejection;
- renderer cannot supply arbitrary source path;
- web fallback only for allowed schemes.

### Media Studio tests

Add tests for:

- completed video automatically appears;
- restart reconciliation;
- duplicate completion does not duplicate catalog item;
- video card/player renders durable protocol URL;
- missing blob state;
- Download action uses secure export IPC.

### Browser deactivation tests

Add tests/verifiers proving:

- no Browser subtab exists;
- Search/Scrape functionality remains;
- Research Workspace has no browser pane or resizer;
- Sources and Findings expand correctly;
- no active `ResearchBrowserView` import exists;
- no active Research Browser preload API exists;
- no Research Browser IPC handler is registered;
- no Research `WebContentsView` is created;
- no Research Browser persistent session is initialized;
- archived code remains present and excluded from the build;
- external-link behavior still obeys existing confirmation/config policy.

## Phase 8 — Validation Commands

Run focused checks first using actual repository scripts after inspecting `package.json`:

```bash
npm run typecheck
npx vitest run \
  src/hooks/use-video.test.tsx \
  src/services/video-retrieve-normalizer.test.ts \
  electron/services/backgroundTaskManager.test.ts \
  src/stores/background-task-store.test.ts \
  src/utils/download.test.ts \
  src/components/video/video-view.test.tsx \
  src/components/research/ResearchWorkspaceView.test.tsx \
  src/components/search/SearchScrapeView.test.tsx \
  --fileParallelism=false

npm run verify:media-studio-power-tools
npm run verify:research-workspace
npm run verify:inactive-feature-archive
```

Then run the repository’s full quality gates:

```bash
npm run lint
npm run typecheck
npm run build
npm run verify:contracts
npm run test:ci
```

Run packaging or packaged-app smoke checks if available. The renderer-export regression must be tested under production CSP, not only in jsdom.

Do not claim a command passed unless it was executed successfully.

If a failure is pre-existing or unrelated:

1. Record the exact command.
2. Record the exact failure.
3. Explain why it is unrelated with file/commit evidence.
4. Do not modify unrelated code merely to make the suite green.

## Manual QA Matrix

### Image-to-video

- [ ] Queue a five-second `kling-2.5-turbo-pro-image-to-video` request.
- [ ] Confirm request payload contains `duration: "5s"`.
- [ ] Confirm progress is labeled as estimated generation progress.
- [ ] Confirm stage changes to retrieving when generation completes.
- [ ] Confirm stage changes to saving while persisting locally.
- [ ] Confirm the MP4 becomes playable in Video Studio.
- [ ] Confirm exactly one Media Studio record appears.
- [ ] Change tabs while the task runs and confirm it continues.
- [ ] Restart the app during processing and confirm recovery.
- [ ] Restart after completion and confirm playback still works.
- [ ] Download with the native Save As flow and play the external file.

### Text-to-video

- [ ] Repeat the same matrix with a supported text-to-video model.
- [ ] Test five-second and ten-second output durations.
- [ ] Confirm neither duration controls the provider progress denominator.

### Large video

- [ ] Complete an MP4 larger than 25 MiB.
- [ ] Confirm the response is streamed, not buffered/base64 encoded.
- [ ] Confirm no `Response too large` failure occurs at the old generic cap.
- [ ] Confirm the dedicated safety cap still rejects an intentionally oversized fixture safely.

### Failure handling

- [ ] Simulate invalid MIME type.
- [ ] Simulate truncated MP4.
- [ ] Simulate disk-full/write failure.
- [ ] Confirm the task enters a visible terminal failure instead of retaining stale progress.
- [ ] Confirm temporary files are removed.

### Research UI

- [ ] Confirm no Browser subtab exists in Search/Research.
- [ ] Confirm no browser pane or resizer exists in Research Workspace.
- [ ] Confirm Search still works.
- [ ] Confirm Venice/Jina scrape actions still work.
- [ ] Confirm AI Research and Profile Discovery still work.
- [ ] Confirm Sources and Findings use the reclaimed width.
- [ ] Confirm source-link actions obey the external-open policy.
- [ ] Inspect process/runtime state and confirm no Research `WebContentsView` or browser partition is created.
- [ ] Confirm inactive browser source remains in `inactive-features/research-browser/`.

## Acceptance Criteria

The work is complete only when all conditions below are met:

1. A successful `/video/queue` response progresses through retrieval to durable completion.
2. Five-second videos no longer remain inaccessible at approximately 50%.
3. Video progress is clearly provider-estimated and independent of requested playback duration.
4. Inline MP4 responses larger than 25 MiB bypass the generic buffered-response cap through a dedicated bounded streaming path.
5. No completed MP4 is base64-encoded through renderer IPC or persisted task JSON.
6. MP4 writes are validated, hashed, atomic, and recoverable after interruption.
7. Video Studio plays the durable result.
8. Media Studio receives exactly one durable video item automatically or through deterministic reconciliation.
9. The result survives application restart.
10. Download uses a main-process native Save As flow for app-owned media.
11. The renderer does not fetch `venice-media://` to export media.
12. CSP is not weakened to solve export.
13. Invalid media and disk failures become explicit terminal task errors with redacted messages.
14. Text-to-video and image-to-video both pass the same completion matrix.
15. The Browser subtab is absent from Search/Research UI.
16. The embedded browser column is absent from Research Workspace.
17. No active Research Browser IPC, preload API, service initialization, WebContentsView, or persistent browser session remains.
18. Preserved browser code is stored under a clearly non-active archive and excluded from normal builds/packages.
19. Search, Scrape, AI Research, Profile Discovery, Sources, Findings, and Workspace data operations remain functional.
20. Focused tests, full typecheck, build, contract checks, and CI tests pass or have explicitly documented unrelated baseline failures.

## Required Final Report

Create a report at a repository-appropriate path such as:

```text
docs/reports/VIDEO_PIPELINE_AND_RESEARCH_BROWSER_DEACTIVATION_2026-07-18.md
```

Use this structure:

```md
# Video Pipeline and Research Browser Deactivation Report

## Repository State

## Reproduced Symptoms

## Verified Root Causes

## Architecture Changes

## Video Retrieval Changes

## Progress and Task-State Changes

## Durable Media Persistence

## External Save Changes

## Media Studio Reconciliation

## Research Browser Deactivation

## Archived Files

## Active Files Changed

## Tests Added or Updated

## Commands Executed

## Validation Results

## Manual QA Results

## Security Review

## Remaining Risks

## Deferred Work
```

For every root cause, include:

```text
file path
symbol or line range
observed behavior
correct contract
implemented correction
test proving correction
```

Do not state “fixed” without evidence.

## Strict Agent Checklist

### Discovery

- [ ] Record git status, branch, commit, Node version, and npm version.
- [ ] Reverify every cited file and symbol against the live checkout.
- [ ] Trace queue, retrieval, persistence, task update, catalog, playback, and export end to end.
- [ ] Inventory every active Research Browser import, IPC channel, session, service, verifier, and document.

### Video Retrieval

- [ ] Add a dedicated `/video/retrieve` service that distinguishes JSON from `video/mp4`.
- [ ] Stream completed MP4 bytes to a temporary file instead of using the generic 25 MiB buffer.
- [ ] Enforce a dedicated bounded media-size limit.
- [ ] Hash and count bytes incrementally.
- [ ] Validate MP4 signature and MIME type.
- [ ] Atomically commit through the generated media store.
- [ ] Remove temporary files on all failure and cancellation paths.
- [ ] Preserve queue-level `download_url` completion support.

### Task State and Progress

- [ ] Add explicit generating, retrieving, and saving stages.
- [ ] Keep requested playback duration separate from generation progress.
- [ ] Use indeterminate UI when no trustworthy progress ratio exists.
- [ ] Mark non-retryable completion/persistence failures terminally.
- [ ] Set progress to 1 only after durable persistence.
- [ ] Preserve restart recovery and deduplicate poll loops.

### Export

- [ ] Add typed `app:media:save-generated` IPC or repository-equivalent.
- [ ] Validate IPC sender and input.
- [ ] Resolve only app-owned media IDs.
- [ ] Show native Save As from main.
- [ ] Sanitize filename and derive extension from MIME.
- [ ] Copy safely without exposing absolute source paths.
- [ ] Update preload, desktop types, bridge, Video Studio, and Media Studio.
- [ ] Remove renderer fetch usage for durable custom-protocol media.

### Media Studio

- [ ] Upsert one deterministic catalog item after completion.
- [ ] Reconcile completed tasks on startup.
- [ ] Prevent duplicate catalog items.
- [ ] Render video with the durable protocol URL.
- [ ] Add missing-blob recovery UI.
- [ ] Route Media Studio download through the same secure export API.

### Research Browser Deactivation

- [ ] Create `inactive-features/research-browser/` with a restoration README.
- [ ] Move browser renderer implementation and tests with `git mv`.
- [ ] Move browser Electron services and policy with `git mv`.
- [ ] Move browser smoke tests and verifier scripts with `git mv`.
- [ ] Remove Browser subtab and pending browser navigation from SearchScrapeView.
- [ ] Remove browser pane, resizer, state, and imports from ResearchWorkspaceView.
- [ ] Remove active Research Browser IPC and preload surface.
- [ ] Remove Research Browser initialization and WebContentsView creation from main.
- [ ] Remove browser-only CSS from the active bundle.
- [ ] Remove active package/CI verifier dependencies.
- [ ] Add an archive-is-inactive verifier.
- [ ] Update README, AGENTS, docs index, and current product docs.
- [ ] Confirm Search, Scrape, AI Research, Profile Discovery, Sources, and Findings remain functional.

### Tests and Validation

- [ ] Add large binary video streaming tests without committing giant fixtures.
- [ ] Add interrupted write, invalid MIME, invalid signature, and disk failure tests.
- [ ] Add five-second progress semantics tests.
- [ ] Add native export IPC security and cancellation tests.
- [ ] Add catalog restart reconciliation tests.
- [ ] Add browser-deactivation static and UI tests.
- [ ] Run focused tests.
- [ ] Run lint, typecheck, build, verify:contracts, and test:ci.
- [ ] Run packaged-app QA for production CSP and native Save As.
- [ ] Write the evidence-backed final report.

## Do Not

- Do not treat the successful queue POST as the root failure.
- Do not hardcode progress to five or ten seconds.
- Do not globally raise the generic Venice response cap as the primary fix.
- Do not buffer large MP4s into arrays or base64 strings.
- Do not persist large data URLs in task state.
- Do not weaken CSP to allow renderer custom-protocol fetches.
- Do not expose arbitrary filesystem read/write APIs to the renderer.
- Do not accept arbitrary source paths from IPC.
- Do not mark a task completed before durable media persistence succeeds.
- Do not silently retry invalid media forever.
- Do not create duplicate Media Studio records.
- Do not only hide the Research Browser visually while leaving its main-process service active.
- Do not leave a hidden WebContentsView or persistent browser partition running.
- Do not place archived browser source under an actively compiled/importable directory.
- Do not delete the underlying browser implementation; preserve it in the inactive archive.
- Do not remove unrelated external-link security controls.
- Do not claim tests or QA were completed unless they were actually run.
