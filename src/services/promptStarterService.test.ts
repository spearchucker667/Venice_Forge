/** @fileoverview Unit tests for promptStarterService. */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  getBalancedPromptStarters,
  clearRecentPromptStarters,
  fetchRemotePromptStarters,
  ENABLE_REMOTE_PROMPT_STARTERS,
  getPromptStartersForCategory,
} from "./promptStarterService";
import { PROMPT_STARTERS } from "../data/promptStarters";

describe("promptStarterService", () => {
  beforeEach(() => {
    clearRecentPromptStarters();
    // Ensure localStorage is clean
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns exactly 4 unique prompts by default", () => {
    const starters = getBalancedPromptStarters();
    expect(starters).toHaveLength(4);

    // Verify all returned starters are unique by ID
    const ids = starters.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(4);
  });

  it("includes the 4 original static prompts in the total pool", () => {
    const originalPrompts = [
      "Explain how RSA encryption works using a metaphor a 10-year-old could grasp.",
      "Draft a polite but firm email asking my landlord to fix the heating.",
      "Compare REST and GraphQL — when does each shine?",
      "Brainstorm five novel side-project ideas using LLMs and a Raspberry Pi.",
    ];

    for (const promptText of originalPrompts) {
      const found = PROMPT_STARTERS.find((p) => p.prompt === promptText);
      expect(found).toBeDefined();
    }
  });

  it("excludes recently shown IDs from the result set", () => {
    // 1st call gets 4 prompts
    const firstSet = getBalancedPromptStarters(4);
    const firstIds = firstSet.map((p) => p.id);

    // 2nd call should not contain any of the first set's IDs
    const secondSet = getBalancedPromptStarters(4);
    const secondIds = secondSet.map((p) => p.id);

    for (const id of firstIds) {
      expect(secondIds).not.toContain(id);
    }
  });

  it("balances categories so that distinct categories are preferred", () => {
    const starters = getBalancedPromptStarters(4);
    const categories = starters.map((s) => s.category);
    const uniqueCategories = new Set(categories);

    // With 7 total categories and 12 prompts in each, a balanced selection of 4 prompts
    // should ideally result in 4 distinct categories.
    expect(uniqueCategories.size).toBe(4);
  });

  it("falls back to the full pool if the remaining pool is smaller than the requested count", () => {
    // Generate almost all prompts to deplete the pool
    // Total count is 84 prompts.
    // Call getBalancedPromptStarters repeatedly to accumulate recent IDs.
    // Since we track up to 32 recent IDs, the pool (84 - 32 = 52) will not actually empty out.
    // But if we mock getRecentIds or manipulate localStorage directly to simulate 82 recent IDs:
    const recentKey = "venice-forge.recentPromptStarterIds";
    const almostAllIds = PROMPT_STARTERS.filter((p) =>
      ["writing", "coding", "learning", "research", "creative", "productivity", "analysis"].includes(p.category)
    ).slice(0, 82).map((p) => p.id);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(recentKey, JSON.stringify(almostAllIds));
    }

    // Now, with only 2 items left in the unused pool, getBalancedPromptStarters(4) should fall back to the full pool
    // and successfully return 4 items instead of failing or returning only 2.
    const starters = getBalancedPromptStarters(4);
    expect(starters).toHaveLength(4);
  });

  it("handles remote fetch failure gracefully and falls back to local data", async () => {
    // Even if remote starters fetch fails (or is disabled), fetchRemotePromptStarters shouldn't throw.
    await expect(fetchRemotePromptStarters()).resolves.not.toThrow();

    // Verify ENABLE_REMOTE_PROMPT_STARTERS is false by default
    expect(ENABLE_REMOTE_PROMPT_STARTERS).toBe(false);
  });

  it("getPromptStartersForCategory returns correct count and unique prompts per category", () => {
    // Image category — 20 starters available
    const imagePrompts = getPromptStartersForCategory("image", 4);
    expect(imagePrompts).toHaveLength(4);
    // All returned prompts should be unique strings
    expect(new Set(imagePrompts).size).toBe(4);

    // Audio category — 15 starters available
    const audioPrompts = getPromptStartersForCategory("audio", 3);
    expect(audioPrompts).toHaveLength(3);
    expect(new Set(audioPrompts).size).toBe(3);

    // Music category — 15 starters available
    const musicPrompts = getPromptStartersForCategory("music", 4);
    expect(musicPrompts).toHaveLength(4);
    expect(new Set(musicPrompts).size).toBe(4);

    // Embeddings category — 15 starters available
    const embeddingsPrompts = getPromptStartersForCategory("embeddings", 3);
    expect(embeddingsPrompts).toHaveLength(3);
    expect(new Set(embeddingsPrompts).size).toBe(3);

    // Category boundaries: prompts from 'image' should not appear in 'audio'
    const imageSet = new Set(imagePrompts);
    for (const p of audioPrompts) {
      expect(imageSet.has(p)).toBe(false);
    }
  });
});
