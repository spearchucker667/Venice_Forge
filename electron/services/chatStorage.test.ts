// @vitest-environment node

/** @fileoverview Unit tests for Electron main-process chat history filesystem storage. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";

const loggerMocks = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
}));

vi.mock("./logger", () => ({
  logError: loggerMocks.logError,
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import {
  getChatHistoryDir,
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  purgeProfileChatHistory,
} from "./chatStorage";
import { isValidId } from "../../src/utils/idValidation";
import type { Conversation } from "../../src/types/conversation";

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Test Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model: "venice-uncensored",
    systemPrompt: "You are a test assistant.",
    messages: [
      { id: "m1", role: "user", content: "hello", timestamp: Date.now() },
      { id: "m2", role: "assistant", content: "hi", timestamp: Date.now() },
    ],
    ...overrides,
  };
}

async function cleanDir() {
  const dir = getChatHistoryDir();
  await fs.rm(dir, { recursive: true, force: true });
}

describe("chatStorage", () => {
  beforeEach(async () => {
    await cleanDir();
  });
  afterEach(async () => {
    await cleanDir();
  });

  it("saves and retrieves a conversation", async () => {
    const conv = makeConv();
    const saveResult = await saveConversation(conv);
    expect(saveResult.ok).toBe(true);

    const retrieved = await getConversation(conv.id);
    expect(retrieved).toEqual(conv);
  });

  it("lists conversations sorted by updatedAt descending", async () => {
    const c1 = makeConv({ updatedAt: 1000 });
    const c2 = makeConv({ updatedAt: 2000 });
    const c3 = makeConv({ updatedAt: 1500 });
    await saveConversation(c1);
    await saveConversation(c2);
    await saveConversation(c3);

    const list = await listConversations();
    expect(list.map((c) => c.id)).toEqual([c2.id, c3.id, c1.id]);
  });

  it("deletes a conversation", async () => {
    const conv = makeConv();
    await saveConversation(conv);
    expect(await getConversation(conv.id)).not.toBeNull();

    const delResult = await deleteConversation(conv.id);
    expect(delResult.ok).toBe(true);
    expect(await getConversation(conv.id)).toBeNull();
  });

  it("returns null for a missing conversation", async () => {
    const result = await getConversation("nonexistent-id");
    expect(result).toBeNull();
  });

  it("returns empty array when no conversations exist", async () => {
    const list = await listConversations();
    expect(list).toEqual([]);
  });

  it("rejects saving a conversation with malformed message content parts", async () => {
    const conv = makeConv({
      messages: [
        {
          id: "m1",
          role: "user",
          content: [
            { type: "text", text: "valid" },
            { type: "image_url", image_url: { url: "https://example.com/img.png" } },
            { type: "unknown", something: "invalid" } as any
          ],
          timestamp: Date.now()
        }
      ]
    });
    const result = await saveConversation(conv);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid conversation schema");
  });

  // VF-AUDIT-001 regression guard: Windows reserved device names must be rejected
  it("rejects Windows reserved device names as conversation IDs", async () => {
    const reservedNames = ["CON", "PRN", "AUX", "NUL", "COM1", "COM9", "LPT1", "LPT9"];
    for (const name of reservedNames) {
      expect(isValidId(name)).toBe(false);
      expect(isValidId(name.toLowerCase())).toBe(false);
      // With extension suffix — still rejected because the basename is reserved
      expect(isValidId(`${name}.json`)).toBe(false);
    }
    // Normal IDs should still pass
    expect(isValidId("hello-world")).toBe(true);
    expect(isValidId("chat-123")).toBe(true);
  });

  it("uses bounded directory iteration instead of eager readdir when listing conversations", async () => {
    const readdirSpy = vi.spyOn(fs, "readdir");
    const conv = makeConv();
    await saveConversation(conv);

    const list = await listConversations();

    expect(list.map((item) => item.id)).toEqual([conv.id]);
    expect(readdirSpy).not.toHaveBeenCalled();
    readdirSpy.mockRestore();
  });

  it("rejects invalid conversation schema", async () => {
    const bad = { id: "bad", title: 123 } as unknown as Conversation;
    const result = await saveConversation(bad);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Invalid conversation schema/);
  });

  it("returns a generic error and basename-only diagnostics on write failure", async () => {
    const writeSpy = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(
      Object.assign(new Error("EACCES /Users/private/chat-history/secret.json Bearer fixture"), { code: "EACCES" }),
    );
    loggerMocks.logError.mockClear();
    const result = await saveConversation(makeConv({ id: "safe-id" }));
    writeSpy.mockRestore();

    expect(result).toEqual({ ok: false, error: "Failed to save conversation." });
    const diagnostics = JSON.stringify(loggerMocks.logError.mock.calls);
    expect(diagnostics).toContain("safe-id.json");
    expect(diagnostics).not.toContain("/Users/private");
    expect(diagnostics).not.toContain("Bearer fixture");
  });

  it("rejects path traversal ids", async () => {
    const result = await getConversation("../../../etc/passwd");
    expect(result).toBeNull();
  });

  it("backs up corrupt files with a timestamp and returns null (M-025)", async () => {
    const dir = getChatHistoryDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "corrupt.json"), "not-json", "utf-8");

    const before = Date.now();
    const result = await getConversation("corrupt");
    const after = Date.now();
    expect(result).toBeNull();

    const files = await fs.readdir(dir);
    const backup = files.find((f) => f.startsWith("corrupt.json.backup."));
    expect(backup).toBeDefined();
    const timestamp = Number(backup!.split(".")[3]);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it("returns null silently for a missing conversation without creating a backup (M-011)", async () => {
    const result = await getConversation("definitely-missing-id");
    expect(result).toBeNull();

    const dir = getChatHistoryDir();
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    expect(files.some((f) => f.includes("definitely-missing-id"))).toBe(false);
  });

  it("allows optional systemPrompt (M-026)", async () => {
    const conv = makeConv({ systemPrompt: undefined });
    const saveResult = await saveConversation(conv);
    expect(saveResult.ok).toBe(true);

    const retrieved = await getConversation(conv.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.systemPrompt).toBeUndefined();
  });

  it("updates an existing conversation", async () => {
    const conv = makeConv();
    await saveConversation(conv);

    const updated: Conversation = { ...conv, title: "Updated", messages: [...conv.messages, { id: "m3", role: "user", content: "new", timestamp: Date.now() }] };
    const saveResult = await saveConversation(updated);
    expect(saveResult.ok).toBe(true);

    const retrieved = await getConversation(conv.id);
    expect(retrieved?.title).toBe("Updated");
    expect(retrieved?.messages).toHaveLength(3);
  });

  // VERIFY-100: identical logical ids are isolated in per-profile directories;
  // unscoped historical files belong only to the default profile.
  it("isolates identical conversation ids across profiles", async () => {
    const defaultConversation = makeConv({ id: "shared", title: "Default" });
    const workConversation = makeConv({ id: "shared", title: "Work" });

    expect((await saveConversation(defaultConversation, "default")).ok).toBe(true);
    expect((await saveConversation(workConversation, "work")).ok).toBe(true);

    expect((await getConversation("shared", "default"))?.title).toBe("Default");
    expect((await getConversation("shared", "work"))?.title).toBe("Work");
    expect((await listConversations(undefined, "default")).map((item) => item.title)).toEqual(["Default"]);
    expect((await listConversations(undefined, "work")).map((item) => item.title)).toEqual(["Work"]);

    expect((await deleteConversation("shared", "work")).ok).toBe(true);
    expect(await getConversation("shared", "work")).toBeNull();
    expect((await getConversation("shared", "default"))?.title).toBe("Default");
  });

  // VERIFY-008 regression guard (T14): server-side paginated listConversations.
  // When called with { offset, limit }, the function returns the envelope
  // shape directly (no back-compat shim) and respects the requested page
  // boundaries. A renderer can use the `truncated` field to know whether
  // more pages exist beyond the current one.
  describe("listConversations({ offset, limit }) — T14 pagination", () => {
    it("returns the envelope shape with offset/count when called with options", async () => {
      const c1 = makeConv({ updatedAt: 1000 });
      const c2 = makeConv({ updatedAt: 2000 });
      const c3 = makeConv({ updatedAt: 3000 });
      await saveConversation(c1);
      await saveConversation(c2);
      await saveConversation(c3);

      const result = await listConversations({ offset: 0, limit: 2 });
      expect(Array.isArray(result)).toBe(false);
      if (Array.isArray(result)) throw new Error("expected envelope shape");
      expect(result.offset).toBe(0);
      expect(result.count).toBe(2);
      expect(result.conversations).toHaveLength(2);
      // Sorted by updatedAt desc: c3, c2 (skip c1)
      expect(result.conversations.map((c) => c.id)).toEqual([c3.id, c2.id]);
      // Truncated because c1 still exists beyond the page
      expect(result.truncated).toBe(true);
      expect(result.totalScanned).toBe(3);
    });

    it("returns the second page correctly when paginating", async () => {
      const c1 = makeConv({ updatedAt: 1000 });
      const c2 = makeConv({ updatedAt: 2000 });
      const c3 = makeConv({ updatedAt: 3000 });
      await saveConversation(c1);
      await saveConversation(c2);
      await saveConversation(c3);

      const page1 = await listConversations({ offset: 0, limit: 2 });
      const page2 = await listConversations({ offset: 2, limit: 2 });
      expect(Array.isArray(page2)).toBe(false);
      if (Array.isArray(page1) || Array.isArray(page2)) throw new Error("expected envelope shape");
      // page1 has c3, c2; page2 has c1
      expect(page1.conversations.map((c) => c.id)).toEqual([c3.id, c2.id]);
      expect(page2.conversations.map((c) => c.id)).toEqual([c1.id]);
      // page1 truncated (more exist), page2 not truncated (end of list)
      expect(page1.truncated).toBe(true);
      expect(page2.truncated).toBe(false);
    });

    it("clamps a renderer-supplied limit > MAX_PAGE_LIMIT (1000)", async () => {
      // Save 3 conversations
      await saveConversation(makeConv({ updatedAt: 1000 }));
      await saveConversation(makeConv({ updatedAt: 2000 }));
      await saveConversation(makeConv({ updatedAt: 3000 }));

      const result = await listConversations({ offset: 0, limit: 10_000_000 });
      if (Array.isArray(result)) throw new Error("expected envelope shape");
      // We have only 3 conversations, so the result is bounded by data, not by limit
      expect(result.conversations).toHaveLength(3);
      expect(result.truncated).toBe(false);
    });

    it("clamps a negative offset to 0", async () => {
      await saveConversation(makeConv({ updatedAt: 1000 }));
      const result = await listConversations({ offset: -10, limit: 50 });
      if (Array.isArray(result)) throw new Error("expected envelope shape");
      expect(result.offset).toBe(0);
    });

    it("returns an empty page (not error) when offset >= total", async () => {
      await saveConversation(makeConv({ updatedAt: 1000 }));
      const result = await listConversations({ offset: 100, limit: 50 });
      if (Array.isArray(result)) throw new Error("expected envelope shape");
      expect(result.conversations).toHaveLength(0);
      expect(result.count).toBe(0);
      expect(result.truncated).toBe(false);
    });
  });

  describe("purgeProfileChatHistory", () => {
    it("rejects the default profile and traversal ids", async () => {
      await expect(purgeProfileChatHistory("default")).resolves.toMatchObject({
        ok: false,
      });
      await expect(purgeProfileChatHistory("../escape")).resolves.toMatchObject({
        ok: false,
      });
      await expect(purgeProfileChatHistory("")).resolves.toMatchObject({ ok: false });
    });

    it("removes the profile directory and is idempotent when absent", async () => {
      await saveConversation(makeConv({ id: "pre-existing", updatedAt: 1000 }), "work");
      const result = await purgeProfileChatHistory("work");
      expect(result.ok).toBe(true);
      expect(result.removed).toBe(true);
      const onceMore = await purgeProfileChatHistory("work");
      expect(onceMore.ok).toBe(true);
      expect(onceMore.removed).toBe(false);
    });

    it("never touches the default profile's historical chat history directory", async () => {
      await saveConversation(makeConv({ id: "default-keep", updatedAt: 1000 }));
      await saveConversation(makeConv({ id: "work-keep", updatedAt: 2000 }), "work");
      const defaultDir = getChatHistoryDir("default");
      const before = await fs.readdir(defaultDir).catch(() => []);
      await purgeProfileChatHistory("work");
      const after = await fs.readdir(defaultDir).catch(() => []);
      expect(after).toEqual(before);
    });

    it("keeps unrelated conversation files outside the target profile intact", async () => {
      await saveConversation(makeConv({ id: "default-keep", updatedAt: 1000 }));
      const profileDir = getChatHistoryDir("work");
      await fs.mkdir(profileDir, { recursive: true });
      await fs.writeFile(path.join(profileDir, "marker.txt"), "stay");

      // mkdtemp guarantees a unique non-symlink directory under os.tmpdir() so
      // the writeFile below cannot race with a malicious symlink in /tmp.
      const outside = await fs.mkdtemp(path.join(os.tmpdir(), "venice-forge-purge-outside-"));
      await fs.writeFile(path.join(outside, "preserve-me.txt"), "do not delete");

      const result = await purgeProfileChatHistory("work");
      expect(result.ok).toBe(true);

      const stillThere = await fs.readFile(path.join(outside, "preserve-me.txt"), "utf8");
      expect(stillThere).toBe("do not delete");
      const defaultFile = await fs.readFile(path.join(getChatHistoryDir("default"), "default-keep.json"), "utf8");
      expect(defaultFile).toContain("default-keep");
      await fs.rm(outside, { recursive: true, force: true });
    });
  });
});
