import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PendingApproval, ProposalType } from "../../../src/agent/contracts/proposals";
import { canonicalHash } from "../documents/document-patch-engine";

interface StoredApproval extends PendingApproval {
  publicView: unknown;
  privateExecutionPlan: unknown;
}

interface ApprovalFile {
  version: 1;
  approvals: StoredApproval[];
}

export class ApprovalCoordinator {
  private readonly locks = new Set<string>();
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly storageFile: string, private readonly runtimeSessionId: string) {}

  private async read(): Promise<ApprovalFile> {
    try {
      const value = JSON.parse(await fs.promises.readFile(this.storageFile, "utf8")) as ApprovalFile;
      if (value.version !== 1 || !Array.isArray(value.approvals)) throw new Error();
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, approvals: [] };
      throw new Error("Pending approval storage is corrupt or unreadable.");
    }
  }

  private async write(value: ApprovalFile): Promise<void> {
    const directory = path.dirname(this.storageFile);
    await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.pending-approvals.vf-tmp-${randomUUID()}`);
    try {
      await fs.promises.writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600, flag: "wx" });
      const handle = await fs.promises.open(temporary, "r");
      try { await handle.sync(); } finally { await handle.close(); }
      await fs.promises.rename(temporary, this.storageFile);
    } finally {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueue;
    let release = () => {};
    this.operationQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }

  async prepare(input: {
    grantId: string;
    proposalType: ProposalType;
    canonicalToolName: string;
    validatedArguments: unknown;
    baseRevisionIds: string[];
    affectedResources: string[];
    publicSummary: unknown;
    privateExecutionPlan: unknown;
    ttlMs?: number;
  }): Promise<PendingApproval> {
    return this.mutate(async () => {
      const file = await this.read();
      const now = Date.now();
      const proposalHash = canonicalHash({
        canonicalToolName: input.canonicalToolName,
        validatedArguments: input.validatedArguments,
        baseRevisionIds: input.baseRevisionIds,
        affectedResources: input.affectedResources,
        grantId: input.grantId,
        publicSummary: input.publicSummary,
      });
      const approval: StoredApproval = {
        id: `approval_${randomUUID()}`,
        sessionId: this.runtimeSessionId,
        grantId: input.grantId,
        proposalType: input.proposalType,
        proposalHash,
        baseRevisionIds: [...input.baseRevisionIds],
        affectedResources: [...input.affectedResources],
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + Math.min(Math.max(input.ttlMs ?? 30 * 60_000, 60_000), 24 * 60 * 60_000)).toISOString(),
        privateExecutionPlan: structuredClone(input.privateExecutionPlan),
        publicView: structuredClone(input.publicSummary),
      };
      file.approvals.push(approval);
      await this.write(file);
      const { privateExecutionPlan: _privateExecutionPlan, publicView: _publicView, ...publicApproval } = approval;
      return structuredClone(publicApproval);
    });
  }

  async listPending(): Promise<PendingApproval[]> {
    const file = await this.read();
    return file.approvals
      .filter((approval) => approval.sessionId === this.runtimeSessionId && !approval.consumedAt && !approval.rejectedAt)
      .map(({ privateExecutionPlan: _privateExecutionPlan, publicView: _publicView, ...approval }) => structuredClone(approval));
  }

  async listPendingWithViews(): Promise<Array<{ approval: PendingApproval; publicView: unknown }>> {
    const file = await this.read();
    return file.approvals
      .filter((approval) => approval.sessionId === this.runtimeSessionId && !approval.consumedAt && !approval.rejectedAt && Date.parse(approval.expiresAt) > Date.now())
      .map(({ privateExecutionPlan: _privateExecutionPlan, publicView, ...approval }) => ({ approval: structuredClone(approval), publicView: structuredClone(publicView) }));
  }

  async decide(input: { pendingApprovalId: string; proposalHash: string; decision: "approve" | "reject" }): Promise<{ approval: PendingApproval; privateExecutionPlan?: unknown }> {
    return this.mutate(async () => {
      const file = await this.read();
      const approval = file.approvals.find((entry) => entry.id === input.pendingApprovalId);
      if (!approval || approval.sessionId !== this.runtimeSessionId) throw new Error("APPROVAL_MISMATCH");
      if (approval.proposalHash !== input.proposalHash) throw new Error("APPROVAL_MISMATCH");
      if (approval.consumedAt || approval.rejectedAt) throw new Error("APPROVAL_MISMATCH");
      if (Date.parse(approval.expiresAt) <= Date.now()) throw new Error("APPROVAL_EXPIRED");
      if (approval.affectedResources.some((resource) => this.locks.has(resource))) throw new Error("CONFLICT");
      const decidedAt = new Date().toISOString();
      if (input.decision === "reject") approval.rejectedAt = decidedAt;
      else approval.consumedAt = decidedAt;
      await this.write(file);
      const plan = input.decision === "approve" ? structuredClone(approval.privateExecutionPlan) : undefined;
      const { privateExecutionPlan: _privateExecutionPlan, publicView: _publicView, ...publicApproval } = approval;
      return { approval: structuredClone(publicApproval), privateExecutionPlan: plan };
    });
  }

  async withResourceLocks<T>(resources: string[], operation: () => Promise<T>): Promise<T> {
    const unique = [...new Set(resources)].sort();
    if (unique.some((resource) => this.locks.has(resource))) throw new Error("CONFLICT");
    unique.forEach((resource) => this.locks.add(resource));
    try { return await operation(); } finally { unique.forEach((resource) => this.locks.delete(resource)); }
  }
}
