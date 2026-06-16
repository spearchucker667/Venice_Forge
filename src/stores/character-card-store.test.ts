/** @fileoverview Phase 2F — character-card-store unit tests.
 *
 *  Verifies the store's createBlank / upsert / remove flow and the
 *  persistence of Phase 2F's optional `firstMessage`, `versions`,
 *  `currentVersionId`, and `metadata` fields through `normalizeCard`.
 *  These fields are loaded back verbatim by the store, so we exercise
 *  the round-trip path here. (The IndexedDB / Electron branches are
 *  exercised through the integration tests; we stub the service via
 *  fake-indexeddb/auto + the existing service code path.) */

import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { renderHook, act } from "@testing-library/react";
import { useCharacterCardStore, useFilteredCharacterCards } from "./character-card-store";
import { useToastStore } from "./toast-store";
import * as characterCardService from "../services/rp/characterCardService";
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
  useToastStore.setState({ toasts: [] });
  vi.restoreAllMocks();
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

  it("load fetches cards and sorts them by updatedAt", async () => {
    const cards = [baseCard({ id: "c_1", updatedAt: 1 }), baseCard({ id: "c_2", updatedAt: 2 })];
    vi.spyOn(characterCardService, "listCharacterCards").mockResolvedValue(cards);
    await useCharacterCardStore.getState().load();
    const state = useCharacterCardStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.hasLoaded).toBe(true);
    expect(state.cards).toHaveLength(2);
    expect(state.cards[0]!.id).toBe("c_2"); // descending order
  });

  it("refresh sets hasLoaded to false and calls load", async () => {
    vi.spyOn(characterCardService, "listCharacterCards").mockResolvedValue([]);
    useCharacterCardStore.setState({ hasLoaded: true });
    await useCharacterCardStore.getState().refresh();
    const state = useCharacterCardStore.getState();
    expect(state.hasLoaded).toBe(true);
  });

  it("setEditing mutates the editingId", () => {
    useCharacterCardStore.getState().setEditing("c_1");
    expect(useCharacterCardStore.getState().editingId).toBe("c_1");
  });

  it("load does not fetch if already isLoading", async () => {
    useCharacterCardStore.setState({ isLoading: true });
    const spy = vi.spyOn(characterCardService, "listCharacterCards");
    await useCharacterCardStore.getState().load();
    expect(spy).not.toHaveBeenCalled();
  });

  it("remove returns false and toasts if storage rejects the request", async () => {
    vi.spyOn(characterCardService, "deleteCharacterCard").mockResolvedValue(false);
    const ok = await useCharacterCardStore.getState().remove("c_1");
    expect(ok).toBe(false);
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.description).toBe("Storage rejected the request.");
  });

  it("upsert updates an existing card in place and sorts", async () => {
    const card1 = baseCard({ id: "c_1", updatedAt: 10 });
    const card2 = baseCard({ id: "c_2", updatedAt: 20 });
    useCharacterCardStore.setState({ cards: [card2, card1] });
    
    const updatedCard1 = { ...card1, updatedAt: 30 };
    const saved = await useCharacterCardStore.getState().upsert(updatedCard1);
    
    const cards = useCharacterCardStore.getState().cards;
    expect(cards).toHaveLength(2);
    expect(cards[0]!.id).toBe("c_1"); // now c_1 is newer
  });

  // T-185 regression guard: persistence failures must never expose raw
  // exception text (paths, driver internals, secrets) in store state or toasts.
  describe("safe persistence error handling (T-185)", () => {
    const rawError = new Error(
      "ENOSPC: no space left on device at /Users/super_user/.secret/path",
    );

    it("load surfaces a safe generic error and toast when listCharacterCards fails", async () => {
      vi.spyOn(characterCardService, "listCharacterCards").mockRejectedValue(
        rawError,
      );
      await useCharacterCardStore.getState().load();

      const state = useCharacterCardStore.getState();
      expect(state.error).toBe("Could not load character cards. Please try again.");
      expect(state.error).not.toContain("ENOSPC");
      expect(state.error).not.toContain("/Users");
      expect(state.isLoading).toBe(false);

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]!.variant).toBe("error");
      expect(toasts[0]!.title).toBe("Could not load characters");
      expect(toasts[0]!.description).toBe("Please try again.");
      expect(toasts[0]!.description).not.toContain("ENOSPC");
    });

    it("upsert surfaces a safe generic error and toast when saveCharacterCard fails", async () => {
      vi.spyOn(characterCardService, "saveCharacterCard").mockRejectedValue(
        rawError,
      );
      const result = await useCharacterCardStore
        .getState()
        .upsert(baseCard());

      expect(result).toBeNull();
      const state = useCharacterCardStore.getState();
      expect(state.error).toBe("Could not save character. Please try again.");
      expect(state.error).not.toContain("ENOSPC");
      expect(state.error).not.toContain("/Users");

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]!.title).toBe("Could not save character");
      expect(toasts[0]!.description).toBe("Please try again.");
    });

    it("remove surfaces a safe generic error and toast when deleteCharacterCard fails", async () => {
      const id = useCharacterCardStore.getState().createBlank();
      vi.spyOn(characterCardService, "deleteCharacterCard").mockRejectedValue(
        rawError,
      );
      const ok = await useCharacterCardStore.getState().remove(id);

      expect(ok).toBe(false);
      const state = useCharacterCardStore.getState();
      expect(state.error).toBe("Could not delete character. Please try again.");
      expect(state.error).not.toContain("ENOSPC");
      expect(state.error).not.toContain("/Users");

      const toasts = useToastStore.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0]!.title).toBe("Could not delete character");
      expect(toasts[0]!.description).toBe("Please try again.");
    });
  });
});

describe("useFilteredCharacterCards", () => {
  beforeEach(() => {
    reset();
  });

  it("filters adult cards out by default", () => {
    const c1 = baseCard({ id: "c_1", adult: false });
    const c2 = baseCard({ id: "c_2", adult: true });
    useCharacterCardStore.setState({ cards: [c1, c2], includeAdult: false });
    const { result } = renderHook(() => useFilteredCharacterCards());
    expect(result.current).toHaveLength(1);
    expect(result.current[0]!.id).toBe("c_1");
  });

  it("includes adult cards if includeAdult is true", () => {
    const c1 = baseCard({ id: "c_1", adult: false });
    const c2 = baseCard({ id: "c_2", adult: true });
    useCharacterCardStore.setState({ cards: [c1, c2], includeAdult: true });
    const { result } = renderHook(() => useFilteredCharacterCards());
    expect(result.current).toHaveLength(2);
  });

  it("filters by name/description/tags", () => {
    const c1 = baseCard({ id: "c_1", name: "Alpha", description: "Hello", tags: ["a"] });
    const c2 = baseCard({ id: "c_2", name: "Beta", description: "World", tags: ["b"] });
    useCharacterCardStore.setState({ cards: [c1, c2], includeAdult: false });
    
    act(() => {
      useCharacterCardStore.getState().setSearchQuery("world");
    });
    const { result: r1 } = renderHook(() => useFilteredCharacterCards());
    expect(r1.current).toHaveLength(1);
    expect(r1.current[0]!.id).toBe("c_2");

    act(() => {
      useCharacterCardStore.getState().setSearchQuery("alpha");
    });
    const { result: r2 } = renderHook(() => useFilteredCharacterCards());
    expect(r2.current).toHaveLength(1);
    expect(r2.current[0]!.id).toBe("c_1");
  });
  
  it("limits to PAGE_SIZE", () => {
    const cards = Array.from({ length: 100 }).map((_, i) => baseCard({ id: `c_${i}` }));
    useCharacterCardStore.setState({ cards, includeAdult: false });
    const { result } = renderHook(() => useFilteredCharacterCards());
    expect(result.current).toHaveLength(60);
  });
});

