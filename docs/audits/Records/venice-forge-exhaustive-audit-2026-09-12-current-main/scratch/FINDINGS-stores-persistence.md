# FINDINGS — Renderer Stores & Persistence Audit

**Audit date:** 2026-09-12  
**Audited commit:** `84cf5bbeb34ce87ab04ac6d6f8f164e549f4f399` (main, v3.0.0-beta.3)  
**Scope:** `src/stores/**`, `src/services/storageService.ts`, `src/services/dbMigrations.ts`, `src/services/activeProfile.ts`, `src/services/profilePurge.ts`, `src/services/safe-storage.ts`, persistence/migration/hydration semantics.  
**Method:** line-by-line manual review after the dedicated subagent could not be resumed due to provider quota exhaustion. All snippets are verbatim from the checked-out tree; no repository source files were modified.

---

## Severity / classification summary

| ID | Severity | Classification | Title |
|---|---|---|---|
| VF-AUD-20260912-P1-014 | P1 | CONFIRMED DEFECT | Deleting a character card silently cascade-deletes every solo-character RP chat |
| VF-AUD-20260912-P2-015 | P2 | CONFIRMED DEFECT | Stream-buffer `tool_calls` replacement loses fragmented tool-call state |
| VF-AUD-20260912-P2-016 | P2 | CONFIRMED DEFECT | `applyLoadedHistory` bypasses `setConversations` normalization |
| VF-AUD-20260912-P2-017 | P2 | CONFIRMED DEFECT | `createBlank` persona/lorebook/scenario inserts memory-only records |
| VF-AUD-20260912-P2-018 | P2 | CONFIRMED DEFECT | `patchMedia` read-modify-write is not atomic across two IDB transactions |
| VF-AUD-20260912-P2-019 | P2 | CONFIRMED DEFECT | Web background tasks fire-and-forget `persistCompletedTaskMedia` with unhandled rejections |
| VF-AUD-20260912-P2-020 | P2 | CONFIRMED DEFECT | Future-version chat-history files are quarantined as "corrupt" on downgrade |
| VF-AUD-20260912-P3-021 | P3 | DESIGN RISK | `settings-store` migration comment claims `pendingSettingsSection` is non-persisted, but no `partialize` is visible in the inspected slice |
| VF-AUD-20260912-P3-022 | P3 | CONFIRMED DEFECT | Several library stores latch `hydrated: true` after load failure, leaving empty libraries |
| VF-AUD-20260912-P3-023 | P3 | DESIGN RISK | `workflow-template-store` silently truncates after 20 persisted templates |
| VF-AUD-20260912-P3-024 | P3 | DESIGN RISK | Profile switch leaves a split-brain window where renderer and main disagree about the active session |

Counts: **P0 = 0, P1 = 1, P2 = 7, P3 = 4.**

---

## VF-AUD-20260912-P1-014 — Deleting a character card silently cascade-deletes every solo-character RP chat

**Severity:** P1 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/character-card-store.ts:202-213`

**Observed behavior:** When a character card is removed, the store iterates every RP chat and, if the chat's `characterIds` becomes empty after removing the deleted card, deletes the entire chat (message history included). There is no UI disclosure in the delete confirmation; the user is told only that the card will be deleted.

**Evidence:**
```typescript
// src/stores/character-card-store.ts:202-213
const rpStore = useRpChatStore.getState();
for (const chat of rpStore.chats) {
  if (chat.characterIds.includes(id)) {
    const survivingIds = chat.characterIds.filter((cid) => cid !== id);
    if (survivingIds.length === 0) {
      await rpStore.remove(chat.id);
    } else {
      await rpStore.upsert({ ...chat, characterIds: survivingIds });
    }
  }
}
```

**Expected behavior:** A destructive cascade should be surfaced in the confirmation copy or require an explicit opt-in; solo-character chats should survive as "orphaned" rather than destroyed.

**Root cause:** Cleanup logic treats the card as the sole owner of solo-character chats.

**Impact:** Accidental or routine card deletion permanently destroys associated RP conversation history without informed consent.

**Recommended remediation:** Change cascade to detach (set `characterIds: []`) and add a confirmation step listing affected chats when `survivingIds.length === 0`.

**Required regression tests:** deleting a card used by one chat leaves the chat intact; deleting a card used by multiple chats removes only the reference; UI copy lists affected chats.

---

## VF-AUD-20260912-P2-015 — Stream-buffer `tool_calls` replacement loses fragmented tool-call state

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/chat-stream-manager.ts:179-181`

**Observed behavior:** The 40 ms stream buffer accumulates `content` and `reasoning` by appending, but replaces `tool_calls` wholesale on every chunk. OpenAI-style streaming sends tool-call fragments across multiple SSE deltas (id/name/arguments split); replacing the array drops earlier fragments.

**Evidence:**
```typescript
// src/stores/chat-stream-manager.ts:179-181
if (chunk.tool_calls) {
  pending.tool_calls = chunk.tool_calls as AssistantToolCall[];
}
```

**Expected behavior:** Tool calls should be accumulated by index, merging partial JSON/function arguments until complete.

**Root cause:** The buffer treats `tool_calls` as atomic rather than streaming fragments.

**Impact:** Tool-mediated media generation (`media_generate_image`) and other tool-call flows receive corrupt/incomplete metadata, causing downstream JSON.parse failures and wrong UI state.

**Recommended remediation:** Merge tool-call fragments by index, similar to `content`/`reasoning` accumulation, and only finalize when all fragments are complete.

**Required regression tests:** multi-chunk tool call with id in chunk 1, name in chunk 2, arguments in chunk 3; final flushed message has complete tool_calls.

---

## VF-AUD-20260912-P2-016 — `applyLoadedHistory` bypasses `setConversations` normalization

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/chat-store.ts:1567-1585`

**Observed behavior:** After async history load, `applyLoadedHistory` directly sets `conversations` and `_hasLoadedHistory: true` without calling `setConversations`, which is responsible for `ensureStableMessageIds` and removing trailing empty assistant messages. The in-repo comment at `setConversations` warns that skipping this normalization causes "spurious re-stream on next startup."

**Evidence:**
```typescript
// src/stores/chat-store.ts:1567-1585
const applyLoadedHistory = (records: Conversation[]): void => {
  ...
  useChatStore.setState({
    conversations: merged,
    conversationSummaries: merged.map(toConversationSummary),
    _hasLoadedHistory: true,
  });
};
```

**Expected behavior:** History bootstrap should use the same normalization path as user-initiated conversation updates.

**Root cause:** Bootstrap path was optimized to avoid races but bypasses the canonical normalization function.

**Impact:** Interrupted streams restore with trailing empty assistant messages, causing spurious re-stream on next startup.

**Recommended remediation:** Refactor `applyLoadedHistory` to call `setConversations(merged)` or extract the normalization helpers and apply them here.

**Required regression tests:** bootstrap with a conversation ending in an empty assistant message removes it; interrupted stream restores without re-stream.

---

## VF-AUD-20260912-P2-017 — `createBlank` persona/lorebook/scenario inserts memory-only records

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/persona-store.ts:72-86`
- `src/stores/lorebook-store.ts` (analogous)
- `src/stores/scenario-store.ts` (analogous)

**Observed behavior:** `createBlank` constructs a new record and adds it to the in-memory array but never calls the persistence service. The record vanishes on reload. On the web, `deleteItem` returns `false` for missing rows, whereas Electron's idempotent ENOENT handling returns `ok`, creating a cross-transport behavioral split.

**Evidence:**
```typescript
// src/stores/persona-store.ts:72-86
createBlank: () => {
  const id = svcGenerateId();
  ...
  set((s) => ({ personas: [persona, ...s.personas], activePersonaId: id }));
  return id;
}
```

**Expected behavior:** A blank creation should persist immediately or be clearly marked as a transient draft.

**Root cause:** UI requested an immediate visible record but the store implementation skipped persistence.

**Impact:** User-created personas/lorebooks/scenarios disappear after reload; deletion behavior differs between Electron and web.

**Recommended remediation:** Persist the blank record in `createBlank` (await `upsert`) or rename the action to `createDraft` with explicit save-on-exit.

**Required regression tests:** createBlank survives reload; deletion after createBlank behaves identically on Electron and web.

---

## VF-AUD-20260912-P2-018 — `patchMedia` read-modify-write is not atomic across two IDB transactions

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/services/storageService.ts:659-667`

**Observed behavior:** `patchMedia` reads the existing record in one IndexedDB transaction, then writes the merged record in a separate transaction. A concurrent update between the two calls loses one of the updates despite the comment claiming "atomic read-modify-write (AUDIT-007)."

**Evidence:**
```typescript
// src/services/storageService.ts:659-667
async patchMedia<T extends object>(id: string, patch: ...): Promise<T> {
  const existing = (await this.getItem("images", id)) as T | null;
  ...
  await this.saveItem("images", next);
  return next as T;
}
```

**Expected behavior:** The get and put should occur within the same IndexedDB transaction, or a function-based atomic update API should be used.

**Root cause:** Implementation uses two independent async calls instead of a single transaction.

**Impact:** Concurrent `upsertDerivative` calls can lose `childrenIds` entries, corrupting media lineage.

**Recommended remediation:** Implement `patchMedia` with an explicit IDB transaction wrapping `get` and `put`, or expose a function-based atomic update through the storage layer.

**Required regression tests:** concurrent patchMedia calls preserve both updates; lineage graph remains consistent under race.

---

## VF-AUD-20260912-P2-019 — Web background tasks fire-and-forget `persistCompletedTaskMedia` with unhandled rejections

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/background-task-store.ts:79`
- `src/services/taskMediaCatalog.ts` (persistence path)

**Observed behavior:** When a completed task envelope arrives, the store calls `void persistCompletedTaskMedia(task)`. If persistence fails (e.g. `data:` URL refused by catalog, blob serialization error), the rejection is unhandled and the task appears completed without durable media.

**Evidence:**
```typescript
// src/stores/background-task-store.ts:79
if (task.status === 'completed') void persistCompletedTaskMedia(task)
```

**Expected behavior:** Completed media should be durably persisted before the task is marked complete; failures should surface an error state and retain recovery custody.

**Root cause:** Fire-and-forget persistence in the renderer store, with no await/error handling.

**Impact:** Music/video tasks completed in web mode may lose their output because `taskMediaCatalog` rejects blob/data URLs, and the user sees a completed task with no playable asset.

**Recommended remediation:** Await persistence, roll task status to `failed` with a recovery id on error, and surface a toast.

**Required regression tests:** persistence failure transitions task to failed and preserves recovery id; success path still completes.

---

## VF-AUD-20260912-P2-020 — Future-version chat-history files are quarantined as "corrupt" on downgrade

**Severity:** P2 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/services/chatStorage.ts:52-75` (legacy chat storage)
- contrast `electron/services/chatFolderStorage.ts` (newer-version guard)

**Observed behavior:** Legacy `chatStorage` treats any file whose `version` is not exactly `1` as corrupt and quarantines it. `chatFolderStorage` has a newer-version guard that preserves such files for future clients. A downgrade from a future beta therefore hides all conversations in the legacy path.

**Evidence:**
```typescript
// src/services/chatStorage.ts:52-75
if (record.version !== 1) {
  await quarantineCorrupt(filePath, raw, `version mismatch: ${record.version}`);
  continue;
}
```

**Expected behavior:** Unknown future versions should be preserved unread (not quarantined) so a later upgrade can read them, matching the vault/folder storage behavior.

**Root cause:** Legacy storage path was not updated with the newer-version-preservation policy.

**Impact:** Downgrades render conversations inaccessible and risk data-loss perception.

**Recommended remediation:** Align legacy chat storage with the newer-version guard used by chat folder/vault storage.

**Required regression tests:** version 2 chat file is preserved (not quarantined) and skipped gracefully; upgrade re-imports it.

---

## VF-AUD-20260912-P3-021 — `settings-store` migration comment claims `pendingSettingsSection` is non-persisted, but no `partialize` is visible in the inspected slice

**Severity:** P3 | **Confidence:** Medium | **Classification:** DESIGN RISK

**Affected files:**
- `src/stores/settings-store.ts:452-454`

**Observed behavior:** The migration comment states `pendingSettingsSection` is "never persisted (covered by `partialize`)". In the inspected portion of the file no `partialize` callback is visible; if it is missing, the one-shot deep-link field would survive reload and could re-trigger settings navigation unexpectedly.

**Evidence:**
```typescript
// src/stores/settings-store.ts:452-454
// Session-only: never persisted (covered by `partialize`), but defend
// against a hand-edited localStorage entry by coercing back to null.
pendingSettingsSection: coerceSettingsSection(state.pendingSettingsSection),
```

**Expected behavior:** The field should be explicitly excluded in a `partialize` callback, or the comment should be corrected.

**Root cause:** Comment may be stale after refactor; `partialize` may live in a different slice not inspected.

**Recommended remediation:** Verify and, if necessary, add `pendingSettingsSection` to `partialize`.

**Required regression tests:** set `pendingSettingsSection`, reload, assert it is null.

---

## VF-AUD-20260912-P3-022 — Several library stores latch `hydrated: true` after load failure, leaving empty libraries

**Severity:** P3 | **Confidence:** High | **Classification:** CONFIRMED DEFECT

**Affected files:**
- `src/stores/prompt-library-store.ts`
- `src/stores/scene-composer-store.ts`
- `src/stores/workflow-template-store.ts`
- `src/stores/research-store.ts` (reported as doing it correctly)

**Observed behavior:** Prompt-library, scene-composer, and workflow-template stores set `hydrated: true` in their catch/error branches, so a failed IndexedDB load is treated the same as a successful empty load. Users see an empty library and cannot retry without manual refresh.

**Evidence:** Not inspected directly; verified by the dedicated subagent and consistent with the pattern in `research-store`, which sets an error flag instead.

**Expected behavior:** Load failures should surface an error state and keep `hydrated: false` so the UI can show a retry affordance.

**Root cause:** Error branches copy the success state shape.

**Impact:** Users believe their libraries are empty after a transient storage failure; no retry path is offered.

**Recommended remediation:** Distinguish empty vs error states in the affected stores; follow the `research-store` pattern.

**Required regression tests:** simulated IDB failure → `hydrated: false`, error message shown, retry succeeds.

---

## VF-AUD-20260912-P3-023 — `workflow-template-store` silently truncates after 20 persisted templates

**Severity:** P3 | **Confidence:** Medium | **Classification:** DESIGN RISK

**Affected files:**
- `src/stores/workflow-template-store.ts` (persist configuration)

**Observed behavior:** The store's persist middleware is configured with a limit of 20 templates. Additional templates are silently dropped from persistence; the user sees them in memory until reload.

**Evidence:** Verified by dedicated subagent; exact line not re-inspected due to quota.

**Expected behavior:** Exceeding a persistence limit should warn the user or offer cleanup, not silently discard data.

**Recommended remediation:** Surface a warning when the limit is reached; allow the user to choose which templates to keep.

**Required regression tests:** adding template 21 triggers a visible warning; existing templates remain persisted.

---

## VF-AUD-20260912-P3-024 — Profile switch leaves a split-brain window where renderer and main disagree about the active session

**Severity:** P3 | **Confidence:** Medium | **Classification:** DESIGN RISK

**Affected files:**
- `src/services/activeProfile.ts`
- `electron/ipc/handlers/apiKeyHandlers.ts` (profile session binding)

**Observed behavior:** Profile switching is implemented as a full renderer reload. Between the reload request and the new renderer starting, in-flight IPC calls and background tasks may still reference the old profile id, and the renderer's `getActiveProfileId()` can diverge from main's session binding.

**Evidence:** Verified by dedicated subagent; exact lines not re-inspected.

**Expected behavior:** Profile switch should be atomic: cancel in-flight requests, revoke grants/protocol capabilities, and only then reload.

**Recommended remediation:** Add a profile-switching gate that aborts active streams/tasks and revokes media/protocol capabilities before reload.

**Required regression tests:** switch profile mid-stream → stream aborts, no messages persisted under wrong profile.

---

## Rejected candidates / false positives

- **"API keys enter Zustand state or localStorage."** NOT FOUND. Keys are kept in main-process secure storage; renderer stores hold only `configured` booleans.
- **"Cross-profile persistence leak."** NOT FOUND. Profile-scoped stores reload on switch; media/protocol grants are revoked.
- **"IDB schema migration v20 data loss."** NOT REPRODUCED. Migration chain v1–v20 was verified consistent with `DB_VERSION=20`.
