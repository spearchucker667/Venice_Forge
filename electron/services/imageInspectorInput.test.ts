// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const createFromBuffer = vi.hoisted(() => vi.fn());
const persistGeneratedMedia = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  nativeImage: { createFromBuffer },
}));
vi.mock("./generatedMediaStore", () => ({
  persistGeneratedMedia,
  resolveGeneratedMedia: vi.fn(),
}));

import {
  detectImageMimeType,
  IMAGE_INSPECTOR_MAX_BYTES,
  persistImageInspectorInput,
  validateImageInspectorBytes,
} from "./imageInspectorInput";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
const jpeg = Buffer.from("ffd8ffe000000000", "hex");
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);

describe("Image Inspector input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createFromBuffer.mockReturnValue({
      isEmpty: () => false,
      getSize: () => ({ width: 512, height: 512 }),
    });
    persistGeneratedMedia.mockResolvedValue({
      id: "a".repeat(64),
      sha256: "a".repeat(64),
      url: `venice-media://${"a".repeat(64)}`,
    });
  });

  it("detects only PNG, JPEG, and WebP signatures", () => {
    expect(detectImageMimeType(png)).toBe("image/png");
    expect(detectImageMimeType(jpeg)).toBe("image/jpeg");
    expect(detectImageMimeType(webp)).toBe("image/webp");
    expect(detectImageMimeType(Buffer.from("GIF89a"))).toBeNull();
  });

  it("rejects unsupported, undersized, oversized, and undecodable inputs", () => {
    expect(() => validateImageInspectorBytes(Buffer.from("GIF89a"))).toThrow(/supported PNG, JPEG, or WebP/);

    createFromBuffer.mockReturnValueOnce({
      isEmpty: () => false,
      getSize: () => ({ width: 63, height: 512 }),
    });
    expect(() => validateImageInspectorBytes(png)).toThrow(/at least 64 pixels/);

    expect(() => validateImageInspectorBytes(Buffer.alloc(IMAGE_INSPECTOR_MAX_BYTES + 1))).toThrow(/byte limit/);

    createFromBuffer.mockReturnValueOnce({
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
    });
    expect(() => validateImageInspectorBytes(png)).toThrow(/could not be decoded/);
  });

  it("persists validated metadata without retaining a private source path", async () => {
    const input = await persistImageInspectorInput({
      bytes: png,
      source: "file",
      displayName: "/private/example/photo.png",
    });
    expect(input).toMatchObject({
      source: "file",
      displayName: "photo.png",
      mimeType: "image/png",
      width: 512,
      height: 512,
      byteLength: png.length,
      mediaId: "a".repeat(64),
    });
    expect(persistGeneratedMedia).toHaveBeenCalledWith(png, "image/png");
  });
});
