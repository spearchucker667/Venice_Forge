# Media and Character Remediation Report

> **HISTORICAL SNAPSHOT — NOT CURRENT STATE.** This report is retained as dated implementation evidence and does not override the live tree.

> **Status:** Implementation closure evidence for the 2026-07-12 remediation and 2026-07-13 follow-through. The canonical open-task authority remains [`../ROADMAP.md`](../ROADMAP.md), and command evidence remains [`../summary_of_work.md`](../summary_of_work.md).

## Repository State

- Canonical root: `/Users/super_user/Projects/Venice_Forge`
- Branch: `main`
- Initial worktree: clean
- Toolchain: Node `v22.13.1`, npm `10.9.2`
- API authority inspected: [`../reference/Venice_swagger_api.yaml`](../reference/Venice_swagger_api.yaml)

## Verified Root Causes

### Image request drift

- **File / symbol:** `src/hooks/use-image-tools.ts`, image edit/upscale/background-removal mutations; `src/components/image/image-tools.tsx`, upscale controls.
- **Observed behavior:** image-tool payloads added `return_binary`; edit used deprecated model naming; upscale exposed and sent obsolete enhancer fields.
- **Correct contract:** edit uses `model`; upscale accepts only `image`, `scale`, and optional `creativity`; background removal accepts exactly one of `image` or `image_url`; all return binary images.
- **Correction:** centralized payload construction and image normalization in `src/services/media-request-adapter.ts`, removed obsolete controls, restricted edit IDs, and validated returned image MIME/bytes.
- **Proof:** `src/services/media-request-adapter.test.ts`, `src/hooks/use-image-tools.test.ts`, and `src/components/image/image-tools.test.tsx`.

### Music retrieval mismatch

- **File / symbol:** `src/stores/background-task-store.ts`, `electron/services/backgroundTaskManager.ts`, `src/lib/workflow-engine.ts`.
- **Observed behavior:** retrieval sent `{ id }` and expected a completed JSON `audio_url`.
- **Correct contract:** `{ model, queue_id, delete_media_on_completion: false }`, with processing JSON or binary MP3/WAV/FLAC completion.
- **Correction:** shared retrieve builder, discriminated audio normalizer, model retention, and durable main-process binary persistence.
- **Proof:** `src/services/audio-retrieve-normalizer.test.ts`, `src/services/media-request-adapter.test.ts`, and `electron/services/backgroundTaskManager.test.ts`.

### Video queue result loss

- **File / symbol:** `src/hooks/use-video.ts`, `normalizeVideoRetrieveResponse`, and `BackgroundTaskManager.pollTask`.
- **Observed behavior:** queue-level `download_url` was discarded; `COMPLETED` without inline bytes was treated as invalid; task JSON could not hold a full data URL safely.
- **Correct contract:** preserve the signed URL, poll retrieval, download completed VPS output in the main process, validate MP4, and persist a compact durable identifier.
- **Correction:** retained model/download metadata, added the `download` normalization result, performed guarded main-process HTTPS retrieval, persisted bytes by content hash, and returned `venice-media://` URLs.
- **Proof:** `src/hooks/use-video.test.tsx`, `src/services/video-retrieve-normalizer.test.ts`, `electron/services/generatedMediaStore.test.ts`, and `electron/services/backgroundTaskManager.test.ts`.

### Character empty-state control flow

- **File / symbol:** `src/components/chat/chat-view.tsx`, empty conversation branch.
- **Observed behavior:** every empty conversation entered the generic shuffled-starter branch; character detection required a hosted slug; the character greeting renderer was unreachable.
- **Correct contract:** metadata presence identifies a character conversation; hosted greetings and local first messages are persisted once; generic starters are generic-chat-only.
- **Correction:** split generic and character-bound empty states, resolved hosted/local greetings, and inserted the assistant greeting through the chat store once.
- **Proof:** `src/components/chat/chat-view.test.tsx` and `src/stores/chat-store.ts` coverage in the passing chat/store suites.

### Character avatar inconsistency

- **File / symbol:** raw `photoUrl` rendering in `HistoryView`, sidebar, and header.
- **Observed behavior:** those surfaces bypassed the existing cache resolver and local-avatar handling.
- **Correct contract:** a single cache-aware component must handle hosted, safe local data, async races, and fallback initials without exposing filesystem paths.
- **Correction:** added `CharacterAvatar`, extended the resolver for bounded image data URLs, and migrated the named surfaces.
- **Proof:** `src/components/characters/CharacterAvatar.test.tsx` plus the passing chat/layout UI suites.

### Template negative-prompt loss

- **File / symbol:** `src/components/image/image-view.tsx`, template preview application.
- **Observed behavior:** template negative text could be placed in hidden state and silently dropped for an incompatible model.
- **Correct contract:** append/replace only for supported models; retain content and warn otherwise; model changes require an explicit user action.
- **Correction:** capability-gated actions, normalized separators, an explicit warning, and an explicit compatible-model switch action.
- **Proof:** image UI tests and the `verify:image-policy` / model-aware recipe contracts pass, including a dedicated incompatible negative-template interaction case.

## Files Changed

### Electron main process

- `electron/main.ts`
- `electron/services/backgroundTaskManager.ts`
- `electron/services/backgroundTaskManager.test.ts`
- `electron/services/generatedMediaStore.ts`
- `electron/services/generatedMediaStore.test.ts`
- `electron/utils/rendererCsp.ts`
- `electron/utils/rendererCsp.test.ts`

### Renderer components and hooks

- `src/components/CharactersView.tsx`
- `src/components/CharactersView.test.tsx`
- `src/components/characters/CharacterAvatar.tsx`
- `src/components/characters/CharacterAvatar.test.tsx`
- `src/components/chat/HistoryView.tsx`
- `src/components/chat/chat-view.tsx`
- `src/components/chat/message-bubble.tsx`
- `src/components/image/image-tools.tsx`
- `src/components/image/image-tools.test.tsx`
- `src/components/image/image-view.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/music/music-view.tsx`
- `src/components/video/video-view.tsx`
- `src/hooks/use-image-tools.ts`
- `src/hooks/use-image-tools.test.ts`
- `src/hooks/use-music.ts`
- `src/hooks/use-video.ts`
- `src/hooks/use-video.test.tsx`
- `src/hooks/useCharacterImage.ts`

### Services, stores, and types

- `src/constants/venice.ts`
- `src/lib/workflow-engine.ts`
- `src/lib/workflow-engine.test.ts`
- `src/services/audio-retrieve-normalizer.ts`
- `src/services/audio-retrieve-normalizer.test.ts`
- `src/services/media-request-adapter.ts`
- `src/services/media-request-adapter.test.ts`
- `src/services/taskMediaCatalog.ts`
- `src/services/workflow-background-task.ts`
- `src/services/video-retrieve-normalizer.ts`
- `src/services/video-retrieve-normalizer.test.ts`
- `src/stores/background-task-store.ts`
- `src/stores/background-task-store.test.ts`
- `src/stores/chat-store.ts`
- `src/stores/character-store.ts`
- `src/stores/character-store.test.ts`
- `src/stores/settings-store.ts`
- `src/stores/settings-store.test.ts`
- `src/types/background-task.ts`
- `src/types/venice.ts`

### Documentation

- `docs/reports/MEDIA_CHARACTER_REMEDIATION_REPORT.md`
- `docs/reports/CANONICAL_REPORT_INDEX.md`
- `docs/DOCS_INDEX.md`
- `docs/ROADMAP.md`
- `docs/summary_of_work.md`

## API Contract Changes

- Canonical pure builders now own image edit, upscale, background removal, audio retrieval, and video retrieval payload shapes.
- Legacy keys are absent from outbound objects by construction.
- Audio and video completion normalizers retain the JSON/binary distinction.
- `VideoQueueResponse` now retains optional `download_url`; task metadata retains the selected model required for retrieval.

## Image Fixes

- Edit uses an explicit edit-model allowlist and canonical `model` field.
- Upscale exposes only 2x/4x scale and creativity `0..0.02` at `0.001` precision.
- Upscale and background removal no longer expose model selectors.
- Source data URLs/raw base64/HTTP(S) URLs are normalized without double-prefixing; blob/file URLs fail locally.
- Embedded PNG/JPEG/WEBP headers are decoded locally; MIME spoofing and undecodable content fail before submission.
- Upscale enforces the provider's 65,536-pixel source minimum and 16,777,216-pixel projected-output maximum before payment, with metadata-only diagnostics rendered in Image Tools.
- Returned image blobs require a supported image MIME type and non-zero bytes.

## Video Fixes

- Queue model and optional signed download URL survive into durable task metadata.
- Inline MP4 and VPS-backed download completion both persist through the main process.
- Signed downloads reject non-HTTPS/local targets and redirects.
- Stable task-derived Media Studio IDs prevent duplicate catalog records.

## Music Fixes

- All three inspected retrieval implementations send the canonical model/queue body.
- MP3, WAV, and FLAC signatures/MIME types are validated before persistence.
- Component-local completion saves were removed; the task catalog is the single completion insertion path.

## Character Chat Fixes

- Character binding uses metadata presence rather than hosted slug presence.
- Hosted greetings and local `firstMessage` values enter history once as assistant messages.
- Character chats without greetings receive a character-specific neutral state.
- Generic shuffled starters remain exclusive to generic empty conversations.

## Character Avatar Fixes

- `CharacterAvatar` owns cached resolution, safe local data URLs, fallback initials, square cropping, and stale-result isolation.
- Active-chat pill, assistant messages, header, sidebar, Chat History, and Character Hub use the shared component.

## Character Hub

- The existing Characters view now exposes Hosted, Local, Favorites, and Recent navigation.
- Local cards adapt the existing character-card store; no third persistence store was created.
- Local cards support start chat, edit, duplicate, favorite, and confirmation-gated delete.
- Hosted browsing now includes persisted slug-only favorites, conversation-derived recents, accessible details, normalized refresh, and safe duplication into the existing local character-card store.
- Workflow video nodes register their queue with the durable background-task owner and resolve compact persisted `venice-media://` results instead of polling a parallel URL-only path.

## Persistence and Migration

- Generated audio/video bytes are atomically written under app data using SHA-256 content addressing and metadata sidecars.
- `venice-media://<sha256>` resolves only validated hashes through a privileged, CSP-allowlisted protocol.
- Task records retain compact `resultMediaId`/`resultUrl` fields, not large data URLs.
- Existing task parsing remains defensive; resumable task metadata supplies model, queue ID, download URL, and poll attempts.

## Tests Added or Updated

- Added pure request-adapter tests, image-hook tests, audio normalizer tests, generated-media persistence tests, and shared-avatar tests.
- Expanded video normalizer, video hook, task-store, task-manager, CSP, and Image Tools tests.
- Focused suites exercised binary signatures, legacy-field exclusion, queue payloads, download completion, durable URLs, and deduplication.

## Commands Executed

- Root discovery: `git status --short`, `git branch --show-current`, `git rev-parse --show-toplevel`, `node --version`, `npm --version`, and the required root file/directory assertions.
- Repository/API inspection: targeted `sed`, `rg`, and `git diff` reads of the Swagger schemas and listed implementation/test surfaces.
- `npm run typecheck`
- Focused Vitest runs for media adapters/normalizers, Image Tools, chat, generated media, and the background-task manager.
- `npm run test:unit:hooks`
- `npm run test:unit:services`
- `npm run test:unit:stores`
- `npm run test:unit:lib`
- `npm run test:ui:chat`
- `npm run test:ui:media`
- `npm run test:electron`
- `npm run verify:venice-api-docs`
- `npm run verify:image-policy`
- `npm run verify:media-studio-power-tools`
- `npm run verify:provider-adapters`
- `npm run verify:network-boundaries`
- `npm run lint`
- `npm run build`
- `npm run verify:contracts`
- `npm run test:ci`
- `git diff --check`
- `npm run verify:markdown-links`
- `npm run verify:agent-docs`
- `npm run verify:repo-handoff-hygiene`
- 2026-07-13 follow-through: focused adapter/hook/workflow/Character Hub/template/avatar suites
- `npm run lint:eslint`
- `npm run typecheck`
- `npm run test:ci`
- `npm run verify:contracts`
- `npm run build`
- `npm run verify:dist`
- `npm run dist:mac:arm64`
- `node scripts/verify-dist.cjs --mac --arch arm64`
- `npm run smoke:electron` (command passed; headed test skipped)
- Packaged executable launch/relaunch against one isolated temporary profile

## Validation Results

- Full combined parity command `npm run lint && npm run build && npm run verify:contracts && npm run test:ci`: **PASS** (exit 0).
- Electron: **40 files / 615 tests PASS**.
- Ingestion: **9 files / 65 tests PASS**.
- Unit stores/services/hooks/lib/shared/utils/theme/scripts/types: **all PASS**.
- UI layout/chat/media/research/settings: **all PASS**.
- Build completed for renderer, Electron, and server. The known ineffective dynamic-import warning for `backupImportService.ts` remains non-fatal.
- Existing jsdom “navigation to another Document” notices remain non-fatal.

## Manual QA Results

- Built the unsigned ARM64 DMG/ZIP and verified both artifacts, metadata, blockmaps, and checksum sidecars with `node scripts/verify-dist.cjs --mac --arch arm64`.
- Launched the packaged app twice against the same isolated temporary profile. Both runs stayed alive until intentionally terminated and created the expected config, background-task, sync, storage, and log surfaces. The second run emitted only Electron environment/deprecation notices.
- `npm run smoke:electron` completed successfully but its single headed test was skipped by the environment.
- After explicit authorization, queried authenticated live model/quote data and ran the least-cost eligible matrix: `z-image-turbo` (256×256 image), `grok-imagine-text-to-video-private` (1 second, 480p, 1:1), and `mmaudio-v2-text-to-audio` (1 second). The exact USD balance delta was $0.08: $0.01 + $0.06 + $0.01.
- The returned WebP, MP4, and MP3 passed format inspection and full decode. The packaged app played the video and audio through `venice-media://`; both reached ready state 4 and advanced beyond 0.5 seconds.
- A real packaged music background task completed through `BackgroundTaskManager`, inserted exactly one Media Studio record after snapshot replay, and retained exactly one record plus working playback after a full restart.
- Hosted Character Hub favorite, accessible details, refresh, and local duplication passed visually after correcting RP save-envelope parsing. The isolated QA profiles and balance snapshots were removed after verification.
- The live `/video/queue` endpoint rejected top-level `safe_mode` with HTTP 400 before billing. The shared endpoint matrix and regression test now omit that unsupported field.

## Remaining Risks

- Renderer/browser mode cannot safely consume VPS signed downloads; it fails closed and directs completion to Electron. The durable completion path is main-process-only by design.
- The Media Studio catalog insertion is recoverable and idempotent from completed task snapshots, but is not one filesystem/IndexedDB transaction with the main-process blob write.
- The paid video was retrieved directly and then validated through packaged protocol playback; the signed completion URL was not retained for a second real-manager replay. The paid music path supplied the full live manager/restart/idempotency proof.

## Deferred Work

- None for this remediation work order. Platform-specific signed-release QA remains governed by the release roadmap and credentials, not this media matrix.
