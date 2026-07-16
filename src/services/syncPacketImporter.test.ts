// VERIFY-128 regression guard: sync conflict records carry explicit
// `_meta = { winningSource, losingSource, ...}` provenance so the
// resolver UI does not have to infer it from the `_conflict_` id
// suffix (which silently inverted keep-local/keep-remote semantics
// whenever the imported revision won the merge).
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  importDecryptedPacket,
  readSyncConflictProvenance,
  SYNC_CONFLICT_META_KEY,
} from "./syncPacketImporter";
import StorageService from "./storageService";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn(() => false),
}));

vi.mock("./storageService", () => ({
  default: {
    getItems: vi.fn(),
    getItem: vi.fn(),
    saveImportedItem: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./tombstoneService", () => ({
  TombstoneService: {
    saveTombstone: vi.fn().mockResolvedValue(undefined),
  },
}));

const STUB_REMOTE_TOKEN = "test-remote-apply-token";

const baseTimestamp = Date.parse("2026-07-15T12:00:00Z");

function makeRecord(id: string, deviceId: string, revisionId: string, baseRevisionId: string, updatedAt: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    updatedAt,
    deletedAt: null,
    revisionId,
    baseRevisionId,
    deviceId,
    name: `Record ${id}`,
    ...extra,
  };
}

function getSavedRecords(): Array<Record<string, unknown>> {
  const calls = vi.mocked(StorageService.saveImportedItem).mock.calls;
  return calls.map((c) => c[1] as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchStoreRecordsByStore();
});

function mockFetchStoreRecordsByStore(libraryRecord?: Record<string, unknown>) {
  vi.mocked(StorageService.getItems).mockImplementation(async (store: unknown) => {
    if (store === "promptLibrary" && libraryRecord) return [libraryRecord];
    return [];
  });
  vi.mocked(StorageService.getItem).mockImplementation(async (_store: string, _key: string) => {
    return null;
  });
}

// mergeStores targets (chats | rp_chats | conversations) require an
// array of messages under `record.messages`. The mock keeps everything
// else default.
function mockFetchConversationRecords(conversationRecord?: Record<string, unknown>) {
  vi.mocked(StorageService.getItems).mockImplementation(async (store: unknown) => {
    if (store === "chats" && conversationRecord) return [conversationRecord];
    return [];
  });
  vi.mocked(StorageService.getItem).mockImplementation(async (_store: string, _key: string) => {
    return null;
  });
}

describe("VERIFY-128 sync conflict provenance", () => {
  it("attaches a complete _meta provenance block to the losing record when the imported revision wins", async () => {
    const local = makeRecord("lib-1", "this-device", "rev-local-1", "rev-base-0", baseTimestamp - 5_000, {
      description: "local content",
    });
    mockFetchStoreRecordsByStore(local);

    const imported = makeRecord("lib-1", "other-device", "rev-imp-2", "rev-base-0", baseTimestamp, {
      description: "imported content, newer",
    });

    const result = await importDecryptedPacket(
      "promptLibrary",
      "lib-1",
      JSON.stringify(imported),
      "op-1",
      STUB_REMOTE_TOKEN,
    );
    expect(result.ok).toBe(true);

    const saved = getSavedRecords();
    // Two saves: the conflict record (loser = local) and the imported winner
    const conflictSaved = saved.find((r) => typeof r.id === "string" && r.id.includes("_conflict_"));
    expect(conflictSaved, `expected a _conflict_ record; instead saved=${JSON.stringify(saved.map(r => r.id))}; result.error=${result.error ?? "(none)"}`).toBeDefined();

    const provenance = readSyncConflictProvenance(conflictSaved);
    expect(provenance).not.toBeNull();
    expect(provenance!.winningSource).toBe("imported");
    expect(provenance!.losingSource).toBe("local");
    expect(provenance!.winningDeviceId).toBe("other-device");
    expect(provenance!.losingDeviceId).toBe("this-device");
    expect(provenance!.originalRecordId).toBe("lib-1");
    expect(provenance!.winningRevisionId).toBe("rev-imp-2");
    expect(provenance!.losingRevisionId).toBe("rev-local-1");
    expect(provenance!.conflictIdentity).toMatch(/^[a-z0-9]+$/);
  });

  it("flips winningSource to 'local' when the local revision wins the merge", async () => {
    const local = makeRecord("lib-1", "this-device", "rev-local-9", "rev-base-0", baseTimestamp + 60_000, {
      description: "local content, much newer",
    });
    mockFetchStoreRecordsByStore(local);

    const imported = makeRecord("lib-1", "other-device", "rev-imp-1", "rev-base-0", baseTimestamp, {
      description: "imported content, older",
    });

    await importDecryptedPacket("promptLibrary", "lib-1", JSON.stringify(imported), "op-1", STUB_REMOTE_TOKEN);

    const saved = getSavedRecords();
    const conflictSaved = saved.find((r) => typeof r.id === "string" && r.id.includes("_conflict_"));
    const provenance = readSyncConflictProvenance(conflictSaved);
    expect(provenance!.winningSource).toBe("local");
    expect(provenance!.losingSource).toBe("imported");
    expect(provenance!.winningRevisionId).toBe("rev-local-9");
    expect(provenance!.losingRevisionId).toBe("rev-imp-1");
  });

  it("readSyncConflictProvenance rejects malformed meta blocks", () => {
    expect(readSyncConflictProvenance({ [SYNC_CONFLICT_META_KEY]: { kind: "not-a-conflict" } })).toBeNull();
    expect(readSyncConflictProvenance({ [SYNC_CONFLICT_META_KEY]: { kind: "sync-conflict", winningSource: "banana", losingSource: "local" } })).toBeNull();
    expect(readSyncConflictProvenance({ [SYNC_CONFLICT_META_KEY]: { kind: "sync-conflict", winningSource: "local", losingSource: "imported", conflictIdentity: 42, originalRecordId: "x" } })).toBeNull();
    expect(readSyncConflictProvenance({})).toBeNull();
    expect(readSyncConflictProvenance(null)).toBeNull();
    expect(readSyncConflictProvenance("not-an-object")).toBeNull();
  });

  it("does NOT emit a conflict record when both revisions share the same device + revisionId", async () => {
    // Same device, same revisionId, matching baseRevisionId ⇒ not a conflict.
    // The single save should be the merged update (no _meta block attached).
    const local = makeRecord("lib-1", "this-device", "rev-1", "rev-0", baseTimestamp, {
      description: "local",
    });
    mockFetchStoreRecordsByStore(local);

    await importDecryptedPacket("promptLibrary", "lib-1", JSON.stringify({
      ...local,
      updatedAt: baseTimestamp + 1,
      description: "trivial edit merged into local",
    }), "op-1", STUB_REMOTE_TOKEN);

    const saved = getSavedRecords();
    const conflictSaved = saved.find((r) => typeof r.id === "string" && r.id.includes("_conflict_"));
    expect(conflictSaved).toBeUndefined();
    // No record should carry _meta when there is no conflict.
    expect(saved.some((r) => r[SYNC_CONFLICT_META_KEY] !== undefined)).toBe(false);
  });
});

// VERIFY-129 regression guard: imports of a mergeStores chat record
// (chats | rp_chats | conversations) whose same-id message diverges in
// non-transport content must surface the diverged message as a
// `*_conflict_*` record with `_meta` provenance pointing at the original
// message id. Previously, `localMsgIds.has(m.id)` silently dropped it.
describe("VERIFY-129 message-content divergence", () => {
  it("forks a divergent same-id message into the parent conversation's messages array (VERIFY-133)", async () => {
    const localChat = {
      id: "conv-1",
      updatedAt: baseTimestamp - 10_000,
      revisionId: "rev-local-1",
      baseRevisionId: "rev-base-0",
      deviceId: "this-device",
      title: "Local title",
      messages: [
        {
          id: "m-1",
          createdAt: baseTimestamp - 30_000,
          revisionId: "rev-local-1",
          deviceId: "this-device",
          content: "original line",
          role: "user",
        },
      ],
    };
    mockFetchConversationRecords(localChat);

    const importedChat = {
      id: "conv-1",
      updatedAt: baseTimestamp + 30_000,
      revisionId: "rev-imp-1",
      baseRevisionId: "rev-base-0",
      deviceId: "other-device",
      title: "Local title",
      messages: [
        {
          id: "m-1",
          createdAt: baseTimestamp - 30_000,
          revisionId: "rev-imp-1",
          deviceId: "other-device",
          content: "edited on other device",
          role: "user",
        },
      ],
    };

    await importDecryptedPacket(
      "chats",
      "conv-1",
      JSON.stringify(importedChat),
      "op-3",
      STUB_REMOTE_TOKEN,
    );

    const saved = getSavedRecords();
    // VERIFY-133: pre-fix this regression test verified a stand-alone
    // message-shaped record with id `m-1_conflict_<...>` and a synthetic
    // `parentRecordId` / `parentMessageId`. The new contract keeps the
    // divergent imported copy *inside* the surviving local conversation's
    // `messages` array under a forked id, so the resulting record is
    // conversation-shaped (passes `chatStorage.isValidConversation`)
    // and contains BOTH edits.
    // 1. No standalone top-level fork record is persisted.
    expect(
      saved.find((r) => typeof r.id === "string" && /^m-1_conflict_/.test(r.id)),
      "must not save the divergent message as a stand-alone record",
    ).toBeUndefined();

    // 2. The surviving local conversation has the forked sibling inside
    //    its `messages` array, not as a separate top-level entry.
    const surviving = saved.find(
      (r) => r.id === "conv-1" && Array.isArray(r.messages),
    );
    expect(surviving, "local conversation must be re-saved").toBeDefined();
    expect(Array.isArray(surviving!.messages)).toBe(true);

    const fork = (surviving!.messages as Array<Record<string, unknown>>).find(
      (m: Record<string, unknown>) =>
        typeof m.id === "string" && /^m-1_conflict_/.test(m.id),
    );
    expect(fork, "forked message must live inside the parent conversation").toBeDefined();

    const provenance = readSyncConflictProvenance(fork);
    expect(provenance).not.toBeNull();
    expect(provenance!.originalRecordId).toBe("m-1");
    expect(provenance!.winningSource).toBe("local");
    expect(provenance!.losingSource).toBe("imported");
    expect(provenance!.winningDeviceId).toBe("this-device");
    expect(provenance!.losingDeviceId).toBe("other-device");
    expect(provenance!.winningRevisionId).toBe("rev-local-1");
    expect(provenance!.losingRevisionId).toBe("rev-imp-1");
    // The forked message keeps its diverged content.
    expect(fork!.content).toBe("edited on other device");

    // 3. The conversation record is conversation-shaped so chatStorage
    //    would accept it (no schema rejection).
    const messagesArr = surviving!.messages as Array<Record<string, unknown>>;
    expect(messagesArr.length).toBe(2);
    expect(messagesArr.some((m) => m.id === "m-1")).toBe(true);
    expect(messagesArr.some((m) => typeof m.id === "string" && /^m-1_conflict_/.test(m.id as string))).toBe(true);
    expect(surviving!.divergedMessageIds).toEqual(["m-1"]);
  });

  it("does not fork same-id messages whose content agrees (no spurious conflict)", async () => {
    const localChat = {
      id: "conv-1",
      updatedAt: baseTimestamp - 5_000,
      revisionId: "rev-local-1",
      baseRevisionId: "rev-base-0",
      deviceId: "this-device",
      title: "T",
      messages: [{ id: "m-1", content: "same", role: "user", createdAt: 1000 }],
    };
    mockFetchConversationRecords(localChat);

    // Newer revision because a brand-new message was added elsewhere;
    // m-1 is untouched in both.
    const importedChat = {
      id: "conv-1",
      updatedAt: baseTimestamp + 60_000,
      revisionId: "rev-imp-7",
      baseRevisionId: "rev-base-0",
      deviceId: "other-device",
      title: "T",
      messages: [
        { id: "m-1", content: "same", role: "user", createdAt: 1000 },
        { id: "m-2", content: "appended on other device", role: "user", createdAt: 2000 },
      ],
    };

    await importDecryptedPacket(
      "chats",
      "conv-1",
      JSON.stringify(importedChat),
      "op-4",
      STUB_REMOTE_TOKEN,
    );

    const saved = getSavedRecords();
    // No forked conflict messages in this case.
    expect(
      saved.find(
        (r) => typeof r.id === "string" && r.id.includes("_conflict_") && r.id.startsWith("m-"),
      ),
    ).toBeUndefined();
  });
});

// VERIFY-129 manual-import branch: a divergent same-id message edit
// must also surface a conflict record under manual imports (not just
// under remote-sync). Previously this branch silently dropped the
// divergent imported edit because the gate `importOrigin !==
// "manual-import"` skipped the divergence fork and the simple append
// filter rejected divergent edits by id.
describe("VERIFY-129 manual-import message divergence", () => {
  it("forks a divergent same-id edit into a conflict record under manual-import (VERIFY-133 embedded)", async () => {
    const localChat = {
      id: "conv-2",
      updatedAt: baseTimestamp - 10_000,
      revisionId: "rev-local-2",
      baseRevisionId: "rev-base-0",
      deviceId: "this-device",
      title: "Local title",
      messages: [
        {
          id: "m-1",
          createdAt: baseTimestamp - 30_000,
          revisionId: "rev-local-2",
          deviceId: "this-device",
          content: "edited on this device",
          role: "user",
        },
      ],
    };
    mockFetchConversationRecords(localChat);

    const importedChat = {
      id: "conv-2",
      updatedAt: baseTimestamp + 30_000,
      revisionId: "rev-imp-2",
      baseRevisionId: "rev-base-0",
      deviceId: "other-device",
      title: "Local title",
      messages: [
        {
          id: "m-1",
          createdAt: baseTimestamp - 30_000,
          revisionId: "rev-imp-2",
          deviceId: "other-device",
          content: "edited on other device",
          role: "user",
        },
      ],
    };

    // No remote-apply-token => manual-import origin.
    await importDecryptedPacket(
      "chats",
      "conv-2",
      JSON.stringify(importedChat),
      "op-3",
    );

    const saved = getSavedRecords();
    // VERIFY-133: the divergent imported copy lives INSIDE the
    // surviving local conversation's `messages` array, not at the
    // top level. Manual imports use the same routing as remote-sync
    // (the dirty-tree change at syncPacketImporter.ts:360 dropped the
    // `importOrigin !== "manual-import"` exclusion).
    expect(
      saved.find((r) => typeof r.id === "string" && /^m-1_conflict_/.test(r.id)),
      "must not save the divergent message as a stand-alone record",
    ).toBeUndefined();

    const surviving = saved.find(
      (r) => r.id === "conv-2" && Array.isArray(r.messages),
    );
    expect(surviving, "local conversation must be re-saved").toBeDefined();
    const fork = (surviving!.messages as Array<Record<string, unknown>>).find(
      (m) => typeof m.id === "string" && /^m-1_conflict_/.test(m.id),
    );
    expect(fork, "forked message must live inside the parent conversation").toBeDefined();
    expect(fork!.content).toBe("edited on other device");
    const prov = readSyncConflictProvenance(fork);
    expect(prov).not.toBeNull();
    expect(prov!.winningSource).toBe("local");
    expect(prov!.losingSource).toBe("imported");
    expect(prov!.originalRecordId).toBe("m-1");
    expect(surviving!.divergedMessageIds).toEqual(["m-1"]);
  });
});

