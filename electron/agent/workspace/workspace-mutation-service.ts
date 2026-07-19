import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { WorkspaceGrant } from "../../../src/agent/contracts/capabilities";
import type { WorkspaceChange, WorkspaceRecoveryRecord } from "../../../src/agent/contracts/workspace";
import { resolveExistingWorkspacePath, resolveNewWorkspacePath } from "./path-policy";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertMutationGrant(grant: WorkspaceGrant, sessionId: string): void {
  if (grant.sessionId !== sessionId || (grant.expiresAt && Date.parse(grant.expiresAt) <= Date.now())) throw new Error("CAPABILITY_DENIED");
}

function replaceOccurrence(content: string, expected: string, replacement: string, occurrence: number): string {
  if (!expected || !Number.isSafeInteger(occurrence) || occurrence < 1) throw new Error("INVALID_ARGUMENTS");
  const positions: number[] = [];
  let offset = 0;
  while (offset <= content.length - expected.length) {
    const index = content.indexOf(expected, offset);
    if (index < 0) break;
    positions.push(index);
    offset = index + expected.length;
  }
  if (positions.length !== occurrence) throw new Error("CONFLICT");
  const index = positions[occurrence - 1];
  return `${content.slice(0, index)}${replacement}${content.slice(index + expected.length)}`;
}

interface PreparedFileChange {
  change: WorkspaceChange;
  target: string;
  resultingBytes?: Uint8Array;
  previousBytes?: Uint8Array;
}

export class WorkspaceMutationService {
  private readonly locks = new Set<string>();

  constructor(private readonly recoveryRoot: string) {}

  async prepareChangeset(input: { grant: WorkspaceGrant; sessionId: string; changes: WorkspaceChange[] }): Promise<{ prepared: PreparedFileChange[]; totalBytes: number; affectedPaths: string[] }> {
    assertMutationGrant(input.grant, input.sessionId);
    if (!input.grant.allowedOperations.includes("create") && !input.grant.allowedOperations.includes("update")) throw new Error("CAPABILITY_DENIED");
    if (input.changes.length === 0 || input.changes.length > input.grant.maxFilesPerOperation) throw new Error("CHANGESET_TOO_LARGE");
    const affectedPaths = input.changes.map((change) => change.relativePath);
    if (new Set(affectedPaths).size !== affectedPaths.length) throw new Error("CONFLICT");
    const prepared: PreparedFileChange[] = [];
    let totalBytes = 0;
    for (const change of input.changes) {
      if (change.type === "create_directory") {
        const target = await resolveNewWorkspacePath(input.grant.rootPath, change.relativePath);
        try { await fs.promises.lstat(target); throw new Error("CONFLICT"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        prepared.push({ change: structuredClone(change), target });
        continue;
      }
      const extension = path.extname(change.relativePath).toLowerCase();
      if (!input.grant.allowedExtensions.includes(extension)) throw new Error("UNSUPPORTED_FILE_TYPE");
      if (change.type === "create_file") {
        const target = await resolveNewWorkspacePath(input.grant.rootPath, change.relativePath);
        try { await fs.promises.lstat(target); throw new Error("CONFLICT"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        const resultingBytes = new TextEncoder().encode(change.content);
        totalBytes += resultingBytes.byteLength;
        prepared.push({ change: structuredClone(change), target, resultingBytes });
        continue;
      }
      const target = await resolveExistingWorkspacePath(input.grant.rootPath, change.relativePath);
      const previousBytes = new Uint8Array(await fs.promises.readFile(target));
      if (previousBytes.byteLength > input.grant.maxReadBytes || sha256(previousBytes) !== change.expectedContentHash) throw new Error("CONFLICT");
      let content = change.type === "replace_file" ? change.content : new TextDecoder().decode(previousBytes);
      if (change.type === "patch_text_file") {
        for (const replacement of change.replacements) content = replaceOccurrence(content, replacement.expectedText, replacement.replacementText, replacement.occurrence);
      }
      const resultingBytes = new TextEncoder().encode(content);
      totalBytes += resultingBytes.byteLength;
      prepared.push({ change: structuredClone(change), target, resultingBytes, previousBytes });
    }
    if (totalBytes > input.grant.maxTotalChangeBytes || prepared.some((item) => (item.resultingBytes?.byteLength ?? 0) > input.grant.maxWriteBytes)) throw new Error("CHANGESET_TOO_LARGE");
    return { prepared, totalBytes, affectedPaths };
  }

  async applyChangeset(input: { grant: WorkspaceGrant; sessionId: string; changes: WorkspaceChange[]; proposalId: string }): Promise<{ committed: string[] }> {
    const preview = await this.prepareChangeset(input);
    const lockKeys = preview.prepared.map((item) => item.target).sort();
    if (lockKeys.some((key) => this.locks.has(key))) throw new Error("CONFLICT");
    lockKeys.forEach((key) => this.locks.add(key));
    const staged: Array<PreparedFileChange & { temporary?: string; backup?: string }> = [];
    const committed: Array<PreparedFileChange & { backup?: string }> = [];
    try {
      await fs.promises.mkdir(this.recoveryRoot, { recursive: true, mode: 0o700 });
      for (const item of preview.prepared) {
        const stagedItem: PreparedFileChange & { temporary?: string; backup?: string } = item;
        if (item.resultingBytes) {
          await fs.promises.mkdir(path.dirname(item.target), { recursive: true, mode: 0o700 });
          stagedItem.temporary = path.join(path.dirname(item.target), `.${path.basename(item.target)}.vf-tmp-${randomUUID()}`);
          const handle = await fs.promises.open(stagedItem.temporary, "wx", 0o600);
          try { await handle.writeFile(item.resultingBytes); await handle.sync(); } finally { await handle.close(); }
        }
        if (item.previousBytes) {
          stagedItem.backup = path.join(this.recoveryRoot, `${input.proposalId}-${randomUUID()}.bak`);
          await fs.promises.writeFile(stagedItem.backup, item.previousBytes, { flag: "wx", mode: 0o600 });
        }
        staged.push(stagedItem);
      }
      for (const item of staged.sort((a, b) => a.target.localeCompare(b.target))) {
        if (item.change.type === "create_directory") await fs.promises.mkdir(item.target, { recursive: false, mode: 0o700 });
        else if (item.temporary) await fs.promises.rename(item.temporary, item.target);
        committed.push(item);
      }
      return { committed: committed.map((item) => item.change.relativePath) };
    } catch (error) {
      for (const item of committed.reverse()) {
        try {
          if (item.backup) {
            const restore = `${item.target}.vf-rollback-${randomUUID()}`;
            await fs.promises.copyFile(item.backup, restore, fs.constants.COPYFILE_EXCL);
            await fs.promises.rename(restore, item.target);
          } else if (item.change.type === "create_directory") await fs.promises.rmdir(item.target);
          else await fs.promises.rm(item.target, { force: true });
        } catch { /* recovery artifact remains for explicit follow-up */ }
      }
      throw error;
    } finally {
      for (const item of staged) if (item.temporary) await fs.promises.rm(item.temporary, { force: true }).catch(() => undefined);
      lockKeys.forEach((key) => this.locks.delete(key));
    }
  }

  async move(input: { grant: WorkspaceGrant; sessionId: string; sourcePath: string; destinationPath: string }): Promise<void> {
    assertMutationGrant(input.grant, input.sessionId);
    if (!input.grant.allowedOperations.includes("move") && !input.grant.allowedOperations.includes("rename")) throw new Error("CAPABILITY_DENIED");
    const source = await resolveExistingWorkspacePath(input.grant.rootPath, input.sourcePath);
    const destination = await resolveNewWorkspacePath(input.grant.rootPath, input.destinationPath);
    try { await fs.promises.lstat(destination); throw new Error("CONFLICT"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await fs.promises.rename(source, destination);
  }

  async trash(input: { grant: WorkspaceGrant; sessionId: string; relativePath: string }): Promise<WorkspaceRecoveryRecord> {
    assertMutationGrant(input.grant, input.sessionId);
    if (!input.grant.allowedOperations.includes("trash")) throw new Error("CAPABILITY_DENIED");
    const source = await resolveExistingWorkspacePath(input.grant.rootPath, input.relativePath);
    const id = `recovery_${randomUUID()}`;
    const directory = path.join(this.recoveryRoot, input.grant.workspaceId);
    await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
    const stagedName = `${id}-${path.basename(source)}`;
    await fs.promises.rename(source, path.join(directory, stagedName));
    const recovery: WorkspaceRecoveryRecord = { id, workspaceId: input.grant.workspaceId, originalRelativePath: input.relativePath, stagedName, createdAt: new Date().toISOString() };
    await fs.promises.writeFile(path.join(directory, `${id}.json`), JSON.stringify(recovery), { flag: "wx", mode: 0o600 });
    return recovery;
  }

  async restoreTrash(input: { grant: WorkspaceGrant; sessionId: string; recoveryId: string }): Promise<void> {
    assertMutationGrant(input.grant, input.sessionId);
    const directory = path.join(this.recoveryRoot, input.grant.workspaceId);
    const metadataPath = path.join(directory, `${input.recoveryId}.json`);
    const recovery = JSON.parse(await fs.promises.readFile(metadataPath, "utf8")) as WorkspaceRecoveryRecord;
    if (recovery.id !== input.recoveryId || recovery.workspaceId !== input.grant.workspaceId || recovery.restoredAt) throw new Error("CONFLICT");
    const destination = await resolveNewWorkspacePath(input.grant.rootPath, recovery.originalRelativePath);
    try { await fs.promises.lstat(destination); throw new Error("CONFLICT"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    await fs.promises.rename(path.join(directory, recovery.stagedName), destination);
    recovery.restoredAt = new Date().toISOString();
    await fs.promises.writeFile(metadataPath, JSON.stringify(recovery), { encoding: "utf8", mode: 0o600 });
  }
}
