import re

with open("electron/ipc/handlers/documentAgentHandlers.ts", "r") as f:
    content = f.read()

types_to_add = """
type WorkspaceChangesetPlan = {
  kind: "workspace_changeset";
  profileId: string;
  grantId: string;
  agentSessionId?: string;
  workspaceId: string;
  summary: string;
  changes: import("../../../src/agent/contracts/workspace").WorkspaceChange[];
};
type WorkspaceMovePlan = {
  kind: "workspace_move";
  profileId: string;
  grantId: string;
  agentSessionId?: string;
  workspaceId: string;
  sourcePath: string;
  destinationPath: string;
};
type WorkspaceTrashPlan = {
  kind: "workspace_trash";
  profileId: string;
  grantId: string;
  agentSessionId?: string;
  workspaceId: string;
  relativePath: string;
};

function isWorkspaceChangesetPlan(value: unknown): value is WorkspaceChangesetPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<WorkspaceChangesetPlan>;
  return plan.kind === "workspace_changeset" && typeof plan.profileId === "string" && typeof plan.grantId === "string" && typeof plan.workspaceId === "string" && typeof plan.summary === "string" && Array.isArray(plan.changes);
}
function isWorkspaceMovePlan(value: unknown): value is WorkspaceMovePlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<WorkspaceMovePlan>;
  return plan.kind === "workspace_move" && typeof plan.profileId === "string" && typeof plan.grantId === "string" && typeof plan.workspaceId === "string" && typeof plan.sourcePath === "string" && typeof plan.destinationPath === "string";
}
function isWorkspaceTrashPlan(value: unknown): value is WorkspaceTrashPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<WorkspaceTrashPlan>;
  return plan.kind === "workspace_trash" && typeof plan.profileId === "string" && typeof plan.grantId === "string" && typeof plan.workspaceId === "string" && typeof plan.relativePath === "string";
}
"""

content = content.replace("type DocumentRestorePlan =", types_to_add + "\ntype DocumentRestorePlan =")

decide_old = """      if (!isDocumentEditPlan(plan) && !isDocumentRestorePlan(plan)) throw new Error("Invalid stored execution plan.");
      if (plan.profileId !== getProfileSessionId(event.sender)) throw new Error("APPROVAL_MISMATCH");
      const revision = await approvals.withResourceLocks([plan.documentId], () => isDocumentEditPlan(plan)
        ? documents.applyEdits(plan.profileId, plan)
        : documents.restore(plan.profileId, plan));
      await audit.record({ sessionId: rendererSession(event.sender.id), toolName: isDocumentEditPlan(plan) ? "document.applyApprovedEdits" : "document.restoreRevision", outcome: "execution", resourceIds: [plan.documentId] });
      return { ok: true, revision };"""

decide_new = """      if (!isDocumentEditPlan(plan) && !isDocumentRestorePlan(plan) && !isWorkspaceChangesetPlan(plan) && !isWorkspaceMovePlan(plan) && !isWorkspaceTrashPlan(plan)) throw new Error("Invalid stored execution plan.");
      if (plan.profileId !== getProfileSessionId(event.sender)) throw new Error("APPROVAL_MISMATCH");
      
      if (isDocumentEditPlan(plan) || isDocumentRestorePlan(plan)) {
        const revision = await approvals.withResourceLocks([plan.documentId], () => isDocumentEditPlan(plan)
          ? documents.applyEdits(plan.profileId, plan)
          : documents.restore(plan.profileId, plan));
        await audit.record({ sessionId: rendererSession(event.sender.id), toolName: isDocumentEditPlan(plan) ? "document.applyApprovedEdits" : "document.restoreRevision", outcome: "execution", resourceIds: [plan.documentId] });
        return { ok: true, revision };
      }
      
      const session = rendererSession(event.sender.id, plan.agentSessionId);
      const grant = workspaceGrants.get(plan.grantId, session);
      if (!grant || grant.workspaceId !== plan.workspaceId) throw new Error("CAPABILITY_DENIED");
      
      if (isWorkspaceChangesetPlan(plan)) {
        const result = await workspaceMutations.applyChangeset({ grant, sessionId: session, changes: plan.changes, proposalId: decided.approval.id });
        await audit.record({ sessionId: session, toolName: "workspace.applyApprovedChangeset", outcome: "execution", resourceIds: result.committed });
        return { ok: true, committed: result.committed };
      } else if (isWorkspaceMovePlan(plan)) {
        await workspaceMutations.move({ grant, sessionId: session, sourcePath: plan.sourcePath, destinationPath: plan.destinationPath });
        await audit.record({ sessionId: session, toolName: "workspace.move", outcome: "execution", resourceIds: [plan.sourcePath, plan.destinationPath] });
        return { ok: true };
      } else if (isWorkspaceTrashPlan(plan)) {
        const recovery = await workspaceMutations.trash({ grant, sessionId: session, relativePath: plan.relativePath });
        await audit.record({ sessionId: session, toolName: "workspace.trash", outcome: "execution", resourceIds: [plan.relativePath], metadata: { recoveryId: recovery.id } });
        return { ok: true, recovery };
      }
      return { ok: false };"""

content = content.replace(decide_old, decide_new)

# getAgentServices update
content = content.replace("const { documents, attachments, approvals, audit, workspaceGrants, workspaceFiles } = getAgentServices();", "const { documents, attachments, approvals, audit, workspaceGrants, workspaceFiles, workspaceMutations } = getAgentServices();")


handlers_to_add = """
  registerIpcChannel("documentAgent:workspace:proposeChangeset", async (event, input: unknown) => {
    try {
      const value = record(input);
      const agentSessionId = optionalString(value, "agentSessionId") ?? undefined;
      const session = rendererSession(event.sender.id, agentSessionId);
      const grantId = stringField(value, "grantId", 128);
      const grant = workspaceGrants.get(grantId, session);
      if (!grant) throw new Error("CAPABILITY_DENIED");
      
      const changes = value.changes as import("../../../src/agent/contracts/workspace").WorkspaceChange[];
      if (!Array.isArray(changes) || changes.length === 0) throw new Error("Invalid changes.");
      const summary = stringField(value, "summary");
      
      const preview = await workspaceMutations.prepareChangeset({ grant, sessionId: session, changes });
      const pending = await approvals.prepare({
        grantId,
        proposalType: "workspace_changeset",
        canonicalToolName: "workspace.proposeChangeset",
        validatedArguments: { summary, changes },
        baseRevisionIds: [],
        affectedResources: preview.affectedPaths,
        publicSummary: { summary, affectedPaths: preview.affectedPaths, totalBytes: preview.totalBytes },
        privateExecutionPlan: { kind: "workspace_changeset", profileId: getProfileSessionId(event.sender), grantId, agentSessionId, workspaceId: grant.workspaceId, summary, changes } satisfies WorkspaceChangesetPlan,
      });
      await audit.record({ sessionId: session, toolName: "workspace.proposeChangeset", outcome: "proposal", resourceIds: preview.affectedPaths });
      return { ok: true, pendingApproval: pending, preview: { affectedPaths: preview.affectedPaths, totalBytes: preview.totalBytes } };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:workspace:proposeMove", async (event, input: unknown) => {
    try {
      const value = record(input);
      const agentSessionId = optionalString(value, "agentSessionId") ?? undefined;
      const session = rendererSession(event.sender.id, agentSessionId);
      const grantId = stringField(value, "grantId", 128);
      const grant = workspaceGrants.get(grantId, session);
      if (!grant) throw new Error("CAPABILITY_DENIED");
      
      const sourcePath = stringField(value, "sourcePath");
      const destinationPath = stringField(value, "destinationPath");
      
      const pending = await approvals.prepare({
        grantId,
        proposalType: "workspace_move",
        canonicalToolName: "workspace.move",
        validatedArguments: { sourcePath, destinationPath },
        baseRevisionIds: [],
        affectedResources: [sourcePath, destinationPath],
        publicSummary: { sourcePath, destinationPath },
        privateExecutionPlan: { kind: "workspace_move", profileId: getProfileSessionId(event.sender), grantId, agentSessionId, workspaceId: grant.workspaceId, sourcePath, destinationPath } satisfies WorkspaceMovePlan,
      });
      await audit.record({ sessionId: session, toolName: "workspace.move", outcome: "proposal", resourceIds: [sourcePath, destinationPath] });
      return { ok: true, pendingApproval: pending };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });

  registerIpcChannel("documentAgent:workspace:proposeTrash", async (event, input: unknown) => {
    try {
      const value = record(input);
      const agentSessionId = optionalString(value, "agentSessionId") ?? undefined;
      const session = rendererSession(event.sender.id, agentSessionId);
      const grantId = stringField(value, "grantId", 128);
      const grant = workspaceGrants.get(grantId, session);
      if (!grant) throw new Error("CAPABILITY_DENIED");
      
      const relativePath = stringField(value, "relativePath");
      
      const pending = await approvals.prepare({
        grantId,
        proposalType: "workspace_trash",
        canonicalToolName: "workspace.trash",
        validatedArguments: { relativePath },
        baseRevisionIds: [],
        affectedResources: [relativePath],
        publicSummary: { relativePath },
        privateExecutionPlan: { kind: "workspace_trash", profileId: getProfileSessionId(event.sender), grantId, agentSessionId, workspaceId: grant.workspaceId, relativePath } satisfies WorkspaceTrashPlan,
      });
      await audit.record({ sessionId: session, toolName: "workspace.trash", outcome: "proposal", resourceIds: [relativePath] });
      return { ok: true, pendingApproval: pending };
    } catch (error) { return { ok: false, error: redactErrorMessage(error) }; }
  });
"""

content = content.replace("registerIpcChannel(\"documentAgent:workspace:revoke\"", handlers_to_add + "\n  registerIpcChannel(\"documentAgent:workspace:revoke\"")

with open("electron/ipc/handlers/documentAgentHandlers.ts", "w") as f:
    f.write(content)

