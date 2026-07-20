/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { getAgentServices } from "./agent-services";
import { type ToolResult, safeToolError } from "../../../src/agent/contracts/tool-results";
import { internalToolNameForProvider } from "../../../src/agent/registry/tool-name-map";
import type { DocumentBlock, DocumentEditOperation } from "../../../src/agent/contracts/documents";
import type { AssistantToolCall } from "../../../src/types/venice";
import { sanitizeErrorText } from "../../../src/shared/redaction";

export async function executeAgentTool(profileId: string, toolCall: AssistantToolCall, agentSessionId?: string): Promise<ToolResult> {
  const services = getAgentServices();
  const internalName = internalToolNameForProvider(toolCall.function.name);
  if (!internalName) {
    return safeToolError("document.get", toolCall.id, "INVALID_ARGUMENTS", `Unknown tool name: ${sanitizeErrorText(toolCall.function.name)}`);
  }

  let args: Record<string, unknown>;
  try {
    const parsed: unknown = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
    args = (parsed ?? {}) as Record<string, unknown>;
  } catch (_error) {
    return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", sanitizeErrorText(`Failed to parse tool arguments: ${_error instanceof Error ? _error.message : String(_error)}`));
  }

  try {
    if (internalName.startsWith("media.")) {
      return await executeMediaTool(profileId, internalName, toolCall.id, args);
    }
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

      case "workspace.createFile": {
        const { grantId, workspaceId, relativePath, content } = args as { grantId: string; workspaceId: string; relativePath: string; content: string };
        const grant = services.workspaceGrants.get(grantId, `runtime_${profileId}:agent_${agentSessionId || ""}`);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid grant not found for workspace.createFile");
        const change: import("../../../src/agent/contracts/workspace").WorkspaceChange = { type: "create_file", relativePath, expectedAbsent: true, format: "txt", content };
        const { prepared, totalBytes, affectedPaths } = await services.workspaceMutations.prepareChangeset({ grant, sessionId: grant.sessionId, changes: [change] });
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_changeset",
          canonicalToolName: "workspace.createFile",
          validatedArguments: { workspaceId, relativePath, content },
          baseRevisionIds: [],
          affectedResources: affectedPaths,
          publicSummary: { summary: `Create file ${relativePath}`, totalBytes, changes: [change] },
          privateExecutionPlan: { kind: "workspace_changeset", profileId, workspaceId, changes: [change] },
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.createFile", outcome: "proposal", resourceIds: affectedPaths });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, affectedPaths } };
      }

      case "workspace.createDirectory": {
        const { grantId, workspaceId, relativePath } = args as { grantId: string; workspaceId: string; relativePath: string };
        const grant = services.workspaceGrants.get(grantId, `runtime_${profileId}:agent_${agentSessionId || ""}`);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid grant not found for workspace.createDirectory");
        const change: import("../../../src/agent/contracts/workspace").WorkspaceChange = { type: "create_directory", relativePath, expectedAbsent: true };
        const { prepared, totalBytes, affectedPaths } = await services.workspaceMutations.prepareChangeset({ grant, sessionId: grant.sessionId, changes: [change] });
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_changeset",
          canonicalToolName: "workspace.createDirectory",
          validatedArguments: { workspaceId, relativePath },
          baseRevisionIds: [],
          affectedResources: affectedPaths,
          publicSummary: { summary: `Create directory ${relativePath}`, totalBytes, changes: [change] },
          privateExecutionPlan: { kind: "workspace_changeset", profileId, workspaceId, changes: [change] },
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.createDirectory", outcome: "proposal", resourceIds: affectedPaths });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, affectedPaths } };
      }

      case "workspace.proposeChangeset": {
        const { grantId, workspaceId, summary, changes } = args as { grantId: string; workspaceId: string; summary: string; changes: import("../../../src/agent/contracts/workspace").WorkspaceChange[] };
        const grant = services.workspaceGrants.get(grantId, `runtime_${profileId}:agent_${agentSessionId || ""}`);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid grant not found for workspace.proposeChangeset");
        const { prepared, totalBytes, affectedPaths } = await services.workspaceMutations.prepareChangeset({ grant, sessionId: grant.sessionId, changes });
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_changeset",
          canonicalToolName: "workspace.proposeChangeset",
          validatedArguments: { workspaceId, summary, changes },
          baseRevisionIds: [], // could be enhanced by scanning expected hashes
          affectedResources: affectedPaths,
          publicSummary: { summary, totalBytes, changes },
          privateExecutionPlan: { kind: "workspace_changeset", profileId, workspaceId, changes },
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.proposeChangeset", outcome: "proposal", resourceIds: affectedPaths });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, affectedPaths } };
      }

      case "workspace.move": {
        const { grantId, workspaceId, sourcePath, destinationPath } = args as { grantId: string; workspaceId: string; sourcePath: string; destinationPath: string };
        const grant = services.workspaceGrants.get(grantId, `runtime_${profileId}:agent_${agentSessionId || ""}`);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid grant not found for workspace.move");
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_move",
          canonicalToolName: "workspace.move",
          validatedArguments: { workspaceId, sourcePath, destinationPath },
          baseRevisionIds: [],
          affectedResources: [sourcePath, destinationPath],
          publicSummary: { summary: `Move ${sourcePath} to ${destinationPath}`, sourcePath, destinationPath },
          privateExecutionPlan: { kind: "workspace_move", profileId, workspaceId, sourcePath, destinationPath },
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.move", outcome: "proposal", resourceIds: [sourcePath, destinationPath] });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, sourcePath, destinationPath } };
      }

      case "workspace.trash": {
        const { grantId, workspaceId, relativePath } = args as { grantId: string; workspaceId: string; relativePath: string };
        const grant = services.workspaceGrants.get(grantId, `runtime_${profileId}:agent_${agentSessionId || ""}`);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid grant not found for workspace.trash");
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_trash",
          canonicalToolName: "workspace.trash",
          validatedArguments: { workspaceId, relativePath },
          baseRevisionIds: [],
          affectedResources: [relativePath],
          publicSummary: { summary: `Trash ${relativePath}`, relativePath },
          privateExecutionPlan: { kind: "workspace_trash", profileId, workspaceId, relativePath },
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.trash", outcome: "proposal", resourceIds: [relativePath] });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, relativePath } };
      }

      
      default:
        return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", `Tool ${internalName} not supported yet`);
    }
  } catch (error) {
    return safeToolError(internalName, toolCall.id, "INTERNAL_ERROR", sanitizeErrorText(error instanceof Error ? error.message : String(error)));
  }
}

import { getApiKey } from "../../services/secureStore";
import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

export async function executeMediaTool(profileId: string, internalName: string, requestId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const services = getAgentServices();

  try {
    const apiKey = getApiKey(profileId);
    if (!apiKey) return safeToolError(internalName as any, requestId, "CAPABILITY_DENIED", "No API key configured for Venice.");

    const veniceHeaders = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };

    if (internalName === "media.generateImage") {
      const { prompt, negativePrompt, resolution, aspectRatio } = args as { prompt: string; negativePrompt?: string; resolution?: string; aspectRatio?: string };
      
      const modelsRes = await fetch("https://api.venice.ai/api/v1/models", { headers: veniceHeaders });
      if (!modelsRes.ok) return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", "Failed to load models.");
      const modelsResponse = await modelsRes.json() as import("../../../src/types/venice").ModelsResponse;
      const imageModels = modelsResponse.data.filter(m => (m as any).type === "image" || (m as any).model_type === "image" || (m.model_spec as any)?.type === "image" || m.model_spec?.traits?.includes("default_vision") || (m.model_spec?.capabilities?.supportsVision && !m.model_spec?.capabilities?.supportsVideoInput));
      
      const model = imageModels[0];
      if (!model) return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", "No image models available in the catalog.");
      
      const genRes = await fetch("https://api.venice.ai/api/v1/image/generate", {
        method: "POST",
        headers: veniceHeaders,
        body: JSON.stringify({
          model: model.id,
          prompt,
          negative_prompt: negativePrompt,
          width: resolution ? parseInt(resolution.split("x")[0], 10) : undefined,
          height: resolution ? parseInt(resolution.split("x")[1], 10) : undefined,
          aspect_ratio: aspectRatio,
          return_binary: false
        })
      });
      if (!genRes.ok) return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", `Failed to generate image: ${genRes.statusText}`);
      const generateResponse = await genRes.json() as import("../../../src/types/venice").ImageGenerateResponse;

      const images = generateResponse.images;
      if (!images || images.length === 0) {
        return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", "No images returned by the Venice API.");
      }
      
      const b64 = (typeof images[0] === 'string') ? images[0] : images[0]?.b64_json;
      if (!b64) {
         return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", "No image returned.");
      }

      const { persistGeneratedMedia } = await import("../../services/generatedMediaStore");
      const buffer = Buffer.from(b64, 'base64');
      const persisted = await persistGeneratedMedia(buffer, 'image/png');

      await services.audit.record({ sessionId: `runtime_${profileId}:agent_`, toolName: "media.generateImage", outcome: "execution", resourceIds: [persisted.id] });
      
      return { ok: true, toolName: internalName as any, requestId, data: { mediaId: persisted.id, mimeType: persisted.mimeType } };
    }
    // Phase 5.2 — video / audio tools are intentionally absent from the
    // canonical tool registry while their durable approval pipeline is
    // pending. If a stale prompt somehow surfaces one of these names, surface
    // it as capability-denied rather than silently miscalling /image/generate.
    return safeToolError(internalName as any, requestId, "CAPABILITY_DENIED", `Media tool ${internalName} is not enabled in this build.`);
  } catch (error) {
    return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", sanitizeErrorText(error instanceof Error ? error.message : String(error)));
  }
}
