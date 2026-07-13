import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCharacterStore } from "./character-store";
import { listCharacters, getCharacter } from "../services/characterService";
import type { VeniceCharacter } from "../types/characters";

vi.mock("../services/characterService", () => ({
  listCharacters: vi.fn(),
  getCharacter: vi.fn(),
}));

describe("useCharacterStore", () => {
  beforeEach(() => {
    // Reset Zustand store state
    useCharacterStore.setState({
      searchQuery: "",
      results: [],
      selectedCharacter: null,
      selectedCharacterSlug: null,
      selectedModel: null,
      includeAdultCharacters: false,
      webEnabledOnly: false,
      isLoading: false,
      error: null,
      sortBy: "featured",
      sortOrder: "desc",
      offset: 0,
      hasMore: false,
    });
    vi.clearAllMocks();
  });

  const mockCharacter = (overrides?: Partial<VeniceCharacter>): VeniceCharacter => ({
    id: "char1",
    slug: "char-1",
    name: "Character 1",
    adult: false,
    webEnabled: false,
    featured: false,
    ...overrides,
  });

  it("should have correct initial state", () => {
    const state = useCharacterStore.getState();
    expect(state.searchQuery).toBe("");
    expect(state.results).toEqual([]);
    expect(state.selectedCharacter).toBeNull();
    expect(state.selectedCharacterSlug).toBeNull();
    expect(state.selectedModel).toBeNull();
    expect(state.includeAdultCharacters).toBe(false);
    expect(state.webEnabledOnly).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.sortBy).toBe("featured");
    expect(state.sortOrder).toBe("desc");
    expect(state.offset).toBe(0);
    expect(state.hasMore).toBe(false);
  });

  it("should update search query without triggering search", () => {
    useCharacterStore.getState().setSearchQuery("new query");
    expect(useCharacterStore.getState().searchQuery).toBe("new query");
    expect(listCharacters).not.toHaveBeenCalled();
  });

  it("should update sort by and trigger search", async () => {
    vi.mocked(listCharacters).mockResolvedValue([]);
    useCharacterStore.getState().setSortBy("mostRecent");
    expect(useCharacterStore.getState().sortBy).toBe("mostRecent");
    expect(useCharacterStore.getState().offset).toBe(0);
    await vi.waitFor(() => {
      expect(listCharacters).toHaveBeenCalled();
    });
  });

  it("should update sort order and trigger search", async () => {
    vi.mocked(listCharacters).mockResolvedValue([]);
    useCharacterStore.getState().setSortOrder("asc");
    expect(useCharacterStore.getState().sortOrder).toBe("asc");
    expect(useCharacterStore.getState().offset).toBe(0);
    await vi.waitFor(() => {
      expect(listCharacters).toHaveBeenCalled();
    });
  });

  it("should update includeAdultCharacters and trigger search", async () => {
    vi.mocked(listCharacters).mockResolvedValue([]);
    useCharacterStore.getState().setIncludeAdult(true);
    expect(useCharacterStore.getState().includeAdultCharacters).toBe(true);
    expect(useCharacterStore.getState().offset).toBe(0);
    await vi.waitFor(() => {
      expect(listCharacters).toHaveBeenCalled();
    });
  });

  it("should update webEnabledOnly and trigger search", async () => {
    vi.mocked(listCharacters).mockResolvedValue([]);
    useCharacterStore.getState().setWebEnabledOnly(true);
    expect(useCharacterStore.getState().webEnabledOnly).toBe(true);
    expect(useCharacterStore.getState().offset).toBe(0);
    await vi.waitFor(() => {
      expect(listCharacters).toHaveBeenCalled();
    });
  });

  describe("searchCharacters", () => {
    it("should fetch and update state with valid characters", async () => {
      const chars = [mockCharacter({ id: "1" }), mockCharacter({ id: "2" })];
      vi.mocked(listCharacters).mockResolvedValue(chars);

      useCharacterStore.getState().setSearchQuery("test search");
      
      const promise = useCharacterStore.getState().searchCharacters();
      expect(useCharacterStore.getState().isLoading).toBe(true);
      
      await promise;

      expect(listCharacters).toHaveBeenCalledWith(expect.objectContaining({
        search: "test search",
        limit: 30,
        offset: 0,
      }));
      
      const state = useCharacterStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.results).toEqual(chars);
      expect(state.offset).toBe(2);
      expect(state.hasMore).toBe(false);
    });

    it("should filter out adult characters if includeAdultCharacters is false", async () => {
      const chars = [mockCharacter({ adult: false }), mockCharacter({ adult: true })];
      vi.mocked(listCharacters).mockResolvedValue(chars);

      await useCharacterStore.getState().searchCharacters();
      
      expect(useCharacterStore.getState().results).toHaveLength(1);
      expect(useCharacterStore.getState().results[0].adult).toBe(false);
    });

    it("should filter web enabled characters if webEnabledOnly is true", async () => {
      useCharacterStore.setState({ webEnabledOnly: true });
      const chars = [mockCharacter({ webEnabled: true }), mockCharacter({ webEnabled: false })];
      vi.mocked(listCharacters).mockResolvedValue(chars);

      await useCharacterStore.getState().searchCharacters();
      
      expect(useCharacterStore.getState().results).toHaveLength(1);
      expect(useCharacterStore.getState().results[0].webEnabled).toBe(true);
    });

    it("should set hasMore to true if results equal to limit", async () => {
      const chars = Array(30).fill(null).map((_, i) => mockCharacter({ id: String(i) }));
      vi.mocked(listCharacters).mockResolvedValue(chars);

      await useCharacterStore.getState().searchCharacters();
      
      expect(useCharacterStore.getState().hasMore).toBe(true);
    });

    it("should handle error during fetch", async () => {
      vi.mocked(listCharacters).mockRejectedValue(new Error("API Error"));

      await useCharacterStore.getState().searchCharacters();
      
      const state = useCharacterStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toContain("API Error"); // Assuming redactErrorMessage handles strings simply or wraps them.
      expect(state.results).toEqual([]);
    });

    it("should use query override if provided", async () => {
      vi.mocked(listCharacters).mockResolvedValue([]);
      await useCharacterStore.getState().searchCharacters("override query");
      
      expect(listCharacters).toHaveBeenCalledWith(expect.objectContaining({
        search: "override query",
      }));
    });
  });

  describe("loadMore", () => {
    it("should do nothing if isLoading is true", async () => {
      useCharacterStore.setState({ isLoading: true, hasMore: true });
      await useCharacterStore.getState().loadMore();
      expect(listCharacters).not.toHaveBeenCalled();
    });

    it("should do nothing if hasMore is false", async () => {
      useCharacterStore.setState({ isLoading: false, hasMore: false });
      await useCharacterStore.getState().loadMore();
      expect(listCharacters).not.toHaveBeenCalled();
    });

    it("should fetch and append more characters", async () => {
      useCharacterStore.setState({
        hasMore: true,
        offset: 2,
        results: [mockCharacter({ id: "1" }), mockCharacter({ id: "2" })],
      });

      const moreChars = [mockCharacter({ id: "3" })];
      vi.mocked(listCharacters).mockResolvedValue(moreChars);

      await useCharacterStore.getState().loadMore();

      expect(listCharacters).toHaveBeenCalledWith(expect.objectContaining({
        offset: 2,
      }));

      const state = useCharacterStore.getState();
      expect(state.results).toHaveLength(3);
      expect(state.offset).toBe(3);
      expect(state.hasMore).toBe(false);
    });

    it("should filter out adult and web enabled characters properly in loadMore", async () => {
      useCharacterStore.setState({
        hasMore: true,
        offset: 0,
        includeAdultCharacters: false,
        webEnabledOnly: true,
        results: [],
      });

      const moreChars = [
        mockCharacter({ id: "1", adult: false, webEnabled: true }),
        mockCharacter({ id: "2", adult: true, webEnabled: true }),
        mockCharacter({ id: "3", adult: false, webEnabled: false }),
      ];
      vi.mocked(listCharacters).mockResolvedValue(moreChars);

      await useCharacterStore.getState().loadMore();

      const state = useCharacterStore.getState();
      expect(state.results).toHaveLength(1);
      expect(state.results[0].id).toBe("1");
    });

    it("should handle error during loadMore", async () => {
      useCharacterStore.setState({ hasMore: true, offset: 2 });
      vi.mocked(listCharacters).mockRejectedValue(new Error("API Error"));

      await useCharacterStore.getState().loadMore();

      const state = useCharacterStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toContain("API Error");
    });
  });

  describe("selectCharacter and clearCharacter", () => {
    it("should set selected character", () => {
      const char = mockCharacter();
      useCharacterStore.getState().selectCharacter(char);

      const state = useCharacterStore.getState();
      expect(state.selectedCharacter).toEqual(char);
      expect(state.selectedCharacterSlug).toBe(char.slug);
    });

    it("should default selectedModel to the character's modelId when selecting", () => {
      const char = mockCharacter({ modelId: "venice-uncensored-1-2" });
      useCharacterStore.getState().selectCharacter(char);
      expect(useCharacterStore.getState().selectedModel).toBe("venice-uncensored-1-2");
    });

    it("should keep selectedModel null when the character has no modelId", () => {
      const char = mockCharacter({ modelId: undefined });
      useCharacterStore.getState().selectCharacter(char);
      expect(useCharacterStore.getState().selectedModel).toBeNull();
    });

    it("should clear selected character and selectedModel", () => {
      useCharacterStore.setState({
        selectedCharacter: mockCharacter(),
        selectedCharacterSlug: "some-slug",
        selectedModel: "llama-3.3-70b",
      });

      useCharacterStore.getState().clearCharacter();

      const state = useCharacterStore.getState();
      expect(state.selectedCharacter).toBeNull();
      expect(state.selectedCharacterSlug).toBeNull();
      expect(state.selectedModel).toBeNull();
    });
  });

  describe("selectedModel", () => {
    it("should update selectedModel", () => {
      useCharacterStore.getState().setSelectedModel("llama-3.3-70b");
      expect(useCharacterStore.getState().selectedModel).toBe("llama-3.3-70b");
    });

    it("should allow clearing selectedModel", () => {
      useCharacterStore.getState().setSelectedModel("llama-3.3-70b");
      useCharacterStore.getState().setSelectedModel(null);
      expect(useCharacterStore.getState().selectedModel).toBeNull();
    });

    it("getEffectiveModel prefers selectedModel override", () => {
      useCharacterStore.getState().setSelectedModel("override-model");
      const char = mockCharacter({ modelId: "character-model" });
      const model = useCharacterStore.getState().getEffectiveModel(char, "fallback-model");
      expect(model).toBe("override-model");
    });

    it("getEffectiveModel falls back to character modelId", () => {
      const char = mockCharacter({ modelId: "character-model" });
      const model = useCharacterStore.getState().getEffectiveModel(char, "fallback-model");
      expect(model).toBe("character-model");
    });

    it("getEffectiveModel falls back to supplied fallback when no override or character model", () => {
      const char = mockCharacter({ modelId: undefined });
      const model = useCharacterStore.getState().getEffectiveModel(char, "fallback-model");
      expect(model).toBe("fallback-model");
    });

    it("getEffectiveModel handles null character", () => {
      useCharacterStore.getState().setSelectedModel("override-model");
      const model = useCharacterStore.getState().getEffectiveModel(null, "fallback-model");
      expect(model).toBe("override-model");
    });
  });

  describe("fetchBySlug", () => {
    it("should fetch by slug, set state, and return character", async () => {
      const char = mockCharacter({ slug: "test-slug" });
      vi.mocked(getCharacter).mockResolvedValue(char);

      const result = await useCharacterStore.getState().fetchBySlug("test-slug");

      expect(getCharacter).toHaveBeenCalledWith("test-slug");
      expect(result).toEqual(char);

      const state = useCharacterStore.getState();
      expect(state.selectedCharacter).toEqual(char);
      expect(state.selectedCharacterSlug).toBe("test-slug");
      expect(state.error).toBeNull();
      expect(state.results).toEqual([char]);
    });

    it("refreshes a hosted result in place without duplicating it", async () => {
      const stale = mockCharacter({ slug: "test-slug", name: "Old name" });
      const refreshed = mockCharacter({ slug: "test-slug", name: "New name" });
      useCharacterStore.setState({ results: [stale] });
      vi.mocked(getCharacter).mockResolvedValue(refreshed);

      await useCharacterStore.getState().fetchBySlug("test-slug");

      expect(useCharacterStore.getState().results).toEqual([refreshed]);
    });

    it("should handle error, set error state, and return null", async () => {
      vi.mocked(getCharacter).mockRejectedValue(new Error("Fetch Error"));

      const result = await useCharacterStore.getState().fetchBySlug("test-slug");

      expect(result).toBeNull();
      const state = useCharacterStore.getState();
      expect(state.error).toContain("Fetch Error");
    });
  });
});
