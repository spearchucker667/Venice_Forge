import { describe, it, expect } from "vitest";
import type {
  AgentRuntimeLayer,
  CustomAgentLayer,
  ToolRuntimeLayer,
} from "../../../src/shared/agentRuntimeContracts";
import {
  composeTrustedRequest,
  composeAgentRuntime,
  buildTrustedRuntimeLayer,
  buildToolRuntimeLayer,
  dedupToolRuntimeLayers,
  substituteTimeAndDatePlaceholders,
} from "./trusted-agent-request";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be a record`);
  }
  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${label} to be a string`);
  }
  return value;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array`);
  }
  return value;
}

function expectComposedBody(raw: unknown): Record<string, unknown> {
  const record = expectRecord(raw, "composed request");
  return expectRecord(record.body, "composed request body");
}

describe("trusted-agent-request", () => {
  it("injects System Runtime Context at the top of messages", () => {
    const raw = {
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        messages: [{ role: "user", content: "hello" }],
        tools: [{ type: "function" }],
      },
    };

    const body = expectComposedBody(composeTrustedRequest(raw));
    const messages = expectArray(body.messages, "messages");
    expect(messages.length).toBe(2);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("[System Runtime Context]"),
      }),
    );
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Current Date/Time:"),
      }),
    );
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Timezone:"),
      }),
    );
    expect(messages[1]).toEqual(expect.objectContaining({ content: "hello" }));
  });

  it("prepends to existing system message", () => {
    const raw = {
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        messages: [{ role: "system", content: "User system prompt." }],
      },
    };

    const body = expectComposedBody(composeTrustedRequest(raw));
    const messages = expectArray(body.messages, "messages");
    expect(messages.length).toBe(1);
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("[System Runtime Context]"),
      }),
    );
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("User system prompt."),
      }),
    );
  });

  it("ignores invalid shapes", () => {
    expect(composeTrustedRequest(null)).toBe(null);
    expect(composeTrustedRequest("abc")).toBe("abc");
    expect(composeTrustedRequest({ body: "not-an-object" })).toEqual({
      body: "not-an-object",
    });
    expect(
      composeTrustedRequest({ body: { messages: "not-an-array" } }),
    ).toEqual({ body: { messages: "not-an-array" } });
  });
});

// P0-05: Audit findings (1)+(3)+(4)+composeAgentRuntime invariants.
describe("trusted-agent-request — P0-05 trust boundary regressions", () => {
  it("P0-05 (1) attaches the tooltrust ledger to the system prompt and never discards it via void", () => {
    const raw = {
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        messages: [{ role: "user", content: "hi" }],
        tools: [
          { type: "function", function: { name: "media.generateImage" } },
          "media.listImages",
        ],
      },
    };
    const body = expectComposedBody(composeTrustedRequest(raw));
    const messages = expectArray(body.messages, "messages");
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("Toolchain Trust Ledger:"),
      }),
    );
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("media.generateImage (trusted=true)"),
      }),
    );
    expect(messages[0]).toEqual(
      expect.objectContaining({
        role: "system",
        content: expect.stringContaining("media.listImages (trusted=true)"),
      }),
    );
  });

  it("does not inject System Runtime Context into /image/generate body.prompt", () => {
    const raw = {
      endpoint: "/image/generate",
      method: "POST",
      body: { model: "nano-banana", prompt: "a quiet forest at dawn" },
    };
    const body = expectComposedBody(composeTrustedRequest(raw));
    const prompt = expectString(body.prompt, "body.prompt");
    expect(prompt.startsWith("[System Runtime Context]")).toBe(false);
    expect(prompt).toBe("a quiet forest at dawn");
    expect(body.model).toBe("nano-banana");
  });

  it("does not inject System Runtime Context into /images/generations body.prompt", () => {
    const raw = {
      endpoint: "/images/generations",
      method: "POST",
      body: { model: "gpt-image-1", prompt: "minimal geometric shapes" },
    };
    const body = expectComposedBody(composeTrustedRequest(raw));
    expect(body.prompt).toBe("minimal geometric shapes");
    expect(body.prompt).not.toContain("[System Runtime Context]");
  });

  it("P0-05 (3) leaves non-POST endpoints untouched", () => {
    const raw = {
      endpoint: "/models",
      method: "GET",
      body: {},
    };
    const body = expectComposedBody(composeTrustedRequest(raw));
    expect(body).toEqual({});
  });

  it("P0-05 (4) substitutes {{time && date}} placeholders inside the system prompt", () => {
    const trusted = buildTrustedRuntimeLayer();
    expect(
      substituteTimeAndDatePlaceholders("payload at {{time && date}}", trusted),
    ).toBe(
      `payload at ${trusted.content.currentDate} ${trusted.content.currentTime}`,
    );
    expect(substituteTimeAndDatePlaceholders("{{date}} start", trusted)).toBe(
      `${trusted.content.currentDate} start`,
    );
    expect(
      substituteTimeAndDatePlaceholders(
        "plain string with no markers",
        trusted,
      ),
    ).toBe("plain string with no markers");
  });

  it("P0-05 (4) substitutes placeholders before injecting into messages[0]", () => {
    const raw = {
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        messages: [{ role: "system", content: "context stamp: {{time && date}}" }],
      },
    };
    const body = expectComposedBody(composeTrustedRequest(raw));
    const messages = expectArray(body.messages, "messages");
    const first = expectRecord(messages[0], "messages[0]");
    const substituted = expectString(first.content, "messages[0].content");
    expect(substituted).toContain("context stamp: ");
    expect(substituted).not.toContain("{{time && date}}");
  });

  it("P0-05 (2) composeAgentRuntime enforces the immutable priority floor", () => {
    const customLayer: CustomAgentLayer = {
      kind: "custom",
      priority: -1,
      immutable: false,
      content: "evil",
    };
    expect(() =>
      composeAgentRuntime({
        systemPrompt: "ok system",
        userPrompt: "hi",
        model: "m",
        tools: ["x"],
        customLayers: [customLayer], // priority < 0 forbidden
      }),
    ).toThrow(/immutable priority floor/);
  });

  it("P0-05 (3-dupe) keeps custom layers in the typed runtime contract", () => {
    const customLayers: CustomAgentLayer[] = [
      { kind: "custom", priority: 20, immutable: false, content: "alpha" },
      { kind: "custom", priority: 30, immutable: false, content: "beta" },
      { kind: "custom", priority: 40, immutable: false, content: "gamma" },
    ];
    const composed = composeAgentRuntime({
      systemPrompt: "ok",
      userPrompt: "hi",
      model: "m",
      tools: ["alpha"],
      customLayers,
    });
    const toolLayers = composed.layers.filter((l) => l.kind === "tool-runtime");
    expect(toolLayers).toHaveLength(1);
    expect(toolLayers[0].tools).toEqual([{ name: "alpha", trusted: true }]);
    expect(composed.layers.filter((layer) => layer.kind === "custom")).toEqual(
      customLayers,
    );
  });

  it("P0-05 (3-dupe) dedupes identical tool-runtime layers by content hash", () => {
    const trusted = buildTrustedRuntimeLayer();
    // Two layers with the same tool names (in different order) share a hash
    // because `dedupToolRuntimeLayers` sorts the tool list before hashing.
    const a = buildToolRuntimeLayer(["alpha", "beta"]);
    const b = buildToolRuntimeLayer(["beta", "alpha"]);
    const c = buildToolRuntimeLayer(["gamma"]);

    const layers: AgentRuntimeLayer[] = [trusted, a, b, c];
    const deduplicated = dedupToolRuntimeLayers(layers);

    const toolLayers = deduplicated.filter(
      (l): l is ToolRuntimeLayer => l.kind === "tool-runtime",
    );
    // a and b are identical after sorting; only one is kept, plus c.
    expect(toolLayers).toHaveLength(2);
    const fingerprints = toolLayers.map((l) =>
      l.tools.map((t) => t.name).sort().join("|"),
    );
    expect(fingerprints).toEqual(["alpha|beta", "gamma"]);
  });
});
