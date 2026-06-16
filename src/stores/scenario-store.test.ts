/** @fileoverview Phase 2F — RP Studio scenario store contract tests. */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { useScenarioStore } from "./scenario-store";
import type { ScenarioV1 } from "../types/rp";
import * as scenarioService from "../services/rp/scenarioService";

vi.mock("../services/rp/scenarioService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/rp/scenarioService")>();
  return {
    ...actual,
    listScenarios: vi.fn(actual.listScenarios),
    saveScenario: vi.fn(actual.saveScenario),
    deleteScenario: vi.fn(actual.deleteScenario),
  };
});

function reset(): void {
  useScenarioStore.setState({
    scenarios: [],
    isLoading: false,
    hasLoaded: false,
    error: null,
    activeScenarioId: null,
    searchQuery: "",
  });
  vi.clearAllMocks();
}

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

describe("scenario-store", () => {
  beforeEach(() => {
    reset();
  });

  it("createBlank returns a stable id and inserts into the list", () => {
    const id = useScenarioStore.getState().createBlank();
    expect(id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
    expect(useScenarioStore.getState().scenarios).toHaveLength(1);
    expect(useScenarioStore.getState().scenarios[0]!.name).toBe("New scenario");
    expect(useScenarioStore.getState().activeScenarioId).toBe(id);
  });

  it("createBlank applies overrides except id/schema/updatedAt", () => {
    const id = useScenarioStore.getState().createBlank({
      name: "Custom",
      scope: "project",
      projectId: "p-1",
      characterId: "c-1",
      sceneId: "scene-1",
      firstUserMessage: "hello",
    });
    const item = useScenarioStore.getState().getById(id);
    expect(item?.name).toBe("Custom");
    expect(item?.scope).toBe("project");
    expect(item?.projectId).toBe("p-1");
    expect(item?.characterId).toBe("c-1");
    expect(item?.sceneId).toBe("scene-1");
    expect(item?.firstUserMessage).toBe("hello");
  });

  it("upsert inserts a new scenario and assigns it to the list head", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    expect(saved).not.toBeNull();
    expect(useScenarioStore.getState().scenarios[0]!.id).toBe("s_test_001");
  });

  it("upsert replaces an existing scenario by id and sorts by updatedAt desc", async () => {
    await useScenarioStore.getState().upsert(baseScenario({ id: "s_a", name: "older", updatedAt: 100 }));
    await useScenarioStore.getState().upsert(baseScenario({ id: "s_b", name: "newer", content: "x", updatedAt: 200 }));
    const list = useScenarioStore.getState().scenarios;
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe("newer"); // Because 200 > 100
  });

  it("remove deletes the scenario and clears activeScenarioId when matching", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    useScenarioStore.setState({ activeScenarioId: saved!.id });
    const ok = await useScenarioStore.getState().remove(saved!.id);
    expect(ok).toBe(true);
    expect(useScenarioStore.getState().scenarios).toHaveLength(0);
    expect(useScenarioStore.getState().activeScenarioId).toBeNull();
  });

  it("toggleFavorite flips the favorite flag", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    const flipped = await useScenarioStore.getState().toggleFavorite(saved!.id);
    expect(flipped?.favorite).toBe(true);
    const back = await useScenarioStore.getState().toggleFavorite(saved!.id);
    expect(back?.favorite).toBe(false);
  });

  it("toggleFavorite returns null if scenario not found", async () => {
    const res = await useScenarioStore.getState().toggleFavorite("missing");
    expect(res).toBeNull();
  });

  it("archiveScenario and unarchiveScenario toggle archivedAt", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    const archived = await useScenarioStore.getState().archiveScenario(saved!.id);
    expect(archived?.archivedAt).toBeTypeOf("number");
    const restored = await useScenarioStore.getState().unarchiveScenario(saved!.id);
    expect(restored?.archivedAt).toBeUndefined();
  });

  it("archiveScenario and unarchiveScenario return null if scenario not found", async () => {
    const archived = await useScenarioStore.getState().archiveScenario("missing");
    expect(archived).toBeNull();
    const restored = await useScenarioStore.getState().unarchiveScenario("missing");
    expect(restored).toBeNull();
  });

  it("importScenarios regenerates ids and skips invalid records", async () => {
    const result = await useScenarioStore.getState().importScenarios({
      version: 1,
      app: "Venice Forge",
      exportedAt: Date.now(),
      scenarios: [
        baseScenario({ name: "Good" }),
        { id: "nope!", name: "" },
      ],
    });
    expect(result.imported).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.imported[0]!.id).not.toBe("s_test_001");
    expect(useScenarioStore.getState().scenarios).toHaveLength(1);
  });

  it("importScenarios handles empty and invalid payloads", async () => {
    const result1 = await useScenarioStore.getState().importScenarios(null);
    expect(result1.imported).toHaveLength(0);
    expect(result1.skipped[0]?.reason).toBe("Invalid envelope");

    const result2 = await useScenarioStore.getState().importScenarios({ foo: "bar" });
    expect(result2.imported).toHaveLength(0);
    expect(result2.skipped[0]?.reason).toBe("Missing scenarios array");

    const result3 = await useScenarioStore.getState().importScenarios({ items: [baseScenario()] });
    expect(result3.imported).toHaveLength(1);
  });

  it("exportScenarios returns a versioned envelope with no archived fields", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    await useScenarioStore.getState().archiveScenario(saved!.id);
    const env = useScenarioStore.getState().exportScenarios([saved!.id]);
    expect(env.version).toBe(1);
    expect(env.app).toBe("Venice Forge");
    expect(env.scenarios[0]!.archivedAt).toBeUndefined();
  });

  it("exportScenarios exports all if ids not provided", async () => {
    await useScenarioStore.getState().upsert(baseScenario({ id: "s_a" }));
    await useScenarioStore.getState().upsert(baseScenario({ id: "s_b" }));
    const env = useScenarioStore.getState().exportScenarios();
    expect(env.scenarios).toHaveLength(2);
  });

  it("selectForProject returns global+character scenarios regardless of project", async () => {
    await useScenarioStore.getState().upsert(baseScenario({ id: "s_a", scope: "global" }));
    await useScenarioStore.getState().upsert(baseScenario({ id: "s_b", scope: "project", projectId: "p-1" }));
    await useScenarioStore.getState().upsert(baseScenario({ id: "s_c", scope: "project", projectId: "p-2" }));
    await useScenarioStore.getState().upsert(baseScenario({ id: "s_d", scope: "character" }));
    
    // Also add an archived one that should be filtered out
    const archived = await useScenarioStore.getState().upsert(baseScenario({ id: "s_e", scope: "global" }));
    await useScenarioStore.getState().archiveScenario(archived!.id);

    const p1 = useScenarioStore.getState().selectForProject("p-1");
    const ids = p1.map((s) => s.id).sort();
    expect(ids).toEqual(["s_a", "s_b", "s_d"]);

    const pNull = useScenarioStore.getState().selectForProject(null);
    const idsNull = pNull.map((s) => s.id).sort();
    // When project is null, it should return global, character, or missing projectId
    expect(idsNull).toEqual(["s_a", "s_d"]);
  });

  it("setActive updates activeScenarioId", () => {
    useScenarioStore.getState().setActive("s_foo");
    expect(useScenarioStore.getState().activeScenarioId).toBe("s_foo");
  });

  it("setSearchQuery updates searchQuery", () => {
    useScenarioStore.getState().setSearchQuery("foo");
    expect(useScenarioStore.getState().searchQuery).toBe("foo");
  });

  it("load fetches from storage and sorts by updatedAt desc", async () => {
    // we use real store unless mocked. Let's mock scenarioService.listScenarios
    vi.mocked(scenarioService.listScenarios).mockResolvedValueOnce([
      baseScenario({ id: "s_1", updatedAt: 100 }),
      baseScenario({ id: "s_2", updatedAt: 200 }),
    ]);

    await useScenarioStore.getState().load();
    expect(useScenarioStore.getState().scenarios).toHaveLength(2);
    expect(useScenarioStore.getState().scenarios[0]!.id).toBe("s_2"); // 200 > 100
    expect(useScenarioStore.getState().isLoading).toBe(false);
    expect(useScenarioStore.getState().hasLoaded).toBe(true);

    // calling load again when isLoading is true should abort early
    useScenarioStore.setState({ isLoading: true });
    await useScenarioStore.getState().load();
    expect(scenarioService.listScenarios).toHaveBeenCalledTimes(1); // not called again
  });

  it("reloadFromStorage resets hasLoaded and calls load", async () => {
    vi.mocked(scenarioService.listScenarios).mockResolvedValueOnce([
      baseScenario({ id: "s_1", updatedAt: 100 })
    ]);
    await useScenarioStore.getState().reloadFromStorage();
    expect(useScenarioStore.getState().hasLoaded).toBe(true);
    expect(useScenarioStore.getState().scenarios).toHaveLength(1);
  });

  it("load handles errors properly", async () => {
    vi.mocked(scenarioService.listScenarios).mockRejectedValueOnce(new Error("load failed"));
    await useScenarioStore.getState().load();
    expect(useScenarioStore.getState().error).toBe("load failed");
    expect(useScenarioStore.getState().isLoading).toBe(false);
  });

  it("upsert handles validation failures", async () => {
    // Pass something that fails normalizeScenario
    const saved = await useScenarioStore.getState().upsert({} as any);
    expect(saved).toBeNull();
    expect(useScenarioStore.getState().error).toBe("Invalid scenario data.");
  });

  it("upsert handles save errors", async () => {
    vi.mocked(scenarioService.saveScenario).mockRejectedValueOnce(new Error("save failed"));
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    expect(saved).toBeNull();
    expect(useScenarioStore.getState().error).toBe("save failed");
  });

  it("remove handles delete errors", async () => {
    vi.mocked(scenarioService.deleteScenario).mockRejectedValueOnce(new Error("delete failed"));
    const ok = await useScenarioStore.getState().remove("some_id");
    expect(ok).toBe(false);
    expect(useScenarioStore.getState().error).toBe("delete failed");
  });

  it("remove handles delete returning false", async () => {
    vi.mocked(scenarioService.deleteScenario).mockResolvedValueOnce(false);
    const ok = await useScenarioStore.getState().remove("some_id");
    expect(ok).toBe(false);
  });
});
