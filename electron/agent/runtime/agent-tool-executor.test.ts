// @vitest-environment node
//
// Regression coverage for the P0-04 audit finding (see ROADMAP P0-04):
//
//   "executeMediaTool() calls fetch() against api.venice.ai/api/v1/models
//    and api.venice.ai/api/v1/image/generate, going around the guard
//    pipeline, capability resolver, safe-mode, retry policy, and traffic
//    inspector."
//
// These tests assert the executor routes `/image/generate` through
// `performGuardedVeniceRequest`, never the global fetch, and returns a
// canonical ChatMediaReference-shaped payload (the contract the chat-agent-
// runner expects) rather than the legacy `{mediaId, mimeType}` stub.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Performance pipeline must be the producer.
const performGuardedVeniceRequest = vi.fn();
vi.mock("../../services/guardPipeline", () => ({
  performGuardedVeniceRequest: (...args: unknown[]) => performGuardedVeniceRequest(...args),
}));

// Audit must be invoked under a non-empty session id.
const audit = { record: vi.fn() };
vi.mock("./agent-services", () => ({
  getAgentServices: () => ({ audit, documents: {}, approvals: {} }),
}));

// Persistence must always run before the canonical payload is returned.
vi.mock("../../services/generatedMediaStore", () => ({}));
const persistGeneratedMedia = vi.fn();
import("../../services/generatedMediaStore").then((mod) => {
  mod.persistGeneratedMedia = persistGeneratedMedia;
});

// Raw fetch must never be called by the executor — the audit flags any
// direct HTTP call to api.venice.ai outside the guarded broker.
const fakeFetch = vi.fn();
vi.stubGlobal("fetch", fakeFetch);

// Must NOT reach the legacy auth flow:
vi.mock("../../services/secureStore", () => ({ getApiKey: vi.fn(() => "should-not-be-used") }));

import { executeMediaTool } from "./agent-tool-executor";
import { isChatMediaReferenceArrayContract } from "../../../src/shared/chatMediaReferenceContracts";

const PNG_PIXEL_BASE64 = "iVBORw0KGgo"; // 1×1 transparent PNG header
const JPEG_PIXEL_BASE64 = "/9j/"; // JPEG escape marker
const SHAM_SHA256 = "a".repeat(64);

describe("executeMediaTool — P0-04 guarded broker regression", () => {
  beforeEach(() => {
    performGuardedVeniceRequest.mockReset();
    audit.record.mockReset();
    persistGeneratedMedia.mockReset();
    fakeFetch.mockReset();
    persistGeneratedMedia.mockResolvedValue({
      id: "media-123",
      url: "venice-media://abc123.png",
      mimeType: "image/png",
      byteCount: 12,
      sha256: SHAM_SHA256,
    });
  });

  it("routes /image/generate through performGuardedVeniceRequest and never calls fetch", async () => {
    performGuardedVeniceRequest.mockResolvedValueOnce({
      kind: "response",
      response: {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: { images: [{ b64_json: PNG_PIXEL_BASE64 }] },
        contentType: "application/json",
      },
    });

    const result = await executeMediaTool(
      "default",
      "media.generateImage",
      "call-1",
      { prompt: "a serene landscape", model: "nano-banana" },
      "agent-session-xyz",
    );

    expect(fakeFetch).not.toHaveBeenCalled();
    expect(performGuardedVeniceRequest).toHaveBeenCalledTimes(1);
    const call = performGuardedVeniceRequest.mock.calls[0][0];
    expect(call.endpoint).toBe("/image/generate");
    expect(call.method).toBe("POST");
    expect(call.profileId).toBe("default");
    expect(call.body.model).toBe("nano-banana");
    expect(call.body.prompt).toBe("a serene landscape");
    expect(call.body.return_binary).toBe(false);

    expect(result.ok).toBe(true);
    expect((result.data as any).chatRef.mediaType).toBe("image");
    expect((result.data as any).chatRef.operation).toBe("generate");
    expect((result.data as any).chatRef.displayUrl).toBe("venice-media://abc123.png");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "media.generateImage",
        outcome: "execution",
        resourceIds: ["media-123"],
        sessionId: "runtime_default:agent_agent-session-xyz",
      }),
    );
  });

  it("never emits the legacy {mediaId, mimeType} stub at the top of data", async () => {
    performGuardedVeniceRequest.mockResolvedValueOnce({
      kind: "response",
      response: {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: { images: [{ b64_json: JPEG_PIXEL_BASE64 }] },
        contentType: "application/json",
      },
    });

    const result = await executeMediaTool(
      "work",
      "media.generateImage",
      "call-2",
      { prompt: "studio lighting still-life", model: "flux-1.1-pro" },
    );

    expect(result.ok).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual(["chatRef"]);
    expect(data).not.toHaveProperty("mediaId");
    expect(data).not.toHaveProperty("mimeType");
    expect(isChatMediaReferenceArrayContract([data.chatRef])).toBe(true);
  });

  it("blocks when the runtime family-safe guard denies the request", async () => {
    performGuardedVeniceRequest.mockResolvedValueOnce({
      kind: "blocked",
      block: {
        ok: false,
        status: 451,
        statusText: "Blocked by Family Safe Mode",
        headers: {},
        body: { error: "Test should be blocked", reasonCode: "TEST_BLOCK", category: "safety", severity: "high" },
        contentType: "application/json",
      },
    });

    const result = await executeMediaTool(
      "default",
      "media.generateImage",
      "call-3",
      { prompt: "anything", model: "nano-banana" },
    );

    expect(result.ok).toBe(false);
    expect((result.error as any).code).toBe("CAPABILITY_DENIED");
    expect((result.error as any).message).toMatch(/Test should be blocked/);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects non-string model id", async () => {
    const result = await executeMediaTool("default", "media.generateImage", "call-4", { prompt: "x", model: 123 });
    expect(result.ok).toBe(false);
    expect((result.error as any).code).toBe("INVALID_ARGUMENTS");
    expect(performGuardedVeniceRequest).not.toHaveBeenCalled();
  });

  it("rejects empty / oversized prompt", async () => {
    const empty = await executeMediaTool("default", "media.generateImage", "call-5", { prompt: "  ", model: "x" });
    expect(empty.ok).toBe(false);
    expect((empty.error as any).code).toBe("INVALID_ARGUMENTS");

    const oversized = await executeMediaTool(
      "default",
      "media.generateImage",
      "call-6",
      { prompt: "a".repeat(5000), model: "x" },
    );
    expect(oversized.ok).toBe(false);
    expect((oversized.error as any).code).toBe("INVALID_ARGUMENTS");
  });

  it("rejects malformed / non-PNG image payload", async () => {
    performGuardedVeniceRequest.mockResolvedValueOnce({
      kind: "response",
      response: {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {},
        body: { images: [{ b64_json: "this-is-not-a-real-magic-bytes" }] },
        contentType: "application/json",
      },
    });

    const result = await executeMediaTool(
      "default",
      "media.generateImage",
      "call-7",
      { prompt: "anything", model: "x" },
    );
    expect(result.ok).toBe(false);
    expect((result.error as any).code).toBe("INTERNAL_ERROR");
    expect(persistGeneratedMedia).not.toHaveBeenCalled();
  });

  it("non-image media tools fail closed with CAPABILITY_DENIED", async () => {
    const result = await executeMediaTool("default", "media.generateVideo", "call-8", { prompt: "x" });
    expect(result.ok).toBe(false);
    expect((result.error as any).code).toBe("CAPABILITY_DENIED");
    expect(performGuardedVeniceRequest).not.toHaveBeenCalled();
  });
});
