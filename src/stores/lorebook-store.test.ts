/** @fileoverview Test suite for the local lorebook library state. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LorebookV1 } from "../types/rp";

const mocks = vi.hoisted(() => ({
  listLorebooks: vi.fn(),
  saveLorebook: vi.fn(),
  deleteLorebook: vi.fn(),
  generateId: vi.fn(),
  toastError: vi.fn(),
  normalizeLorebook: vi.fn((book: unknown) => book as LorebookV1 | null),
}));

vi.mock("../services/rp/lorebookRendererService", () => ({
  listLorebooks: mocks.listLorebooks,
  saveLorebook: mocks.saveLorebook,
  deleteLorebook: mocks.deleteLorebook,
  generateId: mocks.generateId,
  normalizeLorebook: mocks.normalizeLorebook,
}));

vi.mock("./toast-store", () => ({
  toast: { error: mocks.toastError },
}));

import { useLorebookStore } from "./lorebook-store";

function baseBook(overrides: Partial<LorebookV1> = {}): LorebookV1 {
  const now = Date.now();
  return {
    schema: "LorebookV1",
    id: "lb-1",
    name: "Test Book",
    description: "",
    tags: [],
    entries: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function resetStore(): void {
  useLorebookStore.setState({
    lorebooks: [],
    isLoading: false,
    hasLoaded: false,
    error: null,
    searchQuery: "",
    editingId: null,
  });
}

describe("Lorebook Store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listLorebooks.mockResolvedValue([]);
    mocks.generateId.mockReturnValue("lb-new");
    mocks.normalizeLorebook.mockImplementation((book: unknown) => book as LorebookV1);
    resetStore();
  });

  describe("load()", () => {
    it("fetches and sorts lorebooks successfully", async () => {
      const book1 = baseBook({ id: "lb-1", updatedAt: 100 });
      const book2 = baseBook({ id: "lb-2", updatedAt: 200 }); // newer
      mocks.listLorebooks.mockResolvedValue([book1, book2]);

      await useLorebookStore.getState().load();

      const state = useLorebookStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.hasLoaded).toBe(true);
      expect(state.error).toBeNull();
      // Should be sorted by updatedAt descending
      expect(state.lorebooks).toEqual([book2, book1]);
    });

    it("prevents concurrent loads", async () => {
      useLorebookStore.setState({ isLoading: true });
      await useLorebookStore.getState().load();
      expect(mocks.listLorebooks).not.toHaveBeenCalled();
    });

    it("handles load failure gracefully", async () => {
      mocks.listLorebooks.mockRejectedValue(new Error("ENOENT"));

      await useLorebookStore.getState().load();

      const state = useLorebookStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.hasLoaded).toBe(false);
      expect(state.error).toBe("Could not load lorebooks.");
      expect(mocks.toastError).toHaveBeenCalledWith("Could not load lorebooks", "Please try again.");
    });
  });

  describe("createBlank()", () => {
    it("creates a new blank lorebook, sets editingId, and prepends to lorebooks", () => {
      useLorebookStore.setState({
        lorebooks: [baseBook({ id: "lb-existing" })]
      });

      const newId = useLorebookStore.getState().createBlank();

      expect(newId).toBe("lb-new");
      const state = useLorebookStore.getState();
      expect(state.editingId).toBe("lb-new");
      expect(state.lorebooks).toHaveLength(2);
      expect(state.lorebooks[0].id).toBe("lb-new");
      expect(state.lorebooks[0].name).toBe("New Lorebook");
    });
  });

  describe("setSearchQuery() & setEditing()", () => {
    it("updates searchQuery", () => {
      useLorebookStore.getState().setSearchQuery("hello");
      expect(useLorebookStore.getState().searchQuery).toBe("hello");
    });

    it("updates editingId", () => {
      useLorebookStore.getState().setEditing("lb-edit");
      expect(useLorebookStore.getState().editingId).toBe("lb-edit");
    });
  });

  describe("upsert()", () => {
    it("rejects invalid lorebook data", async () => {
      mocks.normalizeLorebook.mockReturnValue(null);

      const result = await useLorebookStore.getState().upsert({} as LorebookV1);

      expect(result).toBeNull();
      const state = useLorebookStore.getState();
      expect(state.error).toBe("Invalid lorebook data.");
      expect(mocks.toastError).toHaveBeenCalledWith("Could not save lorebook", "Invalid lorebook data.");
      expect(mocks.saveLorebook).not.toHaveBeenCalled();
    });

    it("saves a new lorebook successfully and sorts list", async () => {
      const existing = baseBook({ id: "lb-existing", updatedAt: 100 });
      useLorebookStore.setState({ lorebooks: [existing] });

      const saved = baseBook({ id: "lb-new", updatedAt: 200 }); // newer
      mocks.saveLorebook.mockResolvedValue(saved);

      const result = await useLorebookStore.getState().upsert(saved);

      expect(result).toEqual(saved);
      const state = useLorebookStore.getState();
      expect(state.error).toBeNull();
      expect(state.editingId).toBe("lb-new");
      expect(state.lorebooks).toEqual([saved, existing]); // sorted properly
    });

    it("updates an existing lorebook successfully and sorts list", async () => {
      const book1 = baseBook({ id: "lb-1", updatedAt: 100 });
      const book2 = baseBook({ id: "lb-2", updatedAt: 200 });
      useLorebookStore.setState({ lorebooks: [book1, book2] });

      // Update book1 to be the newest
      const updatedBook1 = { ...book1, updatedAt: 300 };
      mocks.saveLorebook.mockResolvedValue(updatedBook1);

      const result = await useLorebookStore.getState().upsert(updatedBook1);

      expect(result).toEqual(updatedBook1);
      const state = useLorebookStore.getState();
      // Should replace the item and sort, so book1 comes first
      expect(state.lorebooks).toEqual([updatedBook1, book2]);
      expect(state.editingId).toBe("lb-1");
    });

    it("handles save failure gracefully", async () => {
      mocks.saveLorebook.mockRejectedValue(new Error("Storage limit"));

      const result = await useLorebookStore.getState().upsert(baseBook());

      expect(result).toBeNull();
      const state = useLorebookStore.getState();
      expect(state.error).toBe("Could not save lorebook.");
      expect(mocks.toastError).toHaveBeenCalledWith("Could not save lorebook", "Please try again.");
    });
  });

  describe("remove()", () => {
    it("deletes successfully and removes from store", async () => {
      const book1 = baseBook({ id: "lb-1" });
      const book2 = baseBook({ id: "lb-2" });
      useLorebookStore.setState({ lorebooks: [book1, book2], editingId: "lb-1" });

      mocks.deleteLorebook.mockResolvedValue(true);

      const result = await useLorebookStore.getState().remove("lb-1");

      expect(result).toBe(true);
      const state = useLorebookStore.getState();
      expect(state.lorebooks).toEqual([book2]);
      expect(state.editingId).toBeNull(); // editingId matches deleted id, so nullified
    });

    it("deletes successfully but keeps editingId if it does not match", async () => {
      const book1 = baseBook({ id: "lb-1" });
      const book2 = baseBook({ id: "lb-2" });
      useLorebookStore.setState({ lorebooks: [book1, book2], editingId: "lb-2" });

      mocks.deleteLorebook.mockResolvedValue(true);

      const result = await useLorebookStore.getState().remove("lb-1");

      expect(result).toBe(true);
      const state = useLorebookStore.getState();
      expect(state.lorebooks).toEqual([book2]);
      expect(state.editingId).toBe("lb-2"); // unchanged
    });

    it("handles rejection from backend gracefully", async () => {
      useLorebookStore.setState({ lorebooks: [baseBook({ id: "lb-1" })] });
      mocks.deleteLorebook.mockResolvedValue(false);

      const result = await useLorebookStore.getState().remove("lb-1");

      expect(result).toBe(false);
      const state = useLorebookStore.getState();
      expect(state.lorebooks).toHaveLength(1); // not removed
      expect(mocks.toastError).toHaveBeenCalledWith("Could not delete lorebook", "Storage rejected the request.");
    });

    it("handles delete exception gracefully", async () => {
      mocks.deleteLorebook.mockRejectedValue(new Error("Internal"));

      const result = await useLorebookStore.getState().remove("lb-1");

      expect(result).toBe(false);
      expect(useLorebookStore.getState().error).toBe("Could not delete lorebook.");
      expect(mocks.toastError).toHaveBeenCalledWith("Could not delete lorebook", "Please try again.");
    });
  });

  describe("getById()", () => {
    it("finds existing book", () => {
      const book = baseBook({ id: "lb-1" });
      useLorebookStore.setState({ lorebooks: [book] });

      expect(useLorebookStore.getState().getById("lb-1")).toEqual(book);
    });

    it("returns undefined for non-existent book", () => {
      useLorebookStore.setState({ lorebooks: [] });

      expect(useLorebookStore.getState().getById("lb-1")).toBeUndefined();
    });
  });
});
