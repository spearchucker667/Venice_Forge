// @vitest-environment node
/** @fileoverview Regression tests for the connection-test URL/header shape
 *  produced by `buildProviderTestRequest` in `apiKeyHandlers.ts`.
 *
 *  VF-AUD-20260916-P2-004 — Google API Keys in Query URLs / Redaction Gap.
 *  The audit required:
 *    - Gemini connection test: header auth via `x-goog-api-key`, no secret in URL.
 *    - Vertex Express connection test: header auth via `x-goog-api-key`, no secret in URL.
 *    - Generic provider coverage (sanity): the bearer path still uses Authorization.
 *
 *  Note on credential shape: the runtime isGoogleVertexConfig / isAzureOpenAiConfig
 *  guards inspect fields that are populated by `getProviderCredential` at runtime
 *  (the wrapped `ProviderCredential` shape with providerId / projectId / location /
 *  deploymentName). The unit tests below mirror that runtime shape so the guards
 *  accept the fixtures.
 */

import { describe, expect, it } from "vitest";
import { buildProviderTestRequest } from "./apiKeyHandlers";

describe("buildProviderTestRequest — Google Gemini (VF-AUD-20260916-P2-004)", () => {
  it("does NOT embed the API key in the URL query", () => {
    const req = buildProviderTestRequest("google_gemini", "AIza-secret-test-key");
    expect(req).not.toBeNull();
    expect(req!.url).not.toContain("?key=");
    expect(req!.url).not.toContain("key=AIza");
    expect(req!.url).not.toContain("AIza-secret-test-key");
    expect(req!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models");
  });

  it("carries the API key in the `x-goog-api-key` header", () => {
    const req = buildProviderTestRequest("google_gemini", "AIza-secret-test-key");
    expect(req!.headers).toEqual({ "x-goog-api-key": "AIza-secret-test-key" });
  });
});

describe("buildProviderTestRequest — Google Vertex Express (VF-AUD-20260916-P2-004)", () => {
  it("does NOT embed the API key in the URL query", () => {
    // The type guard isGoogleVertexConfig requires providerId/projectId/location
    // (the runtime `ProviderCredential` shape returned by getProviderCredential).
    const req = buildProviderTestRequest("google_vertex", {
      providerId: "google_vertex",
      authMode: "express",
      apiKey: "AIzaVertex-secret-key",
      projectId: "test-project",
      location: "us-central1",
    } as unknown as Parameters<typeof buildProviderTestRequest>[1]);
    expect(req).not.toBeNull();
    expect(req!.url).not.toContain("?key=");
    expect(req!.url).not.toContain("key=AIza");
    expect(req!.url).not.toContain("AIzaVertex-secret-key");
    expect(req!.url).toBe(
      "https://aiplatform.googleapis.com/v1/publishers/google/models",
    );
  });

  it("carries the API key in the `x-goog-api-key` header", () => {
    const req = buildProviderTestRequest("google_vertex", {
      providerId: "google_vertex",
      authMode: "express",
      apiKey: "AIzaVertex-secret-key",
      projectId: "test-project",
      location: "us-central1",
    } as unknown as Parameters<typeof buildProviderTestRequest>[1]);
    expect(req!.headers).toEqual({ "x-goog-api-key": "AIzaVertex-secret-key" });
  });
});

describe("buildProviderTestRequest — other providers unaffected", () => {
  it("Anthropic still uses Authorization header", () => {
    const req = buildProviderTestRequest("anthropic", "sk-ant-test");
    expect(req).not.toBeNull();
    expect(req!.headers).toMatchObject({
      Authorization: "Bearer sk-ant-test",
      "anthropic-version": "2023-06-01",
    });
    expect(req!.url).not.toContain("sk-ant-test");
  });

  it("Azure still uses `api-key` header with no secret in URL", () => {
    const req = buildProviderTestRequest("azure_openai", {
      resourceName: "my-resource",
      deploymentName: "my-deployment",
      apiVersion: "2024-02-01",
      apiKey: "azure-secret",
    });
    expect(req).not.toBeNull();
    expect(req!.headers).toEqual({ "api-key": "azure-secret" });
    expect(req!.url).not.toContain("azure-secret");
    // api-version is non-secret configuration, NOT a credential.
    expect(req!.url).toContain("api-version=2024-02-01");
  });
});