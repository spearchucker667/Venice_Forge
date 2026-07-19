import { describe, expect, it } from "vitest";
import { capabilitiesForPreset, type CapabilityGrant } from "../contracts/capabilities";
import { createCanonicalToolDefinitions, ToolRegistry } from "./tool-registry";

function grant(preset: CapabilityGrant["preset"]): CapabilityGrant {
  return {
    id: "grant_1",
    sessionId: "session_1",
    preset,
    capabilities: capabilitiesForPreset(preset),
    issuedAt: new Date().toISOString(),
    userInitiated: true,
  };
}

describe("canonical document-agent tool registry", () => {
  it("VERIFY-145 registers all 16 unique provider-safe tools", () => {
    const definitions = createCanonicalToolDefinitions();
    expect(definitions).toHaveLength(16);
    expect(new Set(definitions.map((tool) => tool.providerName))).toHaveLength(16);
    expect(definitions.every((tool) => !tool.providerName.includes("."))).toBe(true);
  });

  it("fails closed when function calling is unsupported", () => {
    const registry = new ToolRegistry(createCanonicalToolDefinitions(), { supportsFunctionCalling: () => false });
    expect(registry.getProviderSchemas({ modelId: "text-model", grant: grant("limited_documents"), sessionId: "session_1" })).toEqual([]);
  });

  it("filters tools to the active grant and rejects unknown names", () => {
    const registry = new ToolRegistry(createCanonicalToolDefinitions(), { supportsFunctionCalling: () => true });
    const schemas = registry.getProviderSchemas({ modelId: "tool-model", grant: grant("limited_documents"), sessionId: "session_1" });
    expect(schemas).toHaveLength(7);
    expect(schemas.every((schema) => schema.function.name.startsWith("document_"))).toBe(true);
    expect(() => registry.resolveProviderName("document.applyApprovedEdits")).toThrow("Unknown provider tool name");
  });

  it("rejects duplicate registrations at startup", () => {
    const definitions = createCanonicalToolDefinitions();
    expect(() => new ToolRegistry([definitions[0], definitions[0]], { supportsFunctionCalling: () => true })).toThrow("Duplicate tool registration");
  });

  it("runtime-validates required fields, bounds, constants, and unknown properties", () => {
    const registry = new ToolRegistry(createCanonicalToolDefinitions(), { supportsFunctionCalling: () => true });
    const create = registry.resolveProviderName("document_create");
    expect(() => create.argsValidator.parse({ projectId: "p", relativePath: "notes.md", format: "md", document: {}, overwrite: true })).toThrow("Invalid overwrite");
    expect(() => create.argsValidator.parse({ projectId: "p", relativePath: "notes.md", format: "md", document: {}, overwrite: false, arbitrary: true })).toThrow("Unexpected arbitrary");
    expect(create.argsValidator.parse({ projectId: "p", relativePath: "notes.md", format: "md", document: {}, overwrite: false })).toMatchObject({ overwrite: false });
  });
});
