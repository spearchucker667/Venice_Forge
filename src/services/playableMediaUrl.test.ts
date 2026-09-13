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

  it("leaves already-issued capability URLs alone", async () => {
    const id = "b".repeat(64);
    const existing = `venice-media://${id}?cap=existing`;
    await expect(resolvePlayableMediaUrl(existing)).resolves.toBe(existing);
    expect(desktopMedia.resolveUrl).not.toHaveBeenCalled();
  });
});
