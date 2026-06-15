/** @fileoverview Unit tests for attachment reading and assembly. */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isSupportedTextFile,
  isSupportedImageFile,
  assembleAttachmentContext,
  processFileAttachment,
  readLocalPathAttachment,
  readTextFileAttachment,
} from "./attachmentService";
import { desktopFileReader } from "./desktopBridge";
import type { Attachment } from "../types/attachment";

// Mock the research provider to avoid network calls.
vi.mock("../research/providers/veniceResearchProvider", () => ({
  veniceResearchProvider: {
    supports: { search: true, scrape: true, socialDiscovery: false, documentParsing: false },
    scrape: vi.fn(),
  },
}));

// Mock desktopFileReader
vi.mock("./desktopBridge", () => ({
  desktopFileReader: { readLocalFile: vi.fn() },
  isElectron: () => false,
}));

describe("attachment type detection", () => {
  it("recognises supported text files by extension", () => {
    const file = new File(["hello"], "script.ts", { type: "text/plain" });
    expect(isSupportedTextFile(file)).toBe(true);
  });

  it("rejects unsupported files", () => {
    const file = new File(["hello"], "archive.zip", { type: "application/zip" });
    expect(isSupportedTextFile(file)).toBe(false);
    expect(isSupportedImageFile(file)).toBe(false);
  });

  it("recognises supported images by MIME type", () => {
    const png = new File([""], "img.png", { type: "image/png" });
    expect(isSupportedImageFile(png)).toBe(true);
    const jpg = new File([""], "img.jpg", { type: "image/jpeg" });
    expect(isSupportedImageFile(jpg)).toBe(true);
  });
});

describe("assembleAttachmentContext", () => {
  it("wraps file attachments in <file> tags", () => {
    const atts: Attachment[] = [
      { id: "1", type: "file", name: "foo.ts", content: "const x = 1;", size: 12 },
    ];
    const ctx = assembleAttachmentContext(atts);
    expect(ctx.text).toContain('<file name="foo.ts">');
    expect(ctx.text).toContain("const x = 1;");
    expect(ctx.images.length).toBe(0);
    expect(ctx.truncated).toBe(false);
  });

  // T-156 regression guard: attachment body content must be XML-escaped so
  // malicious or accidental delimiters cannot break out of the wrapper tags.
  it("escapes XML metacharacters in attachment body and name", () => {
    const atts: Attachment[] = [
      {
        id: "1",
        type: "file",
        name: 'evil"name',
        content: "</file><script>alert('xss')</script>&more",
        size: 42,
      },
    ];
    const ctx = assembleAttachmentContext(atts);
    expect(ctx.text).toContain('<file name="evil&quot;name">');
    expect(ctx.text).not.toContain("</file><script>");
    expect(ctx.text).toContain("&lt;/file&gt;&lt;script&gt;");
    expect(ctx.text).toContain("&amp;more");
    expect(ctx.text).toMatch(/<file name="evil&quot;name">\s*&lt;\/file&gt;/);
  });

  it("wraps url attachments in <doc> tags", () => {
    const atts: Attachment[] = [
      { id: "1", type: "url", name: "https://example.com", content: "Hello world", size: 11 },
    ];
    const ctx = assembleAttachmentContext(atts);
    expect(ctx.text).toContain('<doc url="https://example.com">');
  });

  it("collects image attachments separately", () => {
    const atts: Attachment[] = [
      { id: "1", type: "image", name: "img.png", content: "data:image/png;base64,abc", size: 100 },
    ];
    const ctx = assembleAttachmentContext(atts);
    expect(ctx.text).toBe("");
    expect(ctx.images.length).toBe(1);
    expect(ctx.images[0].name).toBe("img.png");
  });

  it("truncates when total text exceeds budget", () => {
    const big = "x".repeat(600 * 1024);
    const atts: Attachment[] = [
      { id: "1", type: "file", name: "big1.txt", content: big, size: big.length },
      { id: "2", type: "file", name: "big2.txt", content: big, size: big.length },
    ];
    const ctx = assembleAttachmentContext(atts);
    expect(ctx.truncated).toBe(true);
    expect(ctx.notices.length).toBeGreaterThan(0);
  });

  it("caps attachments at 5", () => {
    const atts: Attachment[] = Array.from({ length: 7 }, (_, i) => ({
      id: `a${i}`,
      type: "file",
      name: `f${i}.txt`,
      content: "hi",
      size: 2,
    }));
    const ctx = assembleAttachmentContext(atts);
    expect(ctx.truncated).toBe(true);
    expect(ctx.notices.some((n) => n.includes("5"))).toBe(true);
  });
});

describe("processFileAttachment", () => {
  it("reads a text file within size limit", async () => {
    const file = new File(["hello world"], "test.txt", { type: "text/plain" });
    const att = await processFileAttachment(file);
    expect(att.type).toBe("file");
    expect(att.name).toBe("test.txt");
    expect(att.content).toBe("hello world");
  });

  it("throws for unsupported files", async () => {
    const file = new File([""], "data.zip", { type: "application/zip" });
    await expect(processFileAttachment(file)).rejects.toThrow(/unsupported/i);
  });
});

describe("readLocalPathAttachment", () => {
  const readLocalFile = vi.mocked(desktopFileReader.readLocalFile);

  beforeEach(() => readLocalFile.mockReset());

  it("uses the main-process selected filename", async () => {
    readLocalFile.mockResolvedValueOnce({ ok: true, content: "hello", filename: "selected.md" });
    await expect(readLocalPathAttachment()).resolves.toMatchObject({
      type: "file",
      name: "selected.md",
      content: "hello",
    });
    expect(readLocalFile).toHaveBeenCalledWith();
  });

  it("returns null when the main-process dialog is canceled", async () => {
    readLocalFile.mockResolvedValueOnce({ ok: true, canceled: true });
    await expect(readLocalPathAttachment()).resolves.toBeNull();
  });
});

describe("readImageAttachment dimensions validation", () => {
  let originalCreateObjectURL: any;
  let originalRevokeObjectURL: any;
  let originalImage: any;

  beforeEach(() => {
    originalCreateObjectURL = global.URL.createObjectURL;
    originalRevokeObjectURL = global.URL.revokeObjectURL;
    originalImage = global.Image;

    global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    global.URL.createObjectURL = originalCreateObjectURL;
    global.URL.revokeObjectURL = originalRevokeObjectURL;
    global.Image = originalImage;
  });

  it("downscales small byte-size image if dimensions are too large (> 1024)", async () => {
    class MockHugeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 5000;
      height = 3000;
      set src(val: string) {
        setTimeout(() => { this.onload?.(); }, 0);
      }
    }
    global.Image = MockHugeImage as any;

    const originalCreateElement = document.createElement;
    document.createElement = vi.fn((tagName) => {
      if (tagName === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: vi.fn(),
          }),
          toDataURL: () => "data:image/png;base64,mocked-downscaled-data",
        } as any;
      }
      return originalCreateElement.call(document, tagName);
    }) as any;

    const file = new File([new ArrayBuffer(100)], "large-dim.png", { type: "image/png" });
    const att = await processFileAttachment(file);
    
    expect(att.type).toBe("image");
    expect(att.content).toBe("data:image/png;base64,mocked-downscaled-data");
    
    document.createElement = originalCreateElement;
  });

  it("rejects image if decode fails", async () => {
    class MockCorruptImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(val: string) {
        setTimeout(() => { this.onerror?.(); }, 0);
      }
    }
    global.Image = MockCorruptImage as any;

    const file = new File([new ArrayBuffer(100)], "corrupt.png", { type: "image/png" });
    await expect(processFileAttachment(file)).rejects.toThrow("Failed to read image dimensions.");
  });

  it("does not propagate raw image inspection errors", async () => {
    global.URL.createObjectURL = vi.fn(() => {
      throw new Error("Authorization: Bearer secret-token /Users/private/image.png");
    });

    const file = new File([new ArrayBuffer(100)], "private.png", { type: "image/png" });
    const rejection = processFileAttachment(file);
    await expect(rejection).rejects.toThrow("Failed to read image dimensions.");
    await expect(rejection).rejects.not.toThrow("secret-token");
  });
});

describe("image type detection fallbacks and blank MIME type handling", () => {
  it("recognises supported images by extension when type is empty", () => {
    const png = new File([""], "img.png", { type: "" });
    expect(isSupportedImageFile(png)).toBe(true);
    const webp = new File([""], "img.webp", { type: "" });
    expect(isSupportedImageFile(webp)).toBe(true);
    const jpg = new File([""], "img.jpg", { type: "" });
    expect(isSupportedImageFile(jpg)).toBe(true);
    const jpeg = new File([""], "img.jpeg", { type: "" });
    expect(isSupportedImageFile(jpeg)).toBe(true);
    
    // Check unsupported extension
    const zip = new File([""], "img.zip", { type: "" });
    expect(isSupportedImageFile(zip)).toBe(false);
  });

  it("reads image file and falls back to extension MIME type if type is blank", async () => {
    class MockSmallImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 100;
      height = 100;
      set src(val: string) {
        setTimeout(() => { this.onload?.(); }, 0);
      }
    }
    const originalImage = global.Image;
    global.Image = MockSmallImage as any;

    try {
      const file = new File([new ArrayBuffer(10)], "fallback.webp", { type: "" });
      const att = await processFileAttachment(file);
      expect(att.type).toBe("image");
      expect(att.content).toContain("data:image/webp;base64,");
    } finally {
      global.Image = originalImage;
    }
  });
});

describe("readTextFileAttachment slicing", () => {
  it("slices files larger than MAX_ATTACHMENT_FILE_BYTES", async () => {
    const hugeText = "x".repeat(300 * 1024); // exceeds 256 KiB
    const file = new File([hugeText], "huge.txt", { type: "text/plain" });
    const att = await readTextFileAttachment(file);
    expect(att.type).toBe("file");
    expect(att.content.length).toBe(256 * 1024);
    expect(att.content).toBe("x".repeat(256 * 1024));
  });
});
