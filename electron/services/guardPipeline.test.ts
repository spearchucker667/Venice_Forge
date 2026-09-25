// @vitest-environment node

/** @fileoverview Tests for the guard pipeline (prompt + response screening).
 *
 *  VERIFY-154 regression guard: every `checkLocalFamilyGuard` evaluation
 *  emits exactly one inspector telemetry pair stamped with source=main-guard
 *  and transport=local, tagged with the matching guardOutcome, and the
 *  emit never breaks the evaluation when telemetry fails.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const inspectorEvents = new Array<{ kind: "request" | "completion"; source?: string; transport?: string; guardOutcome?: string; status?: number; error?: string; eventId?: string; endpoint?: string; method?: string }>();

vi.mock("./inspectorTelemetry", () => ({
  publishInspectorRequest: vi.fn(() => "evt-guard-test"),
  publishInspectorCompletion: vi.fn((args: Record<string, unknown>) => {
    inspectorEvents.push({ kind: "completion", ...args });
    return "evt-guard-test";
  }),
  emitInspectorTelemetry: vi.fn(),
  subscribeInspectorTelemetry: vi.fn(() => () => {}),
  clearInspectorTelemetryListeners: vi.fn(),
}));

vi.mock("../../src/shared/safety", async () => {
  return {
    maybeRunLocalFamilyGuard: vi.fn((_input: unknown, enabled: boolean) =>
      enabled
        ? {
            allowed: false,
            userMessage: "blocked",
            guardDecision: {
              reasonCode: "TEST_BLOCK",
              category: "TEST_CAT",
              severity: "high",
            },
          }
        : { allowed: true, skipped: true },
    ),
    SafetyGuardBlockedError: class extends Error {
      decision: { reasonCode: string; category: string; userMessage: string };
      constructor(dec: { reasonCode: string; category: string; userMessage: string }) {
        super(dec.userMessage);
        this.decision = dec;
      }
    },
    screenResponseBody: vi.fn(() => ({ allowed: true })),
    safetyBlockBodyFromResponseScreen: vi.fn(() => ({ error: "blocked" })),
    identifyAndValidateGeneratedMedia: vi.fn(async () => ({ allowed: true })),
    identifyAndValidateOpenAiImageGenerationResponse: vi.fn(async () => ({ allowed: true })),
    isImageSafetyEndpoint: vi.fn(() => false),
    isOpenAiImageGenerationEndpoint: vi.fn((endpoint: string) => endpoint.split("?", 1)[0] === "/images/generations"),
  };
});

vi.mock("./runtimeSafetySettings", () => ({
  getRuntimeLocalFamilySafeModeEnabled: vi.fn(() => true),
  getRuntimeVeniceApiSafeMode: vi.fn(() => false),
}));

vi.mock("./veniceClient", () => ({
  performVeniceRequest: vi.fn(async () => ({ ok: true, status: 200, body: {} })),
}));

vi.mock("../../src/shared/veniceSafeMode", async () => {
  const actual = await vi.importActual<typeof import("../../src/shared/veniceSafeMode")>(
    "../../src/shared/veniceSafeMode",
  );
  return {
    applyVeniceApiSafeMode: actual.applyVeniceApiSafeMode,
  };
});

vi.mock("../agent/runtime/trusted-agent-request", () => ({
  composeTrustedRequest: (r: unknown) => r,
}));

import { checkLocalFamilyGuard, performGuardedVeniceRequest } from "./guardPipeline";
import {
  publishInspectorRequest,
  publishInspectorCompletion,
} from "./inspectorTelemetry";

beforeEach(() => {
  inspectorEvents.length = 0;
  vi.mocked(publishInspectorRequest as unknown as ReturnType<typeof vi.fn>).mockClear();
  vi.mocked(publishInspectorCompletion as unknown as ReturnType<typeof vi.fn>).mockClear();
  (publishInspectorRequest as unknown as ReturnType<typeof vi.fn>).mockReturnValue("evt-guard-test");
});

describe("Guard pipeline inspector telemetry", () => {
  it("emits request+completion with source=main-guard and transport=local when blocked", () => {
    const block = checkLocalFamilyGuard({
      endpoint: "/chat/completions",
      method: "POST",
      payload: { hello: "world" },
      source: "venice-client",
    });
    expect(block?.status).toBe(451);
    expect(inspectorEvents).toHaveLength(1);
    const completion = inspectorEvents[0];
    expect(completion.kind).toBe("completion");
    expect(completion.source).toBe("main-guard");
    expect(completion.transport).toBe("local");
    expect(completion.endpoint).toBe("/chat/completions");
    expect(completion.method).toBe("POST");
    expect(completion.guardOutcome).toBe("block");
    expect(completion.status).toBe(451);
    expect(completion.eventId).toBe("evt-guard-test");
  });

  it("emits guardOutcome=allow when miss", async () => {
    const maybeRunGuard = (await import("../../src/shared/safety")).maybeRunLocalFamilyGuard;
    vi.mocked(maybeRunGuard as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      allowed: true,
      skipped: false,
    });
    const result = checkLocalFamilyGuard({
      endpoint: "/chat/completions",
      method: "POST",
      payload: {},
      source: "venice-client",
    });
    expect(result).toBeNull();
    expect(inspectorEvents).toHaveLength(1);
    expect(inspectorEvents[0].guardOutcome).toBe("allow");
    expect(inspectorEvents[0].status).toBe(200);
  });

  it("emits guardOutcome=skipped when Adult Mode is on", async () => {
    const maybeRunGuard = (await import("../../src/shared/safety")).maybeRunLocalFamilyGuard;
    vi.mocked(maybeRunGuard as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      allowed: true,
      skipped: true,
    });
    checkLocalFamilyGuard({
      endpoint: "/chat/completions",
      method: "POST",
      payload: {},
      source: "venice-client",
    });
    expect(inspectorEvents[0].guardOutcome).toBe("skipped");
  });

  it("does NOT throw when telemetry fails (publishCompletion throws)", async () => {
    const maybeRunGuard = (await import("../../src/shared/safety")).maybeRunLocalFamilyGuard;
    vi.mocked(maybeRunGuard as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      allowed: true,
      skipped: false,
    });
    vi.mocked(publishInspectorCompletion as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("bus offline");
    });
    expect(() =>
      checkLocalFamilyGuard({
        endpoint: "/chat/completions",
        method: "POST",
        payload: {},
        source: "venice-client",
      }),
    ).not.toThrow();
  });

  it("performGuardedVeniceRequest returns upstream response on allow path", async () => {
    const maybeRunGuard = (await import("../../src/shared/safety")).maybeRunLocalFamilyGuard;
    vi.mocked(maybeRunGuard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      allowed: true,
      skipped: false,
    });
    const out = await performGuardedVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: {},
    });
    expect(out.kind).toBe("response");
  });
});

describe("Venice API Safe Mode independence from Family Safe Mode", () => {
  async function setRuntimeSettings(localFamily: boolean, veniceApi: boolean) {
    const runtime = await import("./runtimeSafetySettings");
    vi.mocked(runtime.getRuntimeLocalFamilySafeModeEnabled as unknown as ReturnType<typeof vi.fn>).mockReturnValue(localFamily);
    vi.mocked(runtime.getRuntimeVeniceApiSafeMode as unknown as ReturnType<typeof vi.fn>).mockReturnValue(veniceApi);
  }

  async function allowGuard() {
    const maybeRunGuard = (await import("../../src/shared/safety")).maybeRunLocalFamilyGuard;
    vi.mocked(maybeRunGuard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      allowed: true,
      skipped: false,
    });
  }

  beforeEach(async () => {
    const performVeniceRequest = (await import("./veniceClient")).performVeniceRequest;
    vi.mocked(performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mockClear();
    vi.mocked(performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      body: {},
    });
  });

  it("does NOT contain safe_mode: true when Family Safe Mode is on but Venice API Safe Mode is off", async () => {
    await setRuntimeSettings(true, false);
    await allowGuard();
    await performGuardedVeniceRequest({
      endpoint: "/image/generate",
      method: "POST",
      body: { prompt: "a cat" },
    });
    const performVeniceRequest = (await import("./veniceClient")).performVeniceRequest;
    const dispatched = vi.mocked(performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      body?: Record<string, unknown>;
    };
    expect(dispatched.body).toBeDefined();
    expect(dispatched.body?.safe_mode).not.toBe(true);
    expect(dispatched.body?.safe_mode).toBe(false);
  });

  it("applies safe_mode: true when Venice API Safe Mode is on", async () => {
    await setRuntimeSettings(false, true);
    await allowGuard();
    await performGuardedVeniceRequest({
      endpoint: "/image/generate",
      method: "POST",
      body: { prompt: "a cat" },
    });
    const performVeniceRequest = (await import("./veniceClient")).performVeniceRequest;
    const dispatched = vi.mocked(performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      body?: Record<string, unknown>;
    };
    expect(dispatched.body?.safe_mode).toBe(true);
  });

  it("applies safe_mode to all supported image endpoints independently of Family Safe Mode", async () => {
    await setRuntimeSettings(true, true);
    await allowGuard();
    for (const endpoint of ["/image/generate", "/image/edit", "/image/multi-edit"]) {
      vi.mocked((await import("./veniceClient")).performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mockClear();
      await performGuardedVeniceRequest({
        endpoint,
        method: "POST",
        body: { prompt: "a cat" },
      });
      const performVeniceRequest = (await import("./veniceClient")).performVeniceRequest;
      const dispatched = vi.mocked(performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        body?: Record<string, unknown>;
      };
      expect(dispatched.body?.safe_mode, `expected safe_mode for ${endpoint}`).toBe(true);
    }
  });

  it("leaves unsupported endpoints without safe_mode even when Venice API Safe Mode is on", async () => {
    await setRuntimeSettings(false, true);
    await allowGuard();
    await performGuardedVeniceRequest({
      endpoint: "/chat/completions",
      method: "POST",
      body: { messages: [] },
    });
    const performVeniceRequest = (await import("./veniceClient")).performVeniceRequest;
    const dispatched = vi.mocked(performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      body?: Record<string, unknown>;
    };
    expect(dispatched.body).not.toHaveProperty("safe_mode");
  });
});

describe("streaming response screening withholds deltas (GSS-P1-001)", () => {
  async function setFamilySafe(enabled: boolean) {
    const runtime = await import("./runtimeSafetySettings");
    vi.mocked(runtime.getRuntimeLocalFamilySafeModeEnabled as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      enabled,
    );
  }

  async function allowRequestGuard() {
    const maybeRunGuard = (await import("../../src/shared/safety")).maybeRunLocalFamilyGuard;
    vi.mocked(maybeRunGuard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      allowed: true,
      skipped: false,
    });
  }

  it("does not forward onDelta when the aggregated stream is later blocked", async () => {
    await setFamilySafe(true);
    await allowRequestGuard();
    const onDelta = vi.fn();
    const performVeniceRequest = (await import("./veniceClient")).performVeniceRequest;
    vi.mocked(performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_req: unknown, opts?: { onDelta?: (chunk: { content: string; reasoning: string }) => void }) => {
        opts?.onDelta?.({ content: "blocked-stream-body", reasoning: "" });
        return { ok: true, status: 200, body: { text: "blocked-stream-body" }, headers: {}, contentType: "text/event-stream" };
      },
    );
    const { screenResponseBody } = await import("../../src/shared/safety");
    vi.mocked(screenResponseBody as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      allowed: false,
      reason: "blocked",
      reasonCode: "RESPONSE_BLOCKED",
      category: "adult_sexual_content",
      uiCategory: "adult-content-blocked",
      severity: "high",
      userMessage: "blocked",
    });

    const out = await performGuardedVeniceRequest(
      { endpoint: "/chat/completions", method: "POST", body: { messages: [] } },
      { onDelta },
    );
    expect(out.kind).toBe("blocked");
    expect(onDelta).not.toHaveBeenCalled();
  });

  it("replays withheld deltas after the aggregated stream is allowed", async () => {
    await setFamilySafe(true);
    await allowRequestGuard();
    const onDelta = vi.fn();
    const performVeniceRequest = (await import("./veniceClient")).performVeniceRequest;
    vi.mocked(performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_req: unknown, opts?: { onDelta?: (chunk: { content: string; reasoning: string }) => void }) => {
        opts?.onDelta?.({ content: "hello", reasoning: "" });
        return { ok: true, status: 200, body: { text: "hello" }, headers: {}, contentType: "text/event-stream" };
      },
    );
    const { screenResponseBody } = await import("../../src/shared/safety");
    vi.mocked(screenResponseBody as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ allowed: true });

    const out = await performGuardedVeniceRequest(
      { endpoint: "/chat/completions", method: "POST", body: { messages: [] } },
      { onDelta },
    );
    expect(out.kind).toBe("response");
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta).toHaveBeenCalledWith({ content: "hello", reasoning: "" });
  });

  it("forwards deltas live when Family Safe Mode is off", async () => {
    await setFamilySafe(false);
    await allowRequestGuard();
    const seen: string[] = [];
    const performVeniceRequest = (await import("./veniceClient")).performVeniceRequest;
    vi.mocked(performVeniceRequest as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_req: unknown, opts?: { onDelta?: (chunk: { content: string; reasoning: string }) => void }) => {
        opts?.onDelta?.({ content: "live", reasoning: "" });
        seen.push("after-upstream-delta");
        return { ok: true, status: 200, body: { text: "live" }, headers: {}, contentType: "text/event-stream" };
      },
    );

    const onDelta = vi.fn(() => {
      seen.push("caller-delta");
    });
    await performGuardedVeniceRequest(
      { endpoint: "/chat/completions", method: "POST", body: { messages: [] } },
      { onDelta },
    );
    expect(seen).toEqual(["caller-delta", "after-upstream-delta"]);
  });
});
