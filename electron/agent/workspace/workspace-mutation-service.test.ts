// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceGrant } from "../../../src/agent/contracts/capabilities";
import { WorkspaceMutationService } from "./workspace-mutation-service";

let root = "";
let recovery = "";
let grant: WorkspaceGrant;
let service: WorkspaceMutationService;

beforeEach(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vf-mutation-"));
  recovery = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vf-recovery-"));
  await fs.promises.writeFile(path.join(root, "existing.md"), "before");
  grant = {
    id: "g", sessionId: "s", workspaceId: "w", rootPath: await fs.promises.realpath(root), displayName: "Workspace",
    allowedOperations: ["create", "update", "move", "rename", "trash"], allowedExtensions: [".md"], maxReadBytes: 1024,
    maxWriteBytes: 1024, maxFilesPerOperation: 10, maxTotalChangeBytes: 4096, includeHiddenFiles: false, followSymlinks: false, issuedAt: new Date().toISOString(),
  };
  service = new WorkspaceMutationService(recovery);
});

afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true });
  await fs.promises.rm(recovery, { recursive: true, force: true });
});

describe("workspace mutation service", () => {
  it("checks expected hashes and applies staged multi-file changes", async () => {
    const expectedContentHash = createHash("sha256").update("before").digest("hex");
    const result = await service.applyChangeset({ grant, sessionId: "s", proposalId: "proposal_1", changes: [
      { type: "replace_file", relativePath: "existing.md", expectedContentHash, format: "md", content: "after" },
      { type: "create_file", relativePath: "new.md", expectedAbsent: true, format: "md", content: "new" },
    ] });
    expect(result.committed).toEqual(["existing.md", "new.md"]);
    expect(await fs.promises.readFile(path.join(root, "existing.md"), "utf8")).toBe("after");
    expect(await fs.promises.readFile(path.join(root, "new.md"), "utf8")).toBe("new");
  });

  it("rejects stale snapshots and accidental overwrites", async () => {
    await expect(service.prepareChangeset({ grant, sessionId: "s", changes: [{ type: "replace_file", relativePath: "existing.md", expectedContentHash: "stale", format: "md", content: "after" }] })).rejects.toThrow("CONFLICT");
    await expect(service.prepareChangeset({ grant, sessionId: "s", changes: [{ type: "create_file", relativePath: "existing.md", expectedAbsent: true, format: "md", content: "after" }] })).rejects.toThrow("CONFLICT");
  });

  it("moves only within the grant and never overwrites", async () => {
    await service.move({ grant, sessionId: "s", sourcePath: "existing.md", destinationPath: "renamed.md" });
    await expect(fs.promises.stat(path.join(root, "renamed.md"))).resolves.toBeTruthy();
    await expect(service.move({ grant, sessionId: "s", sourcePath: "renamed.md", destinationPath: "../escape.md" })).rejects.toThrow();
  });
});
