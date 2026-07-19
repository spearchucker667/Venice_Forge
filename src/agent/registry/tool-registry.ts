import type { Capability, CapabilityGrant } from "../contracts/capabilities";
import { isGrantActive } from "../contracts/capabilities";
import {
  internalToolNameForProvider,
  toolNameMap,
  type InternalToolName,
  type ProviderToolName,
} from "./tool-name-map";

export interface ProviderToolSchema {
  type: "function";
  function: {
    name: ProviderToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface RuntimeValidator<T> {
  parse(input: unknown): T;
}

export interface RegisteredTool<TArgs = Record<string, unknown>> {
  internalName: InternalToolName;
  providerName: ProviderToolName;
  description: string;
  requiredCapabilities: Capability[];
  modelCallable: true;
  requiresApproval: "never" | "always" | "policy";
  schema: ProviderToolSchema;
  argsValidator: RuntimeValidator<TArgs>;
}

export interface ModelToolCapabilitySource {
  supportsFunctionCalling(modelId: string): boolean;
}

function assertPlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be an object.");
  }
  return value as Record<string, unknown>;
}

function boundedString(record: Record<string, unknown>, key: string, max = 500, allowEmpty = false): string {
  const value = record[key];
  if (typeof value !== "string" || value.length > max || (!allowEmpty && value.length === 0)) {
    throw new Error(`Invalid ${key}.`);
  }
  return value;
}

function validateSchema(value: unknown, schema: Record<string, unknown>, label = "arguments"): void {
  if (Array.isArray(schema.anyOf)) {
    if (!schema.anyOf.some((candidate) => {
      try { validateSchema(value, candidate as Record<string, unknown>, label); return true; } catch { return false; }
    })) throw new Error(`Invalid ${label}.`);
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new Error(`Invalid ${label}.`);
  if (Object.hasOwn(schema, "const") && value !== schema.const) throw new Error(`Invalid ${label}.`);
  if (schema.type === "null") { if (value !== null) throw new Error(`Invalid ${label}.`); return; }
  if (schema.type === "string") {
    if (typeof value !== "string" || (typeof schema.minLength === "number" && value.length < schema.minLength)
      || (typeof schema.maxLength === "number" && value.length > schema.maxLength)) throw new Error(`Invalid ${label}.`);
    return;
  }
  if (schema.type === "boolean") { if (typeof value !== "boolean") throw new Error(`Invalid ${label}.`); return; }
  if (schema.type === "integer") {
    if (!Number.isSafeInteger(value) || (typeof schema.minimum === "number" && Number(value) < schema.minimum)
      || (typeof schema.maximum === "number" && Number(value) > schema.maximum)) throw new Error(`Invalid ${label}.`);
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value) || (typeof schema.minItems === "number" && value.length < schema.minItems)
      || (typeof schema.maxItems === "number" && value.length > schema.maxItems)) throw new Error(`Invalid ${label}.`);
    if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items as Record<string, unknown>, `${label}[${index}]`));
    return;
  }
  if (schema.type === "object") {
    const object = assertPlainObject(value);
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const required = (schema.required ?? []) as string[];
    for (const key of required) if (!Object.hasOwn(object, key)) throw new Error(`Missing ${key}.`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) if (!Object.hasOwn(properties, key)) throw new Error(`Unexpected ${key}.`);
    }
    for (const [key, item] of Object.entries(object)) if (properties[key]) validateSchema(item, properties[key], key);
  }
}

function simpleValidator(schema: Record<string, unknown>, options?: { relativePathKeys?: readonly string[] }): RuntimeValidator<Record<string, unknown>> {
  return {
    parse(input) {
      const record = assertPlainObject(input);
      validateSchema(record, schema);
      for (const key of options?.relativePathKeys ?? []) boundedString(record, key, 500, key === "relativeDirectory");
      return structuredClone(record);
    },
  };
}

function objectSchema(properties: Record<string, unknown>, required: readonly string[]): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, required: [...required] };
}

const stringId = { type: "string", minLength: 1, maxLength: 128 } as const;
const relativePath = { type: "string", minLength: 1, maxLength: 500 } as const;

const DEFINITIONS: Array<{
  internalName: InternalToolName;
  description: string;
  capability: Capability;
  approval: RegisteredTool["requiresApproval"];
  required: readonly string[];
  properties: Record<string, unknown>;
  relativePathKeys?: readonly string[];
}> = [
  { internalName: "document.get", description: "Read a bounded segment of a managed document.", capability: "document:read", approval: "never", required: ["documentId"], properties: { documentId: stringId, revisionId: { anyOf: [stringId, { type: "null" }] }, cursor: { anyOf: [{ type: "string", maxLength: 512 }, { type: "null" }] } } },
  { internalName: "document.proposeEdits", description: "Prepare deterministic managed-document edits without writing.", capability: "document:propose-update", approval: "always", required: ["documentId", "baseRevisionId", "summary", "operations"], properties: { documentId: stringId, baseRevisionId: stringId, summary: { type: "string", minLength: 1, maxLength: 500 }, operations: { type: "array", minItems: 1, maxItems: 200, items: { type: "object" } } } },
  { internalName: "document.create", description: "Create a non-overwriting app-managed document.", capability: "document:create", approval: "never", required: ["projectId", "relativePath", "format", "document", "overwrite"], properties: { projectId: stringId, relativePath, format: { enum: ["txt", "md", "json", "csv", "html", "docx", "pdf"] }, document: { type: "object" }, overwrite: { const: false } }, relativePathKeys: ["relativePath"] },
  { internalName: "document.export", description: "Request export through a user-confirmed native save dialog.", capability: "document:export", approval: "always", required: ["documentId", "revisionId", "format", "suggestedFileName"], properties: { documentId: stringId, revisionId: { anyOf: [stringId, { type: "null" }] }, format: { enum: ["txt", "md", "json", "csv", "html", "docx", "pdf"] }, suggestedFileName: { type: "string", minLength: 1, maxLength: 255 } } },
  { internalName: "document.getRevision", description: "Read bounded content from an immutable revision.", capability: "document:read-revision", approval: "never", required: ["documentId", "revisionId"], properties: { documentId: stringId, revisionId: stringId, cursor: { anyOf: [{ type: "string", maxLength: 512 }, { type: "null" }] } } },
  { internalName: "document.restoreRevision", description: "Propose restoration as a new immutable revision.", capability: "document:restore-revision", approval: "always", required: ["documentId", "currentRevisionId", "restoreRevisionId", "reason"], properties: { documentId: stringId, currentRevisionId: stringId, restoreRevisionId: stringId, reason: { type: "string", minLength: 1, maxLength: 500 } } },
  { internalName: "document.promoteAttachment", description: "Promote an attached file into a non-overwriting managed document with bounded text extraction, secret redaction, and audit.", capability: "attachment:promote", approval: "never", required: ["projectId", "relativePath", "format", "attachmentId", "mimeType", "sizeBytes"], properties: { projectId: stringId, relativePath, format: { enum: ["txt", "md", "json", "csv", "html", "docx", "pdf"] }, attachmentId: stringId, mimeType: { type: "string", minLength: 1, maxLength: 255 }, sizeBytes: { type: "integer", minimum: 1, maximum: 1048576 }, displayName: { type: "string", minLength: 1, maxLength: 255 } }, relativePathKeys: ["relativePath"] },
  { internalName: "workspace.list", description: "List bounded entries beneath the granted workspace.", capability: "workspace:list", approval: "never", required: ["workspaceId", "relativeDirectory", "recursive", "maxDepth"], properties: { workspaceId: stringId, relativeDirectory: { type: "string", maxLength: 500 }, recursive: { type: "boolean" }, maxDepth: { type: "integer", minimum: 0, maximum: 10 } }, relativePathKeys: ["relativeDirectory"] },
  { internalName: "workspace.read", description: "Read a supported file beneath the granted workspace.", capability: "workspace:read", approval: "never", required: ["workspaceId", "relativePath", "mode"], properties: { workspaceId: stringId, relativePath, mode: { enum: ["text", "document_blocks", "metadata"] } }, relativePathKeys: ["relativePath"] },
  { internalName: "workspace.search", description: "Search supported text files without shell execution.", capability: "workspace:search", approval: "never", required: ["workspaceId", "query", "maxResults"], properties: { workspaceId: stringId, query: { type: "string", minLength: 1, maxLength: 500 }, maxResults: { type: "integer", minimum: 1, maximum: 200 } } },
  { internalName: "workspace.createFile", description: "Prepare creation of a non-overwriting workspace file.", capability: "workspace:create-file", approval: "policy", required: ["workspaceId", "relativePath", "content"], properties: { workspaceId: stringId, relativePath, content: { type: "string" } }, relativePathKeys: ["relativePath"] },
  { internalName: "workspace.createDirectory", description: "Prepare creation of a workspace directory.", capability: "workspace:create-directory", approval: "policy", required: ["workspaceId", "relativePath"], properties: { workspaceId: stringId, relativePath }, relativePathKeys: ["relativePath"] },
  { internalName: "workspace.proposeChangeset", description: "Prepare a bounded multi-file workspace changeset.", capability: "workspace:propose-update", approval: "policy", required: ["workspaceId", "summary", "changes"], properties: { workspaceId: stringId, summary: { type: "string", minLength: 1, maxLength: 500 }, changes: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } } } },
  { internalName: "workspace.move", description: "Propose an explicitly confirmed move within the workspace.", capability: "workspace:move", approval: "always", required: ["workspaceId", "sourcePath", "destinationPath"], properties: { workspaceId: stringId, sourcePath: relativePath, destinationPath: relativePath }, relativePathKeys: ["sourcePath", "destinationPath"] },
  { internalName: "workspace.trash", description: "Propose moving a workspace item to recoverable Trash.", capability: "workspace:trash", approval: "always", required: ["workspaceId", "relativePath"], properties: { workspaceId: stringId, relativePath }, relativePathKeys: ["relativePath"] },
  { internalName: "media.generateImage", description: "Generate an image based on a text prompt.", capability: "media:generate-image", approval: "always", required: ["prompt"], properties: { prompt: { type: "string", minLength: 1, maxLength: 2000 }, negative_prompt: { type: "string", maxLength: 2000 }, style_preset: { type: "string" }, width: { type: "integer", minimum: 256, maximum: 2048 }, height: { type: "integer", minimum: 256, maximum: 2048 } } },
];

export function createCanonicalToolDefinitions(): RegisteredTool[] {
  return DEFINITIONS.map((definition) => {
    const providerName = toolNameMap[definition.internalName];
    const parameters = objectSchema(definition.properties, definition.required);
    return {
      internalName: definition.internalName,
      providerName,
      description: definition.description,
      requiredCapabilities: [definition.capability],
      modelCallable: true,
      requiresApproval: definition.approval,
      schema: {
        type: "function",
        function: {
          name: providerName,
          description: definition.description,
          parameters,
        },
      },
      argsValidator: simpleValidator(parameters, { relativePathKeys: definition.relativePathKeys }),
    };
  });
}

export class ToolRegistry {
  private readonly byInternal = new Map<InternalToolName, RegisteredTool>();
  private readonly byProvider = new Map<ProviderToolName, RegisteredTool>();

  constructor(
    tools: RegisteredTool[],
    private readonly modelCapabilities: ModelToolCapabilitySource,
  ) {
    for (const tool of tools) {
      if (this.byInternal.has(tool.internalName) || this.byProvider.has(tool.providerName)) {
        throw new Error(`Duplicate tool registration: ${tool.internalName}.`);
      }
      if (toolNameMap[tool.internalName] !== tool.providerName || !internalToolNameForProvider(tool.providerName)) {
        throw new Error(`Invalid tool name mapping: ${tool.internalName}.`);
      }
      if (tool.schema.function.name !== tool.providerName || !tool.argsValidator) {
        throw new Error(`Invalid tool contract: ${tool.internalName}.`);
      }
      this.byInternal.set(tool.internalName, tool);
      this.byProvider.set(tool.providerName, tool);
    }
  }

  getProviderSchemas(input: { modelId: string; grant: CapabilityGrant; sessionId: string }): ProviderToolSchema[] {
    if (!this.modelCapabilities.supportsFunctionCalling(input.modelId) || !isGrantActive(input.grant, input.sessionId)) return [];
    return [...this.byInternal.values()]
      .filter((tool) => tool.requiredCapabilities.every((capability) => input.grant.capabilities.includes(capability)))
      .map((tool) => structuredClone(tool.schema));
  }

  resolveProviderName(providerName: string): RegisteredTool {
    const internalName = internalToolNameForProvider(providerName);
    if (!internalName) throw new Error("Unknown provider tool name.");
    const tool = this.byInternal.get(internalName);
    if (!tool) throw new Error("Provider tool is not registered.");
    return tool;
  }
}
