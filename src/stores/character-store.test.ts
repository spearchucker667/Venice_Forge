/** @fileoverview T-184 regression guard: character-store must never store raw
 *  service exception messages; the UI-facing `error` field must be redacted
 *  and safe (no secrets, no bearer tokens, no raw exception text).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listCharacters, getCharacter } from "../services/characterService";
import { useCharacterStore } from "./character-store";

vi.mock("../services/characterService", () => ({
  listCharacters: vi.fn(),
  getCharacter: vi.fn(),
}));

const mockedListCharacters = vi.mocked(listCharacters);
const mockedGetCharacter = vi.mocked(getCharacter);

function resetStore() {
  useCharacterStore.setState({
    searchQuery: "",
    results: [],
    selectedCharacter: null,
    selectedCharacterSlug: null,
    includeAdultCharacters: false,
    webEnabledOnly: false,
    isLoading: false,
    error: null,
    sortBy: "featured",
    sortOrder: "desc",
    offset: 0,
    hasMore: false,
  });
}

describe("character-store safe error handling (T-184)", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("redacts secrets from searchCharacters errors", async () => {
    mockedListCharacters.mockRejectedValueOnce(
      new Error("Venice error: Bearer vn-super-secret-token-12345"),
    );

    await useCharacterStore.getState().searchCharacters();

    const error = useCharacterStore.getState().error;
    expect(error).not.toContain("vn-super-secret-token-12345");
    expect(error).toContain("Bearer [REDACTED]");
    expect(error).toContain("Venice error:");
    expect(useCharacterStore.getState().isLoading).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("redacts secrets from loadMore errors", async () => {
    useCharacterStore.setState({ searchQuery: "test", hasMore: true, offset: 30 });
    mockedListCharacters.mockRejectedValueOnce(
      new Error("upstream failed: api_key=sk-1234567890abcdef"),
    );

    await useCharacterStore.getState().loadMore();

    const error = useCharacterStore.getState().error;
    expect(error).not.toContain("sk-1234567890abcdef");
    expect(error).toBe("upstream failed: api_key=[REDACTED]");
  });

  it("redacts secrets from fetchBySlug errors", async () => {
    mockedGetCharacter.mockRejectedValueOnce(
      new Error("Authorization: Bearer top-secret-bearer-value"),
    );

    const result = await useCharacterStore.getState().fetchBySlug("alan-watts");

    expect(result).toBeNull();
    const error = useCharacterStore.getState().error;
    expect(error).not.toContain("top-secret-bearer-value");
    expect(error).toBe("Authorization: Bearer [REDACTED]");
  });

  it("falls back to a safe message for non-Error throws", async () => {
    mockedListCharacters.mockRejectedValueOnce("raw string failure");

    await useCharacterStore.getState().searchCharacters();

    expect(useCharacterStore.getState().error).toBe("raw string failure");
  });

  it("preserves safe error messages unchanged", async () => {
    mockedListCharacters.mockRejectedValueOnce(new Error("Network request failed."));

    await useCharacterStore.getState().searchCharacters();

    expect(useCharacterStore.getState().error).toBe("Network request failed.");
  });

  it("does not leak stack traces or file paths in stored errors", async () => {
    const err = new Error("fetch failed");
    err.stack = "Error: fetch failed\n    at /Users/super_user/Projects/Windows-Venice-API-connector/src/services/characterService.ts:175:12";
    mockedListCharacters.mockRejectedValueOnce(err);

    await useCharacterStore.getState().searchCharacters();

    const stored = useCharacterStore.getState().error ?? "";
    expect(stored).not.toContain("/Users/super_user/Projects/");
    expect(stored).not.toContain("characterService.ts");
    expect(stored).toBe("fetch failed");
  });
});
