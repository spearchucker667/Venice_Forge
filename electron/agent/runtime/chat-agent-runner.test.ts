// @vitest-environment node
//
// Regression coverage for the P0-03 audit finding:
//
//   "Agent emits metadata.generatedMedia = { mediaId, mimeType } (non-canonical)
//   on the tool message instead of ChatMediaReference[] canonical shape."
//
// These tests assert the runner projects the executor's `data.chatRef`
// into a validated `ChatMediaReference[]` and attaches it to the tool
// message metadata, never the legacy stub shape.

import { describe, it, expect, vi } from "vitest";

// Stub the executor so we can drive the runner with predictable tool results.
const executeAgentTool = vi.fn();
vi.mock("./agent-tool-executor", () => ({
  executeAgentTool: (...args: unknown[]) => executeAgentTool(...args),
}));

// Stub the guarded pipeline — we drive its onDelta callback manually so we
// can simulate a streamed chat response that arrives with one tool_call
// and `finish_reason: "tool_calls"`.
const performGuardedVeniceRequest = vi.fn();

vi.mock("../../services/guardPipeline", () => ({
  performGuardedVeniceRequest: (rawRequest: unknown, options: { onDelta?: (c: unknown) => void } = {}) =>
    performGuardedVeniceRequest(rawRequest, options),
}));

import { runChatAgentLoop } from "./chat-agent-runner";
import { isChatMediaReferenceArrayContract, type ChatMediaReferenceContract } from "../../../src/shared/chatMediaReferenceContracts";

describe("runChatAgentLoop — P0-03 canonical ChatMediaReference regression", () => {
  /**
   * Helper mock installer that returns a `tool_calls`-terminating response
   * the first time it is invoked and a plain `stop`-terminating response on
   * every subsequent call. The multi-turn bounded loop in `runChatAgentLoop`
   * (Phase 3 §3.7) requires a follow-up turn — without this helper the mock
   * would keep returning `tool_calls` and the loop would exhaust its
   * `MAX_AGENT_TURNS` cap producing a stream of repeated tool executions.
   */
  function installSingleTurnMock(emitFirstTurn: (cb: (chunk: unknown) => void) => void) {
    let calls = 0;
    performGuardedVeniceRequest.mockImplementation((_req: unknown, options: { onDelta?: (c: unknown) => void } = {}) => {
      calls += 1;
      const cb = options.onDelta;
      if (calls === 1) {
        emitFirstTurn(cb!);
      } else {
        // Subsequent turns: no tool calls → bounded loop exits.
        cb?.({ content: "final answer" });
        cb?.({ finish_reason: "stop" });
      }
      return Promise.resolve({ kind: "response", response: { ok: true, status: 200, headers: {}, body: {}, contentType: "application/json" } });
    });
  }

  it("attaches a canonical ChatMediaReference[] on the tool message for media.generateImage", async () => {
    installSingleTurnMock((cb) => {
      // 1) emit a single tool_call chunk
      cb({
        tool_calls: [
          {
            index: 0,
            id: "call_42",
            type: "function",
            function: { name: "media.generateImage", arguments: JSON.stringify({ prompt: "a sunset", model: "nano-banana" }) },
          },
        ],
      });
      // 2) emit finish_reason "tool_calls" so the agent loop runs tools
      cb({ finish_reason: "tool_calls" });
    });

    executeAgentTool.mockResolvedValue({
      ok: true,
      toolName: "media.generateImage",
      requestId: "call_42",
      data: {
        chatRef: {
          id: "media-abc-123",
          mediaId: "media-abc-123",
          mediaType: "image",
          operation: "generate",
          displayUrl: "venice-media://abc123.png",
          thumbnailUrl: "venice-media://abc123.png",
          altText: "a sunset",
          modelId: "nano-banana",
          createdAt: 1700000000000,
          mimeType: "image/png",
        },
      },
    });

    const appendedMessages: unknown[] = [];
    await runChatAgentLoop(
      { profileId: "default", agentSessionId: "session-x" },
      (chunk: { appendedMessages?: unknown[] }) => {
        if (chunk.appendedMessages) appendedMessages.push(...chunk.appendedMessages);
      },
    );

    expect(appendedMessages.length).toBe(1);
    const toolMsg = appendedMessages[0] as Record<string, unknown>;
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.tool_call_id).toBe("call_42");

    const metadata = toolMsg.metadata as Record<string, unknown> | undefined;
    expect(metadata).toBeDefined();
    expect(metadata!.generatedMedia).toBeDefined();
    expect(Array.isArray(metadata!.generatedMedia)).toBe(true);
    const refs = metadata!.generatedMedia as ChatMediaReferenceContract[];
    expect(refs.length).toBe(1);
    expect(refs[0].mediaId).toBe("media-abc-123");
    expect(refs[0].mediaType).toBe("image");
    expect(refs[0].operation).toBe("generate");
    expect(refs[0].displayUrl).toBe("venice-media://abc123.png");
    expect(refs[0].modelId).toBe("nano-banana");
    // mimeType is not part of the canonical contract; ensure it never leaks.
    expect((refs[0] as any).mimeType).toBeUndefined();
    expect(isChatMediaReferenceArrayContract(refs)).toBe(true);
  });

  it("never attaches the legacy stub { mediaId, mimeType } metadata", async () => {
    installSingleTurnMock((cb) => {
      cb({
        tool_calls: [
          {
            index: 0,
            id: "call_stub",
            type: "function",
            function: { name: "legacy.imageStub", arguments: "{}" },
          },
        ],
      });
      cb({ finish_reason: "tool_calls" });
    });

    // Simulate a tool result that *only* carries the old stub shape the
    // audit marked as broken. The runner must refuse to project it.
    executeAgentTool.mockResolvedValue({
      ok: true,
      toolName: "legacy.imageStub",
      requestId: "call_stub",
      data: { mediaId: "media-xyz", mimeType: "image/png" },
    });

    const appendedMessages: unknown[] = [];
    await runChatAgentLoop(
      { profileId: "default" },
      (chunk: { appendedMessages?: unknown[] }) => {
        if (chunk.appendedMessages) appendedMessages.push(...chunk.appendedMessages);
      },
    );

    const toolMsg = appendedMessages[0] as Record<string, unknown>;
    expect(toolMsg.role).toBe("tool");
    expect(toolMsg.metadata).toBeUndefined();
  });

  it("attaches a canonical ChatMediaReference[] even when executor data has unexpected extra fields", async () => {
    installSingleTurnMock((cb) => {
      cb({
        tool_calls: [
          {
            index: 0,
            id: "call_extra",
            type: "function",
            function: { name: "media.generateImage", arguments: JSON.stringify({ prompt: "moonlit forest", model: "flux-dev" }) },
          },
        ],
      });
      cb({ finish_reason: "tool_calls" });
    });

    executeAgentTool.mockResolvedValue({
      ok: true,
      toolName: "media.generateImage",
      requestId: "call_extra",
      data: {
        chatRef: {
          id: "media-extra-1",
          mediaId: "media-extra-1",
          mediaType: "image",
          operation: "generate",
          displayUrl: "venice-media://extra.png",
          altText: "moonlit forest",
          modelId: "flux-dev",
          createdAt: 1700000000001,
          mimeType: "image/png",
          ignoredShape: "render-provider-stub",
          legacy: { mediaId: "media-extra-1", mimeType: "image/png" },
        },
      },
    });

    const appendedMessages: unknown[] = [];
    await runChatAgentLoop(
      { profileId: "default" },
      (chunk: { appendedMessages?: unknown[] }) => {
        if (chunk.appendedMessages) appendedMessages.push(...chunk.appendedMessages);
      },
    );

    const metadata = appendedMessages[0].metadata as { generatedMedia?: ChatMediaReferenceContract[] };
    const refs = metadata.generatedMedia ?? [];
    expect(refs.length).toBe(1);
    expect((refs[0] as any).ignoredShape).toBeUndefined();
    expect((refs[0] as any).legacy).toBeUndefined();
    expect(isChatMediaReferenceArrayContract(refs)).toBe(true);
  });

  it("skips metadata when executor returns an error result", async () => {
    installSingleTurnMock((cb) => {
      cb({
        tool_calls: [
          {
            index: 0,
            id: "call_err",
            type: "function",
            function: { name: "media.generateImage", arguments: JSON.stringify({ prompt: "x", model: "no-such-model-x" }) },
          },
        ],
      });
      cb({ finish_reason: "tool_calls" });
    });

    executeAgentTool.mockResolvedValue({
      ok: false,
      toolName: "media.generateImage",
      requestId: "call_err",
      error: { code: "INVALID_ARGUMENTS", message: "model id not allowed" },
    });

    const appendedMessages: unknown[] = [];
    await runChatAgentLoop(
      { profileId: "default" },
      (chunk: { appendedMessages?: unknown[] }) => {
        if (chunk.appendedMessages) appendedMessages.push(...chunk.appendedMessages);
      },
    );

    const toolMsg = appendedMessages[0] as Record<string, unknown>;
    expect(toolMsg.metadata).toBeUndefined();
    expect((toolMsg.content as string)).toContain("INVALID_ARGUMENTS");
  });
});
