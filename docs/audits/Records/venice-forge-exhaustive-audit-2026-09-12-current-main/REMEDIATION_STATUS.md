# Remediation Status — 2026-09-12 current-main audit

**Baseline SHA:** `84cf5bbeb34ce87ab04ac6d6f8f164e549f4f399`  
**Remediation date:** 2026-09-12  
**Publication:** committed and pushed to `origin/main` (this session)

This file records implementation status against `FINDINGS.md`. It does not replace the original findings text.

## Blocking P1s (13/13 remediated in the working tree)

| ID | Status |
|---|---|
| VF-AUD-20260912-SEC-P1-001 | FIXED — `venice-tts:` added to CSP `media-src` |
| VF-AUD-20260912-VCS-P1-001 | FIXED — `chatTtsBridge` decodes `{ dataBase64 }` |
| VF-AUD-20260912-VCS-P1-003 | FIXED — `RpChatView` sends `{ model, messages, stream: true }` |
| VF-AUD-20260912-IPC-P1-001 | FIXED — `conversations:save` reads `{ record, origin }` |
| VF-AUD-20260912-GSS-P1-001 | FIXED — FSM-on streams withhold `onDelta` until response screening |
| VF-AUD-20260912-GSS-P1-002 | FIXED — chat extractor always keeps first + last messages; first/system is reserved before the newest multimodal turn can spend the 32-field budget |
| VF-AUD-20260912-VCS-P1-002 | FIXED — web SSE output is screened; FSM-on deltas withheld |
| VF-AUD-20260912-VCS-P1-004 | FIXED — block/hard-fail discards pending deltas and rolls back the assistant turn |
| VF-AUD-20260912-STOR-P1-001 | FIXED — `.vfbackup` import pins Argon2id INTERACTIVE constants |
| VF-AUD-20260912-STOR-P1-002 | FIXED — vault key failure no longer quarantines files |
| VF-AUD-20260912-STOR-P1-003 | FIXED — vault master-key write is temp+fsync+rename |
| VF-AUD-20260912-STOR-P1-004 | FIXED — omitted avatar preserves sidecar; `avatar: null` / `removeAvatar: true` deletes |
| VF-AUD-20260912-ZST-P1-014 | FIXED — character-card delete detaches RP chats instead of cascade-deleting |

## P2 confirmed defects

| ID | Status |
|---|---|
| VF-AUD-20260912-GSS-P2-003 | FIXED — extractor field cap covers head+middle+tail scan windows |
| VF-AUD-20260912-GSS-P2-004 | FIXED — additional token families, key names, quoted env values |
| VF-AUD-20260912-VCS-P2-005 | FIXED — Electron SSE absolute 300s lifetime |
| VF-AUD-20260912-VCS-P2-006 | FIXED — non-idempotent POSTs do not retry by default |
| VF-AUD-20260912-IPC-P2-002 | FIXED — dead `documentAgent:workspace:propose*` handlers removed |
| VF-AUD-20260912-IPC-P2-003 | FIXED — generic `credential:*` IPC removed |
| VF-AUD-20260912-STOR-P2-005 / ZST-P2-020 | FIXED — future-version chat files left in place |
| VF-AUD-20260912-STOR-P2-006 | FIXED — unique temp names on seven storage writers |
| VF-AUD-20260912-ZST-P2-015 | FIXED — stream `tool_calls` merged by index |
| VF-AUD-20260912-ZST-P2-016 | FIXED — history bootstrap uses conversation normalization |
| VF-AUD-20260912-ZST-P2-017 | FIXED — persona/lorebook/scenario `createBlank` persists |
| VF-AUD-20260912-ZST-P2-018 | FIXED — `patchMedia` single IDB transaction + per-id queue |
| VF-AUD-20260912-ZST-P2-019 | FIXED — await gallery persist; fail the task on persist error. Web `data:`/`blob:` results convert into the IndexedDB images store (bounded data URL, matching Image Studio). Expiring `https:` URLs are still refused. |
| VF-AUD-20260912-SEC-P2-002 / STOR-P2-009 | FIXED — custom-protocol capability tokens issued via IPC and verified in protocol handlers; revoked on profile switch / renderer destroy / shutdown |
| VF-AUD-20260912-STOR-P2-007 | FIXED — journal checkpoints after 64 KiB and on shutdown |
| VF-AUD-20260912-STOR-P2-008 | FIXED — stale sync devices pruned after 30 days of no lastSeen |
| VF-AUD-20260912-STOR-P2-010 | FIXED — backup counts from scan; `includesMedia` false until blobs are embedded; path/signed-URL strip |

## P3 (selected)

| ID | Status |
|---|---|
| VF-AUD-20260912-SEC-P3-003 | FIXED — same as IPC-P2-002 |
| VF-AUD-20260912-GSS-P3-005 | FIXED — image-model resolver and music retrieve use `performGuardedVeniceRequest`; verifier scans for leftover direct `performVeniceRequest(` |
| VF-AUD-20260912-GSS-P3-006 | FIXED — config parse failure does not force FSM off |
| VF-AUD-20260912-GSS-P3-007 | FIXED — path redaction no longer eats API paths/dates |
| VF-AUD-20260912-STOR-P3-011 | FIXED — unique temp; write errors rethrown; parent dir created |
| VF-AUD-20260912-STOR-P3-012 | FIXED — `totalScanned` is the on-disk file count |
| VF-AUD-20260912-STOR-P3-013 | FIXED — missing-temp journals removed; `.corrupt-*` reaped after 7 days |
| VF-AUD-20260912-STOR-P3-014 | FIXED — listed storage logs use basenames |
| VF-AUD-20260912-VCS-P3-007 | FIXED — deduped `veniceFetch` callers patch their inspector row |
| VF-AUD-20260912-VCS-P3-008 | FIXED — Express JSON error handler for 413 / malformed JSON |
| VF-AUD-20260912-VCS-P3-009 | FIXED — web stream cancels the reader after `[DONE]` |
| VF-AUD-20260912-ZST-P3-021 | FIXED — `pendingSettingsSection` excluded via `partialize` |
| VF-AUD-20260912-ZST-P3-022 | FIXED — library load failures leave `hydrated: false` |
| VF-AUD-20260912-ZST-P3-023 | FIXED — the silent 20-item persist cap was on visual workflows (`workflow-store`), not templates; create now warns and refuses overflow |
| VF-AUD-20260912-IPC-P3-004 | FIXED — `chat:listPage` continues truncated lists; archive/search/validateCard/replicate all have renderer consumers |
| VF-AUD-20260912-IPC-P3-005 | FIXED — dialog/write channels take `requireMainFrame` |
| VF-AUD-20260912-IPC-P3-006 | FIXED — boolean/string channels return `false`/`""` when rate-limited |
| VF-AUD-20260912-IPC-P3-007 | FIXED — inspector broadcast skips subscribers whose session profile does not match `event.profileId` |
| VF-AUD-20260912-IPC-P3-008 | FIXED — removed dead `agentPermissionPreset`; structured `fallbackConfig`; HF `force` forwarded |
| VF-AUD-20260912-IPC-P3-009 | FIXED — dropped dead `updates:checking` emit; load-dialog cancel is `{ ok: false, canceled: true }`; preload includes `filePath`; `credential:set` already removed |
| VF-AUD-20260912-ZST-P3-024 | FIXED — profile switch aborts in-flight chat/TTS before reload |
| VF-AUD-20260912-SEC-P3-004 | FIXED — `applyRendererCspHeaders` unit-tested; packaged smoke auto-runs when a packaged executable exists or `RUN_ELECTRON_SMOKE=true`, including an inline-script probe |
| Remaining P3s | none from this audit leftover list |
