// @vitest-environment jsdom
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useCharacterImage } from "./useCharacterImage";
import { desktopCharacterImage } from "../services/desktopBridge";

vi.mock("../services/desktopBridge", () => ({
  desktopCharacterImage: {
    getCachedUrl: vi.fn(),
  },
}));

vi.mock("../services/characterImageFallback", () => ({
  tryResolveCharacterImageFromPublicPage: vi.fn().mockResolvedValue(null),
}));

vi.mock("../services/characterImageDiagnostics", () => ({
  recordCharacterImageResolution: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useCharacterImage", () => {
  beforeEach(() => {
    vi.mocked(desktopCharacterImage.getCachedUrl).mockReset();
  });

  it("does not re-resolve the avatar when the parent passes a new object identity for the same character", async () => {
    vi.mocked(desktopCharacterImage.getCachedUrl).mockResolvedValue({
      ok: true,
      url: "file:///alan.png",
    });

    const initial = {
      id: "alan-watts",
      slug: "alan-watts",
      name: "Alan Watts",
      photoUrl: "https://outerface.venice.ai/api/characters/alan-watts/photo",
    };

    const { rerender } = renderHook(
      ({ snapVersion }) => useCharacterImage(
        { ...initial, _snap: snapVersion } as typeof initial & { _snap: number },
        { cacheKey: "chat-1" },
      ),
      { initialProps: { snapVersion: 0 } },
    );

    await waitFor(() =>
      expect(desktopCharacterImage.getCachedUrl).toHaveBeenCalledTimes(1),
    );

    rerender({ snapVersion: 1 });
    rerender({ snapVersion: 2 });

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(desktopCharacterImage.getCachedUrl).toHaveBeenCalledTimes(1);
  });

  it("includes the conversation cache key when deciding whether an async avatar result is current", async () => {
    const first = deferred<{ ok: true; url: string }>();
    vi.mocked(desktopCharacterImage.getCachedUrl)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ok: true, url: "file:///chat-b/alan.png" });

    const character = {
      id: "alan-watts",
      slug: "alan-watts",
      name: "Alan Watts",
      photoUrl: "https://outerface.venice.ai/api/characters/alan-watts/photo",
    };

    const { result, rerender } = renderHook(
      ({ cacheKey }) => useCharacterImage(character, { cacheKey }),
      { initialProps: { cacheKey: "chat-a" } },
    );

    rerender({ cacheKey: "chat-b" });

    await waitFor(() => expect(result.current.imageUrl).toBe("file:///chat-b/alan.png"));

    await act(async () => {
      first.resolve({ ok: true, url: "file:///chat-a/alan.png" });
      await first.promise;
    });

    expect(result.current.imageUrl).toBe("file:///chat-b/alan.png");
    expect(desktopCharacterImage.getCachedUrl).toHaveBeenCalledTimes(2);
  });
});
