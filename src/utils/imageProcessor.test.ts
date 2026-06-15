import { describe, it, expect } from "vitest";
import {
  detectMimeType,
  stripImageMetadata,
  routeAsset,
  processBase64Image,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from "./imageProcessor";

describe("Image Processor - Metadata Stripping", () => {
  it("does not label unknown binary data as PNG", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(detectMimeType(bytes)).toBeNull();
    const { data, report } = stripImageMetadata(bytes);
    expect(data).toEqual(bytes);
    expect(report.mimeType).toBe("application/octet-stream");
    expect(report.extension).toBe("bin");
    expect(report.warnings).toContain("Unsupported image format");
  });
  it("detects JPEG MIME type and strips APP1 segments", () => {
    // SOI (2 bytes) + APP1 marker with length (8 bytes) + APP0 (JFIF) with length (6 bytes) + EOI (2 bytes)
    const dummyJpeg = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xE1, 0x00, 0x06, 0x45, 0x78, 0x69, 0x66, // APP1 with Exif
      0xFF, 0xE0, 0x00, 0x04, 0xAA, 0xBB, // APP0
      0xFF, 0xD9, // EOI
    ]);

    const { mimeType } = detectMimeType(dummyJpeg)!;
    expect(mimeType).toBe("image/jpeg");

    const { data, report } = stripImageMetadata(dummyJpeg);
    expect(report.metadataRemoved).toBe(true);
    expect(report.warnings.length).toBe(0);

    // Should keep SOI, APP0, and EOI, but remove APP1
    const expected = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xE0, 0x00, 0x04, 0xAA, 0xBB, // APP0
      0xFF, 0xD9, // EOI
    ]);
    expect(data).toEqual(expected);
  });

  it("detects PNG MIME type and strips textual chunks", () => {
    const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    // IHDR (13 bytes payload + 12 bytes envelope) + tEXt (5 bytes payload + 12 bytes envelope) + IEND (0 bytes payload + 12 bytes envelope)
    const dummyPng = new Uint8Array([
      ...pngHeader,
      // IHDR
      0x00, 0x00, 0x00, 0x0D, // length: 13
      0x49, 0x48, 0x44, 0x52, // type: IHDR
      0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x02, 0x00, 0x00, 0x00, // data
      0x11, 0x22, 0x33, 0x44, // CRC
      // tEXt
      0x00, 0x00, 0x00, 0x05, // length: 5
      0x74, 0x45, 0x58, 0x74, // type: tEXt
      0x61, 0x62, 0x63, 0x64, 0x65, // data: abcde
      0x55, 0x66, 0x77, 0x88, // CRC
      // IEND
      0x00, 0x00, 0x00, 0x00, // length: 0
      0x49, 0x45, 0x4E, 0x44, // type: IEND
      0xAE, 0x42, 0x60, 0x82, // CRC
    ]);

    const { mimeType } = detectMimeType(dummyPng)!;
    expect(mimeType).toBe("image/png");

    const { data, report } = stripImageMetadata(dummyPng);
    expect(report.metadataRemoved).toBe(true);

    // Reconstructed PNG should omit tEXt chunk
    const expected = new Uint8Array([
      ...pngHeader,
      // IHDR
      0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x08, 0x02, 0x00, 0x00, 0x00,
      0x11, 0x22, 0x33, 0x44,
      // IEND
      0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4E, 0x44,
      0xAE, 0x42, 0x60, 0x82,
    ]);
    expect(data).toEqual(expected);
  });

  it("detects WebP container and strips EXIF chunks", () => {
    // RIFF (4) + Size (4) + WEBP (4) + VP8X (10) + EXIF (8 + 4 data + 4 pad)
    const header = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // "RIFF"
      0x2C, 0x00, 0x00, 0x00, // Size: 44 bytes (to be updated)
      0x57, 0x45, 0x42, 0x50, // "WEBP"
    ]);

    const vp8xChunk = new Uint8Array([
      0x56, 0x50, 0x48, 0x58, // "VPHX" (custom representation of critical chunk)
      0x0A, 0x00, 0x00, 0x00, // size: 10
      0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, // data
    ]);

    const exifChunk = new Uint8Array([
      0x45, 0x58, 0x49, 0x46, // "EXIF"
      0x04, 0x00, 0x00, 0x00, // size: 4
      0xA1, 0xB2, 0xC3, 0xD4, // data
    ]);

    const dummyWebp = new Uint8Array([...header, ...vp8xChunk, ...exifChunk]);

    const { mimeType } = detectMimeType(dummyWebp)!;
    expect(mimeType).toBe("image/webp");

    const { data, report } = stripImageMetadata(dummyWebp);
    expect(report.metadataRemoved).toBe(true);

    // Verify EXIF chunk was omitted and RIFF container size updated correctly
    const expectedBody = new Uint8Array([...vp8xChunk]);
    const expected = new Uint8Array([
      0x52, 0x49, 0x46, 0x46,
      0x16, 0x00, 0x00, 0x00, // size updated to 12 + 18 - 8 = 22 (0x16)
      0x57, 0x45, 0x42, 0x50,
      ...expectedBody,
    ]);
    expect(data).toEqual(expected);
  });
});

describe("Image Processor - Asset Routing", () => {
  it("routes based on keywords and priorities", () => {
    expect(routeAsset("an anime girl drawing with colored pencils")).toBe("anime");
    expect(routeAsset("shot on 35mm film bokeh background cinematic landscape")).toBe("cinematic");
    expect(routeAsset("close up headshot portrait of an actor with blue eyes")).toBe("portraits");
    expect(routeAsset("golden hour sunset view of mountain ranges")).toBe("landscapes");
    expect(routeAsset("perfume bottle studio display setup for advertising photography")).toBe("product");
  });

  it("falls back to uncategorized if no match", () => {
    expect(routeAsset("a simple plain red box")).toBe("uncategorized");
  });

  it("handles negative keywords", () => {
    // Portrait rule matches "woman", but if it contains "anime", anime has higher priority or negative check
    // Wait, let's verify if "anime landscape" doesn't route to landscapes because of priorities
    expect(routeAsset("cinematic portrait of a landscape")).toBe("cinematic"); // cinematic (9) > portraits (8) > landscapes (7)
  });
});

describe("Image Processor - Base64 operations", () => {
  it("converts to/from base64 strings and processes base64 directly", () => {
    const originalText = "VeniceForgeBinaryDataTest";
    const encoder = new TextEncoder();
    const bytes = encoder.encode(originalText);
    const base64Str = uint8ArrayToBase64(bytes, "image/png");
    
    expect(base64Str.startsWith("data:image/png;base64,")).toBe(true);
    
    const parsedBytes = base64ToUint8Array(base64Str);
    const decoder = new TextDecoder();
    expect(decoder.decode(parsedBytes)).toBe(originalText);

    // Test processBase64Image
    const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const dummyPng = new Uint8Array([
      ...pngHeader,
      0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4E, 0x44,
      0xAE, 0x42, 0x60, 0x82,
    ]);
    const b64 = uint8ArrayToBase64(dummyPng, "image/png");
    const processed = processBase64Image(b64);
    expect(processed.base64).toBeDefined();
    expect(processed.report.mimeType).toBe("image/png");
  });
});
