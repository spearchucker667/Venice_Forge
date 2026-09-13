# Test Gaps — Venice Forge Exhaustive Audit (2026-09-13)

**Audit baseline SHA:** `2f672682d57f82e5cd2d0ecefa42a4a525a9504c`

---

## TG-001 — SSE Stream CRLF Boundary Split Unit Coverage

### Subsystem:
`src/shared/sseStreamDecoder.ts` / Streaming Chat

### Gap Description:
`src/shared/sseStreamDecoder.test.ts` extensively tests single-line chunks, multi-line chunks, and Unicode surrogate split handling, but completely lacks test coverage for a chunk boundary splitting `\r` and `\n` across two consecutive `push()` calls. Because of this gap, finding `VF-AUD-20260913-P1-004` (premature event dispatch) existed undetected.

### Proposed Test Specification:
```typescript
it("preserves event integrity when CRLF is split across chunk boundaries", () => {
  const decoder = new SseStreamDecoder();
  const events: Array<{ event: string; data: string }> = [];
  decoder.onEvent = (e) => events.push(e);

  // Chunk 1 ends with \r
  decoder.push(Buffer.from("event: delta\r\ndata: {\"token\":\"hello\"}\r"));
  expect(events.length).toBe(0); // Must NOT dispatch on trailing \r

  // Chunk 2 begins with \n followed by next event
  decoder.push(Buffer.from("\n\nevent: delta\r\ndata: {\"token\":\" world\"}\r\n\r\n"));
  
  expect(events.length).toBe(2);
  expect(events[0].data).toBe("{\"token\":\"hello\"}");
  expect(events[1].data).toBe("{\"token\":\" world\"}");
});
```

---

## TG-002 — Profile Switch Storage Partition Flush Integration Test

### Subsystem:
`src/stores/profile-store.ts` & `src/stores/chat-store.ts`

### Gap Description:
Existing tests in `profile-store.test.ts` test basic profile CRUD and in-memory switching, but do not simulate the interaction between `performRawProfileSwitch()`, `beforeunload`, and `chat-store.ts`'s debounced persistence. This allowed `VF-AUD-20260913-P1-002` (cross-profile data pollution) to go unnoticed.

### Proposed Test Specification:
```typescript
it("drains and flushes dirty conversations under the original profile before switching", async () => {
  setActiveProfileId("profile-a");
  const conv = { id: "c1", title: "Secret Chat", messages: [] };
  useChatStore.getState().setConversations([conv]);
  useChatStore.getState().markConversationDirty("c1");

  await performProfileSwitch("profile-b");

  // Verify conversation was persisted under profile-a, not profile-b
  const itemA = await StorageService.getItem("conversations", "c1", { profileId: "profile-a" });
  const itemB = await StorageService.getItem("conversations", "c1", { profileId: "profile-b" });
  expect(itemA).toBeDefined();
  expect(itemB).toBeNull();
});
```

---

## TG-003 — Remote Tombstone Sync Authority End-to-End Test

### Subsystem:
`electron/services/remoteApplyAuthority.ts` & `electron/ipc/handlers/syncHandlers.ts`

### Gap Description:
`remoteApplyAuthority.test.ts` tests that grants with matching `storeName` and `recordId` pass, and mismatching ones fail. However, it never tests the real-world sync engine case where a tombstone packet (bearing `storeName: "tombstones"`) must authorize a delete mutation against the target domain store (`conversations`, `character_cards`, etc.).

### Proposed Test Specification:
```typescript
it("authorizes domain store deletion when grant is issued for tombstones", () => {
  const token = issueRemoteApplyGrant("op-1", "tombstones", "conv-99");
  
  // Must return true when deleting from domain store with tombstone grant
  const allowed = validateMutationAuthority("remote-sync", token, "conversations", "conv-99");
  expect(allowed).toBe(true);
});
```
