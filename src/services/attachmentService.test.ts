/** @fileoverview Unit tests for attachment reading and assembly. */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  isSupportedTextFile,
  isSupportedImageFile,
  assembleAttachmentContext,
  processFileAttachment,
} from "./attachmentService";
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
    await expect(processFileAttachment(file)).rejects.toThrow(/Failed to decode image dimensions/);
  });
});
