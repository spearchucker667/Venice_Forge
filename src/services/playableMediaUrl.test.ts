import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./desktopBridge", () => ({
  isElectron: vi.fn(() => true),
  desktopMedia: {
    resolveUrl: vi.fn(async (input: { scheme: string; objectId: string; resourceUrl?: string }) => {
      return `${input.resourceUrl ?? `${input.scheme}://${input.objectId}`}?cap=token`;
    }),
  },
}));

import { resolvePlayableMediaUrl } from "./playableMediaUrl";
import { desktopMedia, isElectron } from "./desktopBridge";

describe("resolvePlayableMediaUrl", () => {
  beforeEach(() => {
    vi.mocked(isElectron).mockReturnValue(true);
    vi.mocked(desktopMedia.resolveUrl).mockClear();
  });

  it("issues a capability URL for venice-media object ids", async () => {
    const id = "a".repeat(64);
    const url = await resolvePlayableMediaUrl(`venice-media://${id}`);
    expect(desktopMedia.resolveUrl).toHaveBeenCalledWith({
      scheme: "venice-media",
      objectId: id,
      resourceUrl: `venice-media://${id}`,
    });
    expect(url).toContain("cap=token");
  });

  it("accepts the URL-serialized trailing-slash form and issues a canonical base", async () => {
    const id = "c".repeat(64);
    const url = await resolvePlayableMediaUrl(`venice-media://${id}/`);
    expect(desktopMedia.resolveUrl).toHaveBeenCalledWith({
      scheme: "venice-media",
      objectId: id,
      resourceUrl: `venice-media://${id}`,
    });
    expect(url).toContain("cap=token");
    expect(url).not.toContain("//?cap");
  });

  it("strips only trailing slashes from venice-media URLs with query strings", async () => {
    const id = "e".repeat(64);
    const url = await resolvePlayableMediaUrl(`venice-media://${id}?foo=bar`);
    expect(desktopMedia.resolveUrl).toHaveBeenCalledWith({
      scheme: "venice-media",
      objectId: id,
      resourceUrl: `venice-media://${id}`,
    });
    expect(url).toContain("cap=token");
  });

  it("issues a capability URL for venice-character-cache trailing-slash forms", async () => {
    const id = "d".repeat(64);
    const url = await resolvePlayableMediaUrl(`venice-character-cache://${id}/`);
    expect(desktopMedia.resolveUrl).toHaveBeenCalledWith({
      scheme: "venice-character-cache",
      objectId: id,
      resourceUrl: `venice-character-cache://${id}`,
    });
    expect(url).toContain("cap=token");
  });

  it("issues a capability URL for venice-tts://<slug>/<id>.mp3", async () => {
    const id = "f".repeat(64);
    const url = await resolvePlayableMediaUrl(`venice-tts://some-voice/${id}.mp3`);
    expect(desktopMedia.resolveUrl).toHaveBeenCalledWith({
      scheme: "venice-tts",
      objectId: id,
      resourceUrl: `venice-tts://some-voice/${id}.mp3`,
    });
    expect(url).toContain("cap=token");
  });

  it("leaves non-custom URLs untouched", async () => {
    await expect(resolvePlayableMediaUrl("data:image/png;base64,abc")).resolves.toBe(
      "data:image/png;base64,abc",
    );
    expect(desktopMedia.resolveUrl).not.toHaveBeenCalled();
  });

  it("leaves http(s) URLs untouched", async () => {
    await expect(resolvePlayableMediaUrl("https://example.com/img.png")).resolves.toBe(
      "https://example.com/img.png",
    );
    expect(desktopMedia.resolveUrl).not.toHaveBeenCalled();
  });

  it("always issues a fresh capability URL even when the input already has cap=", async () => {
    // Fresh-cap contract: existing cap= tokens may carry an expired session-bound
    // token (5-min TTL in DEFAULT_CAPABILITY_TOKEN_TTL_MS), so Save As and TTS
    // playback must refresh on every call rather than short-circuit.
    const id = "b".repeat(64);
    const existing = `venice-media://${id}?cap=existing-token`;
    const url = await resolvePlayableMediaUrl(existing);
    expect(desktopMedia.resolveUrl).toHaveBeenCalledWith({
      scheme: "venice-media",
      objectId: id,
      resourceUrl: `venice-media://${id}`,
    });
    expect(url).toContain("cap=token"); // mock returns "token"
    expect(url).not.toContain("existing-token");
  });

  it("returns empty string for custom protocols when not running under Electron", async () => {
    vi.mocked(isElectron).mockReturnValue(false);
    const id = "0".repeat(64);
    await expect(resolvePlayableMediaUrl(`venice-media://${id}`)).resolves.toBe("");
    await expect(resolvePlayableMediaUrl(`venice-character-cache://${id}`)).resolves.toBe("");
    await expect(resolvePlayableMediaUrl(`venice-tts://voice/${id}.mp3`)).resolves.toBe("");
    expect(desktopMedia.resolveUrl).not.toHaveBeenCalled();
  });

  it("leaves non-custom URLs untouched when not running under Electron", async () => {
    vi.mocked(isElectron).mockReturnValue(false);
    await expect(resolvePlayableMediaUrl("https://example.com/img.png")).resolves.toBe(
      "https://example.com/img.png",
    );
    expect(desktopMedia.resolveUrl).not.toHaveBeenCalled();
  });

  it("returns empty string when desktopMedia.resolveUrl throws", async () => {
    vi.mocked(desktopMedia.resolveUrl).mockRejectedValueOnce(new Error("IPC failed"));
    const id = "1".repeat(64);
    await expect(resolvePlayableMediaUrl(`venice-media://${id}`)).resolves.toBe("");
  });

  it("returns empty string when desktopMedia.resolveUrl returns a tokenless URL", async () => {
    const id = "2".repeat(64);
    vi.mocked(desktopMedia.resolveUrl).mockResolvedValueOnce(`venice-media://${id}`);
    await expect(resolvePlayableMediaUrl(`venice-media://${id}`)).resolves.toBe("");
  });

  it("returns the input untouched for empty / nullish values", async () => {
    await expect(resolvePlayableMediaUrl("")).resolves.toBe("");
    await expect(resolvePlayableMediaUrl(null as unknown as string)).resolves.toBe(
      null as unknown as string,
    );
    await expect(resolvePlayableMediaUrl(undefined as unknown as string)).resolves.toBe(
      undefined as unknown as string,
    );
    expect(desktopMedia.resolveUrl).not.toHaveBeenCalled();
  });

  it("does not issue a capability URL for an unknown custom-protocol scheme", async () => {
    const id = "9".repeat(64);
    await expect(resolvePlayableMediaUrl(`venice-other://${id}`)).resolves.toBe(
      `venice-other://${id}`,
    );
    expect(desktopMedia.resolveUrl).not.toHaveBeenCalled();
  });

  it("fails closed for a malformed venice-media id (wrong length)", async () => {
    await expect(resolvePlayableMediaUrl("venice-media://abc123")).resolves.toBe("");
    expect(desktopMedia.resolveUrl).not.toHaveBeenCalled();
  });
});
