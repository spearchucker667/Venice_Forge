/** @fileoverview T-187 regression guard — scenario persistence errors must not leak raw exception text into state or toast. */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScenarioV1 } from "../types/rp";

const mocks = vi.hoisted(() => ({
  listScenarios: vi.fn(),
  saveScenario: vi.fn(),
  deleteScenario: vi.fn(),
  generateId: vi.fn(),
  toastError: vi.fn(),
  normalizeScenario: vi.fn((s: unknown) => s as ScenarioV1),
}));

vi.mock("../services/rp/scenarioService", () => ({
  listScenarios: mocks.listScenarios,
  saveScenario: mocks.saveScenario,
  deleteScenario: mocks.deleteScenario,
  generateId: mocks.generateId,
  normalizeScenario: mocks.normalizeScenario,
}));

vi.mock("./toast-store", () => ({
  toast: { error: mocks.toastError },
}));

import { useScenarioStore } from "./scenario-store";

function baseScenario(overrides: Partial<ScenarioV1> = {}): ScenarioV1 {
  const now = Date.now();
  return {
    schema: "ScenarioV1",
    id: "s_test_001",
    scope: "global",
    name: "Test scenario",
    description: "desc",
    content: "content body",
    tags: ["test"],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function resetStore(): void {
  useScenarioStore.setState({
    scenarios: [],
    isLoading: false,
    hasLoaded: false,
    error: null,
    activeScenarioId: null,
    searchQuery: "",
  });
}

describe("T-187 — scenario persistence errors are surfaced safely", () => {
  beforeEach(() => {
    mocks.listScenarios.mockReset();
    mocks.saveScenario.mockReset();
    mocks.deleteScenario.mockReset();
    mocks.generateId.mockReset().mockReturnValue("s-new");
    mocks.toastError.mockReset();
    mocks.normalizeScenario.mockReset().mockImplementation((s: unknown) => s as ScenarioV1);
    resetStore();
  });

  it("load stores a redacted error and toasts safely when persistence fails", async () => {
    mocks.listScenarios.mockRejectedValue(
      new Error("ENOENT: /Users/super_user/.secret/path with sk-live-12345"),
    );

    await useScenarioStore.getState().load();

    expect(useScenarioStore.getState().hasLoaded).toBe(false);
    expect(useScenarioStore.getState().isLoading).toBe(false);
    const error = useScenarioStore.getState().error;
    expect(error).not.toContain("/Users/super_user/.secret/path");
    expect(error).not.toContain("sk-live-12345");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Could not load scenarios",
      "Please try again.",
    );
    expect(mocks.toastError).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("ENOENT"),
    );
  });

  it("upsert stores a redacted error and toasts safely when persistence fails", async () => {
    mocks.saveScenario.mockRejectedValue(
      new Error("QuotaExceededError: vn-abcd1234efgh5678"),
    );

    const result = await useScenarioStore.getState().upsert(baseScenario());

    expect(result).toBeNull();
    const error = useScenarioStore.getState().error;
    expect(error).not.toContain("vn-abcd1234efgh5678");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Could not save scenario",
      "Please try again.",
    );
    expect(mocks.toastError).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("QuotaExceeded"),
    );
  });

  it("remove stores a redacted error and toasts safely when persistence fails", async () => {
    mocks.deleteScenario.mockRejectedValue(
      new Error("Internal error: Bearer token=abc123"),
    );

    const result = await useScenarioStore.getState().remove("s_test_001");

    expect(result).toBe(false);
    const error = useScenarioStore.getState().error;
    expect(error).not.toContain("Bearer token=abc123");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Could not delete scenario",
      "Please try again.",
    );
    expect(mocks.toastError).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Internal error"),
    );
  });

  it("still surfaces the storage-rejected toast when delete is rejected by the backend", async () => {
    mocks.deleteScenario.mockResolvedValue(false);

    const result = await useScenarioStore.getState().remove("s_test_001");

    expect(result).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Could not delete scenario",
      "Storage rejected the request.",
    );
  });

  it("upsert succeeds and clears any previous error", async () => {
    const saved = baseScenario({ name: "Saved" });
    mocks.saveScenario.mockResolvedValue(saved);
    useScenarioStore.setState({ error: "previous error" });

    const result = await useScenarioStore.getState().upsert(baseScenario());

    expect(result).toEqual(saved);
    expect(useScenarioStore.getState().error).toBeNull();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
