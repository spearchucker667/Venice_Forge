import { describe, expect, it } from "vitest";
import { ModelCapabilityService } from "./model-capability-service";

describe("Document Agent model capability source", () => {
  it("derives function calling only from authoritative catalog fields", () => {
    const service = new ModelCapabilityService();
    service.updateFromCatalog([
      { id: "capable", object: "model", created: 1, owned_by: "venice", model_spec: { capabilities: { supportsFunctionCalling: true } } },
      { id: "trait", object: "model", created: 1, owned_by: "venice", model_spec: { traits: ["function_calling_default"] } },
      { id: "plain", object: "model", created: 1, owned_by: "venice" },
    ]);
    expect(service.supportsFunctionCalling("capable")).toBe(true);
    expect(service.supportsFunctionCalling("trait")).toBe(true);
    expect(service.supportsFunctionCalling("plain")).toBe(false);
    expect(service.supportsFunctionCalling("unknown")).toBe(false);
  });

  it("fails closed after the bounded TTL", () => {
    let now = 1_000;
    const service = new ModelCapabilityService(500, () => now);
    service.updateFromCatalog([{ id: "capable", object: "model", created: 1, owned_by: "venice", model_spec: { capabilities: { supportsFunctionCalling: true } } }]);
    expect(service.supportsFunctionCalling("capable")).toBe(true);
    now = 1_501;
    expect(service.supportsFunctionCalling("capable")).toBe(false);
  });
});
