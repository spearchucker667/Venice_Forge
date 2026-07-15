/** @fileoverview Phase 2F — CharacterLibrary regression tests (RELEASE-BLOCKER #6).
 *
 *  Exercises the strict Create Me validator + avatar-mandatory guard +
 *  Family Safe Mode preflight so a card cannot be persisted without an
 *  avatar and so the validator refuses malformed / schema-bloating outputs.
 */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";

const mocks = vi.hoisted(() => ({
  veniceFetchMock: vi.fn(),
  guardMock: vi.fn(),
  upsertMock: vi.fn(),
  loadMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  avatarDataUriFallback: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
}));

vi.mock("../../services/veniceClient/fetch", () => ({
  veniceFetch: mocks.veniceFetchMock,
}));

vi.mock("../../shared/safety/localFamilySafeGuard", () => ({
  maybeRunLocalFamilyGuard: mocks.guardMock,
}));

vi.mock("../../stores/toast-store", () => ({
  toast: {
    success: mocks.toastSuccessMock,
    error: mocks.toastErrorMock,
  },
}));

const settingsState = {
  localFamilySafeModeEnabled: false,
  veniceApiSafeMode: false,
  selectedModels: { text: "llama-3.3-70b", image: "flux-dev" },
};

vi.mock("../../stores/settings-store", () => {
  const fn = (selector: (s: typeof settingsState) => unknown) => selector(settingsState);
  (fn as unknown as { getState: () => typeof settingsState }).getState = () => settingsState;
  return { useSettingsStore: fn };
});

vi.mock("../../stores/character-card-store", () => {
  const cards: unknown[] = [];
  const state = {
    cards,
    hasLoaded: true,
    isLoading: false,
    error: null as string | null,
    load: mocks.loadMock,
    upsert: mocks.upsertMock,
    remove: vi.fn(),
    setSearchQuery: vi.fn(),
    searchQuery: "",
  };
  const fn = (selector: (s: typeof state) => unknown) => selector(state);
  (fn as unknown as { getState: () => typeof state }).getState = () => state;
  return { useCharacterCardStore: fn };
});

vi.mock("../../services/rpHelpers", () => ({
  startNormalChatForCharacter: vi.fn(),
}));

import { CharacterLibrary } from "./CharacterLibrary";

function validCreateMeJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: "Aurora the Navigator",
    description: "A starship captain charting unmapped sectors.",
    instructions: "Be brave, witty, never break character. Always Stay in character and never invent technical specs.",
    systemPrompt: "You are Aurora.",
    imagePrompt: "Square portrait avatar of a female starship captain.",
    tags: ["scifi", "captain"],
    adult: false,
    ...overrides,
  });
}

function setVeniceChatResponse(jsonString: string): void {
  mocks.veniceFetchMock.mockImplementationOnce(async (_endpoint: string) => ({
    data: { choices: [{ message: { content: jsonString } }] },
    response: new Response(),
    headers: {},
    diagnostics: {},
  }));
}

function resetMocks(): void {
  mocks.veniceFetchMock.mockReset();
  mocks.guardMock.mockReset();
  mocks.upsertMock.mockReset();
  mocks.loadMock.mockReset();
  mocks.toastErrorMock.mockReset();
  mocks.toastSuccessMock.mockReset();

  settingsState.localFamilySafeModeEnabled = false;
  settingsState.veniceApiSafeMode = false;
  settingsState.selectedModels = { text: "llama-3.3-70b", image: "flux-dev" };

  mocks.guardMock.mockReturnValue({ allowed: true });
  mocks.upsertMock.mockImplementation(async (card) => card);
}

beforeEach(resetMocks);

afterEach(() => {
  vi.clearAllMocks();
});

describe("CharacterLibrary — Create Me avatar-mandatory guard (RELEASE-BLOCKER #6)", () => {
  it("does NOT call upsert when veniceFetch returns an invalid payload (missing instructions)", async () => {
    const bad = JSON.stringify({ name: "X", description: "d" });
    setVeniceChatResponse(bad);

    render(<CharacterLibrary onEdit={vi.fn()} />);
    const input = screen.getByPlaceholderText("Auto-create prompt...");
    fireEvent.change(input, { target: { value: "Make me a captain" } });
    fireEvent.click(screen.getByRole("button", { name: /create me/i }));

    await waitFor(() => {
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        expect.stringMatching(/invalid|unparseable/i),
      );
    });
    expect(mocks.upsertMock).not.toHaveBeenCalled();
  });

  it("redacts secrets and local paths from Create Me failures", async () => {
    mocks.veniceFetchMock.mockRejectedValueOnce(
      new Error("Bearer sensitive-token from /Users/example/private/config.json"),
    );

    render(<CharacterLibrary onEdit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Auto-create prompt..."), {
      target: { value: "Make me a captain" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create me/i }));

    await waitFor(() => expect(mocks.toastErrorMock).toHaveBeenCalledTimes(1));
    const displayed = String(mocks.toastErrorMock.mock.calls[0]?.[0]);
    expect(displayed).toContain("[REDACTED]");
    expect(displayed).toContain("[REDACTED-PATH]");
    expect(displayed).not.toContain("sensitive-token");
    expect(displayed).not.toContain("/Users/example");
  });

  it("does NOT call upsert when the model payload contains unknown keys (schema bloat)", async () => {
    const bloated = JSON.stringify({
      name: "X",
      description: "d",
      instructions: "Stay in character.",
      rogue: "value",
    });
    setVeniceChatResponse(bloated);

    render(<CharacterLibrary onEdit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Auto-create prompt..."), {
      target: { value: "Make me a captain" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create me/i }));

    await waitFor(() => {
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        expect.stringMatching(/invalid|unparseable/i),
      );
    });
    expect(mocks.upsertMock).not.toHaveBeenCalled();
  });

  it("does NOT call upsert when avatar image generation returns no URL", async () => {
    setVeniceChatResponse(validCreateMeJson());
    // chat/completions returns the JSON, then image/generate returns empty.
    mocks.veniceFetchMock.mockResolvedValueOnce({
      data: { choices: [{ message: { content: validCreateMeJson() } }] },
      response: new Response(),
      headers: {},
      diagnostics: {},
    });
    mocks.veniceFetchMock.mockResolvedValueOnce({
      // No images key.
      data: { images: [] },
      response: new Response(),
      headers: {},
      diagnostics: {},
    });

    render(<CharacterLibrary onEdit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Auto-create prompt..."), {
      target: { value: "Make me a captain" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create me/i }));

    await waitFor(() => {
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        expect.stringMatching(/Avatar generation failed|card not saved/i),
      );
    });
    expect(mocks.upsertMock).not.toHaveBeenCalled();
  });

  it("does NOT call upsert or open editor when Family Safe Mode refuses the avatar prompt", async () => {
    settingsState.localFamilySafeModeEnabled = true;
    // Pre-flight on the prompt → allowed; post-flight on validated JSON → allowed.
    // Avatar prompt guard → refused.
    let callIndex = 0;
    mocks.guardMock.mockImplementation(() => {
      callIndex++;
      // 1st call: pre-flight on user prompt — allowed
      // 2nd call: post-flight on JSON model output — allowed
      // 3rd call: avatar image prompt guard — REFUSED (block)
      if (callIndex === 3) return { allowed: false };
      return { allowed: true };
    });

    setVeniceChatResponse(validCreateMeJson());

    render(<CharacterLibrary onEdit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Auto-create prompt..."), {
      target: { value: "Make me a captain" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create me/i }));

    await waitFor(() => {
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        expect.stringMatching(/Avatar blocked by safety guard/i),
      );
    });
    expect(mocks.upsertMock).not.toHaveBeenCalled();
  });

  it("blocks the entire Create Me flow in Family Safe Mode when the user prompt itself is refused", async () => {
    settingsState.localFamilySafeModeEnabled = true;
    mocks.guardMock.mockReturnValue({ allowed: false });

    render(<CharacterLibrary onEdit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Auto-create prompt..."), {
      target: { value: "Sketch a minor" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create me/i }));

    await waitFor(() => {
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        expect.stringMatching(/Blocked by safety guard/i),
      );
    });
    expect(mocks.veniceFetchMock).not.toHaveBeenCalled();
    expect(mocks.upsertMock).not.toHaveBeenCalled();
  });

  it("calls upsert and onEdit on the happy path (avatar produced)", async () => {
    const onEdit = vi.fn();
    // /chat/completions
    mocks.veniceFetchMock.mockResolvedValueOnce({
      data: { choices: [{ message: { content: validCreateMeJson() } }] },
      response: new Response(),
      headers: {},
      diagnostics: {},
    });
    // /image/generate
    mocks.veniceFetchMock.mockResolvedValueOnce({
      data: { images: [mocks.avatarDataUriFallback] },
      response: new Response(),
      headers: {},
      diagnostics: {},
    });

    render(<CharacterLibrary onEdit={onEdit} />);
    fireEvent.change(screen.getByPlaceholderText("Auto-create prompt..."), {
      target: { value: "Make me a captain" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create me/i }));

    await waitFor(() => {
      expect(mocks.upsertMock).toHaveBeenCalledTimes(1);
    });
    const upsertArg = mocks.upsertMock.mock.calls[0]?.[0] as {
      avatar?: unknown;
      schema?: string;
      name?: string;
      instructions?: string;
    };
    expect(upsertArg.avatar).toMatchObject({ mimeType: "image/png" });
    expect(upsertArg.schema).toBe("CharacterCardV1");
    expect(upsertArg.name).toBe("Aurora the Navigator");
    expect(upsertArg.instructions).toMatch(/Stay in character/);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

describe("CharacterLibrary — empty state + search/filter wiring", () => {
  it("renders the Create Me input + Adult filter even when no cards are loaded", () => {
    render(<CharacterLibrary onEdit={vi.fn()} />);
    expect(screen.getByPlaceholderText("Auto-create prompt...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create me/i })).toBeInTheDocument();
  });
});
