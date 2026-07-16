# Video Gallery, Character Chats, and UI Surface Remediation Report

> **HISTORICAL SNAPSHOT — NOT CURRENT STATE.** This report is retained as dated implementation evidence and does not override the live tree.

> **Status:** Snapshot implementation evidence. Open work remains authoritative in [`../ROADMAP.md`](../ROADMAP.md); command evidence is also recorded in [`../summary_of_work.md`](../summary_of_work.md).

## Repository State

- Root bootstrap checks passed on branch `main` at baseline commit `dc979a50de8efebdfac575d46bcb9423928970b1`.
- Toolchain initially observed: Node `v26.5.0`, npm `11.17.0`; final authoritative validation used repository-supported Node `v22.23.1`, npm `10.9.8`.
- Initial worktree was dirty with an unrelated in-progress profile/session-security tranche. Those changes were preserved; this remediation layered only the files listed below.

## Discovery Summary

- Video queue metadata, mixed JSON/binary normalization, durable SHA-256 media persistence, main-process polling, restart recovery, `venice-media://` playback, Media Studio upsert, and mesh primitives already existed in the live tree.
- The remaining video defect was the queue-level signed-download branch: it used a lexical hostname check plus unbounded `fetch().arrayBuffer()`.
- Character metadata and hosted/local creation paths existed, but no canonical classifier or top-level Character Chats destination existed. Standard Chat sidebar history still mixed in character-bound records.
- The application-level mesh overlay, semantic surface utilities, reduced-transparency handling, soft separators, and theme-derived opacity already existed and were in active use.

## Confirmed Issues

File: `electron/services/backgroundTaskManager.ts`
Symbol or line range: completed video `download` branch
Observed behavior: provider URLs were checked lexically and downloaded without a byte cap or DNS pinning.
Expected behavior: DNS-aware SSRF rejection, connection pinning, redirect rejection, and bounded MP4 streaming.
Root cause: the retrieval branch delegated security and buffering to global `fetch` after only checking URL text.
Correction: added `generatedVideoDownload.ts` and routed the branch through its approved-address HTTPS request and 256 MiB streaming limit.
Test evidence: `generatedVideoDownload.test.ts` and the queue-download manager test under `VERIFY-103`.

File: `src/config/tabs.ts`, `src/components/layout/sidebar.tsx`, `src/components/CharactersView.tsx`, `src/services/rpHelpers.ts`
Symbol or line range: canonical tab registry, standard history selector, hosted/local start-chat handlers
Observed behavior: Character Chats was only a History filter; start actions navigated to standard Chat; character conversations appeared in standard sidebar history.
Expected behavior: separate Chat, Character Chats, and Characters destinations with exclusive default histories.
Root cause: classification and navigation were expressed as repeated metadata checks rather than one workspace contract.
Correction: added the canonical classifier, dedicated workspace, exclusive standard history, and correct hosted/local routing.
Test evidence: `conversationKind.test.ts`, `CharacterChatsView.test.tsx`, `sidebar.test.tsx`, and `tabs.test.ts` under `VERIFY-104`.

## Unconfirmed or Obsolete Reports

- Large video data URLs in Electron task JSON were obsolete: current Electron completion already stores compact `venice-media://<sha256>` references.
- Component-owned Electron polling was obsolete: `BackgroundTaskManager` initializes from `electron/main.ts` and resumes persisted tasks.
- Missing durable video storage was obsolete: `generatedMediaStore.ts` already performs atomic content-addressed persistence and validates MP4 signatures.
- Missing mesh primitives was obsolete: `AppMeshOverlay`, semantic mesh variables, soft separators, and accessibility fallbacks already existed.

## Video Pipeline Root Causes

The confirmed gap was limited to remote signed-download custody after a JSON `COMPLETED` response. Queue IDs, model IDs, and optional `download_url` were already retained, and raw binary completion already persisted correctly.

## Video Persistence Changes

- Resolve every hostname before connecting and reject the entire result set when any address is loopback, private, link-local, documentation, multicast, or otherwise special-use.
- Pin Node HTTPS lookup to the approved address while retaining the original hostname for TLS/SNI.
- Reject credentials, custom ports, redirects, non-200 status, non-MP4 MIME, empty bodies, timeouts, declared oversize bodies, and streamed bodies beyond 256 MiB.
- Continue using the existing MP4 signature check and atomic SHA-256 media store after download.

## Gallery Integration Changes

No parallel gallery was added. Existing task snapshots still reconcile completed tasks through `persistCompletedTaskMedia()`, using stable task/queue identity for idempotent Media Studio upsert.

## Character Conversation Classification

`getConversationKind()` is the compatibility authority. Current `metadata.character`, legacy `source: character`, and legacy `source: localCharacter` resolve to `character`; every other record resolves to `standard`. `getCharacterConversationSource()` distinguishes local bindings without requiring a hosted slug.

## Character Chats Architecture

`CharacterChatsView` owns a searchable character-only sidebar, avatar/name/title, hosted/local badge, model, activity, selected state, character-specific empty state, and the shared chat surface. It never renders generic shuffled starters.

## Character Chat Migration

No destructive schema migration was needed. The classifier is an idempotent compatibility layer over existing persisted metadata and does not rewrite messages, IDs, timestamps, titles, models, or avatars.

## Navigation Changes

- Added `character-chats` to the canonical tab registry and application view map.
- Added distinct sidebar navigation and active state.
- Standard Chat clears a character-bound active selection and lists only standard conversations.
- Global History opens each conversation in its classified workspace.
- Hosted and local character start actions open Character Chats.

## Mesh and Surface-System Design

The existing reusable system was retained: one application mesh overlay sits beneath content; panels use semantic translucent surfaces, soft pseudo-element separators, spacing, and restrained elevation. Rendered QA confirmed the overlay does not intercept input.

## Theme Token Changes

None. Existing semantic mesh/surface tokens and custom-theme fallbacks already met the requested architecture; adding parallel tokens would have duplicated the live contract.

## Files Changed

- `electron/services/backgroundTaskManager.ts`
- `electron/services/backgroundTaskManager.test.ts`
- `electron/services/generatedVideoDownload.ts`
- `electron/services/generatedVideoDownload.test.ts`
- `src/App.tsx`
- `src/config/tabs.ts`
- `src/config/tabs.test.ts`
- `src/utils/conversationKind.ts`
- `src/utils/conversationKind.test.ts`
- `src/components/chat/StandardChatView.tsx`
- `src/components/chat/CharacterChatsView.tsx`
- `src/components/chat/CharacterChatsView.test.tsx`
- `src/components/chat/HistoryView.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/layout/sidebar.test.tsx`
- `src/components/layout/header.tsx`
- `src/components/CharactersView.tsx`
- `src/services/rpHelpers.ts`
- `AGENTS.md`
- `scripts/verify-repo-handoff-hygiene.cjs`
- `docs/ROADMAP.md`
- `docs/DOCS_INDEX.md`
- `docs/reports/CANONICAL_REPORT_INDEX.md`
- `docs/reports/VIDEO_GALLERY_CHARACTER_CHATS_UI_SURFACE_REMEDIATION_REPORT.md`
- `docs/summary_of_work.md`

## Tests Added or Updated

- Added DNS/public-address, connection-pinning, size-limit, classifier, workspace-empty-state, workspace-exclusivity, and standard-chat separation regressions.
- Updated manager, tab registry, sidebar, hosted/local routing, and header behavior coverage.

## Commands Executed

- Required repository/toolchain discovery commands and package-script enumeration.
- Focused Vitest batches for downloader, task manager, classifier, tabs, Character Chats, sidebar, header, Characters, and RP character surfaces.
- `npm run lint:eslint`
- `npm run typecheck`
- `npm run ci` under Node `v26.5.0` (failed; unsupported-runtime aggregate evidence retained)
- `npm run ci` under Node `v22.23.1` (passed)
- Browser automation against `npm run dev` with screenshots and DOM assertions.
- Aggregate commands are recorded with their final status in `docs/summary_of_work.md`.

## Validation Results

- Focused implementation batch: PASS, 10 files / 94 tests.
- Focused final downloader/navigation batch: PASS, 6 files / 50 tests.
- ESLint: PASS, zero warnings.
- Renderer and Electron typecheck: PASS.
- Initial `npm run ci` under unsupported Node `v26.5.0`: FAIL in renderer service aggregates; the implicated Venice client suite passed in isolation.
- Final `npm run ci` under Node `v22.23.1`, npm `10.9.8`: PASS, including all segmented tests, lint, typecheck, zero-vulnerability audit, contracts, build, 103 release-packaging checks, and dist verification.
- Final handoff, Markdown-link, and whitespace checks are recorded in `docs/summary_of_work.md`.

## Manual QA Results

- PASS: standard Chat, Character Chats empty state, Characters hosted list, hosted start-chat routing, active character workspace, correct model/name/source, distinct active navigation, no generic starters, mesh presence, and mesh `pointer-events: none`.
- PASS: wide dark-theme screenshots for standard Chat, Character Chats, Characters, and active hosted character chat.
- NOT RUN: paid prompt-to-video/image-to-video generation, restart playback, light/high-contrast/custom themes, narrow-window screenshot, Settings screenshot, and headed packaged Electron QA. No claim is made for those scenarios in this session.

## Security Review

- Renderer filesystem/shell privileges, context isolation, CSP, endpoint allowlists, API-key custody, Family Safe Mode, and media protocol boundaries were unchanged.
- Signed URLs are never logged or persisted as gallery playback URLs; only validated content-addressed media references survive completion.
- DNS pinning closes the check/use rebinding window for the generated-video request.

## Performance Review

- Video bodies stream into bounded chunks instead of an unbounded `arrayBuffer()`.
- The visual system remains one app-level mesh rather than per-row blur layers.
- Rendered wide-window interactions were responsive; formal paint/FPS profiling was not run.

## Remaining Risks

- Browser-mode video cannot secure a queue-level remote download and intentionally fails with a desktop-required message.
- Live paid video generation and packaged restart playback were not repeated in this session; prior evidence exists, but it is not presented as current manual QA.
- The broader repository audit still has release-blocking T003 and additional T004–T010 work in the canonical roadmap.

## Deferred Work

- Paid provider QA, packaged Electron restart/playback QA, full light/high-contrast/custom-theme screenshot matrix, narrow-window capture, and performance profiling.
