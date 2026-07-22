// VERIFY-115 regression guard
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AUDIO_PREFERENCES, useSettingsStore } from "../stores/settings-store";

const synthesize = vi.hoisted(() => vi.fn());
vi.mock("./desktopBridge", () => ({
  isElectron: () => true,
  desktopTts: { synthesize, clearCache: vi.fn() },
}));

import { chatTtsController } from "./chatTtsController";

describe("chatTtsController", () => {
  const audioSources: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    audioSources.length = 0;
    useSettingsStore.setState({
      audioPreferences: {
        ...DEFAULT_AUDIO_PREFERENCES,
        chatTts: { ...DEFAULT_AUDIO_PREFERENCES.chatTts, skipCodeBlocks: true, skipUrls: true, cacheEnabled: false },
      },
    });
    vi.stubGlobal("Audio", function MockAudio(this: Record<string, unknown>, source: string) {
      audioSources.push(source);
      this.src = source;
      this.volume = 1;
      this.playbackRate = 1;
      this.currentTime = 0;
      this.play = vi.fn(async () => undefined);
      this.pause = vi.fn();
      return this;
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:tts-memory"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    chatTtsController.stop();
    vi.unstubAllGlobals();
  });

  it("uses in-memory playback and applies the configured text filters", async () => {
    synthesize.mockResolvedValueOnce({
      ok: true,
      audioBase64: btoa("audio"),
      mimeType: "audio/mpeg",
      cacheMode: "memory",
    });

    await chatTtsController.play("m1", "Read https://example.com ```secret code```");

    expect(synthesize).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.not.stringContaining("https://example.com"),
    }), false);
    expect(synthesize.mock.calls[0][0].text).not.toContain("secret code");
    expect(audioSources).toEqual(["blob:tts-memory"]);
  });

  it("ignores a stale synthesis response after a newer play request", async () => {
    let resolveFirst!: (value: { ok: true; id: string; profileId: string; cacheMode: "disk" }) => void;
    const first = new Promise<{ ok: true; id: string; profileId: string; cacheMode: "disk" }>((resolve) => { resolveFirst = resolve; });
    synthesize
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ok: true, id: "b".repeat(64), profileId: "default", cacheMode: "disk" });

    const firstPlay = chatTtsController.play("m1", "first");
    const secondPlay = chatTtsController.play("m2", "second");
    await secondPlay;
    resolveFirst({ ok: true, id: "a".repeat(64), profileId: "default", cacheMode: "disk" });
    await firstPlay;

    expect(audioSources).toEqual([`venice-tts://default/${"b".repeat(64)}.mp3`]);
    expect(chatTtsController.getCurrentMessageId()).toBe("m2");
  });

  it("handles empty or fully filtered text gracefully", async () => {
    await chatTtsController.play("m3", "   ");
    expect(synthesize).not.toHaveBeenCalled();
    expect(chatTtsController.getState()).toBe("idle");

    await chatTtsController.play("m4", "```all code```");
    expect(synthesize).not.toHaveBeenCalled();
    expect(chatTtsController.getState()).toBe("idle");
  });
});
