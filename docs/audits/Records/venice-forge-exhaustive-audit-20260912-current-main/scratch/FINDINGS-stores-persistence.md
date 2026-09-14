# VF-AUD-20260912 Stores & Persistence — Verified Findings

- **Scope:** `src/stores/**` (all 86 files), `src/services/storageService.ts`, `src/services/dbMigrations.ts`, `src/services/cryptoService.ts`, `src/services/activeProfile.ts`, `src/services/profilePurge.ts`, `src/lib/safe-storage.ts`, plus targeted verification in `src/services/veniceClient/*`, `src/hooks/use-chat.ts`, `src/components/chat/chat-view.tsx`, `src/components/rp-studio/*`, and Electron main-process handlers/services needed to confirm cross-boundary behavior.
- **Verified against:** working tree at HEAD `84cf5bbeb34ce87ab04ac6d6f8f164e549f4f399`, branch `main`, version `3.0.0-beta.3` (per `package.json`). All claims re-derived from current source; no prior audits trusted.
- **Method:** line-by-line read of every store file; persist middleware config (partialize/version/migrate/merge) checked per store; hydration and flush paths traced; delete/cascade paths traced into main process where authority crosses IPC; secret hygiene checked against AGENTS.md §6.
- **Auditor note:** No repository source file was modified. This is the only file written.

---

## VF-AUD-20260912-P1-001 — Deleting a character card silently cascade-deletes RP chats bound to it

**Severity: P1** | **Confidence: High** | **Classification: CONFIRMED DEFECT**

**Affected files:** `src/stores/character-card-store.ts:181-230` (cascade at 202-213); UI confirm `src/components/rp-studio/CharacterLibrary.tsx:869-884`

**Observed:** `remove(id)` deletes the card, then iterates every RP chat and — without any confirmation or disclosure — deletes every chat whose `characterIds` roster becomes empty:

```ts
// character-card-store.ts:202-213
// Cascading cleanup for RP chats that reference this character
const rpStore = useRpChatStore.getState();
for (const chat of rpStore.chats) {
  if (chat.characterIds.includes(id)) {
    const survivingIds = chat.characterIds.filter((cid) => cid !== id);
    if (survivingIds.length === 0) {
      await rpStore.remove(chat.id);            // ← whole chat + messages destroyed
    } else {
      await rpStore.upsert({ ...chat, characterIds: survivingIds });
    }
  }
}
```

The only UI confirmation is the two-click card delete (`CharacterLibrary.tsx` "delete" confirm), whose copy says nothing about chat deletion.

**Expected:** Deleting a library card must not destroy user conversation data, or at minimum must require explicit, informed confirmation listing the chats to be deleted. AGENTS.md §18: "Silently delete local or remote user data" is prohibited.

**Evidence:** `character-card-store.ts:208` `await rpStore.remove(chat.id)` — `rpStore.remove` calls `svcDelete(id)` (rp-chat-store.ts:274-294), which durably deletes the `RpChatV1` record including its full `messages` array. Single-character RP chats are common (default roster size 1).

**Root cause:** Card-delete was given ownership of chat lifecycle as an implicit side effect; no UI surface discloses or consents to the chat purge.

**Impact:** Permanent loss of RP chat message history when a user deletes a character card they believe is only a library entry.

**Recommended remediation:** Replace the cascade with an orphan-tolerant model (keep chats with an unresolved `characterIds` reference, render as "missing character"), or gate it behind an explicit confirm dialog enumerating the chats that will be deleted.

**Required regression tests:** (1) Delete a card referenced by a solo-character RP chat → chat survives (or confirm dialog appears and cancel preserves it). (2) Delete with two-character roster → roster reduced, chat preserved. (3) No silent `rpStore.remove` calls during card deletion without user consent.

---

## VF-AUD-20260912-P2-002 — Stream delta buffer overwrites `tool_calls`, corrupting streamed tool-call metadata

**Severity: P2** | **Confidence: High** | **Classification: CONFIRMED DEFECT**

**Affected files:** `src/stores/chat-stream-manager.ts:164-189` (overwrite at 179-181; flush at 154-162); consumer `src/hooks/use-chat.ts:270-330`; decoder `src/shared/sseStreamDecoder.ts:206-253`

**Observed:** `bufferStreamDelta` accumulates `content`/`reasoning` with string concatenation but *replaces* `tool_calls` on every chunk:

```ts
// chat-stream-manager.ts:179-181
if (chunk.tool_calls) {
  pending.tool_calls = chunk.tool_calls as AssistantToolCall[];
}
```

and the flush path also replaces rather than merges:

```ts
// chat-store.ts:792
tool_calls: delta.tool_calls || last.tool_calls,
```

The SSE decoder passes through raw incremental OpenAI-style `tool_calls` fragments (`{index, id?, function:{name?, arguments?}}` — `sseStreamDecoder.ts:206-211`), where a single logical tool call is split across many chunks (id/name in the first, `arguments` streamed in pieces). Both within the 40 ms flush window (`STREAM_FLUSH_MS`, chat-stream-manager.ts:152) and across windows, only the *last fragment received* is kept.

**Expected:** Tool-call deltas must be accumulated per `index` (id/type captured once, `arguments` concatenated) before being committed to the message, matching the content/reasoning treatment.

**Evidence:** `chat-stream-manager.ts:169-170` concatenates content; `:180` assigns tool_calls. Consumer side, `use-chat.ts:294` filters `lastMsg.tool_calls` for `media_generate_image` and `:310` does `JSON.parse(tc.function.arguments)` — a truncated fragment makes `arguments` undefined/unparseable, so media-tool execution throws or runs with empty args, and the corrupted fragment is persisted onto the conversation record via `appendAssistantStreamDelta` (chat-store.ts:792) and the flush path (`writeConversation`, chat-store.ts:1408).

**Root cause:** The delta-coalescing buffer was written for text fields only; `tool_calls` (and the multi-chunk streaming shape of OpenAI-compatible tool calls) was treated as a replace-once payload.

**Impact:** Any chat stream that uses tools (document-agent presets inject tools via `resolveAvailableTools`, chat-stream-manager.ts:123-131) loses tool-call identity/arguments: media generation from tool calls fails, document-agent turns render broken, and persisted conversation history contains corrupt `tool_calls` metadata that replays the failure on every reload.

**Recommended remediation:** Accumulate `tool_calls` per `index` in `bufferStreamDelta` (merge `id`/`type`/`name` once, concatenate `arguments`), and in `appendAssistantStreamDelta` merge flushed tool_calls with existing ones by index/id instead of replacing.

**Required regression tests:** (1) Feed a tool call split across 3 chunks (id+name, arguments part 1, arguments part 2) through `bufferStreamDelta`/`flushStreamDelta` → message carries one complete tool call with full arguments. (2) Two interleaved tool calls by index stay distinct. (3) Existing text/reasoning accumulation behavior unchanged.

---

## VF-AUD-20260912-P2-003 — Conversation bootstrap bypasses the cleanup that `setConversations` performs (trailing empty assistant + stable message ids)

**Severity: P2** | **Confidence: High** | **Classification: CONFIRMED DEFECT**

**Affected files:** `src/stores/chat-store.ts:1542-1661` (bootstrap `applyLoadedHistory` at 1567-1585); cleanup that is skipped: `chat-store.ts:387-399` (`ensureStableMessageIds`) and `chat-store.ts:424-445` (trailing empty-assistant removal inside `setConversations`)

**Observed:** `setConversations` — used by tests, `HistoryView`, `DataStoragePanel`, and the profile volatile-reset hook — runs two normalizations on loaded conversations: (a) assigning stable legacy message ids, and (b) stripping trailing empty assistant messages left by aborted streams, with this explicit warning:

```ts
// chat-store.ts:424-427
// Remove trailing empty assistant messages left by aborted streams.
// If persisted in this state they can trigger a spurious re-stream on
// the next startup when the conversation is restored as active.
```

The production bootstrap path never calls it. Both the desktop path and the web path funnel into `applyLoadedHistory`, which merges records straight into state:

```ts
// chat-store.ts:1579-1584
const merged = Array.from(byId.values());
useChatStore.setState({
  conversations: merged,
  conversationSummaries: merged.map(toConversationSummary),
  _hasLoadedHistory: true,
});
```

**Expected:** Every path that loads conversations from durable storage must apply the same normalization. One canonical load/sanitize function should back both `setConversations` and `applyLoadedHistory`.

**Evidence:** Stream checkpoints persist in-progress messages: `appendAssistantStreamDelta` commits deltas at `STREAM_CHECKPOINT_MS = 1500` intervals via `markDirtyConversation` (chat-store.ts:1352, 765-864), and `flushAllPendingSaves` runs on `pagehide`/`beforeunload` (chat-store.ts:1666-1681), so a mid-stream quit durably writes a conversation whose last assistant message is empty. On next launch, `applyLoadedHistory` restores it uncleaned. Additionally, records produced by older builds or the legacy vault migration can carry messages without `id`; `updateMessage` (id-addressed, chat-store.ts:866-891) and the Phase 6 media-ref operations (`recordGeneratedMediaForMessage`, chat-store.ts:1042-1073) then silently no-op (`didSucceed = false`).

**Root cause:** Two load paths with different normalization; the newer, safer one is not the one used at bootstrap.

**Impact:** Restart after an interrupted stream restores conversations in exactly the state the in-repo comment says "can trigger a spurious re-stream"; legacy/vault records without message ids break edit/media-attach operations for those messages.

**Recommended remediation:** Extract the `stable.map(ensureStableMessageIds)` + trailing-empty-assistant cleanup from `setConversations` into a shared `normalizeLoadedConversations` and call it from `applyLoadedHistory`.

**Required regression tests:** (1) Bootstrap from a store containing a trailing empty assistant message → message removed. (2) Bootstrap from id-less legacy messages → ids materialize and `updateMessage` succeeds. (3) `chat-store.web.test.ts`-style reload test covering the vault/IDB path, not only `setConversations`.

---

## VF-AUD-20260912-P2-004 — `createBlank` in persona/lorebook/scenario stores inserts memory-only records that vanish on reload and (web) cannot be deleted

**Severity: P2** | **Confidence: High** | **Classification: CONFIRMED DEFECT**

**Affected files:** `src/stores/persona-store.ts:72-86`; `src/stores/lorebook-store.ts:65-80`; `src/stores/scenario-store.ts:133-157`; delete gating `persona-store.ts:132-152`, `lorebook-store.ts:125-145`, `scenario-store.ts:remove`; web delete semantics `src/services/storageService.ts:455-481` (`deleteRawProfileRows` resolves `deleted=false` for missing rows) vs Electron idempotent delete `electron/services/rpSingleFileStore.ts:118-127` (ENOENT → `ok:true`); callers `src/components/rp-studio/PersonaManager.tsx:115-117`, `LorebookManager.tsx:144`, `src/components/rp-studio/CharacterEditor.tsx:937-953`

**Observed:** All three stores' `createBlank` insert the new record into Zustand state only — no service call:

```ts
// persona-store.ts:84
set((s) => ({ personas: [persona, ...s.personas], activePersonaId: id }));
```

The editors that open afterwards persist only on explicit save (`PersonaManager.tsx:89` `await upsert(p)`; `LorebookManager.tsx:313` `await upsert(draft)`). If the user cancels or never edits, the record exists only in memory. The scenario flow is worse — it reports success while persisting nothing (`CharacterEditor.tsx:943-951`: "Scenario created … open the RP Studio to edit it").

Deleting such a record then fails on web: `remove` gates the in-memory filter on storage success, and `StorageService.deleteItem` returns `false` for a record that does not exist (deleteRawProfileRows only sets `deleted = true` when a row matched, storageService.ts:469-472), so the unsaved record can never be removed in the web build. On Electron, `rpSingleFileStore.remove` returns `ok:true` on ENOENT, so the entry is at least removable there.

**Expected:** "New" actions should either persist immediately (durable-first, as `rp-chat-store.createChat` does at `rp-chat-store.ts:206-213` and `createBlankCharacterCardDraft` does via `saveCharacterCardDraft`) or the UI must label the item as an unsaved draft and `remove` must evict memory-only entries regardless of storage result.

**Root cause:** Optimistic in-memory creation without a persistence contract, combined with a delete path that treats "not found in storage" as an error instead of "already gone".

**Impact:** (1) Records announced as created disappear on reload. (2) In the web build, unsaved blanks are stuck in the list — every delete attempt shows "Storage rejected the request" and the entry remains until the page is reloaded. (Note: `character-card-store.createBlank` has the same shape but appears unreachable from current UI, which uses the draft flow.)

**Recommended remediation:** Persist in `createBlank` (preferred; matches the card-draft pattern), and make `remove` treat a "record not found" storage result as success for in-memory eviction.

**Required regression tests:** (1) `createBlank` → record present in storage. (2) Web-mode `remove` of a memory-only record evicts it without error. (3) Cancel-without-save leaves no phantom entry after reload.

---

## VF-AUD-20260912-P2-005 — `patchMedia` read-modify-write is not atomic across its two IndexedDB transactions despite the AUDIT-007 atomicity claim

**Severity: P2** | **Confidence: High** | **Classification: CONFIRMED DEFECT**

**Affected files:** `src/services/storageService.ts:654-667` (comment at 657-658: "Supports a function-based patch for atomic read-modify-write (AUDIT-007)"); caller `src/stores/media-store.ts:232-252` (`upsertDerivative` at 246-251)

**Observed:** `patchMedia` performs a get in one transaction and a write in a second, with application logic in between:

```ts
// storageService.ts:659-665
const existing = (await this.getItem("images", id)) as T | null;   // transaction 1
if (!existing) throw new Error(`patchMedia: record not found: ${id}`);
const patchRecord = typeof patch === "function" ? patch(existing) : patch;
const next = { ...(existing as object), ...patchRecord, id, timestamp: ... };
await this.saveItem("images", next);                               // transaction 2
```

Two concurrent `patchMedia` calls on the same record both read the same `existing`; both `saveItem`s then write back from that same base — the classic read-modify-write race, not an atomic operation. `saveItem` itself has no per-key serialization.

**Expected:** Either a single `readwrite` transaction (`get` + `put` on the same transaction, with the patch function applied inside `onsuccess`), or a per-key promise queue (the pattern `rp-chat-store.ts:100-126` already uses via `withChatLock`).

**Evidence:** `media-store.ts:244-251` relies on the function patch to compute `childrenIds` "from the latest existing record at write time, reducing the race window" — the window is real: two concurrent `upsertDerivative` calls for children of the same parent each compute `childrenIds` from the same base and the later `put` drops the earlier child's id. The child `MediaItem` itself persists, so the defect manifests as a silently missing parent→child link (childrenOf/parentOf broken for that derivative).

**Root cause:** Comment-level assumption that function-based patching implies atomicity; the storage layer never provided it.

**Impact:** Lost `childrenIds` entries under concurrent derivative saves (e.g., rapid upscale+edit of the same source); derivative appears orphaned from its parent in the gallery hierarchy.

**Recommended regression tests:** (1) Two concurrent `patchMedia(id, fn)` calls where fn appends to an array → both appends present. (2) Two concurrent `upsertDerivative` calls on the same parent → parent's `childrenIds` contains both children.

---

## VF-AUD-20260912-P2-006 — Web-transport background tasks never durably persist completed music/video media

**Severity: P2** | **Confidence: Medium-High** | **Classification: DESIGN RISK**

**Affected files:** `src/stores/background-task-store.ts:72-75` (no persist middleware), `:371-374` (video completes into an in-memory object URL only), `:390-410` (music passes a `data:` URL to `persistCompletedTaskMedia`, which declines it); `src/services/taskMediaCatalog.ts:23-29`

**Observed:** In web mode, `registerQueueTask` stores tasks in Zustand memory only; nothing survives a reload. On completion, the video branch builds a session-only blob URL (`createMediaObjectUrl`, background-task-store.ts:27-34) and marks the task completed without any durable custody. The music branch calls `persistCompletedTaskMedia` with a `data:` URL, but the catalog explicitly refuses `data:`/`blob:`/`https?:` results:

```ts
// taskMediaCatalog.ts:23-28
if (
  /^https?:\/\//i.test(task.resultUrl) ||
  task.resultUrl.startsWith("data:") ||
  task.resultUrl.startsWith("blob:")
)
  return null;
```

So in web mode a completed music/video generation exists only as a blob URL in memory; after reload both the task record and the media are gone. (Desktop mode is covered: the main-process envelope snapshot drives `applyEnvelope` → `persistCompletedTaskMedia(task)` at background-task-store.ts:79 with a canonical, durable URL.)

**Expected:** Per AGENTS.md §11, completion should be durable where the feature claims survival; at minimum the web path should route completed binaries through the canonical media store (as the desktop path does) or the UI must state that web results are session-only and prompt a download.

**Root cause:** The durable-persistence contract was implemented only for the desktop envelope path; the web poller path completes directly into ephemeral object URLs.

**Impact:** Users on the web build lose completed paid generations (music/video) on reload/tab crash unless they manually downloaded first.

**Recommended remediation:** Persist completed web music/video results into the `images` store via `putMedia` (with content validation) before marking the task completed, mirroring `mediaMigration` enrichment; or add an explicit "unsaved — download now" state.

**Required regression tests:** (1) Web-mode video completion → `images` store contains a `video` MediaItem before status becomes `completed`. (2) Reload after completion → task/media recoverable from storage.

---

## VF-AUD-20260912-P3-007 — `pendingSettingsSection` is persisted despite the "never persisted" contract (no `partialize` exists)

**Severity: P3** | **Confidence: High** | **Classification: CONFIRMED DEFECT (documentation/code divergence with user-visible effect)**

**Affected files:** `src/stores/settings-store.ts:151-155` (contract), `:266-267`, `:422-511` (persist config), `:452-454` (comment)

**Observed:** The field is documented as session-only:

```ts
// settings-store.ts:151-154
/** One-shot deep-link used by the onboarding splash … When set, `SettingsView`
 *  will activate the referenced section and immediately clear the field.
 *  Never persisted. */
```

and the migrate step claims:

```ts
// settings-store.ts:452-454
// Session-only: never persisted (covered by `partialize`), but defend
// against a hand-edited localStorage entry by coercing back to null.
```

but the persist configuration has **no `partialize`** — the entire state (minus functions) is serialized on every set, including `setPendingSettingsSection`. Worse, when the stored version already equals 16, the `migrate` step never runs and the custom `merge` (`settings-store.ts:495-509`) blindly spreads the persisted value back:

```ts
// settings-store.ts:499-504
const merged = {
  ...current,
  ...persistedState,
  sidebarOpen: ...,
```

**Expected:** Either add `partialize` excluding `pendingSettingsSection` (and the comment becomes true), or update the contract/comment.

**Root cause:** Comment documents an implementation that was never present; merge path lacks the coercion that migrate has.

**Impact:** A stale deep-link can reopen a settings section unprompted on a later launch; minor UX confusion and a misleading contract for future maintainers.

**Recommended remediation:** Add `partialize: (state) => { const { pendingSettingsSection: _omit, ...rest } = state; return rest; }` (typed accordingly), and mirror the coercion in `merge` for defense in depth.

**Required regression tests:** Set `pendingSettingsSection`, force a persist write, rehydrate → field is `null`.

---

## VF-AUD-20260912-P3-008 — Load failures are cached as `hydrated: true`, turning a transient IndexedDB error into an empty library for the session

**Severity: P3** | **Confidence: High** | **Classification: CONFIRMED DEFECT**

**Affected files:** `src/stores/prompt-library-store.ts:189-195`; `src/stores/scene-composer-store.ts:151-157`; `src/stores/workflow-template-store.ts:117-131` (same pattern: catch → `{ loadError, hydrated: true }`)

**Observed:**

```ts
// prompt-library-store.ts:189-194
} catch (err) {
  set({
    loading: false,
    loadError: redactErrorMessage(err),
    hydrated: true,
  });
}
```

Every `ensureLoaded`/`ensureWorkflowTemplatesLoaded`/`ensureScenesLoaded` guard is `if (hydrated) return;`, so after one failed read (e.g., IndexedDB temporarily blocked during a profile purge or a quota hiccup) the store permanently shows an empty collection until the page is reloaded. `research-store.ensureResearchLoaded` (research-store.ts:62-72) does this correctly — it leaves `hydrated` false on error so the next call retries — proving the intended pattern exists in-repo.

**Expected:** Failed loads must not latch `hydrated`; keep `hydrated: false` (and surface `loadError`) so the next navigation/ensure call retries.

**Impact:** Transient storage errors present as mysteriously empty Prompt Library / Scene Composer / Workflow Templates for the whole session; user data is intact but invisible.

**Recommended remediation:** Drop `hydrated: true` from the catch branches (retry-on-next-ensure), optionally with a bounded backoff.

**Required regression tests:** Mock `StorageService.getItems` to reject once then resolve → second `ensureLoaded` populates the store.

---

## VF-AUD-20260912-P3-009 — Fire-and-forget media persistence has no rejection handling (unhandled promise rejections; side effects inside a Zustand updater)

**Severity: P3** | **Confidence: High** | **Classification: CONFIRMED DEFECT**

**Affected files:** `src/stores/chat-store.ts:821-856` (upsert inside `commitConversationMutation`'s `set` updater, never awaited/caught); `src/stores/background-task-store.ts:77-80` (`void persistCompletedTaskMedia(task)`)

**Observed:** During streaming, media upserts run inside the `set((state) => …)` updater passed to `commitConversationMutation`:

```ts
// chat-store.ts:825-826
useMediaStore.getState().upsert(
  { id: ref.mediaId, image: ref.displayUrl, … },
  { attachActiveProject: true, source: "generated" },
);
```

`upsert` is async and its IDB write (`StorageService.putMedia`) can reject (quota exceeded, IDB error). The promise is neither awaited nor `.catch`-ed → an unhandled rejection; the same applies to `void persistCompletedTaskMedia(task)` (background-task-store.ts:79), whose internal `store.upsert` can also reject (taskMediaCatalog.ts:78).

**Expected:** Fire-and-forget persistence must at minimum attach a `.catch` that logs a redacted error (the recovery-custody contract in AGENTS.md §11 requires failed persistence to be observable, not silent); side effects should also live outside the Zustand state updater (updaters should stay pure).

**Impact:** Console noise/unhandledrejection events during streams under storage pressure; failures are invisible to the user (no toast, no orphan tracking), so generated media can silently fail to reach the gallery.

**Recommended remediation:** Wrap both call sites with `.catch(err => logger.error(redactErrorMessage(err)))` (and route to the existing orphan-recovery UX where applicable); move the upsert out of the updater body.

**Required regression tests:** Make `putMedia` reject during `appendAssistantStreamDelta` → no unhandled rejection; error logged; chat message still commits.

---

## VF-AUD-20260912-P3-010 — `workflow-store` persist silently truncates to 20 workflows

**Severity: P3** | **Confidence: High** | **Classification: CONFIRMED DEFECT (silent truncation, contrast with settings-store which warns)**

**Affected files:** `src/stores/workflow-store.ts:227-230`

**Observed:**

```ts
// workflow-store.ts:227-230
partialize: (state) => ({
  workflows: state.workflows.slice(0, 20),
  activeWorkflowId: state.activeWorkflowId,
}),
```

The 21st (and beyond) workflow silently vanishes from persisted state on the next write — `createWorkflow` keeps it in memory, so it disappears after reload with no warning. Compare `settings-store.ts:296-304`, which at least `console.warn`s when truncating custom themes.

**Expected:** Warn on truncation (settings-store pattern), raise the cap, or persist all workflows.

**Impact:** Users with > 20 visual workflows lose the tail silently across reloads.

**Recommended regression tests:** Create 21 workflows, flush persist, reload → truncation is surfaced (warning) or not performed.

---

## VF-AUD-20260912-P3-011 — Profile switch flips renderer profile id before the main-process session, creating a split-brain scoping window

**Severity: P3** | **Confidence: Medium** | **Classification: DESIGN RISK**

**Affected files:** `src/stores/profile-store.ts:52-57` (`performRawProfileSwitch`: `setActiveProfileId(id); window.location.reload()`); `src/hooks/useProfileVolatileReset.ts:49-79` (broadcast subscriber calls `hydrateConversationHistory()` pre-reload); main-side session scoping `electron/ipc/handlers/systemHandlers.ts:341,411` (`getProfileSessionId(event.sender)`)

**Observed:** On a switch, `setActiveProfileId` writes localStorage and synchronously fires subscribers; the main-process profile session is only re-activated at next boot (`activateRestoredProfileSession`, profile-store.ts:222-256). In the window before `location.reload()` completes, every IPC call is still scoped by the **old** main-process session, while renderer-side IndexedDB tagging (`storageService.saveItem` reads `getActiveProfileId()`) already uses the **new** profile. The volatile-reset hook makes a live IPC list call inside that window (`useProfileVolatileReset.ts:60-65` → `hydrateConversationHistory` → `desktopConversations.list`).

**Expected:** Either defer hydration until after the reload (the reload is the canonical purge anyway), or sequence the main-process session activation before the renderer broadcast.

**Impact:** Mostly masked by the immediate reload; if reload is delayed/blocked, the new profile's store can briefly hydrate with the old profile's conversation list, and any durable write in the window lands cross-profile (renderer IDB tagged new, vault written to old session).

**Recommended remediation:** Remove the `hydrateConversationHistory()` call from `resetVolatileProfileState` (reload re-hydrates with a fresh, correctly activated session), or document and enforce a no-IPC rule between broadcast and reload.

**Required regression tests:** Switch profile with a delayed reload → no IPC list/write calls issued between broadcast and navigation.

---

# Rejected candidates

- **Chat delete vault/legacy asymmetry resurrecting conversations** (`chat-store.ts:660-669` tries vault delete then legacy delete; legacy list always runs in `.finally`): verified closed — vault `deleteConversation` returns `ok:false` for missing records (`electron/services/conversationVault.ts:660-661`), so legacy-only records still get deleted; post-migration dual copies are prevented because `migrateLegacyHistory` moves files into `chat-history/migrated/` which the legacy list does not scan (`electron/services/chatStorage.ts:97-120` only reads top-level files). Only a silently-failed migration rename (`vaultMigration.ts` `.catch(() => {})`) could reopen it — noted for follow-up, not a standalone defect.
- **`selectConversationSummaries` returning stale summaries** (`chat-store.ts:60-67`): the length+first-id fast path can only go stale during `stream-delta` priority, which deliberately skips summary freshness (chat-store.ts:858-859); structural mutations always refresh. Deliberate design.
- **settings `merge` skips migrate coercions** (e.g., `favoriteHostedCharacterSlugs` re-clamp, `customThemes` `ensureThemeCode`): only exploitable via hand-edited localStorage; migrate covers real version bumps. Trivial.
- **`media-store.patch` returns null for items outside the in-memory cache** (`media-store.ts:307-309`): matches its docstring; `loadById` exists for cache misses. Inconsistent with `loadById`-based flows but not user-visible under normal paging.
- **`storageService.getItemsWithMeta` unbounded `getAll`** (`storageService.ts:345-358`): loads all rows (all profiles) then filters in memory; media uses the paginated path, and remaining stores are user-content sized. Performance note only.
- **`getItemsPageWithMeta` `hasMore` computed from post-decrypt `items.length`** (`storageService.ts:409`): skewed only when decrypt failures occur, which are already warned; the `hasProfileIndex` detection at `:385-391` warns but the code always filters in memory — misleading comment, not a behavior bug.
- **v<3 chat migrate drops legacy localStorage conversations** (`chat-store.ts:1304-1307`): real historical data-loss path, but it shipped many releases ago; the affected cohort (pre-v3 localStorage blobs never since launched) is effectively zero. Recorded for archaeology only.
- **`deleteRecordsForProfile` rejects on the first store error** (`storageService.ts:607-636`): deletes in other stores still complete; callers treat it as best-effort (`profilePurge.ts` catches). Acceptable.
- **v16+ stores lack the `profileId` index** (dbMigrations v15 list): reads fall back to in-memory profile filtering with a warning (`storageService.ts:385-391`); correctness preserved.
- **Inspector request logging captures headers/bodies** (`inspector-store.ts`, `veniceClient/fetch.ts:544-551`): masked via `maskInspectorHeaders` and `sanitizeInspectorPayload` (prompt fields summarized, data URLs reduced to length, sensitive headers `******`). Hygiene confirmed.
- **`cryptoService` key custody**: AES-GCM 256 key is non-extractable and stored in a dedicated IndexedDB; standard WebCrypto renderer model, no raw key material in Zustand or localStorage. Complies with §6.
- **`auth-store` `apiKey`/`jinaApiKey` fields**: always set to `null`; keys flow only through the desktop secure-store bridge and never enter Zustand state or persistence. Complies.
- **Profile purge list typo `venice-workflow` vs actual `venice-workflows`** (`profilePurge.ts:40`): the generic sweep (`key.endsWith("_" + profileId)` + `venice-` prefix) still removes the suffixed key; the explicit list is belt-and-suspenders.
- **RP/chat/media stores loading full collections into memory** (personas `MAX_LIST_PERSONAS = 1000` cap present; rpSingleFileStore `MAX_LOAD_FILES` cap present; chat `MAX_LIST_CONVERSATIONS = 2000` cap present): bounded; acceptable.
- **`background-task-store` duplicate registration by `queueId`**: `persistCompletedTaskMedia` dedupes by `queueId`/`task-result-<id>` with an in-flight guard (`taskMediaCatalog.ts:16-40`), so double registration duplicates UI rows/pollers but not persisted media. Minor UX, not filed.
- **chat-store media upsert inside the `set` updater**: works under Zustand v5's synchronous updater execution; folded into VF-AUD-20260912-P3-009 as the side-effect-location concern rather than filed separately.
