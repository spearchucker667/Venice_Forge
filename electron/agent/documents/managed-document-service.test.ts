// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blockHash } from "./document-patch-engine";
import { ManagedDocumentService } from "./managed-document-service";

let root = "";
let service: ManagedDocumentService;

beforeEach(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vf-documents-"));
  service = new ManagedDocumentService(root);
});

afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true });
});

describe("managed document service", () => {
  it("VERIFY-145 creates non-overwriting documents and immutable revisions", async () => {
    const created = await service.create("default", {
      projectId: "project_1",
      relativePath: "notes/research.md",
      format: "md",
      blocks: [{ id: "p_1", type: "paragraph", text: "Original" }],
    });
    await expect(service.create("default", {
      projectId: "project_1",
      relativePath: "notes/research.md",
      format: "md",
      blocks: [{ id: "p_2", type: "paragraph", text: "Overwrite" }],
    })).rejects.toThrow("already exists");

    const revision = await service.applyEdits("default", {
      documentId: created.document.id,
      baseRevisionId: created.revision.id,
      summary: "Update note",
      operations: [{ operation: "replace_block", blockId: "p_1", expectedBlockHash: blockHash(created.revision.blocks[0]), block: { id: "ignored", type: "paragraph", text: "Updated" } }],
    });
    expect(revision.parentRevisionId).toBe(created.revision.id);
    expect((await service.read("default", created.document.id, created.revision.id)).blocks[0]).toMatchObject({ text: "Original" });
    expect((await service.read("default", created.document.id)).blocks[0]).toMatchObject({ text: "Updated" });
  });

  it("rejects stale edits and restores by appending a revision", async () => {
    const created = await service.create("default", { projectId: "project_1", relativePath: "notes.md", format: "md", blocks: [{ id: "p_1", type: "paragraph", text: "One" }] });
    const second = await service.applyEdits("default", { documentId: created.document.id, baseRevisionId: created.revision.id, summary: "Two", operations: [{ operation: "replace_block", blockId: "p_1", expectedBlockHash: blockHash(created.revision.blocks[0]), block: { id: "x", type: "paragraph", text: "Two" } }] });
    await expect(service.applyEdits("default", { documentId: created.document.id, baseRevisionId: created.revision.id, summary: "Stale", operations: [{ operation: "delete_block", blockId: "p_1", expectedBlockHash: blockHash(created.revision.blocks[0]) }] })).rejects.toThrow("STALE_REVISION");
    const restored = await service.restore("default", { documentId: created.document.id, currentRevisionId: second.id, restoreRevisionId: created.revision.id, reason: "Restore original" });
    expect(restored.id).not.toBe(created.revision.id);
    expect(restored.parentRevisionId).toBe(second.id);
    expect(restored.createdBy).toBe("restore");
    expect(await service.listRevisions("default", created.document.id)).toHaveLength(3);
  });
});
