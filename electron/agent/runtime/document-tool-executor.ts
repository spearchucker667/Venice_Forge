import { getAgentServices } from "./agent-services";
import { type ToolResult, safeToolError } from "../../../src/agent/contracts/tool-results";
import { internalToolNameForProvider } from "../../../src/agent/registry/tool-name-map";
import type { DocumentBlock, DocumentEditOperation } from "../../../src/agent/contracts/documents";
import type { AssistantToolCall } from "../../../src/types/venice";

export async function executeDocumentTool(profileId: string, toolCall: AssistantToolCall, agentSessionId?: string): Promise<ToolResult> {
  const services = getAgentServices();
  const internalName = internalToolNameForProvider(toolCall.function.name);
  if (!internalName) {
    return safeToolError("document.get", toolCall.id, "INVALID_ARGUMENTS", `Unknown tool name: ${toolCall.function.name}`);
  }

  let args: Record<string, unknown>;
  try {
    const parsed: unknown = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
    args = (parsed ?? {}) as Record<string, unknown>;
  } catch (_error) {
    return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", `Failed to parse tool arguments: ${_error instanceof Error ? _error.message : String(_error)}`);
  }

  try {
    switch (internalName) {
      case "document.get": {
        const { documentId, revisionId, cursor } = args as { documentId: string; revisionId?: string; cursor?: string };
        const result = await services.documents.read(profileId, documentId, revisionId, cursor);
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      case "document.create": {
        const { projectId, relativePath, format, blocks, displayName } = args as { projectId: string; relativePath: string; format: "txt" | "md" | "json" | "csv" | "html" | "docx" | "pdf"; blocks: DocumentBlock[]; displayName: string };
        const result = await services.documents.create(profileId, {
          projectId, relativePath, format, blocks, displayName
        });
        await services.audit.record({ sessionId: `runtime_${profileId}`, toolName: "document.create", outcome: "execution", resourceIds: [result.document.id] });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      case "document.proposeEdits": {
        const { documentId, baseRevisionId, summary, operations } = args as { documentId: string; baseRevisionId: string; summary: string; operations: DocumentEditOperation[] };
        const preview = await services.documents.prepareEdits(profileId, { documentId, baseRevisionId, operations });
        const pending = await services.approvals.prepare({
          grantId: `limited:${profileId}`,
          proposalType: "document_edit",
          canonicalToolName: "document.proposeEdits",
          validatedArguments: { documentId, baseRevisionId, summary, operations },
          baseRevisionIds: [baseRevisionId],
          affectedResources: [documentId],
          publicSummary: { summary, before: preview.before, after: preview.after, resultingContentHash: preview.resultingContentHash },
          privateExecutionPlan: { kind: "document_edit", profileId, documentId, baseRevisionId, summary, operations },
        });
        await services.audit.record({ sessionId: `runtime_${profileId}`, toolName: "document.proposeEdits", outcome: "proposal", resourceIds: [documentId] });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, preview } };
      }

      case "workspace.list": {
        const { grantId, workspaceId, relativeDirectory, recursive, maxDepth, offset } = args as { grantId: string; workspaceId: string; relativeDirectory: string; recursive: boolean; maxDepth: number; offset: number };
        const grant = services.workspaceGrants.get(grantId, `runtime_${profileId}:agent_${agentSessionId || ""}`);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid grant not found for workspace.list");
        const result = await services.workspaceFiles.list({ grant, sessionId: grant.sessionId, workspaceId, relativeDirectory, recursive, maxDepth, offset });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }
      
      case "workspace.read": {
        const { grantId, workspaceId, relativePath } = args as { grantId: string; workspaceId: string; relativePath: string };
        const grant = services.workspaceGrants.get(grantId, `runtime_${profileId}:agent_${agentSessionId || ""}`);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid grant not found for workspace.read");
        const result = await services.workspaceFiles.readText({ grant, sessionId: grant.sessionId, workspaceId, relativePath });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      case "workspace.search": {
        const { grantId, workspaceId, query, maxResults } = args as { grantId: string; workspaceId: string; query: string; maxResults: number };
        const grant = services.workspaceGrants.get(grantId, `runtime_${profileId}:agent_${agentSessionId || ""}`);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid grant not found for workspace.search");
        const result = await services.workspaceFiles.search({ grant, sessionId: grant.sessionId, workspaceId, query, maxResults });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      default:
        return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", `Tool ${internalName} is not yet implemented.`);
    }
  } catch (error) {
    return safeToolError(internalName, toolCall.id, "INTERNAL_ERROR", error instanceof Error ? error.message : String(error));
  }
}
