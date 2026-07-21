// @vitest-environment node
//
// VERIFY VF-20260720-005 — phase 3 §3.7 bounded multi-turn loop.
//
// The audit confirmed the prior implementation terminated after the
// first tool execution: the model never saw its own tool outputs and the
// loop could not iterate, reply, or self-correct. The fixes are:
//
//   1. `runChatAgentLoop` wraps `streamAndExecuteTurn` in a bounded loop
//      capped at `MAX_AGENT_TURNS = 8` and `MAX_AGENT_TOOL_CALLS = 16`.
//   2. Each turn appends an assistant tool_calls message + tool result
//      messages to the request body's `messages` array before the next
//      dispatch.
//   3. The loop terminates early when:
//        - the upstream finishes with a non-`tool_calls` finish_reason
//          (model emitted text, not tool calls),
//        - the body's tool calls set is empty,
//        - the caller `AbortSignal` is set,
//        - the bound is reached.
//   4. A guard-blocked upstream return propagates without second turn.
//
// These tests assert each of the four termination paths plus the
// tool-call append behaviour.

import { describe, it, expect, vi, beforeEach } from "vitest";

const executeAgentTool = vi.fn();
vi.mock("./agent-tool-executor", () => ({
  executeAgentTool: (...args: unknown[]) => executeAgentTool(...args),
}));

const performGuardedVeniceRequest = vi.fn();

vi.mock("../../services/guardPipeline", () => ({
  performGuardedVeniceRequest: (rawRequest: unknown, options: { onDelta?: (c: unknown) => void } = {}) =>
    performGuardedVeniceRequest(rawRequest, options),
}));

import { runChatAgentLoop } from "./chat-agent-runner";

type SseChunk = {
  content?: string;
  tool_calls?: Array<{ index: number; id?: string; type?: "function"; function?: { name?: string; arguments?: string } }>;
  finish_reason?: string | null;
  appendedMessages?: unknown[];
};

function makeToolCall(id: string, name: string, args: unknown = {}) {
  return {
    index: 0,
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function makeToolResult(callId: string, name: string, data: unknown = { ok: true }) {
  return { ok: true, toolName: name, requestId: callId, data };
}

describe("runChatAgentLoop — multi-turn bounded loop (Phase 3 §3.7)", () => {
  beforeEach(() => {
    performGuardedVeniceRequest.mockReset();
    executeAgentTool.mockReset();
  });

  it("exits after one turn when the second turn emits no tool calls", async () => {
    let calls = 0;
    performGuardedVeniceRequest.mockImplementation(
      (_req: unknown, options: { onDelta?: (c: unknown) => void } = {}) => {
        calls += 1;
        const cb = options.onDelta;
        if (calls === 1) {
          cb?.({ tool_calls: [makeToolCall("call_t1", "workspace.list")] });
          cb?.({ finish_reason: "tool_calls" });
        } else if (calls === 2) {
          // Second turn: model emits content + stop. Loop must exit here
          // and there must be no third call.
          cb?.({ content: "all done" });
          cb?.({ finish_reason: "stop" });
        } else {
          throw new Error("loop continued past second turn");
        }
        return Promise.resolve({ kind: "response", response: { ok: true, status: 200, headers: {}, body: {}, contentType: "application/json" } });
      },
    );

    executeAgentTool.mockResolvedValue(makeToolResult("call_t1", "workspace.list", { files: [] }));

    const deltas: SseChunk[] = [];
    await runChatAgentLoop(
      { profileId: "default", body: { messages: [{ role: "user", content: "list files" }] } },
      (chunk: SseChunk) => {
        deltas.push(chunk);
      },
    );

    expect(calls).toBe(2);
    // First turn is followed by appended tool messages; second turn emits
    // the final assistant text and finish_reason: "stop". The total set
    // of emitted tool messages equals the single tool execution.
    const appendedToolMessages = deltas.flatMap(c => c.appendedMessages ?? []);
    expect(appendedToolMessages).toHaveLength(1);
    expect((appendedToolMessages[0] as { tool_call_id: string }).tool_call_id).toBe("call_t1");
  });

  it("caps at MAX_AGENT_TURNS when every turn keeps requesting tool calls", async () => {
    let calls = 0;
    performGuardedVeniceRequest.mockImplementation(
      (_req: unknown, options: { onDelta?: (c: unknown) => void } = {}) => {
        calls += 1;
        const cb = options.onDelta;
        cb?.({ tool_calls: [makeToolCall(`call_t${calls}`, "workspace.list")] });
        cb?.({ finish_reason: "tool_calls" });
        return Promise.resolve({ kind: "response", response: { ok: true, status: 200, headers: {}, body: {}, contentType: "application/json" } });
      },
    );

    executeAgentTool.mockResolvedValue(makeToolResult("any", "workspace.list", { files: [] }));

    await runChatAgentLoop(
      { profileId: "default", body: { messages: [{ role: "user", content: "loop" }] } },
      () => undefined,
    );

    // 8 turns is the documented cap; we dispatch one more attempt than we
    // execute (the 8th turn's tool execution is bounded by the loop check
    // beforehand, so the loop dispatches at most MAX_AGENT_TURNS calls).
    expect(calls).toBe(8);
  });

  it("appends assistant tool_calls message + tool result messages to body.messages", async () => {
    const capturedBodies: unknown[] = [];
    let calls = 0;
    performGuardedVeniceRequest.mockImplementation(
      (req: unknown, options: { onDelta?: (c: unknown) => void } = {}) => {
        calls += 1;
        // `runChatAgentLoop` forwards `{ profileId, agentSessionId, body, signal }`
        // as rawRequest. The body is at `req.body.messages`.
        capturedBodies.push((req as { body?: { messages?: unknown[] } }).body);
        const cb = options.onDelta;
        if (calls === 1) {
          cb?.({ tool_calls: [makeToolCall("call_aa", "workspace.list")] });
          cb?.({ finish_reason: "tool_calls" });
        } else if (calls === 2) {
          cb?.({ content: "final" });
          cb?.({ finish_reason: "stop" });
        }
        return Promise.resolve({ kind: "response", response: { ok: true, status: 200, headers: {}, body: {}, contentType: "application/json" } });
      },
    );

    executeAgentTool.mockResolvedValue(makeToolResult("call_aa", "workspace.list", { files: ["a"] }));

    await runChatAgentLoop(
      { profileId: "default", body: { messages: [{ role: "user", content: "list" }] } },
      () => undefined,
    );

    expect(capturedBodies).toHaveLength(2);

    const firstBody = capturedBodies[0] as { messages: unknown[] };
    expect(firstBody.messages).toEqual([{ role: "user", content: "list" }]);

    const secondBody = capturedBodies[1] as {
      messages: Array<{
        role: string;
        tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
        tool_call_id?: string;
        content?: string;
      }>;
    };
    expect(secondBody.messages).toHaveLength(3);
    expect(secondBody.messages[0]).toEqual({ role: "user", content: "list" });
    // 1: assistant tool_calls message describing what the model asked.
    expect(secondBody.messages[1].role).toBe("assistant");
    expect(secondBody.messages[1].tool_calls).toBeTruthy();
    expect(secondBody.messages[1].tool_calls![0].function.name).toBe("workspace.list");
    // 2: tool result message linked to the same tool_call_id.
    expect(secondBody.messages[2].role).toBe("tool");
    expect(secondBody.messages[2].tool_call_id).toBe("call_aa");
  });

  it("respects caller abort between turns", async () => {
    const controller = new AbortController();
    let calls = 0;
    performGuardedVeniceRequest.mockImplementation(
      (_req: unknown, options: { onDelta?: (c: unknown) => void } = {}) => {
        calls += 1;
        const cb = options.onDelta;
        cb?.({ tool_calls: [makeToolCall("call_abort", "workspace.list")] });
        cb?.({ finish_reason: "tool_calls" });
        // Abort after the first turn completes so the loop guard fires
        // before the second turn is dispatched.
        if (calls === 1) controller.abort();
        return Promise.resolve({ kind: "response", response: { ok: true, status: 200, headers: {}, body: {}, contentType: "application/json" } });
      },
    );

    executeAgentTool.mockResolvedValue(makeToolResult("call_abort", "workspace.list", { files: [] }));

    await runChatAgentLoop(
      {
        profileId: "default",
        signal: controller.signal,
        body: { messages: [{ role: "user", content: "abort me" }] },
      },
      () => undefined,
    );

    // Aborted after first turn: exactly one network dispatch.
    expect(calls).toBe(1);
  });

  it("returns guard-blocked result without dispatching a second turn", async () => {
    performGuardedVeniceRequest.mockResolvedValueOnce({
      kind: "blocked",
      block: { ok: false, status: 451, body: { error: "blocked", reasonCode: "CSAM_GUARD_BLOCK", category: "child_safety", severity: "high" } },
    });

    const result = await runChatAgentLoop(
      { profileId: "default", body: { messages: [{ role: "user", content: "p" }] } },
      () => undefined,
    );

    expect(result.kind).toBe("blocked");
    expect(performGuardedVeniceRequest).toHaveBeenCalledTimes(1);
  });
});
