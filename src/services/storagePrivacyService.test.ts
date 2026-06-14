// VERIFY-053 regression guard: Storage & Privacy inventory includes the
// character image cache as a cache-category row with byte/count metadata.

import { describe, it, expect } from "vitest";
import { buildStorageInventory, buildSafePrivacySummary } from "./storagePrivacyService";
import { type StorageStoreInventoryItem } from "../types/storage-privacy";

describe("storagePrivacyService", () => {
  it("counts all major categories", () => {
    const inventory = buildStorageInventory({
      projects: [{ id: "p1" }, { id: "p2" }],
      prompts: [{ id: "pr1", title: "Prompt 1" }],
      media: [{ id: "m1", projectId: "p1" }],
    });

    const projectStore = inventory.stores.find((s: StorageStoreInventoryItem) => s.id === "projects");
    expect(projectStore?.count).toBe(2);

    const promptStore = inventory.stores.find((s: StorageStoreInventoryItem) => s.id === "prompts");
    expect(promptStore?.count).toBe(1);
    expect(promptStore?.unscopedCount).toBe(1);

    const mediaStore = inventory.stores.find((s: StorageStoreInventoryItem) => s.id === "media");
    expect(mediaStore?.scopedCount).toBe(1);
  });

  it("detects orphan project references", () => {
    const inventory = buildStorageInventory({
      projects: [{ id: "p1" }],
      prompts: [{ id: "pr1", projectId: "missing-project" }],
    });

    expect(inventory.issues).toHaveLength(1);
    expect(inventory.issues[0].message).toContain("refers to missing project");
  });

  it("safe summary excludes secrets", () => {
    const inventory = buildStorageInventory({
      settings: { veniceApiKey: "sk-secret" },
    });

    const summary = buildSafePrivacySummary(inventory);
    const apiKeysStore = summary.stores.find((s) => s.id === "api_keys");
    expect(apiKeysStore).toBeUndefined();
    expect(summary.exclusions).toContain("API Keys");
  });

  it("does not mutate input records", () => {
    const prompts = [{ id: "pr1", title: "Original" }];
    buildStorageInventory({ prompts });
    expect(prompts[0].title).toBe("Original");
  });

  it("surfaces the character image cache as a cache-category store", () => {
    const inventory = buildStorageInventory({
      characterImageCache: { count: 5, totalBytes: 2_097_152 },
    });
    const cacheStore = inventory.stores.find((s) => s.id === "character-image-cache");
    expect(cacheStore).toBeDefined();
    expect(cacheStore?.category).toBe("cache");
    expect(cacheStore?.count).toBe(5);
    expect(cacheStore?.containsSecrets).toBe(false);
    expect(cacheStore?.containsUserContent).toBe(false);
    expect(cacheStore?.summary).toContain("2.0 MiB");
  });
});
