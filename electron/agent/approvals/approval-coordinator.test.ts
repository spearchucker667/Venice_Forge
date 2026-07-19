// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApprovalCoordinator } from "./approval-coordinator";

let root = "";
let coordinator: ApprovalCoordinator;

beforeEach(async () => {
  root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vf-approval-"));
  coordinator = new ApprovalCoordinator(path.join(root, "pending.json"), "runtime-session");
});

afterEach(async () => {
  await fs.promises.rm(root, { recursive: true, force: true });
});

describe("approval coordinator", () => {
  it("VERIFY-146 binds approval to the exact proposal and consumes it once", async () => {
    const pending = await coordinator.prepare({
      grantId: "grant_1",
      proposalType: "document_edit",
      canonicalToolName: "document.proposeEdits",
      validatedArguments: { documentId: "doc_1", replacement: "safe" },
      baseRevisionIds: ["rev_1"],
      affectedResources: ["doc_1"],
      publicSummary: { title: "Edit" },
      privateExecutionPlan: { replacement: "safe" },
    });
    await expect(coordinator.decide({ pendingApprovalId: pending.id, proposalHash: "tampered", decision: "approve" })).rejects.toThrow("APPROVAL_MISMATCH");
    const result = await coordinator.decide({ pendingApprovalId: pending.id, proposalHash: pending.proposalHash, decision: "approve" });
    expect(result.privateExecutionPlan).toEqual({ replacement: "safe" });
    await expect(coordinator.decide({ pendingApprovalId: pending.id, proposalHash: pending.proposalHash, decision: "approve" })).rejects.toThrow("APPROVAL_MISMATCH");
  });

  it("fails persisted approvals closed in a new runtime session", async () => {
    const pending = await coordinator.prepare({
      grantId: "grant_1",
      proposalType: "document_restore",
      canonicalToolName: "document.restoreRevision",
      validatedArguments: {},
      baseRevisionIds: ["rev_1"],
      affectedResources: ["doc_1"],
      publicSummary: {},
      privateExecutionPlan: {},
    });
    const restarted = new ApprovalCoordinator(path.join(root, "pending.json"), "new-runtime-session");
    expect(await restarted.listPending()).toEqual([]);
    await expect(restarted.decide({ pendingApprovalId: pending.id, proposalHash: pending.proposalHash, decision: "approve" })).rejects.toThrow("APPROVAL_MISMATCH");
  });
});
