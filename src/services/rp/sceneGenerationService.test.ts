/** @fileoverview Unit tests for scene generation service.
 *
 *  VERIFY-049 regression guard: scene generation must route through the
 *  canonical Venice client (`veniceFetch`) and must not call
 *  `fetch('/api/venice/image/generate')` directly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateScene, extractScenePrompt } from "./sceneGenerationService";
import type { RpChatV1, SceneGenerationRequest, SceneGenerationError } from "../../types/rp";

const originalFetch = globalThis.fetch;

vi.mock("../../shared/safety/characterImportSafety", () => ({
  assessScenePrompt: vi.fn((_prompt: string, _negative: string | undefined, enabled: boolean) => ({
    allow: true,
    userMessage: "",
    ...(enabled ? {} : { skipped: true }),
  })),
}));

vi.mock("../desktopBridge", () => ({
  isElectron: vi.fn(() => false),
  desktopVenice: { request: vi.fn() },
}));

vi.mock("./characterCardService", () => ({
  readCharacterCard: vi.fn(),
}));

vi.mock("./assetService", () => ({
  saveAsset: vi.fn((a) => Promise.resolve(a)),
}));

vi.mock("../../safetyHydration", () => ({
  getEffectiveRendererLocalFamilySafeModeEnabled: vi.fn(() => false),
  getEffectiveRendererVeniceApiSafeMode: vi.fn(() => false),
}));

vi.mock("../veniceClient", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../veniceClient")>();
  return {
    ...mod,
    veniceFetch: vi.fn(),
  };
});

import { veniceFetch } from "../veniceClient";
import { readCharacterCard } from "./characterCardService";
import { saveAsset } from "./assetService";
import { assessScenePrompt } from "../../shared/safety/characterImportSafety";

const baseChat = (): RpChatV1 => ({
  schema: "RpChatV1",
  id: "chat_test_01",
  title: "Test Chat",
  characterIds: ["char_01"],
  lorebookIds: [],
  modelId: "venice-uncensored",
  messages: [
    { id: "m1", role: "user", content: "Hello there.", createdAt: 1 },
    { id: "m2", role: "character", content: "General Kenobi.", characterId: "char_01", createdAt: 2 },
  ],
  adult: false,
  metadata: { pinned: false, archived: false, tags: [] },
  createdAt: 1,
  updatedAt: 2,
});

const baseReq = (): SceneGenerationRequest => ({
  rpChatId: "chat_test_01",
});

function expectError(result: { ok: boolean }, expectedError: string, expectedSafetyBlocked = false) {
  expect(result.ok).toBe(false);
  const err = result as unknown as SceneGenerationError;
  expect(err.error).toBe(expectedError);
  expect(err.safetyBlocked).toBe(expectedSafetyBlocked);
}

describe("extractScenePrompt", () => {
  it("returns the promptOverride when provided", () => {
    const chat = baseChat();
    expect(extractScenePrompt(chat, { promptOverride: "Custom scene." })).toBe("Custom scene.");
  });

  it("returns the most recent non-system message content", () => {
    const chat = baseChat();
    expect(extractScenePrompt(chat)).toBe("General Kenobi.");
  });

  it("falls back to chat title when no valid messages", () => {
    const chat: RpChatV1 = { ...baseChat(), messages: [] };
    expect(extractScenePrompt(chat)).toBe("Test Chat");
  });

  it("falls back to 'A scene.' when title is also missing", () => {
    const chat: RpChatV1 = { ...baseChat(), title: "", messages: [] };
    expect(extractScenePrompt(chat)).toBe("A scene.");
  });
});

describe("generateScene", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    (veniceFetch as unknown as ReturnType<typeof vi.fn>).mockReset();
    (readCharacterCard as unknown as ReturnType<typeof vi.fn>).mockReset();
    (saveAsset as unknown as ReturnType<typeof vi.fn>).mockReset();
    (assessScenePrompt as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ allow: true, userMessage: "" });
  });

  it("returns safetyBlocked=true when assessScenePrompt blocks", async () => {
    (assessScenePrompt as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      allow: false,
      userMessage: "Blocked for safety.",
    });

    const result = await generateScene(baseChat(), baseReq());
    expectError(result, "Blocked for safety.", true);
    expect(veniceFetch).not.toHaveBeenCalled();
  });

  it("returns error when no transport is available", async () => {
    const originalFetchFn = globalThis.fetch;
    // @ts-expect-error deliberate deletion for test
    globalThis.fetch = undefined;

    const result = await generateScene(baseChat(), baseReq());
    expectError(result, "No transport available.");

    globalThis.fetch = originalFetchFn;
  });

  it("calls veniceFetch with the correct payload and timeout", async () => {
    (veniceFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        images: [{ url: "https://venice.ai/image.png" }],
        seed: 42,
      },
    });
    (readCharacterCard as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req: SceneGenerationRequest = {
      ...baseReq(),
      model: "sdxl",
      negativePrompt: "blurry",
      seed: 123,
      width: 512,
      height: 512,
      steps: 20,
    };

    const result = await generateScene(baseChat(), req);
    expect(result.ok).toBe(true);
    expect(veniceFetch).toHaveBeenCalledWith(
      "/image/generate",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          model: "sdxl",
          prompt: "General Kenobi.",
          negative_prompt: "blurry",
          seed: 123,
          width: 512,
          height: 512,
          steps: 20,
        }),
        timeoutMs: 120_000,
      })
    );
  });

  it("returns a safe error when veniceFetch throws", async () => {
    (veniceFetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network timeout"));
    (readCharacterCard as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await generateScene(baseChat(), baseReq());
    expectError(result, "Image generation failed. Please try again.");
  });

  it("does not leak raw veniceFetch error messages", async () => {
    (veniceFetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("ENOENT: no such file or directory, open /Users/admin/.venice/secret.key")
    );
    (readCharacterCard as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await generateScene(baseChat(), baseReq());
    expectError(result, "Image generation failed. Please try again.");
    const err = result as unknown as SceneGenerationError;
    expect(err.error).not.toContain("ENOENT");
    expect(err.error).not.toContain("secret.key");
    expect(err.error).not.toContain("/Users/admin");
  });

  it("returns an error when the response has no images", async () => {
    (veniceFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { images: [] },
    });
    (readCharacterCard as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await generateScene(baseChat(), baseReq());
    expectError(result, "Image generation returned no images.");
  });

  it("resolves character names and saves the asset", async () => {
    (veniceFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        images: [{ url: "https://venice.ai/image.png" }],
        seed: 7,
      },
    });
    (readCharacterCard as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "char_01",
      name: "Obi-Wan",
    } as unknown as Awaited<ReturnType<typeof readCharacterCard>>);

    const result = await generateScene(baseChat(), baseReq());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.asset.characterIds).toEqual(["Obi-Wan"]);
      expect(result.asset.url).toBe("https://venice.ai/image.png");
      expect(result.asset.seed).toBe(7);
    }
    expect(saveAsset).toHaveBeenCalled();
  });

  it("falls back to characterIds when card name is unavailable", async () => {
    (veniceFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        images: [{ b64_json: "base64data" }],
      },
    });
    (readCharacterCard as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await generateScene(baseChat(), baseReq());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.asset.characterIds).toEqual(["char_01"]);
      expect(result.asset.url).toBe("data:image/png;base64,base64data");
    }
  });

  it("returns a safe error when saveAsset throws", async () => {
    (veniceFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { images: [{ url: "https://venice.ai/image.png" }] },
    });
    (readCharacterCard as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (saveAsset as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Disk full"));

    const result = await generateScene(baseChat(), baseReq());
    expectError(result, "Failed to save scene asset. Please try again.");
  });

  it("does not leak raw saveAsset error messages", async () => {
    (veniceFetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { images: [{ url: "https://venice.ai/image.png" }] },
    });
    (readCharacterCard as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (saveAsset as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("EACCES: permission denied, mkdir /Users/admin/.venice/rp_assets")
    );

    const result = await generateScene(baseChat(), baseReq());
    expectError(result, "Failed to save scene asset. Please try again.");
    const err = result as unknown as SceneGenerationError;
    expect(err.error).not.toContain("EACCES");
    expect(err.error).not.toContain("permission denied");
    expect(err.error).not.toContain("/Users/admin");
  });
});
