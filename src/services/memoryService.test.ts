/** @fileoverview Unit tests for the memory service. */

import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  saveMemory,
  listMemories,
  deleteMemory,
  searchMemory,
  selectMemoriesForInjection,
  type Memory,
} from "./memoryService";
import StorageService from "./storageService";

// Mock StorageService to avoid IndexedDB in unit tests.
vi.mock("./storageService", () => ({
  default: {
    saveItem: vi.fn(),
    getItems: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

const mockSaveItem = vi.mocked(StorageService.saveItem);
const mockGetItems = vi.mocked(StorageService.getItems);
const mockDeleteItem = vi.mocked(StorageService.deleteItem);

describe("memoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a memory with tags and conversationId", async () => {
    mockSaveItem.mockResolvedValue({ id: "m1", timestamp: 1 } as unknown as Awaited<ReturnType<typeof StorageService.saveItem>>);
    const result = await saveMemory("Hello world", ["tag1", "tag2"], "conv-1");
    expect(result.content).toBe("Hello world");
    expect(result.tags).toEqual(["tag1", "tag2"]);
    expect(result.conversationId).toBe("conv-1");
    expect(mockSaveItem).toHaveBeenCalledOnce();
  });

  it("lists all memories newest-first", async () => {
    const memories: Memory[] = [
      { id: "a", content: "older", createdAt: 1000, tags: [] },
      { id: "b", content: "newer", createdAt: 2000, tags: [] },
    ];
    mockGetItems.mockResolvedValue(memories);
    const result = await listMemories();
    expect(result).toEqual(memories);
    expect(mockGetItems).toHaveBeenCalledWith("ai_memory");
  });

  it("deletes a memory by id", async () => {
    mockDeleteItem.mockResolvedValue(true);
    const result = await deleteMemory("m1");
    expect(result).toBe(true);
    expect(mockDeleteItem).toHaveBeenCalledWith("ai_memory", "m1");
  });

  it("searches memories by substring", async () => {
    const memories: Memory[] = [
      { id: "a", content: "React hooks", createdAt: 1, tags: ["react"] },
      { id: "b", content: "Vue refs", createdAt: 2, tags: ["vue"] },
    ];
    mockGetItems.mockResolvedValue(memories);
    const result = await searchMemory("react");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("a");
  });

  it("searches memories by tag filter", async () => {
    const memories: Memory[] = [
      { id: "a", content: "React hooks", createdAt: 1, tags: ["react"] },
      { id: "b", content: "Vue refs", createdAt: 2, tags: ["vue"] },
    ];
    mockGetItems.mockResolvedValue(memories);
    const result = await searchMemory("", "vue");
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("b");
  });

  it("selects memories for injection, preferring conversation-tagged ones", async () => {
    const memories: Memory[] = [
      { id: "a", content: "Global tip", createdAt: 3, tags: [] },
      { id: "b", content: "Conv tip", createdAt: 2, tags: [], conversationId: "conv-1" },
      { id: "c", content: "Another global", createdAt: 1, tags: [] },
    ];
    mockGetItems.mockResolvedValue(memories);
    const block = await selectMemoriesForInjection("conv-1");
    expect(block.text).toContain("Conv tip");
    expect(block.text.indexOf("Conv tip")).toBeLessThan(block.text.indexOf("Global tip"));
    expect(block.used).toBeGreaterThanOrEqual(2);
  });

  it("caps injected memory block to budget and reports truncation", async () => {
    const longContent = "x".repeat(3000);
    const memories: Memory[] = [
      { id: "a", content: longContent, createdAt: 1, tags: [] },
    ];
    mockGetItems.mockResolvedValue(memories);
    const block = await selectMemoriesForInjection();
    expect(block.text.length).toBeLessThanOrEqual(2000);
    expect(block.truncated).toBe(true);
  });

  it("returns empty block when no memories exist", async () => {
    mockGetItems.mockResolvedValue([]);
    const block = await selectMemoriesForInjection();
    expect(block.text).toBe("");
    expect(block.used).toBe(0);
    expect(block.truncated).toBe(false);
  });
});
