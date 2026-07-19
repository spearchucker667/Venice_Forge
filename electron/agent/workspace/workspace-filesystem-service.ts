import fs from "node:fs";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import type { WorkspaceGrant, WorkspaceOperation } from "../../../src/agent/contracts/capabilities";
import { resolveExistingWorkspacePath, resolveNewWorkspacePath } from "./path-policy";

export interface WorkspaceEntry {
  relativePath: string;
  kind: "file" | "directory";
  sizeBytes: number;
  modifiedAt: string;
}

export interface WorkspaceSearchResult {
  relativePath: string;
  line: number;
  snippet: string;
}

function assertGrant(grant: WorkspaceGrant, sessionId: string, workspaceId: string, operation: WorkspaceOperation): void {
  if (grant.sessionId !== sessionId || grant.workspaceId !== workspaceId || !grant.allowedOperations.includes(operation)
    || (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now())) {
    throw new Error("CAPABILITY_DENIED");
  }
}

function relativeDisplay(root: string, candidate: string): string {
  return path.relative(root, candidate).split(path.sep).join("/");
}

function supportedExtension(grant: WorkspaceGrant, candidate: string): boolean {
  return grant.allowedExtensions.includes(path.extname(candidate).toLowerCase());
}

function hiddenOrExcluded(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => segment.startsWith(".") || ["node_modules", "vendor", "dist", "build", "coverage"].includes(segment));
}

async function readRegularFileBounded(filePath: string, maxBytes: number): Promise<Buffer> {
  const handle = await fs.promises.open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("UNSUPPORTED_FILE_TYPE");
    if (stat.size > maxBytes) throw new Error("FILE_TOO_LARGE");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export class WorkspaceFilesystemService {
  async list(input: {
    grant: WorkspaceGrant;
    sessionId: string;
    workspaceId: string;
    relativeDirectory: string;
    recursive: boolean;
    maxDepth: number;
    offset?: number;
    limit?: number;
  }): Promise<{ entries: WorkspaceEntry[]; nextOffset: number | null }> {
    assertGrant(input.grant, input.sessionId, input.workspaceId, "list");
    const directory = await resolveExistingWorkspacePath(input.grant.rootPath, input.relativeDirectory, true);
    const rootReal = await fs.promises.realpath(input.grant.rootPath);
    const all: WorkspaceEntry[] = [];
    const walk = async (current: string, depth: number): Promise<void> => {
      const entries = await fs.promises.readdir(current, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const candidate = path.join(current, entry.name);
        const relativePath = relativeDisplay(rootReal, candidate);
        if ((!input.grant.includeHiddenFiles && hiddenOrExcluded(relativePath)) || entry.isSymbolicLink()) continue;
        if (!entry.isDirectory() && !entry.isFile()) continue;
        if (entry.isFile() && !supportedExtension(input.grant, candidate)) continue;
        const stat = await fs.promises.lstat(candidate);
        all.push({ relativePath, kind: entry.isDirectory() ? "directory" : "file", sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() });
        if (all.length > 10_000) throw new Error("Workspace listing exceeds the safe entry limit.");
        if (entry.isDirectory() && input.recursive && depth < Math.min(Math.max(input.maxDepth, 0), 10)) await walk(candidate, depth + 1);
      }
    };
    await walk(directory, 0);
    const offset = Math.max(0, input.offset ?? 0);
    const limit = Math.min(Math.max(input.limit ?? 200, 1), 500);
    const entries = all.slice(offset, offset + limit);
    return { entries, nextOffset: offset + entries.length < all.length ? offset + entries.length : null };
  }

  async readText(input: { grant: WorkspaceGrant; sessionId: string; workspaceId: string; relativePath: string }): Promise<{ content: string; sizeBytes: number }> {
    assertGrant(input.grant, input.sessionId, input.workspaceId, "read");
    const candidate = await resolveExistingWorkspacePath(input.grant.rootPath, input.relativePath);
    if (!supportedExtension(input.grant, candidate)) throw new Error("UNSUPPORTED_FILE_TYPE");
    const bytes = await readRegularFileBounded(candidate, input.grant.maxReadBytes);
    if (bytes.includes(0)) throw new Error("UNSUPPORTED_FILE_TYPE");
    return { content: bytes.toString("utf8"), sizeBytes: bytes.byteLength };
  }

  async search(input: {
    grant: WorkspaceGrant;
    sessionId: string;
    workspaceId: string;
    query: string;
    maxResults: number;
    signal?: AbortSignal;
  }): Promise<WorkspaceSearchResult[]> {
    assertGrant(input.grant, input.sessionId, input.workspaceId, "search");
    if (!input.query || input.query.length > 500) throw new Error("INVALID_ARGUMENTS");
    const listingGrant: WorkspaceGrant = input.grant.allowedOperations.includes("list")
      ? input.grant
      : { ...input.grant, allowedOperations: [...input.grant.allowedOperations, "list"] };
    const listing = await this.list({
      grant: listingGrant,
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      relativeDirectory: "",
      recursive: true,
      maxDepth: 10,
      limit: 10_000,
    });
    const results: WorkspaceSearchResult[] = [];
    let totalBytes = 0;
    const maxResults = Math.min(Math.max(input.maxResults, 1), 200);
    for (const entry of listing.entries) {
      if (input.signal?.aborted) throw new Error("ABORTED");
      if (entry.kind !== "file" || entry.sizeBytes > input.grant.maxReadBytes) continue;
      totalBytes += entry.sizeBytes;
      if (totalBytes > 25 * 1024 * 1024) break;
      const candidate = await resolveExistingWorkspacePath(input.grant.rootPath, entry.relativePath);
      const bytes = await readRegularFileBounded(candidate, input.grant.maxReadBytes);
      if (bytes.includes(0)) continue;
      const lines = bytes.toString("utf8").split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].includes(input.query)) continue;
        results.push({ relativePath: entry.relativePath, line: index + 1, snippet: lines[index].slice(0, 500) });
        if (results.length >= maxResults) return results;
      }
    }
    return results;
  }

  async createFile(input: { grant: WorkspaceGrant; sessionId: string; workspaceId: string; relativePath: string; bytes: Uint8Array }): Promise<void> {
    assertGrant(input.grant, input.sessionId, input.workspaceId, "create");
    if (input.bytes.byteLength > input.grant.maxWriteBytes) throw new Error("FILE_TOO_LARGE");
    const target = await resolveNewWorkspacePath(input.grant.rootPath, input.relativePath);
    if (!supportedExtension(input.grant, target)) throw new Error("UNSUPPORTED_FILE_TYPE");
    await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const handle = await fs.promises.open(target, "wx", 0o600);
    try { await handle.writeFile(input.bytes); await handle.sync(); } finally { await handle.close(); }
  }
}
