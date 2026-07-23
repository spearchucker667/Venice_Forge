/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { getAgentServices } from "./agent-services";
import { type ToolResult, safeToolError } from "../../../src/agent/contracts/tool-results";
import { internalToolNameForProvider } from "../../../src/agent/registry/tool-name-map";
import type { DocumentBlock, DocumentEditOperation } from "../../../src/agent/contracts/documents";
import { serializableDocumentToBlocks } from "../../../src/agent/documents/document-source";
import type { AssistantToolCall } from "../../../src/types/venice";
import { sanitizeErrorText } from "../../../src/shared/redaction";
import { performGuardedVeniceRequest } from "../../services/guardPipeline";

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
      return await executeMediaTool(profileId, internalName, toolCall.id, args, agentSessionId);
    }
    switch (internalName) {
      case "document.get": {
        const { documentId, revisionId, cursor } = args as { documentId: string; revisionId?: string; cursor?: string };
        const result = await services.documents.read(profileId, documentId, revisionId, cursor);
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      case "document.create": {
        const { projectId, relativePath, format, document, blocks, displayName, overwrite } = args as {
          projectId: string;
          relativePath: string;
          format: "txt" | "md" | "json" | "csv" | "html" | "docx" | "pdf";
          document?: unknown;
          blocks?: DocumentBlock[];
          displayName?: string;
          overwrite?: boolean;
        };
        if (overwrite === true) {
          return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", "document.create overwrite must be false.");
        }
        const resolvedBlocks = serializableDocumentToBlocks(document ?? blocks, format);
        const resolvedDisplayName = displayName || relativePath;
        const result = await services.documents.create(profileId, {
          projectId,
          relativePath,
          format,
          blocks: resolvedBlocks,
          displayName: resolvedDisplayName,
        });
        await services.audit.record({ sessionId: `runtime_${profileId}`, toolName: "document.create", outcome: "execution", resourceIds: [result.document.id] });
        const chatDocumentRef = {
          documentId: result.document.id,
          projectId: result.document.projectId,
          relativePath: result.document.libraryRelativePath,
          displayName: result.document.displayName,
          format: result.document.originalFormat,
          revisionId: result.revision.id,
        };
        return {
          ok: true,
          toolName: internalName,
          requestId: toolCall.id,
          data: {
            documentId: result.document.id,
            revisionId: result.revision.id,
            displayName: result.document.displayName,
            format: result.document.originalFormat,
            relativePath: result.document.libraryRelativePath,
            chatDocumentRef,
          },
        };
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

// Phase 5.1 — `media.generateImage` is the only currently enabled media
// tool. It routes through the canonical guarded Venice request pipeline
// (Local Family Safe Mode -> trusted runtime composition -> performVeniceRequest
// -> response screening) instead of raw `fetch`, so every prompt payload is
// preflighted and every response is audited. Other media.* tools are
// not yet wired and surface CAPABILITY_DENIED rather than silently
// miscalling /image/generate.

const ENABLE_RESOLUTION_RE = /^[0-9]{1,5}x[0-9]{1,5}$/;
const MODEL_ID_RE = /^[a-zA-Z0-9_.:-]{1,128}$/;
const PROMPT_MAX_CHARS = 4000;

function detectImageMimeTypeFromBase64(b64: string): "image/png" | "image/jpeg" | "image/webp" | null {
  // The base64 prefixes below fingerprint every common format we accept.
  // persistGeneratedMedia's allowlist is the second line of defence; this
  // first-line sniff rejects unknown / empty payloads before we ever
  // attempt base64-to-byte conversion.
  if (b64.startsWith("iVBORw0KGgo")) return "image/png";
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("UklGR")) return "image/webp";
  return null;
}

export async function executeMediaTool(
  profileId: string,
  internalName: string,
  requestId: string,
  args: Record<string, unknown>,
  agentSessionId?: string,
): Promise<ToolResult> {
  const services = getAgentServices();

  try {
    if (internalName !== "media.generateImage") {
      // Phase 5.2 — video / audio tools are intentionally absent from the
      // canonical tool registry while their durable approval pipeline is
      // pending. Fail closed rather than silently miscalling /image/generate.
      return safeToolError(internalName as any, requestId, "CAPABILITY_DENIED", `Media tool ${internalName} is not enabled in this build.`);
    }

    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (prompt.length === 0) {
      return safeToolError(internalName as any, requestId, "INVALID_ARGUMENTS", "generateImage requires a non-empty prompt.");
    }
    if (prompt.length > PROMPT_MAX_CHARS) {
      return safeToolError(internalName as any, requestId, "INVALID_ARGUMENTS", `generateImage prompt exceeds ${PROMPT_MAX_CHARS} characters.`);
    }
    const requestedModel = typeof args.model === "string" ? args.model.trim() : "";
    if (!MODEL_ID_RE.test(requestedModel)) {
      return safeToolError(internalName as any, requestId, "INVALID_ARGUMENTS", "generateImage requires a string model id.");
    }
    const negativePrompt = typeof args.negativePrompt === "string" ? args.negativePrompt.trim().slice(0, PROMPT_MAX_CHARS) : undefined;
    const aspectRatio = typeof args.aspectRatio === "string" && /^[0-9]+:[0-9]+$/.test(args.aspectRatio) ? args.aspectRatio : undefined;
    let width: number | undefined;
    let height: number | undefined;
    if (typeof args.resolution === "string" && ENABLE_RESOLUTION_RE.test(args.resolution)) {
      const [w, h] = args.resolution.split("x").map((part) => Number.parseInt(part, 10));
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w <= 4096 && h <= 4096) {
        width = w;
        height = h;
      }
    }

    const imagePayload: Record<string, unknown> = {
      model: requestedModel,
      prompt,
      return_binary: false,
    };
    if (negativePrompt) imagePayload.negative_prompt = negativePrompt;
    if (aspectRatio) imagePayload.aspect_ratio = aspectRatio;
    if (width !== undefined && height !== undefined) {
      imagePayload.width = width;
      imagePayload.height = height;
    }

    const guarded = await performGuardedVeniceRequest({
      endpoint: "/image/generate",
      method: "POST",
      body: imagePayload,
      profileId,
    });

    if (guarded.kind === "blocked") {
      const reason = (guarded.block.body as { error?: unknown } | undefined)?.error;
      const reasonText = typeof reason === "string" ? reason : "image-generate request blocked by Family Safe Mode";
      return safeToolError(internalName as any, requestId, "CAPABILITY_DENIED", sanitizeErrorText(reasonText));
    }
    const response = guarded.response;
    if (!response.ok) {
      return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", sanitizeErrorText(`Image generate returned status ${response.status} ${response.statusText ?? ""}.`));
    }

    const responseBody = (response.body ?? {}) as { images?: unknown };
    const rawImages = Array.isArray(responseBody.images) ? responseBody.images : [];
    if (rawImages.length === 0) {
      return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", "Image generate response did not include any images.");
    }
    const first = rawImages[0] as unknown;
    const b64 = typeof first === "string" ? first : (first && typeof first === "object" && typeof (first as { b64_json?: unknown }).b64_json === "string")
      ? (first as { b64_json: string }).b64_json
      : "";
    if (b64.length === 0) {
      return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", "Image generate response was missing base64 image data.");
    }
    const mimeType = detectImageMimeTypeFromBase64(b64);
    if (!mimeType) {
      return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", "Image generate produced an unsupported image format.");
    }

    const { persistGeneratedMedia } = await import("../../services/generatedMediaStore");
    const buffer = Buffer.from(b64, "base64");
    const persisted = await persistGeneratedMedia(buffer, mimeType);

    await services.audit.record({
      sessionId: agentSessionId ? `runtime_${profileId}:agent_${agentSessionId}` : `runtime_${profileId}:agent_unknown`,
      toolName: "media.generateImage",
      outcome: "execution",
      resourceIds: [persisted.id],
    });

    const createdAt = Date.now();
    // Canonical fields consumed by `chat-agent-runner` to build a
    // `metadata.generatedMedia: ChatMediaReference[]` attachment on the tool
    // message. Keeping the executor output canonical means the chat-store
    // Media Studio upsert path always sees the full ChatMediaReference shape
    // it expects instead of a stub `{ mediaId, mimeType }` object.
    return {
      ok: true,
      toolName: internalName as any,
      requestId,
      data: {
        chatRef: {
          id: persisted.id,
          mediaId: persisted.id,
          mediaType: "image",
          operation: "generate",
          displayUrl: persisted.url,
          thumbnailUrl: persisted.url,
          altText: prompt.slice(0, 200),
          modelId: requestedModel,
          createdAt,
          mimeType: persisted.mimeType,
        },
      },
    };
  } catch (error) {
    return safeToolError(internalName as any, requestId, "INTERNAL_ERROR", sanitizeErrorText(error instanceof Error ? error.message : String(error)));
  }
}
