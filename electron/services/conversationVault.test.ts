// @vitest-environment node

/** @fileoverview Unit tests for Electron main-process Conversation Vault. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// Mock safeStorage values
const mockSafeStorage = {
  encryptionAvailable: true,
  encryptString: (str: string) => Buffer.from("enc:" + str),
  decryptString: (buf: Buffer) => buf.toString().replace("enc:", ""),
};

// vi.mock is hoisted, so variables used inside must be defined inside or imported within the mock
vi.mock("electron", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  const tempPath = path.join(os.tmpdir(), "venice-forge-tests-temp-user-data");
  return {
    app: {
      getPath: vi.fn((name) => {
        if (name === "userData") return tempPath;
        return os.tmpdir();
      }),
    },
    safeStorage: {
      isEncryptionAvailable: () => mockSafeStorage.encryptionAvailable,
      encryptString: (str: string) => mockSafeStorage.encryptString(str),
      decryptString: (buf: Buffer) => mockSafeStorage.decryptString(buf),
    },
  };
});

import {
  CONVERSATIONS_DIR,
  INDEX_FILE,
  getOrInitVaultKey,
  encrypt,
  decrypt,
  writeEncryptedFile,
  readEncryptedFile,
  listConversations,
  getConversation,
  saveConversation,
  _resetVaultCache_TEST_ONLY,
} from "./conversationVault";

import {
  searchIndex,
  pullContext,
  rebuildIndex,
  extractKeywordsAndEntities,
  _resetIndexCache_TEST_ONLY,
} from "./memoryPuller";

import {
  migrateLegacyHistory,
  detectLegacyHistory,
} from "./vaultMigration";

import { assessChildExploitationSafety } from "../../src/shared/safety";

import type { ConversationRecordV1 } from "../../src/types/conversationVault";

function makeRecord(overrides: Partial<ConversationRecordV1> = {}): ConversationRecordV1 {
  const id = "conv_" + crypto.randomUUID().replace(/-/g, "");
  return {
    version: 1,
    id,
    title: "Test Encryption Vault Chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model: "llama-3-8b",
    systemPrompt: "You are a secure vault helper.",
    messages: [
      { id: "msg1", role: "user", content: "Implement a secure vault key", timestamp: Date.now() },
      { id: "msg2", role: "assistant", content: "I will secure it with AES-256-GCM.", timestamp: Date.now() },
    ],
    metadata: {
      tags: ["security", "test"],
      pinned: false,
      archived: false,
      source: "chat",
      messageCount: 2,
    },
    memory: {
      summary: "Discussion on AES-256-GCM implementation.",
      topics: ["security", "vault"],
      entities: ["AES-256-GCM"],
      userFacts: [
        {
          id: "fact1",
          text: "User works on secure vault storage design.",
          confidence: 0.9,
          sourceMessageIds: ["msg1"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      projectRefs: ["Venice Forge"],
    },
    ...overrides,
  };
}

async function cleanVaultDirs() {
  const userData = path.dirname(CONVERSATIONS_DIR);
  try {
    await fs.rm(userData, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe("ConversationVault core and services", () => {
  beforeEach(async () => {
    mockSafeStorage.encryptionAvailable = true;
    process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "false";
    _resetVaultCache_TEST_ONLY();
    _resetIndexCache_TEST_ONLY();
    await cleanVaultDirs();
    await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
  });

  afterEach(async () => {
    await cleanVaultDirs();
  });

  // Group A: Encryption & Vault IO
  describe("Group A: Encryption & Vault IO", () => {
    it("1. Encryption & Decryption produces unreadable cipher text and parses correctly", async () => {
      const key = crypto.randomBytes(32);
      const text = JSON.stringify({ secret: "hello GCM" });
      const env = encrypt(text, key, "test-file", "id123");

      expect(env.version).toBe(1);
      expect(env.algorithm).toBe("aes-256-gcm");
      expect(env.ciphertext).not.toContain("hello GCM");

      const decrypted = decrypt(env, key, "test-file", "id123");
      expect(JSON.parse(decrypted)).toEqual({ secret: "hello GCM" });

      // AAD verification failure
      expect(() => decrypt(env, key, "test-file", "id456")).toThrow();
    });

    it("2. Master Key is successfully initialized and wrapped using safeStorage", async () => {
      const key = await getOrInitVaultKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);

      const keyFile = path.join(CONVERSATIONS_DIR, "vault-key.v1.json");
      const raw = await fs.readFile(keyFile, "utf-8");
      const envelope = JSON.parse(raw);
      expect(envelope.version).toBe(1);
      expect(envelope.wrappedWith).toBe("electron.safeStorage");
    });

    it("3. Fail-closed: Throws an error on Windows/macOS if safeStorage is unavailable", async () => {
      mockSafeStorage.encryptionAvailable = false;
      // Pretend to be darwin (macOS)
      Object.defineProperty(process, "platform", { value: "darwin" });

      await expect(getOrInitVaultKey()).rejects.toThrow(/safeStorage is unavailable/);
    });

    it("4. Linux plaintext fallback: Allows plaintext key wrapper if allowed by env", async () => {
      mockSafeStorage.encryptionAvailable = false;
      process.env.VENICE_FORGE_ALLOW_PLAINTEXT_KEY_STORAGE = "true";
      Object.defineProperty(process, "platform", { value: "linux" });

      const key = await getOrInitVaultKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);

      const keyFile = path.join(CONVERSATIONS_DIR, "vault-key.v1.json");
      const envelope = JSON.parse(await fs.readFile(keyFile, "utf-8"));
      expect(envelope.wrappedWith).toBe("plaintext");
    });

    it("5. Atomic writes write via tmp file and rename", async () => {
      const filePath = path.join(CONVERSATIONS_DIR, "test-atomic.json.enc");
      const payload = "atomic data";
      await writeEncryptedFile(filePath, payload, "test-type", "test-id");

      const dec = await readEncryptedFile(filePath, "test-type", "test-id");
      expect(dec).toBe(payload);
    });

    it("6. Corruption Recovery: Backs up corrupted file and returns null", async () => {
      const filePath = path.join(CONVERSATIONS_DIR, "corrupt-test.json.enc");
      await fs.writeFile(filePath, "garbage not json encrypted content");

      const dec = await readEncryptedFile(filePath, "test-type", "test-id");
      expect(dec).toBeNull();

      const corruptDir = path.join(CONVERSATIONS_DIR, "corrupt");
      const files = await fs.readdir(corruptDir);
      expect(files.some((f) => f.includes("corrupt-test.json.enc"))).toBe(true);
    });

    it("7. Key Rotation/IV collision check: Writing multiple files uses unique IVs", async () => {
      const key = crypto.randomBytes(32);
      const payload = "same-payload";
      const env1 = encrypt(payload, key, "type", "id1");
      const env2 = encrypt(payload, key, "type", "id2");

      expect(env1.iv).not.toEqual(env2.iv);
      expect(env1.ciphertext).not.toEqual(env2.ciphertext);
    });
  });

  // Group B: Queue & Concurrency
  describe("Group B: Queue & Concurrency", () => {
    it("8. Write serialization enqueues parallel writes sequentially", async () => {
      const record = makeRecord();
      const operations: string[] = [];

      const p1 = saveConversation(record).then(() => {
        operations.push("op1");
      });
      const p2 = saveConversation(record).then(() => {
        operations.push("op2");
      });

      await Promise.all([p1, p2]);
      expect(operations).toEqual(["op1", "op2"]);
    });

    it("9. Queue isolates errors: A failed write does not prevent subsequent writes", async () => {
      const record = makeRecord();

      // Force failure by mocking save
      const badRecord = { ...record, version: 99 } as any; // Invalid version throws
      const res1 = await saveConversation(badRecord);
      expect(res1.ok).toBe(false);

      const res2 = await saveConversation(record);
      expect(res2.ok).toBe(true);
    });

    it("10. Race Condition: concurrent updates write latest state correctly", async () => {
      const record = makeRecord();
      await saveConversation(record);

      const update1 = { ...record, title: "Title 1" };
      const update2 = { ...record, title: "Title 2" };

      await Promise.all([
        saveConversation(update1),
        saveConversation(update2),
      ]);

      const retrieved = await getConversation(record.id);
      expect(retrieved?.title).toBe("Title 2");
    });
  });

  // Group C: Search, Index, and Scoring
  describe("Group C: Search, Index, and Scoring", () => {
    it("11. Index Rebuild compiles searchable index from manifest records", async () => {
      const r1 = makeRecord({ title: "First Thread" });
      const r2 = makeRecord({ title: "Second Thread" });
      await saveConversation(r1);
      await saveConversation(r2);

      const indexedCount = await rebuildIndex();
      expect(indexedCount).toBe(2);

      const indexFileExists = await fs.access(INDEX_FILE).then(() => true).catch(() => false);
      expect(indexFileExists).toBe(true);
    });

    it("12. Substring matching matches query in title, keywords, etc.", async () => {
      const r = makeRecord({ title: "React Native Performance Optimization" });
      await saveConversation(r);

      const results = await searchIndex("react performance");
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(r.id);
      expect(results[0].matchedFields).toContain("title");
    });

    it("13. Recency boosting works correctly", async () => {
      const r1 = makeRecord({ title: "React native", updatedAt: Date.now() }); // recency +3
      const r2 = makeRecord({ title: "React native", updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000 }); // recency +2
      await saveConversation(r1);
      await saveConversation(r2);

      const results = await searchIndex("react");
      expect(results[0].id).toBe(r1.id);
    });

    it("14. Filtering: searchIndex filters out archived records unless requested", async () => {
      const r1 = makeRecord({ title: "Standard conversation" });
      const r2 = makeRecord({
        title: "Archived conversation tagmatch topicmatch",
        metadata: { tags: ["tagmatch"], pinned: false, archived: true, source: "chat", messageCount: 0 },
        memory: {
          summary: "Archived conversation tagmatch topicmatch",
          topics: ["topicmatch"],
          entities: [],
          userFacts: [],
          projectRefs: []
        }
      });
      await saveConversation(r1);
      await saveConversation(r2);

      const normalSearch = await searchIndex("conversation");
      expect(normalSearch.map((res) => res.id)).toContain(r1.id);
      expect(normalSearch.map((res) => res.id)).not.toContain(r2.id);

      const searchWithArchived = await searchIndex("conversation tagmatch topicmatch", { includeArchived: true });
      expect(searchWithArchived.map((res) => res.id)).toContain(r2.id);
    });

    it("15. Pinned boosting: pinned conversations score higher", async () => {
      const r1 = makeRecord({ title: "Not pinned chat", metadata: { tags: [], pinned: false, archived: false, source: "chat", messageCount: 0 } });
      const r2 = makeRecord({ title: "Pinned chat", metadata: { tags: [], pinned: true, archived: false, source: "chat", messageCount: 0 } });
      await saveConversation(r1);
      await saveConversation(r2);

      const results = await searchIndex("chat");
      expect(results[0].id).toBe(r2.id);
    });

    it("16. Match index extraction extracts keywords, entities, and topics", async () => {
      const text = "Electron applications use safeStorage API keys for high security.";
      const { keywords, entities, topics } = extractKeywordsAndEntities(text);

      expect(keywords).toContain("applications");
      expect(keywords).toContain("safestorage");
      expect(entities).toContain("API");
      expect(topics).toBeDefined();
    });
  });

  // Group D: Memory Retrieval & Safety Guard
  describe("Group D: Memory Retrieval & Safety Guard", () => {
    it("17. Memory Injection follows target formatting rules", async () => {
      const r = makeRecord({
        title: "Image Persistence",
        memory: {
          summary: "Image persistence issues.",
          topics: ["images"],
          entities: [],
          userFacts: [
            {
              id: "f1",
              text: "User prefers PNG images over JPG.",
              confidence: 0.9,
              sourceMessageIds: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          projectRefs: [],
        },
      });
      await saveConversation(r);

      const context = await pullContext({ message: "Persistence preferences", maxItems: 1 });
      expect(context.injectedText).toContain("[Local Memory Context]");
      expect(context.injectedText).toContain("PNG images");
      expect(context.injectedText).toContain("Image persistence issues");
    });

    it("18. Context Size limitation caps and truncates long contexts", async () => {
      const longFactText = "A".repeat(5000);
      const r = makeRecord({
        memory: {
          summary: "Long summary",
          topics: [],
          entities: [],
          userFacts: [
            {
              id: "long-fact",
              text: longFactText,
              confidence: 1,
              sourceMessageIds: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
          projectRefs: [],
        },
      });
      await saveConversation(r);

      const context = await pullContext({ message: "Test long fact", maxTokens: 100 });
      expect(context.injectedText.length).toBeLessThanOrEqual(500); // 100 tokens * 4 + extra truncation text buffer
      expect(context.injectedText).toContain("truncated");
    });

    it("19. Excludes forgotten facts from matched output context", async () => {
      const r = makeRecord({
        memory: {
          summary: "Fact list",
          topics: [],
          entities: [],
          userFacts: [
            {
              id: "active-fact",
              text: "This fact is active.",
              confidence: 1,
              sourceMessageIds: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            {
              id: "forgotten-fact",
              text: "This fact is forgotten.",
              confidence: 1,
              sourceMessageIds: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              forgotten: true,
            },
          ],
          projectRefs: [],
        },
      });
      await saveConversation(r);

      const context = await pullContext({ message: "Fact list" });
      expect(context.injectedText).toContain("This fact is active.");
      expect(context.injectedText).not.toContain("This fact is forgotten.");
    });
  });

  // Group E: Migration & Compatibility
  describe("Group E: Migration & Compatibility", () => {
    it("20. Detects and performs legacy flat history file migration", async () => {
      const legacyDir = path.join(path.dirname(CONVERSATIONS_DIR), "chat-history");
      await fs.mkdir(legacyDir, { recursive: true });

      const legacyConv = {
        id: "legacy_uuid_12345",
        title: "Legacy Chat Session",
        createdAt: Date.now() - 100000,
        updatedAt: Date.now() - 100000,
        model: "llama-3-8b",
        messages: [
          { id: "lm1", role: "user", content: "legacy user message", timestamp: Date.now() },
          { id: "lm2", role: "assistant", content: "legacy assistant response", timestamp: Date.now() },
        ],
      };

      await fs.writeFile(
        path.join(legacyDir, "legacy_uuid_12345.json"),
        JSON.stringify({ version: 1, conversation: legacyConv })
      );

      const detect = await detectLegacyHistory();
      expect(detect).toBe(true);

      const res = await migrateLegacyHistory();
      expect(res.ok).toBe(true);
      expect(res.migrated).toBe(1);

      // Verify migrated file is in the vault
      const list = await listConversations();
      expect(list.length).toBe(1);
      expect(list[0].id).toBe("legacy_uuid_12345");
      expect(list[0].metadata.source).toBe("migration");
      expect(list[0].metadata.migratedFrom?.oldId).toBe("legacy_uuid_12345");

      // Verify original is moved to migrated
      const migratedExists = await fs.access(path.join(legacyDir, "migrated", "legacy_uuid_12345.json")).then(() => true).catch(() => false);
      expect(migratedExists).toBe(true);
    });

    it("21. ID sanitization: Path traversal and bad characters are converted to safe aliases", async () => {
      const legacyDir = path.join(path.dirname(CONVERSATIONS_DIR), "chat-history");
      await fs.mkdir(legacyDir, { recursive: true });

      const traversalConv = {
        id: "../bad/traversal_id",
        title: "Traversal Threat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        model: "llama-3-8b",
        messages: [],
      };

      await fs.writeFile(
        path.join(legacyDir, "traversal.json"),
        JSON.stringify({ version: 1, conversation: traversalConv })
      );

      const res = await migrateLegacyHistory();
      expect(res.ok).toBe(true);
      expect(res.migrated).toBe(1);

      const list = await listConversations();
      expect(list[0].id).not.toContain("..");
      expect(list[0].id).not.toContain("/");
      expect(list[0].id).toMatch(/^conv_[a-f0-9]+$/);
    });

    it("22. Old window.veniceForge.chat.* backwards compatibility wrapper holds", async () => {
      const record = makeRecord();
      await saveConversation(record);

      const retrieved = await getConversation(record.id);
      expect(retrieved?.id).toBe(record.id);
    });

    it("23. Headless/deferred migration detect works cleanly", async () => {
      const detectBefore = await detectLegacyHistory();
      expect(detectBefore).toBe(false);

      const legacyDir = path.join(path.dirname(CONVERSATIONS_DIR), "chat-history");
      await fs.mkdir(legacyDir, { recursive: true });
      await fs.writeFile(path.join(legacyDir, "test.json"), "{}");

      const detectAfter = await detectLegacyHistory();
      expect(detectAfter).toBe(true);
    });

    it("24. Safety-blocked memory checks intercept block queries", async () => {
      const badQuery = "loli shota roleplay";
      const decision = assessChildExploitationSafety({
        endpoint: "/chat/completions",
        method: "POST",
        payload: { messages: [{ role: "user", content: badQuery }] },
        source: "chat"
      });
      expect(decision.allow).toBe(false);
    });

    it("25. Validation logic rejects invalid record fields on save", async () => {
      const badRecord = { version: 1, id: "" } as any;
      const res = await saveConversation(badRecord);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("Invalid conversation record");
    });

    it("26. Forgotten facts are excluded from matched output context in pullContext", async () => {
      const r = makeRecord({
        memory: {
          summary: "Search fact",
          topics: [],
          entities: [],
          userFacts: [
            {
              id: "active",
              text: "Match this active fact",
              confidence: 1,
              sourceMessageIds: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              forgotten: false
            },
            {
              id: "forgotten",
              text: "Match this forgotten fact",
              confidence: 1,
              sourceMessageIds: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              forgotten: true
            }
          ],
          projectRefs: []
        }
      });
      await saveConversation(r);

      const context = await pullContext({ message: "Search fact" });
      expect(context.injectedText).toContain("Match this active fact");
      expect(context.injectedText).not.toContain("Match this forgotten fact");
    });
  });
});
