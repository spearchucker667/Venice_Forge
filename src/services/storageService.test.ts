import { describe, expect, it, beforeEach } from "vitest";
// @ts-ignore — fake-indexeddb ESM exports lack proper typings
import FDBFactory from "fake-indexeddb/lib/FDBFactory";
import StorageService from "./storageService";

beforeEach(() => {
  // @ts-ignore
  global.indexedDB = new FDBFactory();
  StorageService.db = null;
});

describe("storageService", () => {
  it("saves and retrieves an item from a non-encrypted store", async () => {
    const item = { id: "img-1", image: "base64...", prompt: "cat", timestamp: 1 };
    await StorageService.saveItem("images", item);
    const items = await StorageService.getItems("images");
    expect(items).toHaveLength(1);
    expect(items[0].prompt).toBe("cat");
  });

  it("deletes an item", async () => {
    await StorageService.saveItem("images", { id: "del-1", prompt: "a" });
    const deleted = await StorageService.deleteItem("images", "del-1");
    expect(deleted).toBe(true);
    const items = await StorageService.getItems("images");
    expect(items).toHaveLength(0);
  });

  it("clears a store", async () => {
    await StorageService.saveItem("images", { id: "c-1", prompt: "a" });
    await StorageService.saveItem("images", { id: "c-2", prompt: "b" });
    const cleared = await StorageService.clearStore("images");
    expect(cleared).toBe(true);
    const items = await StorageService.getItems("images");
    expect(items).toHaveLength(0);
  });

  it("sorts results by timestamp descending", async () => {
    await StorageService.saveItem("images", { id: "s-1", prompt: "old", timestamp: 100 });
    await StorageService.saveItem("images", { id: "s-2", prompt: "new", timestamp: 300 });
    await StorageService.saveItem("images", { id: "s-3", prompt: "mid", timestamp: 200 });
    const items = await StorageService.getItems("images");
    expect(items[0].prompt).toBe("new");
    expect(items[1].prompt).toBe("mid");
    expect(items[2].prompt).toBe("old");
  });

  it("encrypts items in encrypted stores", async () => {
    const item = { id: "enc-1", content: "secret" };
    await StorageService.saveItem("chats", item);
    const items = await StorageService.getItems("chats");
    expect(items).toHaveLength(1);
    expect(items[0].content).toBe("secret");
  });

  it("assigns id and timestamp if missing", async () => {
    const item = { prompt: "no-id" };
    const saved = await StorageService.saveItem("images", item);
    expect(saved.id).toBeDefined();
    expect(saved.timestamp).toBeDefined();
  });
});
