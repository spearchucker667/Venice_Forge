// @vitest-environment node
//
// Regression coverage for the P2 durable paid-media submission path:
//
//   `media.generateImage` no longer dispatches directly. Instead,
//   `executeAgentTool` validates arguments, resolves a trusted model in the
//   main process, builds a canonical wire payload, hashes it, and stores
//   everything in a `GenerateImagePlan` for approval-gated execution.
//
// These tests assert the proposal path, payload shape, and validation rules
// without ever calling the provider.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolResult } from "../../../src/agent/contracts/tool-results";
import { executeAgentTool } from "./agent-tool-executor";
import { createToolExecutionContext } from "./tool-execution-context";
import { isGenerateImagePlan } from "../approvals/plan-factories";
import { computePayloadHash } from "../../../src/shared/venice-media-contract/payload-hash";
import { resolveAvailableTools, createCanonicalToolDefinitions, ToolRegistry } from "../../../src/agent/registry/tool-registry";

const mockApprovals = {
  prepare: vi.fn().mockResolvedValue({ id: "approval_1" }),
};

const mockAudit = {
  record: vi.fn().mockResolvedValue(undefined),
};

vi.mock("./agent-services", () => ({
  getAgentServices: () => ({ approvals: mockApprovals, audit: mockAudit }),
}));

vi.mock("./image-model-resolver", () => ({
  resolveGenerateImageModel: vi.fn().mockResolvedValue("flux-dev"),
}));

function makeMediaCtx(preset: "media_with_approval" | "limited_documents" = "media_with_approval") {
  return createToolExecutionContext({
    profileId: "profile_1",
    runtimeSessionId: "runtime_test",
    senderId: 1,
    agentSessionId: "agent_1",
    preset,
  });
}

function makeToolCall(args: Record<string, unknown>) {
  return {
    id: "call_1",
    type: "function" as const,
    function: { name: "media_generate_image", arguments: JSON.stringify(args) },
  };
}

function expectSuccessfulToolResult(result: ToolResult): asserts result is Extract<ToolResult, { ok: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
}

function expectFailedToolResult(result: ToolResult): asserts result is Extract<ToolResult, { ok: false }> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected tool failure");
}

describe("executeAgentTool — media.generateImage durable approval path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApprovals.prepare.mockResolvedValue({ id: "approval_1" });
  });

  it("requires the media:generate-image capability", async () => {
    const result = await executeAgentTool(makeMediaCtx("limited_documents"), makeToolCall({ prompt: "x" }));
    expectFailedToolResult(result);
    expect(result.error.code).toBe("CAPABILITY_DENIED");
    expect(mockApprovals.prepare).not.toHaveBeenCalled();
  });

  it("returns a pendingApprovalId on success", async () => {
    const result = await executeAgentTool(makeMediaCtx(), makeToolCall({ prompt: "a serene landscape" }));
    expectSuccessfulToolResult(result);
    expect(result.data).toHaveProperty("pendingApprovalId", "approval_1");
    expect(mockApprovals.prepare).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty prompt", async () => {
    const result = await executeAgentTool(makeMediaCtx(), makeToolCall({ prompt: "   " }));
    expectFailedToolResult(result);
    expect(result.error.code).toBe("INVALID_ARGUMENTS");
    expect(mockApprovals.prepare).not.toHaveBeenCalled();
  });

  it("rejects an oversized prompt", async () => {
    const result = await executeAgentTool(makeMediaCtx(), makeToolCall({ prompt: "a".repeat(5000) }));
    expectFailedToolResult(result);
    expect(result.error.code).toBe("INVALID_ARGUMENTS");
  });

  it("builds a canonical GenerateImagePlan with model resolved in main", async () => {
    const { resolveGenerateImageModel } = await import("./image-model-resolver");
    await executeAgentTool(makeMediaCtx(), makeToolCall({ prompt: "a serene landscape" }));
    expect(resolveGenerateImageModel).toHaveBeenCalledWith({ profileId: "profile_1" });

    const [call] = mockApprovals.prepare.mock.calls;
    if (call === undefined) throw new Error("Expected approval prepare call");
    const [args] = call;
    expect(args.proposalType).toBe("media_generate_image");
    expect(args.canonicalToolName).toBe("media.generateImage");
    expect(args.grantId).toBe("media:profile_1");
    expect(isGenerateImagePlan(args.privateExecutionPlan)).toBe(true);

    const plan = args.privateExecutionPlan;
    expect(plan.modelId).toBe("flux-dev");
    expect(plan.prompt).toBe("a serene landscape");
    expect(plan.wirePayload).toMatchObject({
      model: "flux-dev",
      prompt: "a serene landscape",
      return_binary: false,
    });
    expect(plan.payloadHash).toBe(`sha256:${computePayloadHash(plan.wirePayload)}`);
    expect(plan.requestFingerprint).toBe(plan.payloadHash);
  });

  it("includes optional negativePrompt, aspectRatio, and resolution in the wire payload", async () => {
    await executeAgentTool(
      makeMediaCtx(),
      makeToolCall({
        prompt: "a serene landscape",
        negativePrompt: "blurry",
        aspectRatio: "16:9",
        resolution: "1920x1080",
      }),
    );

    const [call] = mockApprovals.prepare.mock.calls;
    if (call === undefined) throw new Error("Expected approval prepare call");
    const [args] = call;
    const plan = args.privateExecutionPlan;
    expect(plan.wirePayload).toMatchObject({
      model: "flux-dev",
      prompt: "a serene landscape",
      negative_prompt: "blurry",
      width: 1920,
      height: 1080,
      aspect_ratio: "16:9",
      return_binary: false,
    });
  });

  it("falls back to aspect_ratio when resolution is invalid", async () => {
    await executeAgentTool(
      makeMediaCtx(),
      makeToolCall({
        prompt: "a serene landscape",
        aspectRatio: "16:9",
        resolution: "not-a-resolution",
      }),
    );

    const [call] = mockApprovals.prepare.mock.calls;
    if (call === undefined) throw new Error("Expected approval prepare call");
    const [args] = call;
    const plan = args.privateExecutionPlan;
    expect(plan.wirePayload).toMatchObject({
      aspect_ratio: "16:9",
    });
    expect(plan.wirePayload).not.toHaveProperty("width");
    expect(plan.wirePayload).not.toHaveProperty("height");
  });

  it("rejects model supplied by the LLM in tool arguments", async () => {
    const result = await executeAgentTool(makeMediaCtx(), makeToolCall({ prompt: "x", model: "attacker-model" }));
    expect(result.ok).toBe(false);
    expect(mockApprovals.prepare).not.toHaveBeenCalled();
  });

  it("records a proposal audit event", async () => {
    await executeAgentTool(makeMediaCtx(), makeToolCall({ prompt: "a serene landscape" }));
    expect(mockAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "runtime_test:renderer_1:agent_agent_1",
        toolName: "media.generateImage",
        outcome: "proposal",
      }),
    );
  });
});

describe("P1 media approval end-to-end regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApprovals.prepare.mockResolvedValue({ id: "approval_1" });
  });

  it("resolveAvailableTools -> schema validation -> executeAgentTool creates approval plan without dispatch", async () => {
    const schemas = resolveAvailableTools(
      { capabilities: { supportsFunctionCalling: true } },
      "media_with_approval",
    );
    const mediaSchema = schemas.find((s) => s.function.name === "media_generate_image");
    expect(mediaSchema).toBeDefined();
    expect(mediaSchema?.function.parameters).toMatchObject({
      additionalProperties: false,
      required: ["prompt"],
    });

    const registry = new ToolRegistry(createCanonicalToolDefinitions(), { supportsFunctionCalling: () => true });
    const tool = registry.resolveProviderName("media_generate_image");
    const args = tool.argsValidator.parse({ prompt: "a serene landscape" });
    expect(args).not.toHaveProperty("model");

    const toolCall = {
      id: "call-e2e-1",
      type: "function" as const,
      function: {
        name: "media_generate_image",
        arguments: JSON.stringify(args),
      },
    };
    const ctx = createToolExecutionContext({
      profileId: "profile_1",
      runtimeSessionId: "runtime_test",
      senderId: 1,
      agentSessionId: "agent_1",
      preset: "media_with_approval",
    });

    const result = await executeAgentTool(ctx, toolCall);

    expectSuccessfulToolResult(result);
    expect(result.data).toHaveProperty("pendingApprovalId", "approval_1");
    expect(mockApprovals.prepare).toHaveBeenCalledTimes(1);
    const [call] = mockApprovals.prepare.mock.calls;
    if (call === undefined) throw new Error("Expected approval prepare call");
    const [prepareArgs] = call;
    expect(prepareArgs.proposalType).toBe("media_generate_image");
    expect(prepareArgs.privateExecutionPlan).toMatchObject({
      kind: "generate_image",
      profileId: "profile_1",
      prompt: "a serene landscape",
      modelId: "flux-dev",
    });
  });
});
