/** @fileoverview Phase 2F — character-card-store unit tests.
 *
 *  Verifies the store's createBlank / upsert / remove flow and the
 *  persistence of Phase 2F's optional `firstMessage`, `versions`,
 *  `currentVersionId`, and `metadata` fields through `normalizeCard`.
 *  These fields are loaded back verbatim by the store, so we exercise
 *  the round-trip path here. (The IndexedDB / Electron branches are
 *  exercised through the integration tests; we stub the service via
 *  fake-indexeddb/auto + the existing service code path.) */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { useCharacterCardStore } from "./character-card-store";
import type { CharacterCardV1 } from "../types/rp";

function reset(): void {
  useCharacterCardStore.setState({
    cards: [],
    isLoading: false,
    hasLoaded: false,
    error: null,
    searchQuery: "",
    includeAdult: false,
    editingId: null,
  });
}

function baseCard(overrides: Partial<CharacterCardV1> = {}): CharacterCardV1 {
  const now = Date.now();
  return {
    schema: "CharacterCardV1",
    id: "c_test_001",
    name: "Tester",
    description: "test desc",
    systemPrompt: "You are a test character.",
    scenario: "",
    tags: ["test"],
    adult: false,
    exampleDialogues: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("character-card-store", () => {
  beforeEach(() => {
    reset();
  });

  it("createBlank returns a stable id and inserts at the head", () => {
    const id = useCharacterCardStore.getState().createBlank();
    expect(id).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
    expect(useCharacterCardStore.getState().cards).toHaveLength(1);
    expect(useCharacterCardStore.getState().cards[0]!.name).toBe(
      "New Character",
    );
    expect(useCharacterCardStore.getState().editingId).toBe(id);
  });

  it("upsert replaces an existing card by id and sorts by updatedAt desc", async () => {
    await useCharacterCardStore
      .getState()
      .upsert(baseCard({ name: "older" }));
    await new Promise((r) => setTimeout(r, 5));
    await useCharacterCardStore
      .getState()
      .upsert(baseCard({ name: "newer" }));
    const cards = useCharacterCardStore.getState().cards;
    expect(cards).toHaveLength(1);
    expect(cards[0]!.name).toBe("newer");
    expect(useCharacterCardStore.getState().editingId).toBe("c_test_001");
  });

  it("upsert rejects and surfaces an error for invalid input", async () => {
    const saved = await useCharacterCardStore
      .getState()
      .upsert({} as unknown as CharacterCardV1);
    expect(saved).toBeNull();
    expect(useCharacterCardStore.getState().error).toMatch(
      /Invalid character card data/,
    );
  });

  it("remove deletes a card and clears editingId when matching", async () => {
    const saved = await useCharacterCardStore.getState().upsert(baseCard());
    expect(saved).not.toBeNull();
    useCharacterCardStore.setState({ editingId: "c_test_001" });
    const ok = await useCharacterCardStore.getState().remove("c_test_001");
    expect(ok).toBe(true);
    expect(useCharacterCardStore.getState().cards).toHaveLength(0);
    expect(useCharacterCardStore.getState().editingId).toBeNull();
  });

  it("getById returns the matching card", async () => {
    await useCharacterCardStore.getState().upsert(baseCard({ name: "A" }));
    const c = useCharacterCardStore.getState().getById("c_test_001");
    expect(c?.name).toBe("A");
    expect(useCharacterCardStore.getState().getById("nonexistent")).toBeUndefined();
  });

  it("setIncludeAdult and setSearchQuery mutate the filter inputs", () => {
    useCharacterCardStore.getState().setIncludeAdult(true);
    useCharacterCardStore.getState().setSearchQuery("dragon");
    expect(useCharacterCardStore.getState().includeAdult).toBe(true);
    expect(useCharacterCardStore.getState().searchQuery).toBe("dragon");
  });

  it("preserves Phase 2F firstMessage / versions / currentVersionId / metadata through upsert", async () => {
    const now = Date.now();
    const versions = [
      {
        id: "v_1",
        createdAt: now,
        reason: "Initial",
        snapshot: {
          name: "v1",
          description: "d1",
          systemPrompt: "p1",
          tags: ["v1"],
          adult: false,
          exampleDialogues: [],
        },
      },
    ];
    const card = baseCard({
      firstMessage: "Hello, traveller.",
      versions,
      currentVersionId: "v_1",
      metadata: { source: "import", attachedSceneId: "s_1" },
    });
    const saved = await useCharacterCardStore.getState().upsert(card);
    expect(saved).not.toBeNull();
    expect(saved!.firstMessage).toBe("Hello, traveller.");
    expect(saved!.versions).toHaveLength(1);
    expect(saved!.versions![0]!.id).toBe("v_1");
    expect(saved!.currentVersionId).toBe("v_1");
    expect(saved!.metadata).toEqual({ source: "import", attachedSceneId: "s_1" });
  });

  it("normalizes metadata to primitive scalars only (drops arrays/objects)", async () => {
    const card = baseCard({
      metadata: {
        ok: "string",
        bad: { nested: "object" },
        list: [1, 2, 3],
        n: 42,
        b: true,
        n2: null,
      },
    });
    const saved = await useCharacterCardStore.getState().upsert(card);
    expect(saved).not.toBeNull();
    expect(saved!.metadata).toEqual({ ok: "string", n: 42, b: true, n2: null });
  });
});
