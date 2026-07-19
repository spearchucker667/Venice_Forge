// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceGrant } from "../../../src/agent/contracts/capabilities";
import { WorkspaceFilesystemService } from "./workspace-filesystem-service";

let root = "";
let grant: WorkspaceGrant;
const service = new WorkspaceFilesystemService();

beforeEach(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vf-workspace-"));
  await fs.promises.mkdir(path.join(root, "docs"));
  await fs.promises.mkdir(path.join(root, ".git"));
  await fs.promises.writeFile(path.join(root, "docs", "notes.md"), "first line\nneedle here\nlast line");
  await fs.promises.writeFile(path.join(root, ".git", "secret.md"), "needle hidden");
  grant = {
    id: "grant_1", sessionId: "session_1", workspaceId: "workspace_1", rootPath: await fs.promises.realpath(root), displayName: "Test",
    allowedOperations: ["list", "read", "search", "create"], allowedExtensions: [".md", ".txt"], maxReadBytes: 1024,
    maxWriteBytes: 1024, maxFilesPerOperation: 10, maxTotalChangeBytes: 4096, includeHiddenFiles: false, followSymlinks: false, issuedAt: new Date().toISOString(),
  };
});

afterEach(async () => { await fs.promises.rm(root, { recursive: true, force: true }); });

describe("workspace filesystem service", () => {
  it("bounds listings and excludes hidden directories", async () => {
    const result = await service.list({ grant, sessionId: "session_1", workspaceId: "workspace_1", relativeDirectory: "", recursive: true, maxDepth: 3, limit: 1 });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].relativePath).toBe("docs");
    expect(result.nextOffset).toBe(1);
  });

  it("VERIFY-149 reads and searches supported text without exposing hidden files", async () => {
    await expect(service.readText({ grant, sessionId: "session_1", workspaceId: "workspace_1", relativePath: "docs/notes.md" })).resolves.toMatchObject({ sizeBytes: 32 });
    const results = await service.search({ grant, sessionId: "session_1", workspaceId: "workspace_1", query: "needle", maxResults: 20 });
    expect(results).toEqual([{ relativePath: "docs/notes.md", line: 2, snippet: "needle here" }]);
  });

  it("creates without overwriting and revocation is immediate", async () => {
    await service.createFile({ grant, sessionId: "session_1", workspaceId: "workspace_1", relativePath: "docs/new.md", bytes: new TextEncoder().encode("new") });
    await expect(service.createFile({ grant, sessionId: "session_1", workspaceId: "workspace_1", relativePath: "docs/new.md", bytes: new TextEncoder().encode("again") })).rejects.toThrow();
    await expect(service.readText({ grant, sessionId: "other", workspaceId: "workspace_1", relativePath: "docs/notes.md" })).rejects.toThrow("CAPABILITY_DENIED");
  });
});
