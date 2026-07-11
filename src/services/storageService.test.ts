/** @fileoverview Unit tests for StorageService IndexedDB operations. */

import { describe, expect, it, vi, beforeEach } from "vitest";
// @ts-expect-error — fake-indexeddb ESM exports lack proper typings
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import StorageService from "./storageService";
import { MissingTimestampIndexError } from "./storageService";

/** Resets the IndexedDB instance and StorageService state before each test. */
beforeEach(() => {
  global.indexedDB = new FDBFactory();
  StorageService.db = null;
});

/** Tests for StorageService CRUD, sorting, and encryption behavior. */
describe("storageService", () => {
  /** Verifies saving and retrieving items from a non-encrypted store. */
  it("saves and retrieves an item from a non-encrypted store", async () => {
    const item = { id: "img-1", image: "base64...", prompt: "cat", timestamp: 1 };
    await StorageService.saveItem("images", item);
    const items = await StorageService.getItems<{ id: string; image: string; prompt: string; timestamp: number }>("images");
    expect(items).toHaveLength(1);
    expect(items[0].prompt).toBe("cat");
  });

  /** Verifies deletion of an item by ID. */
  it("deletes an item", async () => {
    await StorageService.saveItem("images", { id: "del-1", prompt: "a" });
    const deleted = await StorageService.deleteItem("images", "del-1");
    expect(deleted).toBe(true);
    const items = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(items).toHaveLength(0);
    expect(await StorageService.getItem("tombstones", "images:del-1")).toMatchObject({
      storeName: "images",
      recordId: "del-1",
    });
  });

  /** Verifies clearing all items from a store. */
  it("clears a store", async () => {
    await StorageService.saveItem("images", { id: "c-1", prompt: "a" });
    await StorageService.saveItem("images", { id: "c-2", prompt: "b" });
    const cleared = await StorageService.clearStore("images");
    expect(cleared).toBe(true);
    const items = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(items).toHaveLength(0);
  });

  /** Verifies descending timestamp sort order for retrieved items. */
  it("sorts results by timestamp descending", async () => {
    await StorageService.saveItem("images", { id: "s-1", prompt: "old", timestamp: 100 });
    await StorageService.saveItem("images", { id: "s-2", prompt: "new", timestamp: 300 });
    await StorageService.saveItem("images", { id: "s-3", prompt: "mid", timestamp: 200 });
    const items = await StorageService.getItems<{ id: string; prompt: string; timestamp: number }>("images");
    expect(items[0].prompt).toBe("new");
    expect(items[1].prompt).toBe("mid");
    expect(items[2].prompt).toBe("old");
  });

  // VERIFY-028: encrypted Media Studio reads stay timestamp-ordered and paginated.
  it("reads encrypted media in timestamp-ordered pages", async () => {
    for (let timestamp = 1; timestamp <= 5; timestamp += 1) {
      await StorageService.saveItem("images", { id: `page-${timestamp}`, prompt: `${timestamp}`, timestamp });
    }

    const first = await StorageService.getItemsPageWithMeta<{ id: string; timestamp: number }>("images", { limit: 2 });
    const second = await StorageService.getItemsPageWithMeta<{ id: string; timestamp: number }>("images", { offset: 2, limit: 2 });

    expect(first).toMatchObject({ total: 5, offset: 0, limit: 2, hasMore: true, decryptFailures: 0 });
    expect(first.items.map((item) => item.id)).toEqual(["page-5", "page-4"]);
    expect(second).toMatchObject({ total: 5, offset: 2, limit: 2, hasMore: true, decryptFailures: 0 });
    expect(second.items.map((item) => item.id)).toEqual(["page-3", "page-2"]);
  });

  it("fails closed instead of loading a full store when the timestamp index is missing", async () => {
    const db = await StorageService.openDB();
    const tx = db.transaction("settings", "readwrite");
    await new Promise<void>((resolve, reject) => {
      const req = tx.objectStore("settings").put({ id: "app-settings", value: {}, timestamp: 1 });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    await expect(StorageService.getItemsPageWithMeta("settings")).rejects.toBeInstanceOf(MissingTimestampIndexError);
  });

  /** Verifies transparent encryption and decryption for sensitive stores. */
  it("encrypts items in encrypted stores", async () => {
    const item = { id: "enc-1", content: "secret" };
    await StorageService.saveItem("chats", item);
    const items = await StorageService.getItems<{ id: string; content: string }>("chats");
    expect(items).toHaveLength(1);
    expect(items[0].content).toBe("secret");
  });

  /** Verifies automatic assignment of id and timestamp when missing. */
  it("assigns id and timestamp if missing", async () => {
    const item = { prompt: "no-id" };
    const saved = await StorageService.saveItem("images", item);
    expect(saved.id).toBeDefined();
    expect(saved.timestamp).toBeDefined();
  });

  it("preserves imported revision and timestamp metadata exactly without emitting", async () => {
    const saveHandler = vi.fn();
    window.addEventListener("venice:storage-saved", saveHandler);
    const imported = {
      id: "import-exact-1",
      updatedAt: "2026-07-11T20:00:00.000Z",
      timestamp: 1_752_261_200_000,
      revisionId: "revision-remote",
      baseRevisionId: "revision-parent",
    };

    await StorageService.saveImportedItem("conversations", imported);
    const stored = await StorageService.getItem<typeof imported>("conversations", imported.id);

    expect(stored).toEqual(imported);
    expect(saveHandler).not.toHaveBeenCalled();
    window.removeEventListener("venice:storage-saved", saveHandler);
  });

  /** Default mutation origin is local-user and is emitted on save/delete events. */
  it("emits storage mutation events with a default local-user origin", async () => {
    const saveHandler = vi.fn();
    const deleteHandler = vi.fn();
    window.addEventListener("venice:storage-saved", saveHandler);
    window.addEventListener("venice:storage-deleted", deleteHandler);

    await StorageService.saveItem("images", { id: "origin-1", prompt: "a" });
    await StorageService.deleteItem("images", "origin-1");

    expect(saveHandler).toHaveBeenCalledTimes(1);
    const saveDetail = (saveHandler.mock.calls[0][0] as CustomEvent).detail;
    expect(saveDetail.origin).toBe("local-user");

    expect(deleteHandler).not.toHaveBeenCalled();

    window.removeEventListener("venice:storage-saved", saveHandler);
    window.removeEventListener("venice:storage-deleted", deleteHandler);
  });

  /** Explicit mutation origin is forwarded through storage events. */
  it("forwards explicit mutation origins through storage events", async () => {
    const saveHandler = vi.fn();
    const deleteHandler = vi.fn();
    window.addEventListener("venice:storage-saved", saveHandler);
    window.addEventListener("venice:storage-deleted", deleteHandler);

    await StorageService.saveItem("images", { id: "origin-2", prompt: "b" }, { origin: "remote-sync" });
    await StorageService.deleteItem("images", "origin-2", { origin: "manual-import" });

    expect(saveHandler).toHaveBeenCalledTimes(1);
    expect((saveHandler.mock.calls[0][0] as CustomEvent).detail.origin).toBe("remote-sync");

    expect(deleteHandler).toHaveBeenCalledTimes(1);
    expect((deleteHandler.mock.calls[0][0] as CustomEvent).detail.origin).toBe("manual-import");

    window.removeEventListener("venice:storage-saved", saveHandler);
    window.removeEventListener("venice:storage-deleted", deleteHandler);
  });

  // BUG-001 regression guard: silently dropped decrypt records must be logged
  /** Verifies that decryption failures are logged as warnings instead of crashing. */
  it("warns when records fail decryption", async () => {
    // Inject a corrupted encrypted wrapper directly into the store,
    // bypassing saveItem so the envelope is NOT re-encrypted correctly.
    const db = await StorageService.openDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction("chats", "readwrite");
      tx.objectStore("chats").put({
        id: "corrupt-1",
        timestamp: 1,
        data: { _encrypted: true, iv: [0, 1, 2], data: [9, 9, 9] },
        _isEncryptedWrapper: true,
      });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await StorageService.getItemsWithMeta("chats");
    expect(result.items).toHaveLength(0); // corrupt record was silently dropped
    expect(result.decryptFailures).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('1 record(s) in "chats"')
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('could not be decrypted')
    );
    warnSpy.mockRestore();
  });

  // P1 web privacy regression guard: conversations (and other ENCRYPTED_STORES)
  // must be written with the _isEncryptedWrapper + data shape. Raw IDB rows
  // inspected directly must never expose title, messages, prompts, or other
  // sensitive plaintext at the top level of the stored record.
  it("stores conversations (web fallback) as encrypted wrappers with no plaintext sensitive fields at rest", async () => {
    const conv = {
      id: "conv-priv-1",
      title: "Secret chat about something sensitive",
      model: "venice-uncensored",
      messages: [
        { role: "user", content: "private prompt text that must not leak" },
        { role: "assistant", content: "private response that must not leak" },
      ],
      systemPrompt: "top secret system prompt",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await StorageService.saveItem("conversations", conv as any);

    // Peek at the *raw* row in the object store (bypassing getItems / decodeRows).
    const db = await StorageService.openDB();
    const rawRow: any = await new Promise((resolve, reject) => {
      const tx = db.transaction("conversations", "readonly");
      const req = tx.objectStore("conversations").get("default:conv-priv-1");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    expect(rawRow).toBeTruthy();
    // Must be the encrypted wrapper form.
    expect(rawRow._isEncryptedWrapper).toBe(true);
    expect(rawRow.data).toBeTruthy(); // the AES-GCM ciphertext blob
    // No top-level plaintext sensitive fields.
    expect(rawRow.title).toBeUndefined();
    expect(rawRow.messages).toBeUndefined();
    expect(rawRow.systemPrompt).toBeUndefined();
    expect(rawRow.prompt).toBeUndefined();
    // The wrapper carries the physical id for indexing and the logical id for callers.
    expect(rawRow.id).toBe("default:conv-priv-1");
    expect(rawRow.logicalId).toBe("conv-priv-1");
    expect(typeof rawRow.timestamp).toBe("number");

    // And the normal read path still returns usable plaintext (service decrypts).
    const roundtripped = await StorageService.getItems<any>("conversations");
    const found = roundtripped.find((c: any) => c.id === "conv-priv-1");
    expect(found?.title).toBe("Secret chat about something sensitive");
    expect(found?.messages?.[0]?.content).toContain("private prompt text");
  });
});

// VERIFY-066 regression guard: two distinct profiles must never see each
// other's rows. Even though both profiles share the same IDB store name,
// saveItem stamps profileId and getItems filters before decrypt.
describe("storageService profile isolation", () => {
  beforeEach(() => {
    global.indexedDB = new FDBFactory();
    StorageService.db = null;
    // Make each test deterministic: start on "default".
    window.localStorage.clear();
    window.localStorage.setItem("venice-active-profile-id", "default");
  });

  it("hides rows between profile switches and prefers rows belonging to the active profile", async () => {
    // Save three rows under "default".
    await StorageService.saveItem("images", { id: "d-1", prompt: "alpha", timestamp: 1 });
    await StorageService.saveItem("images", { id: "d-2", prompt: "bravo", timestamp: 2 });
    await StorageService.saveItem("images", { id: "d-3", prompt: "charlie", timestamp: 3 });

    const defaultView = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(defaultView.map((r) => r.id).sort()).toEqual(["d-1", "d-2", "d-3"]);

    // Switch to "work" — same store, no rows yet.
    window.localStorage.setItem("venice-active-profile-id", "work");
    const emptyView = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(emptyView).toEqual([]);

    // Save one row under "work".
    await StorageService.saveItem("images", { id: "w-1", prompt: "delta", timestamp: 4 });
    const workView = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(workView.map((r) => r.id)).toEqual(["w-1"]);

    // raw row peek — the work row is present but the default rows are
    // still in the database; isolation is enforced only at read time.
    const db = await StorageService.openDB();
    const allIds: string[] = await new Promise((resolve, reject) => {
      const req = db.transaction("images", "readonly").objectStore("images").getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
    expect(allIds.sort()).toEqual(["default:d-1", "default:d-2", "default:d-3", "work:w-1"]);

    // Switch back to "default" — defaults reappear, "work" row hidden.
    window.localStorage.setItem("venice-active-profile-id", "default");
    const restored = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(restored.map((r) => r.id).sort()).toEqual(["d-1", "d-2", "d-3"]);
  });

  it("clearStore on the active profile leaves untouched profiles intact", async () => {
    window.localStorage.setItem("venice-active-profile-id", "default");
    await StorageService.saveItem("images", { id: "d-1", prompt: "alpha", timestamp: 1 });
    await StorageService.saveItem("images", { id: "d-2", prompt: "bravo", timestamp: 2 });

    window.localStorage.setItem("venice-active-profile-id", "work");
    await StorageService.saveItem("images", { id: "w-1", prompt: "delta", timestamp: 3 });

    // Clearing the "work" store must not touch "default" rows.
    const clearedWork = await StorageService.clearStore("images");
    expect(clearedWork).toBe(true);

    const db = await StorageService.openDB();
    const remaining: string[] = await new Promise((resolve, reject) => {
      const req = db.transaction("images", "readonly").objectStore("images").getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
    expect(remaining.sort()).toEqual(["default:d-1", "default:d-2"]);

    // And reading under "default" still surfaces both rows.
    window.localStorage.setItem("venice-active-profile-id", "default");
    const def = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(def.map((r) => r.id).sort()).toEqual(["d-1", "d-2"]);
  });

  it("legacy records without a profileId field are treated as the default profile", async () => {
    // Inject a raw row that predates the profile-id migration — the helper
    // `rowBelongsToActiveProfile` must classify it as "default" so the
    // migration does not silently orphan legacy data.
    window.localStorage.setItem("venice-active-profile-id", "default");
    const db = await StorageService.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put({ id: "legacy-1", prompt: "ancient", timestamp: 1 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const visible = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(visible.map((r) => r.id)).toEqual(["legacy-1"]);
  });
});

// Phase 2J profile-isolation hardening: two profiles must be able to persist
// the same logical id without overwriting, reading, or deleting each other's
// physical rows.
describe("storageService profile-isolation hardening", () => {
  beforeEach(() => {
    global.indexedDB = new FDBFactory();
    StorageService.db = null;
    window.localStorage.clear();
    window.localStorage.setItem("venice-active-profile-id", "default");
  });

  it("allows two profiles to save the same logical image id without collision", async () => {
    // Profile A writes id "shared" under "default".
    window.localStorage.setItem("venice-active-profile-id", "default");
    await StorageService.saveItem("images", {
      id: "shared",
      prompt: "alpha",
      timestamp: 1,
    });

    // Profile B (work) writes the same logical id under a distinct physical key.
    window.localStorage.setItem("venice-active-profile-id", "work");
    await StorageService.saveItem("images", {
      id: "shared",
      prompt: "bravo",
      timestamp: 2,
    });

    const workItems = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(workItems).toEqual([expect.objectContaining({ id: "shared", prompt: "bravo" })]);

    window.localStorage.setItem("venice-active-profile-id", "default");
    const items = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(items).toEqual([expect.objectContaining({ id: "shared", prompt: "alpha" })]);

    const db = await StorageService.openDB();
    const keys: string[] = await new Promise((resolve, reject) => {
      const req = db.transaction("images", "readonly").objectStore("images").getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
    expect(keys.sort()).toEqual(["default:shared", "work:shared"]);
  });

  it("allows profile A and profile B to persist fixed app store ids independently", async () => {
    window.localStorage.setItem("venice-active-profile-id", "default");
    await StorageService.saveItem("chats", { id: "venice-chat", value: "default-chat", timestamp: 1 });
    await StorageService.saveItem("visualWorkflows", { id: "venice-workflows", value: "default-workflow", timestamp: 2 });

    window.localStorage.setItem("venice-active-profile-id", "work");
    await StorageService.saveItem("chats", { id: "venice-chat", value: "work-chat", timestamp: 3 });
    await StorageService.saveItem("visualWorkflows", { id: "venice-workflows", value: "work-workflow", timestamp: 4 });

    expect(await StorageService.getItem<{ id: string; value: string }>("chats", "venice-chat")).toMatchObject({
      id: "venice-chat",
      value: "work-chat",
    });
    expect(await StorageService.getItem<{ id: string; value: string }>("visualWorkflows", "venice-workflows")).toMatchObject({
      id: "venice-workflows",
      value: "work-workflow",
    });

    window.localStorage.setItem("venice-active-profile-id", "default");
    expect(await StorageService.getItem<{ id: string; value: string }>("chats", "venice-chat")).toMatchObject({
      id: "venice-chat",
      value: "default-chat",
    });
    expect(await StorageService.getItem<{ id: string; value: string }>("visualWorkflows", "venice-workflows")).toMatchObject({
      id: "venice-workflows",
      value: "default-workflow",
    });
  });

  it("deleteItem refuses to delete a row owned by another profile and returns false", async () => {
    window.localStorage.setItem("venice-active-profile-id", "default");
    await StorageService.saveItem("images", {
      id: "must-survive",
      prompt: "default-only",
      timestamp: 1,
    });

    // Switch to "work" and try to delete the default-owned row.
    window.localStorage.setItem("venice-active-profile-id", "work");
    const deleted = await StorageService.deleteItem("images", "must-survive");
    expect(deleted).toBe(false);

    // The row must still exist for the default profile.
    window.localStorage.setItem("venice-active-profile-id", "default");
    const items = await StorageService.getItems<{ id: string; prompt: string }>("images");
    expect(items.map((r) => r.id)).toEqual(["must-survive"]);
  });

  it("getItemsPageWithMeta scopes its page total to the active profile", async () => {
    window.localStorage.setItem("venice-active-profile-id", "default");
    for (let i = 1; i <= 3; i += 1) {
      await StorageService.saveItem("images", {
        id: `d-${i}`,
        prompt: `default-${i}`,
        timestamp: i,
      });
    }
    window.localStorage.setItem("venice-active-profile-id", "work");
    for (let i = 1; i <= 5; i += 1) {
      await StorageService.saveItem("images", {
        id: `w-${i}`,
        prompt: `work-${i}`,
        timestamp: 10 + i,
      });
    }

    const workPage = await StorageService.getItemsPageWithMeta<{
      id: string;
      prompt: string;
      timestamp: number;
    }>("images", { limit: 5 });
    expect(workPage.total).toBe(5);
    expect(workPage.items).toHaveLength(5);
    expect(workPage.items.every((row) => row.id.startsWith("w-"))).toBe(true);

    window.localStorage.setItem("venice-active-profile-id", "default");
    const defaultPage = await StorageService.getItemsPageWithMeta<{
      id: string;
      prompt: string;
      timestamp: number;
    }>("images", { limit: 5 });
    expect(defaultPage.total).toBe(3);
    expect(defaultPage.items.map((r) => r.id).sort()).toEqual(["d-1", "d-2", "d-3"]);
  });

  it("legacy unscoped records are visible only to the default profile", async () => {
    const db = await StorageService.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put({ id: "legacy-shared", prompt: "legacy", timestamp: 1 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    window.localStorage.setItem("venice-active-profile-id", "work");
    expect(await StorageService.getItem("images", "legacy-shared")).toBeNull();
    expect(await StorageService.getItems("images")).toEqual([]);

    window.localStorage.setItem("venice-active-profile-id", "default");
    expect(await StorageService.getItem<{ id: string; prompt: string }>("images", "legacy-shared")).toMatchObject({
      id: "legacy-shared",
      prompt: "legacy",
    });
  });
});
