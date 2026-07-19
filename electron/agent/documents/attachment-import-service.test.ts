// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AttachmentImportService,
  MAX_ATTACHMENT_IMPORT_BYTES,
  type AttachmentImportRequest,
} from "./attachment-import-service";
import { ManagedDocumentService } from "./managed-document-service";

let root = "";
let documents: ManagedDocumentService;
let service: AttachmentImportService;

beforeEach(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vf-attachments-"));
  documents = new ManagedDocumentService(root);
  service = new AttachmentImportService(documents);
});

afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true });
});

function makeRequest(overrides: Partial<AttachmentImportRequest> = {}): AttachmentImportRequest {
  return {
    attachmentId: "att_001",
    projectId: "project_alpha",
    relativePath: "promoted/notes.txt",
    mimeType: "text/plain",
    bodyB64: Buffer.from("hello world", "utf8").toString("base64"),
    ...overrides,
  };
}

describe("AttachmentImportService", () => {
  it("VERIFY-154 promotes text attachments into non-overwriting managed documents with secret redaction", async () => {
    const body = "User Bearer abcdefghijklmnop0123456789 set sk-aBcDeFgHiJkLmNoPqRsT1234 in the config.";
    const result = await service.promote("default", {
      attachmentId: "att_text_1",
      projectId: "project_alpha",
      relativePath: "promoted/config.txt",
      mimeType: "text/plain",
      bodyB64: Buffer.from(body, "utf8").toString("base64"),
    });

    expect(result.mode).toBe("text");
    expect(result.format).toBe("txt");
    expect(result.bytesReceived).toBe(Buffer.byteLength(body, "utf8"));
    expect(result.bytesRedacted).toBeGreaterThan(0);
    expect(result.revision.createdBy).toBe("import");
    expect(result.document.metadata.sourceAttachmentId).toBe("att_text_1");
    expect(result.document.metadata.mimeType).toBe("text/plain");
    expect(result.document.metadata.importedAt).toMatch(/T/);
    expect(typeof result.revision.summary).toBe("string");
    expect(result.revision.summary.length).toBeGreaterThan(0);
    const flattened = JSON.stringify(result.revision.blocks);
    expect(flattened).toContain("[REDACTED]");
    expect(flattened).not.toContain("sk-aBcDeFgHiJkLmNoPqRsT1234");
    expect(flattened).not.toContain("abcdefghijklmnop0123456789");

    // non-overwriting
    await expect(
      service.promote("default", {
        attachmentId: "att_text_2",
        projectId: "project_alpha",
        relativePath: "promoted/config.txt",
        mimeType: "text/plain",
        bodyB64: Buffer.from("overwrite", "utf8").toString("base64"),
      })
    ).rejects.toThrow(/already exists/i);
  });

  it("detects Markdown format from .md extension", async () => {
    const result = await service.promote("default", {
      ...makeRequest({ relativePath: "promoted/notes.md", bodyB64: Buffer.from("# Heading\n\nbody", "utf8").toString("base64") }),
    });
    expect(result.format).toBe("md");
    expect(result.revision.sourceFormat).toBe("md");
    expect(result.document.originalFormat).toBe("md");
  });

  it("builds a binary placeholder for non-text MIME types", async () => {
    const payload = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = await service.promote("default", {
      attachmentId: "att_img_1",
      projectId: "project_alpha",
      relativePath: "promoted/photo.png",
      mimeType: "image/png",
      bodyB64: payload.toString("base64"),
    });
    expect(result.mode).toBe("metadata-only");
    expect(result.format).toBe("txt");
    expect(result.bytesRedacted).toBe(0);
    expect(result.document.metadata.contentKind).toBe("binary");
    expect(result.document.metadata.sourceAttachmentId).toBe("att_img_1");
    const flattened = JSON.stringify(result.revision.blocks);
    expect(flattened).not.toContain("\u00ff");
    expect(flattened).toContain("Binary content was not extracted");
    expect(result.revision.createdBy).toBe("import");
  });

  it("rejects text/html in the allow-list blocklist", async () => {
    await expect(
      service.promote("default", {
        attachmentId: "att_html_1",
        projectId: "project_alpha",
        relativePath: "promoted/page.html",
        mimeType: "text/html",
        bodyB64: Buffer.from("<html></html>", "utf8").toString("base64"),
      })
    ).rejects.toThrow(/not supported/i);
  });

  it("rejects traversal-style relative paths", async () => {
    await expect(
      service.promote("default", {
        ...makeRequest({ relativePath: "../escaped/secrets.txt" }),
      })
    ).rejects.toThrow(/traversal/i);
  });

  it("rejects absolute relative paths and oversize inputs", async () => {
    await expect(
      service.promote("default", {
        ...makeRequest({ relativePath: "/abs/path.txt" }),
      })
    ).rejects.toThrow(/relative/i);

    const oversize = Buffer.alloc(MAX_ATTACHMENT_IMPORT_BYTES + 16, "x");
    await expect(
      service.promote("default", {
        ...makeRequest({ bodyB64: oversize.toString("base64") }),
      })
    ).rejects.toThrow(/limit/i);
  });

  it("rejects invalid IDs and empty bodies", async () => {
    await expect(
      service.promote("default", {
        ...makeRequest({ attachmentId: "no spaces allowed" }),
      })
    ).rejects.toThrow(/attachmentId/);
    await expect(
      service.promote("default", {
        ...makeRequest({ projectId: "" }),
      })
    ).rejects.toThrow(/projectId/);
    await expect(
      service.promote("default", {
        ...makeRequest({ bodyB64: "" }),
      })
    ).rejects.toThrow(/empty/i);
    await expect(
      service.promote("default", {
        ...makeRequest({ bodyB64: "!!!not-base64!!!" }),
      })
    ).rejects.toThrow(/base64/i);
  });

  it("treats +xml/+json/+yaml structured suffixes as text", async () => {
    const result = await service.promote("default", {
      attachmentId: "att_struct_1",
      projectId: "project_alpha",
      relativePath: "promoted/data.txt",
      mimeType: "application/vnd.api+json",
      bodyB64: Buffer.from('{"ok":true}', "utf8").toString("base64"),
    });
    expect(result.mode).toBe("text");
    expect(result.document.metadata.mimeType).toBe("application/vnd.api+json");
  });

  it("truncates oversized text bodies and caps redacted-byte reporting", async () => {
    const longBody = "lorem ipsum\n".repeat(500);
    const result = await service.promote("default", {
      ...makeRequest({
        mimeType: "text/plain",
        relativePath: "promoted/long.txt",
        bodyB64: Buffer.from(longBody, "utf8").toString("base64"),
      }),
    });
    expect(result.mode).toBe("text");
    expect(result.format).toBe("txt");
    expect(result.bytesReceived).toBe(Buffer.byteLength(longBody, "utf8"));
    expect(result.revision.blocks.length).toBeGreaterThan(0);
    expect(result.revision.blocks.length).toBeLessThanOrEqual(201);
  });
});
