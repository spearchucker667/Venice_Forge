# Media Preview and Traffic Inspector Remediation — 2026-07-26

> **Historical snapshot.** Retained evidence only; the live repository, `docs/ROADMAP.md`, and `docs/summary_of_work.md` are authoritative.

> [!NOTE]
> **IMMUTABLE HISTORICAL RECORD**
> This report is a point-in-time snapshot of the repository state as of July 26, 2026. It is preserved for historical context and is not updated to track current `main`.

> Snapshot report for the Venice Forge work order of the same name.
> Scanned repository: `spearchucker667/Venice_Forge`, branch `main`.
> Scope: renderer-side image preview, legacy `venice()` request helper, main-process traffic telemetry, and inspector pane UI semantics.

## 1. Executive Summary

Four regression areas were addressed:

- **Phase A — Durable image source resolution.** `mediaItemSource()` now strictly validates the `venice-media://<sha256>` URL scheme and rejects malformed shapes. Legacy display sites that used ad-hoc string concatenation were patched to use the canonical helper.
- **Phase B — Legacy `venice()` consolidation.** `src/services/veniceClient/venice.ts` is now a thin shim that delegates to `veniceFetch()`. A runtime crash where clients used `instanceof VeniceApiError` (an interface, not a class) was replaced with shape-based detection.
- **Phase C — Main-process traffic telemetry bridge.** A cross-process inspector telemetry bus was added (shared contracts → main bus → IPC relay → preload `inspector.onTelemetry` → Zustand `upsertByEventId`). The first emitter (music `/audio/retrieve` lifecycle) is wired in `backgroundTaskManager.ts`.
- **Phase D — Inspector pane UI semantics.** A capture-state pill (`Traffic Inspector: Capturing` / `Traffic Inspector: Disabled`) with a pulsing accent dot and a live request counter (`Traffic Inspector requests: N`) was added to the Inspector pane header. UI text on this surface exclusively references "Traffic Inspector" per user clarification.

Privacy and safety invariants were preserved: the telemetry contract emits only task IDs, model names, byte counts, durations, and pre-normalized error text. No prompts, signed URLs, or renderer-selected paths cross the IPC boundary.

## 2. Repository State

- Branch: `main`. No auto-commits performed. No PRs opened or pushed during this session.
- Local-only bootstrap (`AGENTS.md`) confirmed canonical path.
- Node 22.13.1 / npm 10.9.2 used for all validation.

## 3. Verified Findings

### 3.A Durable image source resolution (Phase A)

- `src/utils/mediaItem.ts::mediaItemSource()` accepted ad-hoc fallback paths that quietly produced malformed URLs like `data:image/png;base64,venice-media://<hash>` when callers passed a `MediaItem.record` with no usable `image` field.
- Two legacy display sites (`src/components/image/image-view.tsx` and `src/components/chat/message-bubble.tsx:977`) used `|| "venice-media://" + r.mediaId` string concatenation that silently produced 24-byte URLs the renderer would later reject.
- `src/hooks/useMediaThumb.ts` did not surface thumbnail-build failures explicitly for non-PNG sources.

### 3.B Legacy `venice()` request helper (Phase B)

- `src/lib/venice-client.ts` had drifted from canonical telemetry (`veniceFetch()` in `src/services/veniceClient/fetch.ts`). It still re-implemented a serialize → `fetch` → check → parse pipeline and skipped the safety guard decoration.
- The error classifier used `instanceof VeniceApiError`. Because `VeniceApiError` in `src/services/veniceClient/errors.ts:6` is a TypeScript **interface**, this throws `Right-hand side of 'instanceof' is not an object` at runtime the first time `venice()` was called.

### 3.C Main-process traffic telemetry bridge (Phase C)

- Background tasks that fetch through the main process (`/audio/retrieve`, `/video/queue`, `/video/retrieve`, Jina research, main-process guard pipeline, agent-tool executor, chat-agent runner) produced no Inspector pane rows.
- There was no cross-process contract for telemetry; publishers had no shared `eventId`-based lifecycle shape.
- Two scaled Cases (`/video/retrieve` binary responses and `download_url` expiries) needed the contract applied before being wired.

### 3.D Inspector pane UI semantics (Phase D)

- The Inspector pane had a `Traffic Inspector` title and a Clear / Export / Close toolbar, but no live capture-state pill or request counter.
- The toggle label in the sidebar used `inspector.title` = `Traffic Inspector` to enable a feature whose persisted Zustand slice was named `redTeamMode`; user-facing copy on this surface exclusively references "Traffic Inspector" per session clarification.

## 4. Changes Made

### 4.A Phase A — durable image source resolution

- **`src/utils/mediaItem.ts`** — rewrote `mediaItemSource()` to validate a strict `venice-media://<sha256>` URL (64 lowercase hex only) via `VALID_VENICE_MEDIA_RE / /^venice-media:\/\/[0-9a-f]{64}$/`. Accepts `data:`/`blob:`/`https?:`; rejects `file://` and unknown schemes through a `looksLikeUrl()` helper. Added `safeVeniceMediaUrl(mediaId, displayUrl?)` companion.
- **`src/hooks/useMediaThumb.ts`** — non-PNG data URLs now route through `makeImageThumb()` with explicit error state.
- **`src/components/gallery/media-card.tsx`** — added `useEffect(() => setThumbFailed(false), [item.id, item.image, item.thumbHash])` reset so a source identity change forces a re-attempt.
- **`src/components/image/image-view.tsx`** — replaced inline `r.mediaId` concatenation with `safeVeniceMediaUrl()`.
- **`src/components/chat/message-bubble.tsx`** (line ~977) — same replacement.

### 4.B Phase B — legacy `venice()` consolidation

- **`src/services/veniceClient/venice.ts`** — collapsed to a thin shim that delegates to `veniceFetch()` with `retry: false`. Replaced `instanceof VeniceApiError` with shape-based detection (`typeof err.status === "number"`). Error messages now follow the canonical `normalizeError(status, body)` shape (e.g. `"400 request/schema/model error: …"`).
- **`src/lib/venice-client.test.ts`** — updated four assertions to match the new error message format.

### 4.C Phase C — main-process traffic telemetry bridge

Created:

- **`src/shared/inspectorTelemetryContracts.ts`** — shared types (`InspectorTelemetryEvent`, `InspectorTelemetryPhase`, `InspectorTelemetryTransport`, `InspectorTelemetryGuardOutcome`, `InspectorTelemetrySource`, `InspectorTelemetryListener`) and the `INSPECTOR_TELEMETRY_CHANNEL` constant.
- **`electron/services/inspectorTelemetry.ts`** — process-local bus: `subscribeInspectorTelemetry`, `emitInspectorTelemetry`, `publishInspectorRequest`, `publishInspectorCompletion`. Listeners are wrapped in try/catch so a faulty subscriber cannot break emitters. Event IDs are monotonic: `mt-<base36 ts>-<base36 counter>`.
- **`electron/ipc/handlers/inspectorTelemetryHandlers.ts`** — IPC relay; subscribes to the bus exactly once per process (`busAttached` guard), broadcasts to subscribed `WebContents` via `safeSendToRenderer`, prunes destroyed senders. Idempotent registration via a `handlersRegistered` boolean.
- **`electron/services/inspectorTelemetry.test.ts`** — 5 tests: bus delivery, single subscriber, no-op when empty, listener-fault isolation, monotonic eventId.
- **`electron/ipc/handlers/inspectorTelemetryHandlers.test.ts`** — 6 tests: idempotent registration, channel delivery, eventId merging, destroyed-sender prune, unsubscribe.
- **`src/stores/inspector-store.test.ts`** — 5 tests: new row creation, row merge, error mapping, external-only clearing, 100-entry cap.

Modified:

- **`src/stores/inspector-store.ts`** — added `upsertByEventId(event)` (externalId-based lifecycle merge with 100-entry cap) and `clearExternalLogs()` (only drops external sources, never user-cleared logs). Source/phase/guardOutcome/callOutcome are mapped onto the existing `InspectorTransport` / `InspectorCallOutcome` / `InspectorGuardOutcome` enums to avoid widening the public store contract.
- **`src/types/desktop.ts`** — added `interface VeniceForgeInspector` with `onTelemetry(callback): () => void`, and `inspector: VeniceForgeInspector` on the `VeniceForge` interface.
- **`electron/preload.ts`** — added `inspector.onTelemetry(callback)` namespace. Subscribe IPC is `"inspector:telemetry:subscribe"`, unsubscribe is `"inspector:telemetry:unsubscribe"`, event channel is `INSPECTOR_TELEMETRY_CHANNEL = "inspector:telemetry"`.
- **`src/services/desktopBridge.ts`** — added `desktopInspector` no-op bridge; returns a no-op unsubscribe when `!isElectron()`.
- **`electron/ipc/handlers/index.ts`** — registered `registerInspectorTelemetryHandlers()` alongside existing handlers.
- **`electron/services/backgroundTaskManager.ts`** — first emitter: wrapped the music `task.type === "music"` `performVeniceRequest({ endpoint: "/audio/retrieve" ... })` call with a per-cycle `musicTelemetryId` request emit plus a terminal `completed` / `failed` / `aborted` event carrying summaries (`taskId`, `model`, `bytes: media.byteCount`, `durationMs`). EventId is reused so the renderer collapses the lifecycle into a single Inspector row.

### 4.D Phase D — inspector pane UI semantics

- **`src/components/layout/inspector-pane.tsx`** — added an unambiguous capture-state pill above the Traffic / Prompt-layers tab strip, showing `Traffic Inspector: Capturing` (with a pulsing accent dot) or `Traffic Inspector: Disabled` (with a muted border dot). Added a live request counter (`Traffic Inspector requests: N`) on the right side. The pill and counter use the `redTeamMode` slice as the source of truth but display only "Traffic Inspector" strings.
- **`src/components/layout/inspector-pane.test.tsx`** — added three new tests: (1) capture state with pulsing accent dot when enabled, (2) disabled state without pulse when off, (3) live request counter reflects `filteredLogs.length`.
- **`src/i18n/resources/en-US/navigation.json`** — `inspector.title` / `inspector.description` / `inspector.toggle` / `inspector.enabled` / `inspector.disabled` remain `"Traffic Inspector"` strings (the audit suggested more thorough naming but a later session clarification locked UI text to "Traffic Inspector" only).

## 5. Files Changed

```
src/utils/mediaItem.ts                                       Phase A
src/hooks/useMediaThumb.ts                                   Phase A
src/components/gallery/media-card.tsx                        Phase A
src/components/image/image-view.tsx                          Phase A
src/components/chat/message-bubble.tsx                       Phase A
src/utils/mediaItem.test.ts                                  Phase A
src/services/veniceClient/venice.ts                          Phase B
src/lib/venice-client.test.ts                                Phase B
src/shared/inspectorTelemetryContracts.ts                    Phase C (new)
electron/services/inspectorTelemetry.ts                      Phase C (new)
electron/ipc/handlers/inspectorTelemetryHandlers.ts          Phase C (new)
electron/services/inspectorTelemetry.test.ts                 Phase C (new)
electron/ipc/handlers/inspectorTelemetryHandlers.test.ts     Phase C (new)
src/stores/inspector-store.ts                                Phase C
src/stores/inspector-store.test.ts                           Phase C (new)
src/types/desktop.ts                                         Phase C
electron/preload.ts                                          Phase C
src/services/desktopBridge.ts                                Phase C
electron/ipc/handlers/index.ts                               Phase C
electron/services/backgroundTaskManager.ts                   Phase C
src/components/layout/inspector-pane.tsx                     Phase D
src/components/layout/inspector-pane.test.tsx                Phase D
src/components/layout/sidebar.tsx                            Phase D (regression reference)
src/components/layout/sidebar.test.tsx                       Phase D (regression reference)
src/i18n/resources/en-US/navigation.json                     Phase D (preserved)
docs/summary_of_work.md                                      Session handoff
docs/ROADMAP.md                                              Cross-process telemetry follow-up row
docs/DOCS_INDEX.md                                           Document index entry
docs/reports/historical/MEDIA_PREVIEW_TRAFFIC_INSPECTOR_REMEDIATION_REPORT_2026-07-26.md   This report
```

## 6. Tests Added or Updated

- `src/utils/mediaItem.test.ts` — Phase A regression guard, 11 cases covering strict `venice-media://` validation, malformed-URL rejection, and `safeVeniceMediaUrl()` fallback.
- `src/lib/venice-client.test.ts` — Phase B regression guard, 4 cases covering the new `normalizeError()` message format.
- `electron/services/inspectorTelemetry.test.ts` — Phase C, 5 cases.
- `electron/ipc/handlers/inspectorTelemetryHandlers.test.ts` — Phase C, 6 cases.
- `src/stores/inspector-store.test.ts` — Phase C, 5 cases.
- `src/components/layout/inspector-pane.test.tsx` — Phase D, 3 new cases (capture, disabled, counter).
- `src/components/layout/sidebar.test.tsx` — Phase D, regression references reverted to the canonical `Toggle Traffic Inspector` label.

## 7. Commands Executed

```
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.electron.json
npm run lint:eslint
npm run verify:agent-docs
npm run verify:safety-guard
npm run verify:i18n-hardcoded-regressions
npm run verify:contracts
npx vitest run src/components/layout
npx vitest run electron
npx vitest run src/services/veniceClient src/hooks/use-models.test.ts src/hooks/use-styles.test.ts src/lib src/components/image/image-view.test.tsx src/utils/mediaItem.test.ts src/stores/inspector-store.test.ts
npm test
npm run build
```

## 8. Validation Results

| Command / evidence | Result | Notes |
|---|---|---|
| Focused layout components | PASS | 35/35 after the "only Traffic Inspector in UI" clarification. |
| Inspector telemetry bus tests | PASS | 5/5. |
| Inspector telemetry IPC tests | PASS | 6/6. |
| Inspector store tests | PASS | 5/5. |
| `mediaItem` regression tests | PASS | 11/11 (Phase A). |
| Legacy `venice()` regression tests | PASS | 4/4 (Phase B). |
| Full Electron segment | PASS | 814 passed / 1 skipped. |
| `tsc --noEmit -p tsconfig.json` | PASS | Render TypeScript clean. |
| `tsc --noEmit -p tsconfig.electron.json` | PASS | Electron TypeScript clean. |
| `npm run lint:eslint` | PASS | Zero warnings under Node 22.13.1. |
| `npm run verify:i18n-hardcoded-regressions` | PASS | 0 regressions vs the exact baseline. |
| `npm run verify:agent-docs` | PASS | AGENTS.md parity check passes. |
| `npm run verify:safety-guard` | PASS | Renderer, IPC, proxy, research, and raw-log guards clean. |
| `npm test` (full suite) | PASS | 4795 passed / 1 skipped across 438 files / 325 s. |
| `npm run verify:contracts` | PASS | 103 contract checks pass. |
| `npm run build` | PASS | Vite web, Express server, Electron main/preload build clean. |

## 9. Manual QA

- Manual headed Electron QA was not rerun. Externalized acceptance rows remain on `docs/ROADMAP.md` under `VF-VERIFY-005` (paid provider generation, packaged Save As, restart recovery against live queued jobs, headed Traffic Inspector export review, Windows packaged fault injection).

## 10. Remaining Risks

- **Phase C emitter coverage.** Only the music `/audio/retrieve` cycle is wired. Video retrieve, Jina research, guard pipeline, agent-tool executor, and chat-agent runner emitters are unwired (this is a `TOD-TELEMETRY-EMITTERS-001` row in `docs/summary_of_work.md` and `docs/ROADMAP.md`). Each additional emitter is a small isolated patch but requires care around video `download_url` summaries (must remain empty-undefined at the publish boundary).
- **Inspector telemetry retention.** The Zustand store caps entries at 100. Cross-process emitters that fire more often than the renderer-side boundary should respect this; the cap is shared across user-cleared and external logs.
- **External OS fault injection.** As above.

## 11. Deferred Work

- Wire remaining Phase C emitters per the `TOD-TELEMETRY-EMITTERS-001` row in `docs/ROADMAP.md`.
- External headed / packaged OS fault verification under `VF-VERIFY-005`.
- A follow-up design refinement could decouple the persisted `redTeamMode` slice from the user-visible "Traffic Inspector" label without requiring rename of the underlying Zustand slice — tracked on `docs/ROADMAP.md` as future optional UX work.

## 12. Definition of Done

All four phases are complete in code and verified against this worktree's existing tests, build, lint, typecheck, contract verifier, and safety guard contracts. Mandatory session handoff (`docs/summary_of_work.md`) is updated. `docs/ROADMAP.md` and `docs/DOCS_INDEX.md` will reflect this report at handoff.
