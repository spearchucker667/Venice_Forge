import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkspaceGrant, WorkspaceOperation } from "../../../src/agent/contracts/capabilities";

const DEFAULT_EXTENSIONS = [".md", ".txt", ".json", ".html", ".csv", ".docx", ".pdf"];

export class WorkspaceGrantService {
  private readonly grants = new Map<string, WorkspaceGrant>();

  async issue(input: {
    sessionId: string;
    rootPath: string;
    allowedOperations?: WorkspaceOperation[];
    allowedExtensions?: string[];
  }): Promise<WorkspaceGrant> {
    const rootPath = await fs.promises.realpath(input.rootPath);
    const stat = await fs.promises.stat(rootPath);
    if (!stat.isDirectory()) throw new Error("Workspace root must be a directory.");
    this.revokeSession(input.sessionId);
    const grant: WorkspaceGrant = {
      id: `grant_${randomUUID()}`,
      sessionId: input.sessionId,
      workspaceId: `workspace_${randomUUID()}`,
      rootPath,
      displayName: path.basename(rootPath) || "Workspace",
      allowedOperations: [...(input.allowedOperations ?? ["list", "read", "search", "create", "update", "rename", "move", "trash"])],
      allowedExtensions: [...(input.allowedExtensions ?? DEFAULT_EXTENSIONS)].map((extension) => extension.toLowerCase()),
      maxReadBytes: 5 * 1024 * 1024,
      maxWriteBytes: 10 * 1024 * 1024,
      maxFilesPerOperation: 100,
      maxTotalChangeBytes: 25 * 1024 * 1024,
      includeHiddenFiles: false,
      followSymlinks: false,
      issuedAt: new Date().toISOString(),
    };
    this.grants.set(grant.id, grant);
    return structuredClone(grant);
  }

  get(grantId: string, sessionId: string): WorkspaceGrant | null {
    const grant = this.grants.get(grantId);
    if (!grant || grant.sessionId !== sessionId || (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now())) return null;
    return structuredClone(grant);
  }

  getByWorkspace(workspaceId: string, sessionId: string): WorkspaceGrant | null {
    const grant = [...this.grants.values()].find((entry) => entry.workspaceId === workspaceId && entry.sessionId === sessionId);
    return grant ? this.get(grant.id, sessionId) : null;
  }

  revoke(grantId: string, sessionId: string): boolean {
    const grant = this.grants.get(grantId);
    return Boolean(grant && grant.sessionId === sessionId && this.grants.delete(grantId));
  }

  revokeSession(sessionId: string): void {
    for (const [id, grant] of this.grants) if (grant.sessionId === sessionId) this.grants.delete(id);
  }
}
