# Video Pipeline and Research Browser Deactivation Report

Date: 2026-07-18
Status: local implementation and automated validation complete; paid-provider and packaged headed QA deferred.

## Repository State

- Canonical root: `/Users/super_user/Projects/Venice_Forge`
- Branch: `main`
- Starting commit: `c59b8ad2`
- Runtime: Node `v26.5.0`, npm `11.17.0` (not the declared Node 22 CI runtime)
- Pre-existing user state preserved: two deleted files under `docs/audits/Venice_Forge-audit-evidence-20260717-031029/`; neither deletion belongs to this work order or is included in its commit.

## Reproduced Symptoms

- The generic Venice transport buffered successful binary retrieval responses under its 25 MiB cap and converted them to base64.
- Video task UI could remain in a processing state without a durable media result, and elapsed/requested duration could be mistaken for generation progress.
- Electron export depended on renderer handling of the private `venice-media://` protocol.
- Media Studio had no restart-safe durable media ID projection for a completed video task.
- Research Browser remained active through renderer tabs, workspace panes, preload/IPC, `WebContentsView`, session policy, CSS, tests, and contract scripts.

## Verified Root Causes

### Generic retrieval owned large completed MP4s

- File/symbol: `electron/services/backgroundTaskManager.ts`, `runPoll`; generic `performVeniceRequest` completion path before this change.
- Observed behavior: a completed inline MP4 used a buffered/base64 response contract designed for ordinary API bodies.
- Correct contract: video retrieval must distinguish bounded JSON status from bounded streamed `video/mp4` data.
- Implemented correction: `retrieveVideoQueueResult` now owns `/video/retrieve`; `persistGeneratedMp4Stream` incrementally writes, counts, hashes, validates, fsyncs, and commits the stream.
- Proof: `videoRetrieveService.test.ts` and `generatedMediaStream.test.ts`, including a generated-at-runtime response larger than 25 MiB.

### Task status did not describe the durable completion pipeline

- File/symbol: `electron/services/backgroundTaskManager.ts`, `runPoll`; `src/types/background-task.ts`, `VideoTaskStage`.
- Observed behavior: queue polling exposed broad processing/completed states and could leave persistence/retrieval indistinguishable from provider generation.
- Correct contract: generating, retrieving, saving, and completed are separate stages; progress is provider-supplied only; terminal media failures stop polling.
- Implemented correction: persisted lifecycle stages, stage callbacks, explicit retryability, cleared terminal progress, and completion only after durable commit.
- Proof: `backgroundTaskManager.test.ts`, including five-second duration/progress separation, stage persistence, restart recovery, completion, and terminal handling.

### Renderer owned export of app-private media

- File/symbol: `src/components/video/video-view.tsx`, download action; `electron/ipc/handlers/fileHandlers.ts`, `app:media:save-generated`.
- Observed behavior: Electron download attempted renderer-side conversion of a private protocol URL.
- Correct contract: the renderer supplies only a durable media ID; main validates the main-frame sender, resolves app-owned storage, and performs native Save As.
- Implemented correction: added `generatedMediaExport`, typed preload/desktop bridge wiring, and Video/Media Studio callers.
- Proof: `generatedMediaExport.test.ts` and `fileHandlers.generatedMediaExport.test.ts` cover ID-only input, extension derivation, path-free receipts, cancellation, copy failure cleanup, and subframe rejection.

### Catalog insertion was a fragile UI side effect

- File/symbol: `src/services/taskMediaCatalog.ts`, `ensureTaskMediaCatalogItem`.
- Observed behavior: a completed task without an in-memory UI save could have no Media Studio projection.
- Correct contract: completed durable tasks reconcile idempotently on startup using a stable record ID and durable media ID.
- Implemented correction: deterministic `task-result-<task-id>` reconciliation stores `generatedMediaId` and returns an existing record instead of duplicating it.
- Proof: `taskMediaCatalog.test.ts` covers restart-safe video reconciliation and duplicate prevention.

### Research Browser was active across multiple layers

- File/symbol: `electron/main.ts`, preload browser API, `SearchScrapeView`, `ResearchWorkspaceView`, research-browser services and verifiers.
- Observed behavior: hiding one UI control would still leave a browser view, partition, IPC, service, and build/test wiring active.
- Correct contract: preserve source under a non-compiled archive while removing every active entry point.
- Implemented correction: moved the implementation with Git history to `inactive-features/research-browser/`, removed runtime/config/UI/CSS/package wiring, and added an archive-inactivity verifier.
- Proof: `verify:inactive-feature-archive`, `verify:research-workspace`, active UI tests, TypeScript exclusion, Vitest exclusion, and production build.

## Architecture Changes

The main process now owns queue retrieval, streamed persistence, durable protocol playback, and native export. Renderer/task state carries only bounded operational metadata, lifecycle state, a content-addressed media ID, and a private protocol URL. Research retains Search, Venice/Jina Scrape, AI Research, Profile Discovery, Sources, Findings, saved sessions, uploads, summaries, and handoffs without embedding a browser engine.

## Video Retrieval Changes

- Added a direct HTTPS `/video/retrieve` transport with main-owned API credentials.
- Capped JSON status responses at 1 MiB and accepted successful binary responses only as `video/mp4`.
- Preserved queue-level and retrieve-level `download_url` support through the existing HTTPS/public-DNS/pinned-connection downloader.
- Classified network/429/5xx outcomes as retryable and invalid MIME/signature/size/completed-without-media outcomes as terminal.

## Progress and Task-State Changes

- Added `queued | generating | retrieving | saving | completed` video stages.
- Kept requested duration/resolution/aspect ratio as restart metadata, independent of progress.
- Rendered indeterminate generation state when the provider gives no trustworthy ratio.
- Set progress to `1` only with a durable completed media record; terminal errors clear progress and stop the poll loop.

## Durable Media Persistence

- Default maximum video size is 256 MiB and can be configured with `VENICE_FORGE_MAX_GENERATED_VIDEO_BYTES`.
- Bytes are counted and SHA-256 hashed incrementally; no completed MP4 enters task JSON, base64 IPC, or an aggregate chunk array.
- The first MP4 box is checked for `ftyp`; the temporary file is fsynced and atomically committed through `generatedMediaStore`.
- Full and byte-range `venice-media://` responses stream from disk.
- Failure, overflow, invalid signature, and interrupted-stream paths remove temporary files.

## External Save Changes

- `app:media:save-generated` accepts `{ mediaId, suggestedName? }` only from the main renderer frame.
- Main resolves only app-owned media, derives the extension/filter from trusted MIME, sanitizes the name, and performs a destination-side temporary copy, fsync, and rename.
- Receipts return filename and byte count, never a source or destination absolute path.
- Electron Video Studio and Media Studio use this IPC; web mode retains browser-native URL download behavior for web-owned URLs.

## Media Studio Reconciliation

- Completed tasks project to deterministic `task-result-<task-id>` records.
- `generatedMediaId` is retained on the Media Studio item for native export.
- Existing queue-result records are reused, preventing duplicate insertion during restart reconciliation.
- Missing durable blobs produce a redacted recovery error directing the user back to Video Studio retrieval rather than exposing a path.

## Research Browser Deactivation

- Removed the Browser subtab, result-to-browser action, and pending browser navigation.
- Removed the Research Workspace browser column, drag/resizer state, capture action, and browser-only CSS.
- Removed active main-process setup, `WebContentsView`, persistent session exception, IPC/preload API, runtime bridge/types, and config flags.
- Removed active package/CI browser verifier scripts and excluded the archive from TypeScript, Vitest discovery, and packaging inputs.
- Preserved external-link handling and the supported Research data workflows.

## Archived Files

`inactive-features/research-browser/` contains:

- `README.md` restoration/re-audit warning;
- renderer view, bridge, types, URL-security test, and component tests;
- Electron server, home, network policy, and tests;
- smoke test and three historical verifier scripts;
- historical developer documentation.

## Active Files Changed

- Retrieval/storage/export: `electron/services/videoRetrieveService.ts`, `generatedMediaStream.ts`, `generatedMediaStore.ts`, `generatedVideoDownload.ts`, `generatedMediaExport.ts`.
- Task/IPC bridges: background-task manager/handlers/types/store, file handlers, preload, desktop bridge/types.
- Video/Media UI and projection: Video Studio, Task Center/toasts, media inspector, migration/storage types, task media catalog.
- Research deactivation: Electron main/preload, Search/Research views and tests, config, URL security, theme/CSS, package/verifier/build configs.
- Governance/docs: README, About, File Tree, Media Studio design, Docs Index, Roadmap, AGENTS, this report, and the session ledger.

## Tests Added or Updated

- Streaming: chunked commit, runtime-generated >25 MiB response, overflow, invalid signature, interruption cleanup.
- Retrieval/download: direct MP4, bounded JSON processing, download URL, invalid MIME, secure streaming downloader.
- Export/IPC: ID-only resolution, MIME extension, cancellation, copy failure cleanup, path-free receipt, subframe rejection.
- Tasks/catalog/UI: completion stages, five-second progress semantics, restart-safe metadata, task recovery, deterministic catalog reconciliation, download actions.
- Research: Browser UI removal, supported Research workflow preservation, inactive archive/static build contract.

## Commands Executed

- `npm run lint:eslint`
- `npm run typecheck`
- focused Vitest runs for video retrieval, streaming, export/IPC, background tasks, Media Studio, Search, and Research
- `npm run test:server`
- `npm run test:electron`
- `npm run test:ci`
- `npm run verify:inactive-feature-archive`
- `npm run verify:research-workspace`
- `npm run verify:network-boundaries`
- `npm run verify:agent-docs`
- `npm run verify:repo-handoff-hygiene`
- CI-contract, no-native-dialog, theme-token, Markdown, roadmap, and aggregate contract verifiers
- `npm audit --audit-level=moderate`
- `npm run build`
- `npm run verify:dist`
- `git diff --check`

## Validation Results

- PASS: zero-warning ESLint; renderer and Electron typecheck; focused suites; 59 server tests; 645 Electron tests; production build; zero-vulnerability audit; dist, archive, Research, network, agent-doc, handoff, CI-contract, dialog, and theme verifiers.
- BASELINE BLOCK: `test:ci`, Markdown, roadmap, aggregate contracts, and therefore the aggregate `ci` command encounter only the two pre-existing deleted audit-evidence files: three local links cannot resolve and the retained-evidence verifier cannot find its manifest. The deletions were not restored or staged.
- NOT CLAIMED: Node 22 clean-install parity, packaged/signed application behavior, real paid-provider retrieval, and headed native-dialog/playback behavior.

## Manual QA Results

No paid-provider or packaged headed QA was run. Image-to-video/text-to-video, large live response, restart during each stage, scrub/playback, native Save As, forced disk failure, and live Research workflow rows remain explicitly unverified rather than inferred from unit tests.

## Security Review

- API keys stay in main-process secure storage and are never appended to provider download URLs.
- Provider download URLs remain HTTPS-only with public DNS validation and pinned connection behavior.
- No raw prompt, request body, MP4 bytes, data URL, absolute path, or bearer credential is persisted in task JSON or returned through export IPC.
- Export rejects non-main-frame senders, arbitrary paths, invalid media IDs, and unsupported MIME types.
- CSP was not weakened; archived browser code is not compiled or packaged.

## Remaining Risks

- Real provider response headers, very large network streams, throttling, and signed download URLs need paid integration evidence.
- Disk-full and permission failures are handled and unit-tested at cleanup boundaries, but require packaged manual fault injection for OS-specific dialogs/filesystems.
- An app crash after durable media commit but before catalog projection depends on startup reconciliation; the deterministic unit contract passes, while packaged crash recovery remains untested.
- Archived browser code will drift and must be security/API re-audited before any restoration.

## Deferred Work

The canonical `docs/ROADMAP.md` item `VF-VERIFY-005` owns paid-provider, signed/packaged, restart, headed playback/Save As, two-device, and accessibility acceptance. The earlier missing AI Research screenshot remains separately tracked as `VF-UX-REPRO-001`.
