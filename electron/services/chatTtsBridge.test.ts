// VERIFY-114 regression guard
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
  mkdir: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  readdir: vi.fn(),
  unlink: vi.fn(),
}));
const guardedMock = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({ app: { getPath: () => "/user-data" } }));
vi.mock("node:fs/promises", () => ({ default: fsMock, ...fsMock }));
vi.mock("./guardPipeline", () => ({ performGuardedVeniceRequest: guardedMock }));
vi.mock("./logger", () => ({ logError: vi.fn() }));

import { clearTtsCache, synthesizeSpeech, validateSynthesizeSpeechOptions } from "./chatTtsBridge";

describe("chatTtsBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.mkdir.mockResolvedValue(undefined);
    fsMock.stat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.rename.mockResolvedValue(undefined);
    fsMock.rm.mockResolvedValue(undefined);
    fsMock.readdir.mockResolvedValue([]);
    guardedMock.mockResolvedValue({
      kind: "allowed",
      response: { ok: true, status: 200, body: Buffer.from("audio") },
    });
  });

  it("rejects malformed payloads before guard or filesystem access", async () => {
    await expect(synthesizeSpeech({ text: "" }, true, "work")).resolves.toMatchObject({ ok: false });
    expect(guardedMock).not.toHaveBeenCalled();
    expect(fsMock.mkdir).not.toHaveBeenCalled();
    expect(() => validateSynthesizeSpeechOptions({ text: "ok", speed: 99 })).toThrow(/speed/i);
  });

  it("binds the guarded request to the main-authoritative profile and keeps no-cache audio in memory", async () => {
    const result = await synthesizeSpeech({ text: " hello ", model: "tts-kokoro", voice: "af_heart" }, false, "work");

    expect(result).toMatchObject({ ok: true, cacheMode: "memory", mimeType: "audio/mpeg" });
    expect(result.audioBase64).toBe(Buffer.from("audio").toString("base64"));
    expect(guardedMock).toHaveBeenCalledWith(expect.objectContaining({ profileId: "work" }));
    expect(fsMock.mkdir).not.toHaveBeenCalled();
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("writes cached audio atomically only when caching is enabled", async () => {
    const result = await synthesizeSpeech({ text: "hello" }, true, "work");

    expect(result).toMatchObject({ ok: true, cacheMode: "disk", id: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(fsMock.mkdir).toHaveBeenCalled();
    expect(fsMock.writeFile).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), Buffer.from("audio"), { mode: 0o600 });
    expect(fsMock.rename).toHaveBeenCalled();
  });

  it("does not expose internal provider or filesystem exception text", async () => {
    guardedMock.mockRejectedValueOnce(new Error("/private/path secret backend failure"));
    await expect(synthesizeSpeech({ text: "hello" }, false, "work")).resolves.toEqual({
      ok: false,
      error: "Speech synthesis failed.",
    });

    fsMock.readdir.mockRejectedValueOnce(new Error("/private/cache permission denied"));
    await expect(clearTtsCache()).resolves.toEqual({ ok: false, error: "Unable to clear the TTS cache." });
  });
});
