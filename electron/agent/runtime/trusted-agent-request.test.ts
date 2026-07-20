/* eslint-disable @typescript-eslint/no-unused-vars */

import { describe, it, expect, vi } from "vitest";
import {
  composeTrustedRequest,
  composeAgentRuntime,
  buildTrustedRuntimeLayer,
  buildToolRuntimeLayer,
  substituteTimeAndDatePlaceholders,
} from "./trusted-agent-request";

describe("trusted-agent-request", () => {
  it("injects System Runtime Context at the top of messages", () => {
    const raw = {
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        messages: [{ role: "user", content: "hello" }],
        tools: [{ type: "function" }]
      }
    };

    const composed = composeTrustedRequest(raw) as any;
    expect(composed.body.messages.length).toBe(2);
    expect(composed.body.messages[0].role).toBe("system");
    expect(composed.body.messages[0].content).toContain("[System Runtime Context]");
    expect(composed.body.messages[0].content).toContain("Current Date/Time:");
    expect(composed.body.messages[0].content).toContain("Timezone:");
    expect(composed.body.messages[1].content).toBe("hello");
  });

  it("prepends to existing system message", () => {
    const raw = {
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        messages: [{ role: "system", content: "User system prompt." }],
      }
    };

    const composed = composeTrustedRequest(raw) as any;
    expect(composed.body.messages.length).toBe(1);
    expect(composed.body.messages[0].role).toBe("system");
    expect(composed.body.messages[0].content).toContain("[System Runtime Context]");
    expect(composed.body.messages[0].content).toContain("User system prompt.");
  });

  it("ignores invalid shapes", () => {
    expect(composeTrustedRequest(null)).toBe(null);
    expect(composeTrustedRequest("abc")).toBe("abc");
    expect(composeTrustedRequest({ body: "not-an-object" })).toEqual({ body: "not-an-object" });
    expect(composeTrustedRequest({ body: { messages: "not-an-array" } })).toEqual({ body: { messages: "not-an-array" } });
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
    const composed = composeTrustedRequest(raw) as any;
    expect(composed.body.messages[0].role).toBe("system");
    expect(composed.body.messages[0].content).toContain("Toolchain Trust Ledger:");
    expect(composed.body.messages[0].content).toContain("media.generateImage (trusted=true)");
    expect(composed.body.messages[0].content).toContain("media.listImages (trusted=true)");
  });

  it("P0-05 (3) injects trusted context into /image/generate body.prompt too", () => {
    const raw = {
      endpoint: "/image/generate",
      method: "POST",
      body: { model: "nano-banana", prompt: "a quiet forest at dawn" },
    };
    const composed = composeTrustedRequest(raw) as any;
    expect(composed.body.prompt.startsWith("[System Runtime Context]")).toBe(true);
    expect(composed.body.prompt).toContain("Toolchain Trust Ledger:");
    expect(composed.body.prompt).toContain("a quiet forest at dawn");
    // Original `model` is preserved.
    expect(composed.body.model).toBe("nano-banana");
  });

  it("P0-05 (3) leaves non-POST endpoints untouched", () => {
    const raw = {
      endpoint: "/models",
      method: "GET",
      body: {},
    };
    const composed = composeTrustedRequest(raw) as any;
    expect(composed.body).toEqual({});
  });

  it("P0-05 (4) substitutes {{time && date}} placeholders inside the system prompt", () => {
    const trusted = buildTrustedRuntimeLayer();
    expect(substituteTimeAndDatePlaceholders("payload at {{time && date}}", trusted))
      .toBe(`payload at ${trusted.content.currentDate} ${trusted.content.currentTime}`);
    expect(substituteTimeAndDatePlaceholders("{{date}} start", trusted))
      .toBe(`${trusted.content.currentDate} start`);
    expect(substituteTimeAndDatePlaceholders("plain string with no markers", trusted))
      .toBe("plain string with no markers");
  });

  it("P0-05 (4) substitutes placeholders before injecting into messages[0]", () => {
    const raw = {
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        messages: [{ role: "system", content: "context stamp: {{time && date}}" }],
      },
    };
    const composed = composeTrustedRequest(raw) as any;
    const substituted = composed.body.messages[0].content;
    expect(substituted).toContain("context stamp: ");
    expect(substituted).not.toContain("{{time && date}}");
  });

  it("P0-05 (2) composeAgentRuntime enforces the immutable priority floor", () => {
    const trusted = buildTrustedRuntimeLayer();
    const tool = buildToolRuntimeLayer(["x"]);
    expect(() => composeAgentRuntime({
      systemPrompt: "ok system",
      userPrompt: "hi",
      model: "m",
      tools: ["x"],
      customLayers: [
        { kind: "custom", priority: -1, immutable: false, content: "evil" }, // priority < 0 forbidden
        tool,
        trusted,
      ],
    })).toThrow(/immutable priority floor/);
  });

  it("P0-05 (3-dupe) dedupes identical tool-runtime layers by content hash", () => {
    const trusted = buildTrustedRuntimeLayer();
    // Two layers with the same tool names (in different order) share a hash
    // because `dedupToolRuntimeLayers` sorts the tool list before hashing.
    const a = buildToolRuntimeLayer(["alpha", "beta"]);
    const b = buildToolRuntimeLayer(["beta", "alpha"]); // same tools → same hash
    const c = buildToolRuntimeLayer(["gamma"]);
    const composed = composeAgentRuntime({
      systemPrompt: "ok",
      userPrompt: "hi",
      model: "m",
      // Use a different tool list so the request's tool layer does not
      // collide with what's supplied as `customLayers`.
      tools: ["alpha"],
      // Cast through `unknown` because the production input filter rejects
      // tool-runtime entries inside customLayers; that is the canonical
      // shape, and these tests exercise the dedup invariant directly.
      customLayers: [a, b, c, trusted] as unknown as never[],
    });
    const toolLayers = composed.layers.filter((l) => l.kind === "tool-runtime");
    // Layers distinct after dedup: 'alpha' (from request.tools), 'alpha,beta'
    // (customLayer a), 'gamma'. The duplicate (b) is dropped.
    expect(toolLayers.length).toBe(3);
    const fingerprints = toolLayers.map((l) => l.kind === "tool-runtime" ? l.tools.map((t) => t.name).sort().join("|") : null);
    expect(fingerprints).toEqual([
      "alpha",
      "alpha|beta",
      "gamma",
    ]);
  });
});
