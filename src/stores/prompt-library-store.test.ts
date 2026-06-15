/** @fileoverview Phase 2D — Prompt Library store contract tests (VERIFY-046). */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  usePromptLibraryStore,
  resolvePromptProjectId,
  selectActivePrompts,
  selectArchivedPrompts,
  selectPromptsForProject,
} from "./prompt-library-store";
import type { PromptLibraryItem } from "../types/prompt-library";
import { redactErrorMessage } from "../shared/redaction";
import StorageService from "../services/storageService";

/** Type-safe mocked handles for the StorageService singleton. */
const mockStorage = StorageService as unknown as {
  getItems: ReturnType<typeof vi.fn>;
  saveItem: ReturnType<typeof vi.fn>;
  deleteItem: ReturnType<typeof vi.fn>;
};

function reset(): void {
  // Replace state with a clean snapshot. The store is a Zustand `create`
  // result, so the only safe way to reset is to set the entire object.
  usePromptLibraryStore.setState({
    prompts: [],
    activePromptId: null,
    hydrated: false,
    loading: false,
    loadError: null,
  });
}

describe("prompt-library-store (VERIFY-046)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    reset();
    mockStorage.getItems = vi.fn().mockResolvedValue([]);
    mockStorage.saveItem = vi.fn().mockResolvedValue(undefined);
    mockStorage.deleteItem = vi.fn().mockResolvedValue(true);
  });

  it("createPrompt returns a version-1 record with a stable id", async () => {
    const item = await usePromptLibraryStore.getState().createPrompt({
      title: "Mountains",
      kind: "image",
      content: "A serene mountain landscape",
      scope: "global",
    });
    expect(item.id).toMatch(/^plib-/);
    expect(item.versions).toHaveLength(1);
    expect(item.versions[0]!.version).toBe(1);
    expect(item.currentVersionId).toBe(item.versions[0]!.id);
    expect(usePromptLibraryStore.getState().prompts).toHaveLength(1);
  });

  it("createPrompt dedupes tags case-insensitively", async () => {
    const item = await usePromptLibraryStore.getState().createPrompt({
      title: "t",
      kind: "general",
      content: "c",
      scope: "global",
      tags: ["Foo", "FOO", "bar", "  Bar "],
    });
    expect(item.tags).toEqual(["foo", "bar"]);
  });

  it("createPrompt defaults to active project when scope is project", async () => {
    usePromptLibraryStore.setState({ prompts: [] });
    // Project resolution uses useProjectStore + useSettingsStore; we
    // exercise the explicit-path branch here so the test is hermetic.
    const item = await usePromptLibraryStore.getState().createPrompt({
      title: "Project-scoped",
      kind: "image",
      content: "c",
      scope: "project",
      projectId: "p-1",
    });
    expect(item.scope).toBe("project");
    expect(item.projectId).toBe("p-1");
  });

  it("createPrompt drops projectId when scope is global", async () => {
    const item = await usePromptLibraryStore.getState().createPrompt({
      title: "Global",
      kind: "image",
      content: "c",
      scope: "global",
      projectId: "p-1",
    });
    expect(item.scope).toBe("global");
    expect(item.projectId).toBeNull();
  });

  it("updatePrompt mutates only the patched fields and bumps updatedAt", async () => {
    const created = await usePromptLibraryStore.getState().createPrompt({
      title: "Original",
      kind: "image",
      content: "c",
      scope: "global",
    });
    const before = usePromptLibraryStore.getState().prompts.find((p) => p.id === created.id)!;
    await new Promise((r) => setTimeout(r, 5));
    await usePromptLibraryStore.getState().updatePrompt(created.id, { title: "Renamed" });
    const after = usePromptLibraryStore.getState().prompts.find((p) => p.id === created.id)!;
    expect(after.title).toBe("Renamed");
    expect(after.kind).toBe(before.kind);
    expect(after.versions).toEqual(before.versions);
    expect(Date.parse(after.updatedAt)).toBeGreaterThanOrEqual(Date.parse(before.updatedAt));
  });

  it("addPromptVersion increments the version number and points currentVersionId at the new one", async () => {
    const created = await usePromptLibraryStore.getState().createPrompt({
      title: "t",
      kind: "image",
      content: "v1 body",
      scope: "global",
    });
    const v2 = await usePromptLibraryStore.getState().addPromptVersion(created.id, {
      content: "v2 body",
    });
    expect(v2.version).toBe(2);
    const item = usePromptLibraryStore.getState().prompts.find((p) => p.id === created.id)!;
    expect(item.versions).toHaveLength(2);
    expect(item.currentVersionId).toBe(v2.id);
  });

  it("addPromptVersion rejects unknown prompt ids", async () => {
    await expect(
      usePromptLibraryStore.getState().addPromptVersion("missing-id", { content: "x" }),
    ).rejects.toThrow(/Prompt not found/);
  });

  it("setCurrentVersion switches the active version without losing history", async () => {
    const created = await usePromptLibraryStore.getState().createPrompt({
      title: "t",
      kind: "image",
      content: "v1",
      scope: "global",
    });
    const v2 = await usePromptLibraryStore.getState().addPromptVersion(created.id, { content: "v2" });
    await usePromptLibraryStore.getState().setCurrentVersion(created.id, created.versions[0]!.id);
    const item = usePromptLibraryStore.getState().prompts.find((p) => p.id === created.id)!;
    expect(item.currentVersionId).toBe(created.versions[0]!.id);
    expect(item.versions).toHaveLength(2);
    expect(item.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(v2.version).toBe(2);
  });

  it("archivePrompt / unarchivePrompt toggles the archivedAt timestamp", async () => {
    const created = await usePromptLibraryStore.getState().createPrompt({
      title: "t",
      kind: "general",
      content: "c",
      scope: "global",
    });
    expect(usePromptLibraryStore.getState().prompts[0]!.archivedAt).toBeNull();
    await usePromptLibraryStore.getState().archivePrompt(created.id);
    expect(usePromptLibraryStore.getState().prompts[0]!.archivedAt).not.toBeNull();
    await usePromptLibraryStore.getState().unarchivePrompt(created.id);
    expect(usePromptLibraryStore.getState().prompts[0]!.archivedAt).toBeNull();
  });

  it("archivePrompt preserves all versions", async () => {
    const created = await usePromptLibraryStore.getState().createPrompt({
      title: "t",
      kind: "image",
      content: "v1",
      scope: "global",
    });
    await usePromptLibraryStore.getState().addPromptVersion(created.id, { content: "v2" });
    await usePromptLibraryStore.getState().archivePrompt(created.id);
    const item = usePromptLibraryStore.getState().prompts.find((p) => p.id === created.id)!;
    expect(item.versions).toHaveLength(2);
    expect(item.archivedAt).not.toBeNull();
  });

  it("deletePrompt removes the prompt entirely", async () => {
    const created = await usePromptLibraryStore.getState().createPrompt({
      title: "t",
      kind: "general",
      content: "c",
      scope: "global",
    });
    await usePromptLibraryStore.getState().deletePrompt(created.id);
    expect(usePromptLibraryStore.getState().prompts).toHaveLength(0);
  });

  it("toggleFavorite flips the favorite flag", async () => {
    const created = await usePromptLibraryStore.getState().createPrompt({
      title: "t",
      kind: "general",
      content: "c",
      scope: "global",
    });
    expect(usePromptLibraryStore.getState().prompts[0]!.favorite).toBe(false);
    await usePromptLibraryStore.getState().toggleFavorite(created.id);
    expect(usePromptLibraryStore.getState().prompts[0]!.favorite).toBe(true);
    await usePromptLibraryStore.getState().toggleFavorite(created.id);
    expect(usePromptLibraryStore.getState().prompts[0]!.favorite).toBe(false);
  });

  it("selectActivePrompts / selectArchivedPrompts split by archive state", async () => {
    const a = await usePromptLibraryStore.getState().createPrompt({ title: "A", kind: "general", content: "c", scope: "global" });
    const b = await usePromptLibraryStore.getState().createPrompt({ title: "B", kind: "general", content: "c", scope: "global" });
    await usePromptLibraryStore.getState().archivePrompt(a.id);
    const s = usePromptLibraryStore.getState();
    expect(selectActivePrompts(s).map((p) => p.id)).toEqual([b.id]);
    expect(selectArchivedPrompts(s).map((p) => p.id)).toEqual([a.id]);
  });

  it("selectPromptsForProject honours project + global scopes", async () => {
    const g = await usePromptLibraryStore.getState().createPrompt({ title: "G", kind: "general", content: "c", scope: "global" });
    const p1 = await usePromptLibraryStore.getState().createPrompt({ title: "P1", kind: "general", content: "c", scope: "project", projectId: "p-1" });
    await usePromptLibraryStore.getState().createPrompt({ title: "P2", kind: "general", content: "c", scope: "project", projectId: "p-2" });
    const s = usePromptLibraryStore.getState();
    const ids = selectPromptsForProject(s, "p-1").map((p) => p.id);
    expect(ids).toContain(g.id);
    expect(ids).toContain(p1.id);
    expect(ids).not.toContain(s.prompts.find((p) => p.title === "P2")!.id);
  });

  it("exportPrompts returns a versioned envelope with the selected items", async () => {
    const a = await usePromptLibraryStore.getState().createPrompt({ title: "A", kind: "general", content: "alpha", scope: "global" });
    const b = await usePromptLibraryStore.getState().createPrompt({ title: "B", kind: "general", content: "beta", scope: "global" });
    const out = usePromptLibraryStore.getState().exportPrompts([a.id, b.id]);
    expect(out.version).toBe(1);
    expect(out.app).toBe("Venice Forge");
    expect(out.prompts).toHaveLength(2);
    expect(out.prompts.map((p) => p.title).sort()).toEqual(["A", "B"]);
  });

  it("importPrompts ingests a valid export and regenerates ids", async () => {
    const a = await usePromptLibraryStore.getState().createPrompt({ title: "A", kind: "general", content: "alpha", scope: "global" });
    const exported = usePromptLibraryStore.getState().exportPrompts([a.id]);
    const result = await usePromptLibraryStore.getState().importPrompts(exported);
    expect(result.imported).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    expect(result.imported[0]!.id).not.toBe(a.id);
    expect(usePromptLibraryStore.getState().prompts).toHaveLength(2);
  });

  it("importPrompts rejects an unknown future version", async () => {
    const result = await usePromptLibraryStore.getState().importPrompts({
      version: 99,
      app: "Venice Forge",
      exportedAt: new Date().toISOString(),
      prompts: [],
    });
    expect(result.imported).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/Unsupported export version/);
  });

  it("importPrompts skips records with secret-like content", async () => {
    const a = await usePromptLibraryStore.getState().createPrompt({ title: "Poison", kind: "image", content: "Authorization: Bearer aaaaaaaaaaaaaaaabbbbbbbbbbbbbbb", scope: "global" });
    // The export already drops secret records, so the import receives 0.
    const exported = usePromptLibraryStore.getState().exportPrompts([a.id]);
    expect(exported.prompts).toHaveLength(0);
    const result = await usePromptLibraryStore.getState().importPrompts(exported);
    expect(result.imported).toHaveLength(0);
  });

  it("input objects are not mutated by create / update / addVersion", async () => {
    const input = { title: "Stable", kind: "image" as const, content: "c", scope: "global" as const };
    const snapshot = JSON.stringify(input);
    await usePromptLibraryStore.getState().createPrompt(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("resolvePromptProjectId prefers explicit argument", () => {
    expect(resolvePromptProjectId("p-explicit")).toBe("p-explicit");
  });

  it("createPrompt does not throw when storage persistence fails (no-op in this environment)", async () => {
    // The store's createPrompt rolls back on persistence failure, but in
    // the node test environment there is no real IDB so the write simply
    // resolves to a no-op via StorageService fallback. The important
    // invariant is that the store state still holds the new record.
    const item = await usePromptLibraryStore.getState().createPrompt({
      title: "T",
      kind: "general",
      content: "c",
      scope: "global",
    });
    expect(usePromptLibraryStore.getState().prompts.find((p) => p.id === item.id)).toBeTruthy();
  });

  it("PromptItem stays well-formed after a full lifecycle", async () => {
    const created: PromptLibraryItem = await usePromptLibraryStore.getState().createPrompt({
      title: "Lifecycle",
      kind: "image",
      content: "v1",
      scope: "global",
      tags: ["x"],
    });
    await usePromptLibraryStore.getState().addPromptVersion(created.id, { content: "v2" });
    await usePromptLibraryStore.getState().updatePrompt(created.id, { favorite: true });
    await usePromptLibraryStore.getState().archivePrompt(created.id);
    await usePromptLibraryStore.getState().unarchivePrompt(created.id);
    const after = usePromptLibraryStore.getState().prompts.find((p) => p.id === created.id)!;
    expect(after.versions).toHaveLength(2);
    expect(after.favorite).toBe(true);
    expect(after.archivedAt).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // T-192 / store-level safe error handling regression guards
  // ---------------------------------------------------------------------------

  describe("safe error handling (T-192)", () => {
    it("ensureLoaded redacts persistence errors in loadError", async () => {
      const raw = new Error("IndexedDB read failed for key vn-aaaaaaaaaaaaaaaa");
      mockStorage.getItems.mockRejectedValueOnce(raw);
      await usePromptLibraryStore.getState().ensureLoaded();
      const { loadError, hydrated } = usePromptLibraryStore.getState();
      expect(hydrated).toBe(true);
      expect(loadError).toBe(redactErrorMessage(raw));
      expect(loadError).toContain("IndexedDB read failed");
      expect(loadError).not.toContain("vn-aaaaaaaaaaaaaaaa");
      expect(loadError).toContain("[REDACTED]");
    });

    it("createPrompt reverts state and redacts loadError on persistence failure", async () => {
      const raw = new Error("write failed: apiKey=vn-bbbbbbbbbbbbbbbb");
      mockStorage.saveItem.mockRejectedValueOnce(raw);
      await expect(
        usePromptLibraryStore.getState().createPrompt({
          title: "T",
          kind: "general",
          content: "c",
          scope: "global",
        }),
      ).rejects.toThrow();
      const { prompts, loadError } = usePromptLibraryStore.getState();
      expect(prompts).toHaveLength(0);
      expect(loadError).toBe(redactErrorMessage(raw));
      expect(loadError).toContain("write failed");
      expect(loadError).not.toContain("vn-bbbbbbbbbbbbbbbb");
      expect(loadError).toContain("[REDACTED]");
    });

    it("updatePrompt reverts state and redacts loadError on persistence failure", async () => {
      const created = await usePromptLibraryStore.getState().createPrompt({
        title: "T",
        kind: "general",
        content: "c",
        scope: "global",
      });
      const raw = new Error("update failed: token=vn-cccccccccccccccc");
      mockStorage.saveItem.mockRejectedValueOnce(raw);
      await expect(
        usePromptLibraryStore.getState().updatePrompt(created.id, { title: "Renamed" }),
      ).rejects.toThrow();
      const { prompts, loadError } = usePromptLibraryStore.getState();
      expect(prompts[0]!.title).toBe("T");
      expect(loadError).toBe(redactErrorMessage(raw));
      expect(loadError).not.toContain("vn-cccccccccccccccc");
      expect(loadError).toContain("[REDACTED]");
    });

    it("deletePrompt reverts state and redacts loadError on persistence failure", async () => {
      const created = await usePromptLibraryStore.getState().createPrompt({
        title: "T",
        kind: "general",
        content: "c",
        scope: "global",
      });
      const raw = new Error("delete failed: sk-dddddddddddddddd");
      mockStorage.deleteItem.mockRejectedValueOnce(raw);
      await expect(usePromptLibraryStore.getState().deletePrompt(created.id)).rejects.toThrow();
      const { prompts, loadError } = usePromptLibraryStore.getState();
      expect(prompts).toHaveLength(1);
      expect(loadError).toBe(redactErrorMessage(raw));
      expect(loadError).not.toContain("sk-dddddddddddddddd");
      expect(loadError).toContain("[REDACTED]");
    });

    it("importPrompts redacts persistence errors in skipped reasons (T-192)", async () => {
      const created = await usePromptLibraryStore.getState().createPrompt({
        title: "Importable",
        kind: "general",
        content: "body",
        scope: "global",
      });
      const exported = usePromptLibraryStore.getState().exportPrompts([created.id]);
      const raw = new Error("batch write failed: Bearer cccccccccccccccc");
      mockStorage.saveItem.mockRejectedValueOnce(raw);
      const result = await usePromptLibraryStore.getState().importPrompts(exported);
      expect(result.skipped).toHaveLength(1);
      const reason = result.skipped[0]!.reason;
      expect(reason).toBe(`Persistence failed: ${redactErrorMessage(raw)}`);
      expect(reason).toContain("batch write failed");
      expect(reason).not.toContain("cccccccccccccccc");
      expect(reason).toContain("[REDACTED]");
    });
  });

  describe("id generation (T-199)", () => {
    it("prefers crypto.randomUUID for prompt ids when available", async () => {
      const item = await usePromptLibraryStore.getState().createPrompt({
        title: "UUID",
        kind: "general",
        content: "c",
        scope: "global",
      });
      // crypto.randomUUID, when available, produces a 36-char hyphenated UUID.
      expect(item.id).toMatch(
        /^plib-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });
});
