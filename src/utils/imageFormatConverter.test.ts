/** @fileoverview Tests for image format converter and signature validation (Workstream B). */

import { describe, expect, it, vi } from "vitest";
import {
  convertImageFormat,
  validateImageSignature,
} from "./imageFormatConverter";

// Valid 1x1 PNG bytes (starts with \x89PNG\r\n\x1a\n)
const VALID_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_B64}`;

// Valid WebP bytes (starts with RIFF....WEBP)
const VALID_WEBP_B64 =
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
const VALID_WEBP_DATA_URL = `data:image/webp;base64,${VALID_WEBP_B64}`;

describe("validateImageSignature", () => {
  it("validates genuine PNG bytes", () => {
    expect(validateImageSignature(VALID_PNG_DATA_URL, "image/png")).toBe(true);
    expect(validateImageSignature(VALID_PNG_DATA_URL, "image/webp")).toBe(false);
  });

  it("validates genuine WebP bytes", () => {
    expect(validateImageSignature(VALID_WEBP_DATA_URL, "image/webp")).toBe(true);
    expect(validateImageSignature(VALID_WEBP_DATA_URL, "image/png")).toBe(false);
  });

  it("rejects mismatched MIME and binary signature", () => {
    // A data URL claiming to be webp but containing PNG bytes
    const fakeWebp = `data:image/webp;base64,${VALID_PNG_B64}`;
    expect(validateImageSignature(fakeWebp, "image/webp")).toBe(false);
  });

  it("rejects invalid or corrupted base64 payloads", () => {
    expect(validateImageSignature("data:image/png;base64,not-valid", "image/png")).toBe(false);
    expect(validateImageSignature("", "image/png")).toBe(false);
  });
});

describe("convertImageFormat", () => {
  it("returns existing data URL immediately when source format matches target format", async () => {
    const result = await convertImageFormat(VALID_PNG_DATA_URL, "png");
    expect(result.mimeType).toBe("image/png");
    expect(result.dataUrl).toBe(VALID_PNG_DATA_URL);
    expect(result.byteCount).toBeGreaterThan(0);
  });

  it("returns existing WebP data URL immediately when target is webp", async () => {
    const result = await convertImageFormat(VALID_WEBP_DATA_URL, "webp");
    expect(result.mimeType).toBe("image/webp");
    expect(result.dataUrl).toBe(VALID_WEBP_DATA_URL);
    expect(result.byteCount).toBeGreaterThan(0);
  });

  it("converts PNG to WEBP using Canvas", async () => {
    class MockSmallImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 100;
      height = 100;
      naturalWidth = 100;
      naturalHeight = 100;
      set src(_val: string) {
        setTimeout(() => {
          this.onload?.();
        }, 0);
      }
    }
    const originalImage = global.Image;
    global.Image = MockSmallImage as unknown as typeof Image;
    const toDataUrlSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockImplementation((type?: string) => {
        if (type === "image/webp") return VALID_WEBP_DATA_URL;
        return VALID_PNG_DATA_URL;
      });

    try {
      const result = await convertImageFormat(VALID_PNG_DATA_URL, "webp");
      expect(result.mimeType).toBe("image/webp");
      expect(result.dataUrl).toContain("data:image/webp;base64,");
    } finally {
      toDataUrlSpy.mockRestore();
      global.Image = originalImage;
    }
  });
});
