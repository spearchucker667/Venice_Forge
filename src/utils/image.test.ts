/** @fileoverview Unit tests for image normalization, extraction, and filename utilities. */

import { describe, it, expect } from "vitest";
import { galleryFilename, normalizeImageData, extractImages, stripDataUrlPrefix, blobToDataUrl, getExtensionFromDataUrl } from "./image";

/** Tests for the galleryFilename helper. */
describe("galleryFilename", () => {
  /** Verifies that a filename is built from the item model and id. */
  it("builds a filename from item model and id", () => {
    const item = { model: "fluently-xl", id: "abc-123", prompt: "a cat", timestamp: 1000 };
    expect(galleryFilename(item)).toBe("fluently-xl-abc-123.png");
  });

  /** Verifies that the model falls back to "venice" when absent. */
  it("falls back to 'venice' when model is absent", () => {
    const item = { id: "xyz", prompt: "test", timestamp: 1 };
    expect(galleryFilename(item)).toMatch(/^venice-xyz\.png$/);
  });

  /** Verifies that the index parameter is used as a fallback id. */
  it("uses the index when id is absent", () => {
    const item = { model: "test-model", prompt: "p", timestamp: 1 };
    // When item.id is undefined, the index parameter is used as the fallback id
    expect(galleryFilename(item, 5)).toBe("test-model-5.png");
  });

  /** Verifies that unsafe characters are sanitised from model and id. */
  it("sanitises unsafe characters in model and id", () => {
    const item = { model: "my model/v1", id: "img 001", prompt: "x", timestamp: 1 };
    expect(galleryFilename(item)).not.toMatch(/[ /]/);
  });

  /**
   * Verifies that passing an item object yields the correct model/id filename.
   *
   * BUG-002 regression guard.
   */
  it("does NOT use item as a plain string (BUG-002 regression guard)", () => {
    const item = { model: "fluently-xl", id: "correct-id", prompt: "some prompt", timestamp: 9999 };
    // Passing item correctly should yield the model/id, not 'venice-undefined'
    const name = galleryFilename(item);
    expect(name).not.toContain("undefined");
    expect(name).toBe("fluently-xl-correct-id.png");
  });

  it("assigns .mp4 extension for generic video media (BUG-004 regression guard)", () => {
    const item = { mediaType: "video", model: "model-1", id: "123" };
    expect(galleryFilename(item)).toBe("model-1-123.mp4");
  });

  it("assigns .webm extension for webm download URLs (BUG-004 regression guard)", () => {
    const item = { mediaType: "video", downloadUrl: "https://example.com/file.webm?sig=123", model: "m", id: "i" };
    expect(galleryFilename(item)).toBe("m-i.webm");
  });

  it("appends suffix correctly", () => {
    const item = { model: "m", id: "i" };
    expect(galleryFilename(item, 0, "-upscaled")).toBe("m-i-upscaled.png");
  });
});

/** Tests for the normalizeImageData helper. */
describe("normalizeImageData", () => {
  /** Verifies that data URLs pass through unchanged. */
  it("passes through data: URLs unchanged", () => {
    const url = "data:image/png;base64,abc123";
    expect(normalizeImageData(url)).toBe(url);
  });

  /** Verifies that HTTPS URLs pass through unchanged. */
  it("passes through https URLs unchanged", () => {
    const url = "https://example.com/img.png";
    expect(normalizeImageData(url)).toBe(url);
  });

  it("rejects insecure http image URLs", () => {
    expect(normalizeImageData("http://example.com/img.png")).toBeNull();
  });

  /** Verifies that bare base64 strings are wrapped in a PNG data URL. */
  it("wraps a bare base64 string in a data URL", () => {
    // normalizeImageData requires length > 80 to treat as raw base64
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAA==";
    const result = normalizeImageData(b64);
    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/^data:image\/png;base64,/);
  });

  /** Verifies that empty or nullish input returns null. */
  it("returns null for empty input", () => {
    expect(normalizeImageData(null)).toBeNull();
    expect(normalizeImageData("")).toBeNull();
  });

  /** Verifies that nested object shapes are unwrapped correctly. */
  it("unwraps nested object shapes", () => {
    expect(normalizeImageData({ b64_json: "data:image/png;base64,abc" })).toBe("data:image/png;base64,abc");
    expect(normalizeImageData({ b64: "data:image/png;base64,1" })).toBe("data:image/png;base64,1");
    expect(normalizeImageData({ base64: "data:image/png;base64,2" })).toBe("data:image/png;base64,2");
    expect(normalizeImageData({ dataBase64: "data:image/png;base64,3" })).toBe("data:image/png;base64,3");
    expect(normalizeImageData({ dataUrl: "data:image/png;base64,4" })).toBe("data:image/png;base64,4");
    expect(normalizeImageData({ image: "data:image/png;base64,5" })).toBe("data:image/png;base64,5");
    expect(normalizeImageData({ url: "data:image/png;base64,6" })).toBe("data:image/png;base64,6");
    expect(normalizeImageData({ data: "data:image/png;base64,7" })).toBe("data:image/png;base64,7");
    expect(normalizeImageData({ content: "data:image/png;base64,8" })).toBe("data:image/png;base64,8");
  });

  /** Verifies that circular objects do not cause infinite recursion. */
  it("returns null for circular objects", () => {
    const obj: Record<string, unknown> = { b64_json: null };
    obj.b64_json = obj;
    expect(normalizeImageData(obj)).toBeNull();
  });

  it("returns null for primitive non-strings or unrecognised objects", () => {
    expect(normalizeImageData(123)).toBeNull();
    expect(normalizeImageData(true)).toBeNull();
    expect(normalizeImageData({ unknownKey: "value" })).toBeNull();
  });
});

/** Tests for the extractImages helper. */
describe("extractImages", () => {
  /** Verifies that images are extracted from a data array. */
  it("extracts images from a data array", () => {
    const payload = { data: [{ b64_json: "data:image/png;base64,X" }] };
    expect(extractImages(payload)).toEqual(["data:image/png;base64,X"]);
  });

  it("extracts images from an images array", () => {
    const payload = { images: ["data:image/png;base64,Y", "https://example.com/Z"] };
    expect(extractImages(payload)).toEqual(["data:image/png;base64,Y", "https://example.com/Z"]);
  });

  it("extracts from various top level properties", () => {
    expect(extractImages({ image: "data:image/png;base64,A" })).toEqual(["data:image/png;base64,A"]);
    expect(extractImages({ dataUrl: "data:image/png;base64,B" })).toEqual(["data:image/png;base64,B"]);
    expect(extractImages({ dataBase64: "data:image/png;base64,C" })).toEqual(["data:image/png;base64,C"]);
    expect(extractImages({ base64: "data:image/png;base64,D" })).toEqual(["data:image/png;base64,D"]);
    expect(extractImages({ url: "https://example.com/E" })).toEqual(["https://example.com/E"]);
  });

  /** Verifies that duplicate image URLs are deduplicated. */
  it("deduplicates identical image URLs", () => {
    const url = "data:image/png;base64,Z";
    const payload = { data: [{ b64_json: url }, { b64_json: url }] };
    expect(extractImages(payload)).toHaveLength(1);
  });

  /** Verifies that empty or null payloads yield an empty array. */
  it("returns empty array for empty payload", () => {
    expect(extractImages({})).toEqual([]);
    expect(extractImages(null)).toEqual([]);
  });

  it("extracts from a primitive string payload", () => {
    expect(extractImages("data:image/png;base64,hello")).toEqual(["data:image/png;base64,hello"]);
  });

  it("extracts from values when no top-level candidates exist", () => {
    const payload = {
      nested: "data:image/png;base64,nestedVal",
      nestedArray: ["https://example.com/arrayVal"]
    };
    expect(extractImages(payload)).toEqual(["data:image/png;base64,nestedVal", "https://example.com/arrayVal"]);
  });
});

describe("stripDataUrlPrefix", () => {
  it("removes the data url prefix", () => {
    expect(stripDataUrlPrefix("data:image/png;base64,iVBORw0KGgo")).toBe("iVBORw0KGgo");
    expect(stripDataUrlPrefix("data:image/jpeg;base64,iVBORw0KGgo")).toBe("iVBORw0KGgo");
    expect(stripDataUrlPrefix("data:image/webp;base64,iVBORw0KGgo")).toBe("iVBORw0KGgo");
  });

  it("leaves strings without prefix unchanged", () => {
    expect(stripDataUrlPrefix("iVBORw0KGgo")).toBe("iVBORw0KGgo");
  });

  it("handles empty or falsy values gracefully", () => {
    expect(stripDataUrlPrefix("")).toBe("");
    expect(stripDataUrlPrefix(undefined as unknown as string)).toBe("");
    expect(stripDataUrlPrefix(null as unknown as string)).toBe("");
  });
});

describe("getExtensionFromDataUrl", () => {
  it("derives extensions from image data URL MIME types", () => {
    expect(getExtensionFromDataUrl("data:image/png;base64,abc")).toBe("png");
    expect(getExtensionFromDataUrl("data:image/jpeg;base64,abc")).toBe("jpg");
    expect(getExtensionFromDataUrl("data:image/jpg;base64,abc")).toBe("jpg");
    expect(getExtensionFromDataUrl("data:image/webp;base64,abc")).toBe("webp");
    expect(getExtensionFromDataUrl("data:image/gif;base64,abc")).toBe("gif");
    expect(getExtensionFromDataUrl("data:image/avif;base64,abc")).toBe("avif");
  });

  it("defaults to png for unrecognised or missing MIME types", () => {
    expect(getExtensionFromDataUrl("data:text/plain;base64,abc")).toBe("png");
    expect(getExtensionFromDataUrl("plain-base64-string")).toBe("png");
    expect(getExtensionFromDataUrl("")).toBe("png");
  });
});

describe("blobToDataUrl", () => {
  it("converts a blob to a data URL", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const dataUrl = await blobToDataUrl(blob);
    expect(dataUrl).toMatch(/^data:text\/plain;base64,/);
  });

  it("handles FileReader error", async () => {
    const originalFileReader = global.FileReader;
    class MockFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onerror) this.onerror();
        }, 0);
      }
    }
    global.FileReader = MockFileReader as any;

    const blob = new Blob(["hello"]);
    await expect(blobToDataUrl(blob)).rejects.toThrow("Failed to serialize generated media.");

    global.FileReader = originalFileReader;
  });

  it("handles FileReader returning non-string result", async () => {
    const originalFileReader = global.FileReader;
    class MockFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result = new ArrayBuffer(0);
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    }
    global.FileReader = MockFileReader as any;

    const blob = new Blob(["hello"]);
    await expect(blobToDataUrl(blob)).rejects.toThrow("Generated media serialization returned a non-string result.");

    global.FileReader = originalFileReader;
  });
});
