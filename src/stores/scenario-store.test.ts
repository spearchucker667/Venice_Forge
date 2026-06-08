/** @fileoverview Phase 2F — RP Studio scenario store contract tests. */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { useScenarioStore } from "./scenario-store";
import type { ScenarioV1 } from "../types/rp";

function reset(): void {
  useScenarioStore.setState({
    scenarios: [],
    isLoading: false,
    hasLoaded: false,
    error: null,
    activeScenarioId: null,
    searchQuery: "",
  });
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
    });
    const item = useScenarioStore.getState().getById(id);
    expect(item?.name).toBe("Custom");
    expect(item?.scope).toBe("project");
    expect(item?.projectId).toBe("p-1");
  });

  it("upsert inserts a new scenario and assigns it to the list head", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    expect(saved).not.toBeNull();
    expect(useScenarioStore.getState().scenarios[0]!.id).toBe("s_test_001");
  });

  it("upsert replaces an existing scenario by id and sorts by updatedAt desc", async () => {
    await useScenarioStore
      .getState()
      .upsert(baseScenario({ id: "s_a", name: "older" }));
    await new Promise((r) => setTimeout(r, 5));
    await useScenarioStore
      .getState()
      .upsert(baseScenario({ id: "s_b", name: "newer", content: "x" }));
    const list = useScenarioStore.getState().scenarios;
    expect(list).toHaveLength(2);
    expect(list[0]!.name).toBe("newer");
  });

  it("remove deletes the scenario and clears activeScenarioId when matching", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    expect(saved).not.toBeNull();
    useScenarioStore.setState({ activeScenarioId: saved!.id });
    const ok = await useScenarioStore.getState().remove(saved!.id);
    expect(ok).toBe(true);
    expect(useScenarioStore.getState().scenarios).toHaveLength(0);
    expect(useScenarioStore.getState().activeScenarioId).toBeNull();
  });

  it("toggleFavorite flips the favorite flag", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    expect(saved).not.toBeNull();
    expect(saved!.favorite).toBe(false);
    const flipped = await useScenarioStore.getState().toggleFavorite(saved!.id);
    expect(flipped?.favorite).toBe(true);
    const back = await useScenarioStore.getState().toggleFavorite(saved!.id);
    expect(back?.favorite).toBe(false);
  });

  it("archiveScenario and unarchiveScenario toggle archivedAt", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    expect(saved).not.toBeNull();
    const archived = await useScenarioStore
      .getState()
      .archiveScenario(saved!.id);
    expect(archived?.archivedAt).toBeTypeOf("number");
    const restored = await useScenarioStore
      .getState()
      .unarchiveScenario(saved!.id);
    expect(restored?.archivedAt).toBeUndefined();
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

  it("exportScenarios returns a versioned envelope with no archived fields", async () => {
    const saved = await useScenarioStore.getState().upsert(baseScenario());
    expect(saved).not.toBeNull();
    await useScenarioStore.getState().archiveScenario(saved!.id);
    const env = useScenarioStore.getState().exportScenarios([saved!.id]);
    expect(env.version).toBe(1);
    expect(env.app).toBe("Venice Forge");
    expect(env.scenarios[0]!.archivedAt).toBeUndefined();
  });

  it("selectForProject returns global+character scenarios regardless of project", async () => {
    await useScenarioStore.getState().upsert(
      baseScenario({ id: "s_a", scope: "global" }),
    );
    await useScenarioStore.getState().upsert(
      baseScenario({ id: "s_b", scope: "project", projectId: "p-1" }),
    );
    await useScenarioStore.getState().upsert(
      baseScenario({ id: "s_c", scope: "project", projectId: "p-2" }),
    );
    await useScenarioStore.getState().upsert(
      baseScenario({ id: "s_d", scope: "character" }),
    );
    const p1 = useScenarioStore.getState().selectForProject("p-1");
    const ids = p1.map((s) => s.id).sort();
    expect(ids).toEqual(["s_a", "s_b", "s_d"]);
  });
});
