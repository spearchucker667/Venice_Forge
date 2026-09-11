
import { getAgentServices } from "./agent-services";
import { type ToolResult, safeToolError } from "../../../src/agent/contracts/tool-results";
import { internalToolNameForProvider } from "../../../src/agent/registry/tool-name-map";
import { createCanonicalToolDefinitions } from "../../../src/agent/registry/tool-registry";
import type { DocumentBlock, DocumentEditOperation, DocumentFormat } from "../../../src/agent/contracts/documents";
import { serializableDocumentToBlocks } from "../../../src/agent/documents/document-source";
import type { AssistantToolCall } from "../../../src/types/venice";
import { sanitizeErrorText } from "../../../src/shared/redaction";
import { contextHasCapability, type ToolExecutionContext } from "./tool-execution-context";
import {
  buildDocumentEditPlan,
  buildDocumentExportPlan,
  buildDocumentRestorePlan,
  buildGenerateImagePlan,
  buildWorkspaceChangesetPlan,
  buildWorkspaceMovePlan,
  buildWorkspaceTrashPlan,
} from "../approvals/plan-factories";
import { resolveGenerateImageModel } from "./image-model-resolver";
import { computePayloadHash } from "../../../src/shared/venice-media-contract/payload-hash";

const TOOL_VALIDATORS = new Map(
  createCanonicalToolDefinitions().map((tool) => [tool.internalName, tool.argsValidator] as const),
);

export async function executeAgentTool(ctx: ToolExecutionContext, toolCall: AssistantToolCall): Promise<ToolResult> {
  const services = getAgentServices();
  const internalName = internalToolNameForProvider(toolCall.function.name);
  if (!internalName) {
    return safeToolError("document.get", toolCall.id, "INVALID_ARGUMENTS", `Unknown tool name: ${sanitizeErrorText(toolCall.function.name)}`);
  }
  const toolName = internalName;

  let args: Record<string, unknown>;
  try {
    const parsed: unknown = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
    args = (parsed ?? {}) as Record<string, unknown>;
    const validator = TOOL_VALIDATORS.get(internalName);
    if (validator) {
      args = validator.parse(args) as Record<string, unknown>;
    }
  } catch (_error) {
    return safeToolError(toolName, toolCall.id, "INVALID_ARGUMENTS", sanitizeErrorText(`Failed to parse tool arguments: ${_error instanceof Error ? _error.message : String(_error)}`));
  }

  function requireCapability(capability: import("../../../src/agent/contracts/capabilities").Capability): ToolResult | null {
    if (!contextHasCapability(ctx, capability)) {
      return safeToolError(toolName, toolCall.id, "CAPABILITY_DENIED", `Preset ${ctx.preset} does not allow ${toolName}.`);
    }
    return null;
  }

  function resolveWorkspaceGrant(workspaceId: string): import("../../../src/agent/contracts/capabilities").WorkspaceGrant | null {
    if (!ctx.workspaceGrant) return null;
    if (ctx.workspaceGrant.workspaceId !== workspaceId) return null;
    return ctx.workspaceGrant;
  }

  try {
    switch (internalName) {
      case "media.generateImage": {
        const denied = requireCapability("media:generate-image");
        if (denied) return denied;
        const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
        if (prompt.length === 0) {
          return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", "generateImage requires a non-empty prompt.");
        }
        if (prompt.length > PROMPT_MAX_CHARS) {
          return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", `generateImage prompt exceeds ${PROMPT_MAX_CHARS} characters.`);
        }
        const negativePrompt = typeof args.negativePrompt === "string" ? args.negativePrompt.trim().slice(0, PROMPT_MAX_CHARS) : undefined;
        const aspectRatio = typeof args.aspectRatio === "string" && /^[0-9]+:[0-9]+$/.test(args.aspectRatio) ? args.aspectRatio : undefined;
        let width: number | undefined;
        let height: number | undefined;
        if (typeof args.resolution === "string" && /^[0-9]{1,5}x[0-9]{1,5}$/.test(args.resolution)) {
          const [w, h] = args.resolution.split("x").map((part) => Number.parseInt(part, 10));
          if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w <= 4096 && h <= 4096) {
            width = w;
            height = h;
          }
        }
        const modelId = await resolveGenerateImageModel({ profileId: ctx.profileId });
        const wirePayload: Record<string, unknown> = {
          model: modelId,
          prompt,
          return_binary: false,
        };
        if (negativePrompt) wirePayload.negative_prompt = negativePrompt;
        if (aspectRatio) wirePayload.aspect_ratio = aspectRatio;
        if (width !== undefined && height !== undefined) {
          wirePayload.width = width;
          wirePayload.height = height;
        }
        const payloadHash = `sha256:${computePayloadHash(wirePayload)}`;
        const requestFingerprint = payloadHash;
        const plan = buildGenerateImagePlan({
          profileId: ctx.profileId,
          toolCallId: toolCall.id,
          prompt,
          modelId,
          negativePrompt,
          aspectRatio,
          resolution: typeof args.resolution === "string" ? args.resolution : undefined,
          payloadHash,
          requestFingerprint,
          wirePayload,
        });
        const pending = await services.approvals.prepare({
          grantId: `media:${ctx.profileId}`,
          proposalType: "media_generate_image",
          canonicalToolName: "media.generateImage",
          validatedArguments: { prompt, negativePrompt, aspectRatio, resolution: typeof args.resolution === "string" ? args.resolution : undefined },
          baseRevisionIds: [],
          affectedResources: [],
          publicSummary: { prompt: prompt.slice(0, 200), modelId },
          privateExecutionPlan: plan,
        });
        await services.audit.record({ sessionId: ctx.rendererSessionId, toolName: "media.generateImage", outcome: "proposal" });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, proposalHash: pending.proposalHash, proposalType: pending.proposalType } };
      }

      case "document.get": {
        const denied = requireCapability("document:read");
        if (denied) return denied;
        const { documentId, revisionId, cursor } = args as { documentId: string; revisionId?: string; cursor?: string };
        const result = await services.documents.read(ctx.profileId, documentId, revisionId, cursor);
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      case "document.create": {
        const denied = requireCapability("document:create");
        if (denied) return denied;
        const { projectId, relativePath, format, document, blocks, displayName, overwrite } = args as {
          projectId: string;
          relativePath: string;
          format: DocumentFormat;
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
        const result = await services.documents.create(ctx.profileId, {
          projectId,
          relativePath,
          format,
          blocks: resolvedBlocks,
          displayName: resolvedDisplayName,
        });
        await services.audit.record({ sessionId: ctx.rendererSessionId, toolName: "document.create", outcome: "execution", resourceIds: [result.document.id] });
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
        const denied = requireCapability("document:propose-update");
        if (denied) return denied;
        const { documentId, baseRevisionId, summary, operations } = args as { documentId: string; baseRevisionId: string; summary: string; operations: DocumentEditOperation[] };
        const preview = await services.documents.prepareEdits(ctx.profileId, { documentId, baseRevisionId, operations });
        const plan = buildDocumentEditPlan({ profileId: ctx.profileId, documentId, baseRevisionId, summary, operations });
        const pending = await services.approvals.prepare({
          grantId: `limited:${ctx.profileId}`,
          proposalType: "document_edit",
          canonicalToolName: "document.proposeEdits",
          validatedArguments: { documentId, baseRevisionId, summary, operations },
          baseRevisionIds: [baseRevisionId],
          affectedResources: [documentId],
          publicSummary: { summary, before: preview.before, after: preview.after, resultingContentHash: preview.resultingContentHash },
          privateExecutionPlan: plan,
        });
        await services.audit.record({ sessionId: ctx.rendererSessionId, toolName: "document.proposeEdits", outcome: "proposal", resourceIds: [documentId] });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, proposalHash: pending.proposalHash, proposalType: pending.proposalType, preview } };
      }

      case "document.export": {
        const denied = requireCapability("document:export");
        if (denied) return denied;
        const { documentId, revisionId, format, suggestedFileName } = args as { documentId: string; revisionId?: string; format: DocumentFormat; suggestedFileName: string };
        const plan = buildDocumentExportPlan({ profileId: ctx.profileId, documentId, revisionId, format, suggestedFileName });
        const source = await services.documents.getRevisionForSerialization(ctx.profileId, documentId, revisionId ?? null);
        const pending = await services.approvals.prepare({
          grantId: `limited:${ctx.profileId}`,
          proposalType: "document_export",
          canonicalToolName: "document.export",
          validatedArguments: { documentId, revisionId, format, suggestedFileName },
          baseRevisionIds: revisionId ? [revisionId] : [source.document.currentRevisionId],
          affectedResources: [documentId],
          publicSummary: { documentId, displayName: source.document.displayName, format, suggestedFileName },
          privateExecutionPlan: plan,
        });
        await services.audit.record({ sessionId: ctx.rendererSessionId, toolName: "document.export", outcome: "proposal", resourceIds: [documentId] });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, proposalHash: pending.proposalHash, proposalType: pending.proposalType } };
      }

      case "document.getRevision": {
        const denied = requireCapability("document:read-revision");
        if (denied) return denied;
        const { documentId, revisionId, cursor } = args as { documentId: string; revisionId: string; cursor?: string };
        const result = await services.documents.read(ctx.profileId, documentId, revisionId, cursor);
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      case "document.restoreRevision": {
        const denied = requireCapability("document:restore-revision");
        if (denied) return denied;
        const { documentId, currentRevisionId, restoreRevisionId, reason } = args as { documentId: string; currentRevisionId: string; restoreRevisionId: string; reason: string };
        const source = await services.documents.getRevisionForSerialization(ctx.profileId, documentId, restoreRevisionId);
        const plan = buildDocumentRestorePlan({ profileId: ctx.profileId, documentId, currentRevisionId, restoreRevisionId, reason });
        const pending = await services.approvals.prepare({
          grantId: `limited:${ctx.profileId}`,
          proposalType: "document_restore",
          canonicalToolName: "document.restoreRevision",
          validatedArguments: { documentId, currentRevisionId, restoreRevisionId, reason },
          baseRevisionIds: [currentRevisionId, restoreRevisionId],
          affectedResources: [documentId],
          publicSummary: { reason, restoreRevisionId, blocks: source.revision.blocks, warnings: source.revision.warnings },
          privateExecutionPlan: plan,
        });
        await services.audit.record({ sessionId: ctx.rendererSessionId, toolName: "document.restoreRevision", outcome: "proposal", resourceIds: [documentId] });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, proposalHash: pending.proposalHash, proposalType: pending.proposalType, preview: { blocks: source.revision.blocks, warnings: source.revision.warnings } } };
      }

      case "document.promoteAttachment": {
        const denied = requireCapability("attachment:promote");
        if (denied) return denied;
        const { projectId, relativePath, attachmentId, mimeType, sizeBytes, displayName } = args as {
          projectId: string;
          relativePath: string;
          attachmentId: string;
          mimeType: string;
          sizeBytes: number;
          displayName?: string;
        };
        if (typeof sizeBytes !== "number" || sizeBytes < 1 || sizeBytes > 1_048_576) {
          return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", "Invalid attachment size.");
        }
        // Use the main-internal accessor that returns the body buffer; the
        // public resolve() intentionally never returns the body (P1-002).
        const rendererRoot = ctx.rendererSessionId.replace(/:agent_[a-zA-Z0-9_.-]+$/, "");
        const attachment =
          services.attachmentRegistry.resolveWithBody(ctx.profileId, attachmentId, ctx.rendererSessionId)
          ?? (rendererRoot !== ctx.rendererSessionId
            ? services.attachmentRegistry.resolveWithBody(ctx.profileId, attachmentId, rendererRoot)
            : null);
        if (!attachment) {
          return safeToolError(toolName, toolCall.id, "INVALID_ARGUMENTS", "Attachment not found or access denied.");
        }
        const result = await services.attachments.promote(ctx.profileId, {
          attachmentId,
          projectId,
          relativePath,
          displayName,
          mimeType: attachment.mimeType,
          bodyB64: attachment.body.toString("base64"),
        });
        await services.audit.record({
          sessionId: ctx.rendererSessionId,
          toolName: "document.promoteAttachment",
          outcome: "execution",
          resourceIds: [result.document.id],
          metadata: { attachmentId, mimeType, sizeBytes, format: result.format, mode: result.mode, bytesRedacted: result.bytesRedacted },
        });
        return {
          ok: true,
          toolName: internalName,
          requestId: toolCall.id,
          data: {
            documentId: result.document.id,
            revisionId: result.revision.id,
            displayName: result.document.displayName,
            format: result.format,
            mode: result.mode,
            bytesReceived: result.bytesReceived,
            bytesRedacted: result.bytesRedacted,
          },
        };
      }

      case "workspace.list": {
        const denied = requireCapability("workspace:list");
        if (denied) return denied;
        const { workspaceId, relativeDirectory, recursive, maxDepth, offset } = args as { workspaceId: string; relativeDirectory: string; recursive: boolean; maxDepth: number; offset?: number };
        const grant = resolveWorkspaceGrant(workspaceId);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid workspace grant not found for workspace.list");
        const result = await services.workspaceFiles.list({ grant, sessionId: grant.sessionId, workspaceId, relativeDirectory, recursive, maxDepth: Math.min(Math.max(maxDepth ?? 1, 0), 10), offset });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      case "workspace.read": {
        const denied = requireCapability("workspace:read");
        if (denied) return denied;
        const { workspaceId, relativePath, mode } = args as { workspaceId: string; relativePath: string; mode?: string };
        const grant = resolveWorkspaceGrant(workspaceId);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid workspace grant not found for workspace.read");
        if (mode && mode !== "text") {
          return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", `workspace.read mode ${mode} is not supported yet.`);
        }
        const result = await services.workspaceFiles.readText({ grant, sessionId: grant.sessionId, workspaceId, relativePath });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      case "workspace.search": {
        const denied = requireCapability("workspace:search");
        if (denied) return denied;
        const { workspaceId, query, maxResults } = args as { workspaceId: string; query: string; maxResults: number };
        const grant = resolveWorkspaceGrant(workspaceId);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid workspace grant not found for workspace.search");
        const result = await services.workspaceFiles.search({ grant, sessionId: grant.sessionId, workspaceId, query, maxResults });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: result };
      }

      case "workspace.createFile": {
        const denied = requireCapability("workspace:create-file");
        if (denied) return denied;
        const { workspaceId, relativePath, content } = args as { workspaceId: string; relativePath: string; content: string };
        const grant = resolveWorkspaceGrant(workspaceId);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid workspace grant not found for workspace.createFile");
        const change: import("../../../src/agent/contracts/workspace").WorkspaceChange = { type: "create_file", relativePath, expectedAbsent: true, format: "txt", content };
        const { totalBytes, affectedPaths } = await services.workspaceMutations.prepareChangeset({ grant, sessionId: grant.sessionId, changes: [change] });
        const plan = buildWorkspaceChangesetPlan({ profileId: ctx.profileId, grantId: grant.id, agentSessionId: ctx.agentSessionId, workspaceId, summary: `Create file ${relativePath}`, changes: [change] });
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_changeset",
          canonicalToolName: "workspace.createFile",
          validatedArguments: { workspaceId, relativePath, content },
          baseRevisionIds: [],
          affectedResources: affectedPaths,
          publicSummary: { summary: `Create file ${relativePath}`, totalBytes, changes: [change] },
          privateExecutionPlan: plan,
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.createFile", outcome: "proposal", resourceIds: affectedPaths });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, proposalHash: pending.proposalHash, proposalType: pending.proposalType, affectedPaths } };
      }

      case "workspace.createDirectory": {
        const denied = requireCapability("workspace:create-directory");
        if (denied) return denied;
        const { workspaceId, relativePath } = args as { workspaceId: string; relativePath: string };
        const grant = resolveWorkspaceGrant(workspaceId);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid workspace grant not found for workspace.createDirectory");
        const change: import("../../../src/agent/contracts/workspace").WorkspaceChange = { type: "create_directory", relativePath, expectedAbsent: true };
        const { totalBytes, affectedPaths } = await services.workspaceMutations.prepareChangeset({ grant, sessionId: grant.sessionId, changes: [change] });
        const plan = buildWorkspaceChangesetPlan({ profileId: ctx.profileId, grantId: grant.id, agentSessionId: ctx.agentSessionId, workspaceId, summary: `Create directory ${relativePath}`, changes: [change] });
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_changeset",
          canonicalToolName: "workspace.createDirectory",
          validatedArguments: { workspaceId, relativePath },
          baseRevisionIds: [],
          affectedResources: affectedPaths,
          publicSummary: { summary: `Create directory ${relativePath}`, totalBytes, changes: [change] },
          privateExecutionPlan: plan,
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.createDirectory", outcome: "proposal", resourceIds: affectedPaths });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, proposalHash: pending.proposalHash, proposalType: pending.proposalType, affectedPaths } };
      }

      case "workspace.proposeChangeset": {
        const denied = requireCapability("workspace:propose-update");
        if (denied) return denied;
        const { workspaceId, summary, changes } = args as { workspaceId: string; summary: string; changes: import("../../../src/agent/contracts/workspace").WorkspaceChange[] };
        const grant = resolveWorkspaceGrant(workspaceId);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid workspace grant not found for workspace.proposeChangeset");
        const { totalBytes, affectedPaths } = await services.workspaceMutations.prepareChangeset({ grant, sessionId: grant.sessionId, changes });
        const plan = buildWorkspaceChangesetPlan({ profileId: ctx.profileId, grantId: grant.id, agentSessionId: ctx.agentSessionId, workspaceId, summary, changes });
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_changeset",
          canonicalToolName: "workspace.proposeChangeset",
          validatedArguments: { workspaceId, summary, changes },
          baseRevisionIds: [],
          affectedResources: affectedPaths,
          publicSummary: { summary, totalBytes, changes },
          privateExecutionPlan: plan,
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.proposeChangeset", outcome: "proposal", resourceIds: affectedPaths });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, proposalHash: pending.proposalHash, proposalType: pending.proposalType, affectedPaths } };
      }

      case "workspace.move": {
        const denied = requireCapability("workspace:move");
        if (denied) return denied;
        const { workspaceId, sourcePath, destinationPath } = args as { workspaceId: string; sourcePath: string; destinationPath: string };
        const grant = resolveWorkspaceGrant(workspaceId);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid workspace grant not found for workspace.move");
        const plan = buildWorkspaceMovePlan({ profileId: ctx.profileId, grantId: grant.id, agentSessionId: ctx.agentSessionId, workspaceId, sourcePath, destinationPath });
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_move",
          canonicalToolName: "workspace.move",
          validatedArguments: { workspaceId, sourcePath, destinationPath },
          baseRevisionIds: [],
          affectedResources: [sourcePath, destinationPath],
          publicSummary: { summary: `Move ${sourcePath} to ${destinationPath}`, sourcePath, destinationPath },
          privateExecutionPlan: plan,
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.move", outcome: "proposal", resourceIds: [sourcePath, destinationPath] });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, proposalHash: pending.proposalHash, proposalType: pending.proposalType, sourcePath, destinationPath } };
      }

      case "workspace.trash": {
        const denied = requireCapability("workspace:trash");
        if (denied) return denied;
        const { workspaceId, relativePath } = args as { workspaceId: string; relativePath: string };
        const grant = resolveWorkspaceGrant(workspaceId);
        if (!grant) return safeToolError(internalName, toolCall.id, "CAPABILITY_DENIED", "Valid workspace grant not found for workspace.trash");
        const plan = buildWorkspaceTrashPlan({ profileId: ctx.profileId, grantId: grant.id, agentSessionId: ctx.agentSessionId, workspaceId, relativePath });
        const pending = await services.approvals.prepare({
          grantId: grant.id,
          proposalType: "workspace_trash",
          canonicalToolName: "workspace.trash",
          validatedArguments: { workspaceId, relativePath },
          baseRevisionIds: [],
          affectedResources: [relativePath],
          publicSummary: { summary: `Trash ${relativePath}`, relativePath },
          privateExecutionPlan: plan,
        });
        await services.audit.record({ sessionId: grant.sessionId, toolName: "workspace.trash", outcome: "proposal", resourceIds: [relativePath] });
        return { ok: true, toolName: internalName, requestId: toolCall.id, data: { pendingApprovalId: pending.id, proposalHash: pending.proposalHash, proposalType: pending.proposalType, relativePath } };
      }

      default:
        return safeToolError(internalName, toolCall.id, "INVALID_ARGUMENTS", `Tool ${internalName} not supported yet`);
    }
  } catch (error) {
    return safeToolError(internalName, toolCall.id, "INTERNAL_ERROR", sanitizeErrorText(error instanceof Error ? error.message : String(error)));
  }
}

const PROMPT_MAX_CHARS = 4000;
