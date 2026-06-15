/** @fileoverview T-186 regression guard — lorebook persistence errors must not leak raw exception text into state or toast. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LorebookV1 } from "../types/rp";

const mocks = vi.hoisted(() => ({
  listLorebooks: vi.fn(),
  saveLorebook: vi.fn(),
  deleteLorebook: vi.fn(),
  generateId: vi.fn(),
  toastError: vi.fn(),
  normalizeLorebook: vi.fn((book: unknown) => book as LorebookV1),
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

describe("T-186 — lorebook persistence errors are surfaced safely", () => {
  beforeEach(() => {
    mocks.listLorebooks.mockReset();
    mocks.saveLorebook.mockReset();
    mocks.deleteLorebook.mockReset();
    mocks.generateId.mockReset().mockReturnValue("lb-new");
    mocks.toastError.mockReset();
    mocks.normalizeLorebook.mockReset().mockImplementation((book: unknown) => book as LorebookV1);
    resetStore();
  });

  it("load stores a generic error and toasts safely when persistence fails", async () => {
    mocks.listLorebooks.mockRejectedValue(new Error("ENOENT: /Users/super_user/.secret/path"));

    await useLorebookStore.getState().load();

    expect(useLorebookStore.getState().error).toBe("Could not load lorebooks.");
    expect(useLorebookStore.getState().hasLoaded).toBe(false);
    expect(useLorebookStore.getState().isLoading).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith("Could not load lorebooks", "Please try again.");
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("ENOENT"));
  });

  it("upsert stores a generic error and toasts safely when persistence fails", async () => {
    mocks.saveLorebook.mockRejectedValue(new Error("QuotaExceededError: sk-live-12345"));

    const result = await useLorebookStore.getState().upsert(baseBook());

    expect(result).toBeNull();
    expect(useLorebookStore.getState().error).toBe("Could not save lorebook.");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not save lorebook", "Please try again.");
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("QuotaExceeded"));
  });

  it("remove stores a generic error and toasts safely when persistence fails", async () => {
    mocks.deleteLorebook.mockRejectedValue(new Error("Internal error"));

    const result = await useLorebookStore.getState().remove("lb-1");

    expect(result).toBe(false);
    expect(useLorebookStore.getState().error).toBe("Could not delete lorebook.");
    expect(mocks.toastError).toHaveBeenCalledWith("Could not delete lorebook", "Please try again.");
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("Internal"));
  });

  it("still surfaces the storage-rejected toast when delete is rejected by the backend", async () => {
    mocks.deleteLorebook.mockResolvedValue(false);

    const result = await useLorebookStore.getState().remove("lb-1");

    expect(result).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith("Could not delete lorebook", "Storage rejected the request.");
  });

  it("upsert succeeds and clears any previous error", async () => {
    const saved = baseBook({ name: "Saved" });
    mocks.saveLorebook.mockResolvedValue(saved);
    useLorebookStore.setState({ error: "previous error" });

    const result = await useLorebookStore.getState().upsert(baseBook());

    expect(result).toEqual(saved);
    expect(useLorebookStore.getState().error).toBeNull();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
