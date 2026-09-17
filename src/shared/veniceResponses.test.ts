// @vitest-environment node
/** @fileoverview Wire-shape and SSE-parser tests for the experimental Venice
 *  Responses API transport (Phase 8). Request/response shapes are
 *  cross-asserted against the tracked OpenAPI snapshot so runtime drift is
 *  caught by tests, not by users. */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  applyResponsesSseEvent,
  extractResponsesBodyScreenText,
  extractResponsesEventScreenText,
  modelSupportsResponsesApi,
  RESPONSES_SSE_EVENT_TYPES,
  type VeniceResponsesRequest,
} from "./veniceResponses";

const SWAGGER_PATH = path.resolve(__dirname, "../../docs/reference/Venice_swagger_api.yaml");

function readSwagger(): string {
  return fs.readFileSync(SWAGGER_PATH, "utf8");
}

describe("Responses API contract (swagger cross-assertions)", () => {
  const swagger = readSwagger();

  it("documents POST /responses", () => {
    expect(swagger).toContain("/responses:");
    expect(swagger).toContain("operationId: createResponse");
  });

  it("documents the ResponsesRequest and ResponsesResponse schemas", () => {
    expect(swagger).toContain("ResponsesRequest:");
    expect(swagger).toContain("ResponsesResponse:");
  });

  it("declares E2EE models unsupported on /responses", () => {
    expect(swagger).toContain("E2EE-capable models are not supported");
    expect(swagger).toContain("use /api/v1/chat/completions with the required");
  });

  it("documents stateless semantics", () => {
    expect(swagger).toContain("This API is stateless");
  });

  it("documents SSE streaming via stream: true", () => {
    expect(swagger).toContain("supports streaming via Server-Sent Events");
  });

  it("requires model and input on the request", () => {
    const requestSection = swagger.slice(
      swagger.indexOf("ResponsesRequest:"),
      swagger.indexOf("ResponsesResponse:"),
    );
    expect(requestSection).toContain("- model");
    expect(requestSection).toContain("- input");
  });

  it("every field the canonical builder emits exists in the swagger ResponsesRequest", () => {
    const requestSection = swagger.slice(
      swagger.indexOf("ResponsesRequest:"),
      swagger.indexOf("ResponsesResponse:"),
    );
    // Top-level fields emitted by buildResponsesBody in chat-stream-manager.
    const emittedTopLevel = [
      "model",
      "input",
      "stream",
      "temperature",
      "top_p",
      "max_output_tokens",
      "reasoning",
      "venice_parameters",
    ];
    for (const field of emittedTopLevel) {
      expect(`${field}:`, `ResponsesRequest must document ${field}`).toBeDefined();
      expect(
        requestSection.includes(`        ${field}:`) ||
          requestSection.includes(`          ${field}:`),
        `ResponsesRequest schema must contain field "${field}"`,
      ).toBe(true);
    }
    // venice_parameters sub-fields emitted by pickResponsesVeniceParameters.
    for (const vpField of [
      "character_slug",
      "enable_web_search",
      "enable_web_scraping",
      "enable_web_citations",
      "include_venice_system_prompt",
    ]) {
      expect(
        requestSection.includes(`            ${vpField}:`) ||
          requestSection.includes(`              ${vpField}:`),
        `ResponsesRequest venice_parameters must document "${vpField}"`,
      ).toBe(true);
    }
  });

  it("typed builder payloads satisfy the emitted-field subset (no invented fields)", () => {
    // Compile-time guard: constructing a request with only the emitted
    // fields must typecheck. Anything not in VeniceResponsesRequest would
    // fail here.
    const payload: VeniceResponsesRequest = {
      model: "test-model",
      input: [
        { type: "message", role: "system", content: "sys" },
        { type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] },
        { type: "function_call", call_id: "c1", name: "tool", arguments: "{}" },
        { type: "function_call_output", call_id: "c1", output: "ok" },
      ],
      stream: true,
      temperature: 0.7,
      top_p: 1,
      max_output_tokens: 1024,
      reasoning: { effort: "low" },
      venice_parameters: {
        character_slug: "slug",
        enable_web_search: "auto",
        enable_web_scraping: false,
        enable_web_citations: true,
        include_venice_system_prompt: false,
      },
    };
    expect(payload.model).toBe("test-model");
  });
});

describe("modelSupportsResponsesApi capability gate", () => {
  it("accepts models with explicit supportsE2EE === false (spec-level)", () => {
    expect(
      modelSupportsResponsesApi({ model_spec: { supportsE2EE: false } }),
    ).toBe(true);
  });

  it("accepts models with explicit capabilities.supportsE2EE === false", () => {
    expect(
      modelSupportsResponsesApi({
        model_spec: { capabilities: { supportsE2EE: false } },
      }),
    ).toBe(true);
  });

  it("rejects E2EE-capable models (documented unsupported on /responses)", () => {
    expect(
      modelSupportsResponsesApi({ model_spec: { supportsE2EE: true } }),
    ).toBe(false);
    expect(
      modelSupportsResponsesApi({
        model_spec: { capabilities: { supportsE2EE: true } },
      }),
    ).toBe(false);
  });

  it("fails closed when metadata is absent", () => {
    expect(modelSupportsResponsesApi(undefined)).toBe(false);
    expect(modelSupportsResponsesApi({})).toBe(false);
    expect(modelSupportsResponsesApi({ model_spec: {} })).toBe(false);
    expect(
      modelSupportsResponsesApi({ model_spec: { capabilities: {} } }),
    ).toBe(false);
  });

  it("spec-level boolean wins over capabilities", () => {
    expect(
      modelSupportsResponsesApi({
        model_spec: { supportsE2EE: false, capabilities: { supportsE2EE: true } },
      }),
    ).toBe(true);
  });
});

describe("applyResponsesSseEvent (documented SSE events)", () => {
  it("treats [DONE] as the stream terminator", () => {
    const outcome = applyResponsesSseEvent("[DONE]");
    expect(outcome.done).toBe(true);
    expect(outcome.malformed).toBe(false);
    expect(outcome.terminal).toBeNull();
  });

  it("ignores empty payloads benignly", () => {
    const outcome = applyResponsesSseEvent("");
    expect(outcome.done).toBe(false);
    expect(outcome.malformed).toBe(false);
  });

  it("response.completed terminates and carries usage", () => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_1",
          status: "completed",
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        },
      }),
    );
    expect(outcome.done).toBe(true);
    expect(outcome.terminal).toBe("completed");
    expect(outcome.malformed).toBe(false);
    expect(outcome.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });

  it("response.output_text.delta emits a text delta", () => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({
        type: "response.output_text.delta",
        output_index: 0,
        content_index: 0,
        delta: "Hello",
      }),
    );
    expect(outcome.text).toBe("Hello");
    expect(outcome.done).toBe(false);
    expect(outcome.malformed).toBe(false);
  });

  it("response.reasoning_summary_text.delta emits a reasoning delta", () => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({
        type: "response.reasoning_summary_text.delta",
        output_index: 0,
        summary_index: 0,
        delta: "thinking…",
      }),
    );
    expect(outcome.reasoning).toBe("thinking…");
    expect(outcome.text).toBe("");
  });

  it("response.output_item.added with a function_call emits a name fragment", () => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({
        type: "response.output_item.added",
        output_index: 1,
        item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "get_weather", arguments: "" },
      }),
    );
    expect(outcome.toolCalls).toEqual([
      {
        index: 1,
        id: "fc_1",
        type: "function",
        function: { name: "get_weather" },
      },
    ]);
  });

  it("response.function_call_arguments.delta emits an arguments fragment", () => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({
        type: "response.function_call_arguments.delta",
        output_index: 1,
        item_id: "fc_1",
        delta: "{\"city\":",
      }),
    );
    expect(outcome.toolCalls).toEqual([
      {
        index: 1,
        id: "fc_1",
        type: "function",
        function: { arguments: "{\"city\":" },
      },
    ]);
  });

  it("response.failed is malformed with a bounded provider message", () => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({
        type: "response.failed",
        response: { id: "resp_1", status: "failed", error: { code: "x", message: "provider blew up" } },
      }),
    );
    expect(outcome.done).toBe(false);
    expect(outcome.malformed).toBe(true);
    expect(outcome.terminal).toBe("failed");
    expect(outcome.errorMessage).toBe("provider blew up");
    expect(outcome.rawData).toBeTruthy();
  });

  it("response.incomplete is malformed with a safe fallback message", () => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({ type: "response.incomplete", response: { id: "resp_1" } }),
    );
    expect(outcome.malformed).toBe(true);
    expect(outcome.terminal).toBe("incomplete");
    expect(outcome.errorMessage).toMatch(/incomplete/i);
  });

  it("error frames are malformed with the provider message", () => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({ type: "error", error: { message: "overloaded", code: "E" } }),
    );
    expect(outcome.malformed).toBe(true);
    expect(outcome.errorMessage).toBe("overloaded");
  });

  it("malformed JSON is malformed with rawData for redacted diagnostics", () => {
    const outcome = applyResponsesSseEvent("{not json");
    expect(outcome.malformed).toBe(true);
    expect(outcome.rawData).toBe("{not json");
    expect(outcome.errorMessage).toBeUndefined();
  });

  it.each([
    "response.created",
    "response.in_progress",
    "response.output_item.done",
    "response.content_part.added",
    "response.output_text.done",
    "response.output_text.annotation.added",
    "response.function_call_arguments.done",
    "response.web_search_call.in_progress",
    "response.web_search_call.searching",
    "response.web_search_call.completed",
  ])("treats %s as benign (parsed, no delta, not done)", (type) => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({ type, output_index: 0, item: { type: "message" }, delta: "x", text: "full" }),
    );
    expect(outcome.done).toBe(false);
    expect(outcome.malformed).toBe(false);
    expect(outcome.text).toBe("");
    expect(outcome.toolCalls).toBeUndefined();
  });

  it("ignores unknown future event types without failing", () => {
    const outcome = applyResponsesSseEvent(
      JSON.stringify({ type: "response.future_event.v2", something: 1 }),
    );
    expect(outcome.done).toBe(false);
    expect(outcome.malformed).toBe(false);
  });

  it("documented event type table covers the lifecycle families", () => {
    for (const family of [
      "response.created",
      "response.output_text.delta",
      "response.output_text.done",
      "response.output_item.added",
      "response.output_item.done",
      "response.function_call_arguments.delta",
      "response.function_call_arguments.done",
      "response.web_search_call.completed",
      "response.completed",
      "response.incomplete",
      "response.failed",
      "error",
    ]) {
      expect(RESPONSES_SSE_EVENT_TYPES).toContain(family);
    }
  });
});

describe("extractResponsesEventScreenText (FSM screening helper)", () => {
  it("extracts delta text", () => {
    expect(
      extractResponsesEventScreenText(
        JSON.stringify({ type: "response.output_text.delta", delta: "bad text" }),
      ),
    ).toBe("bad text");
  });

  it("extracts done-echo text (providers that skip deltas)", () => {
    expect(
      extractResponsesEventScreenText(
        JSON.stringify({ type: "response.output_text.done", text: "full text" }),
      ),
    ).toBe("full text");
  });

  it("extracts message text from output_item.done", () => {
    const text = extractResponsesEventScreenText(
      JSON.stringify({
        type: "response.output_item.done",
        item: {
          type: "message",
          content: [{ type: "output_text", text: "done text" }],
        },
      }),
    );
    expect(text).toBe("done text");
  });

  it("extracts message text from response.completed output blocks", () => {
    const text = extractResponsesEventScreenText(
      JSON.stringify({
        type: "response.completed",
        response: {
          output: [
            { type: "message", content: [{ type: "output_text", text: "final" }] },
          ],
        },
      }),
    );
    expect(text).toBe("final");
  });

  it("returns empty for lifecycle events and garbage", () => {
    expect(extractResponsesEventScreenText(JSON.stringify({ type: "response.created" }))).toBe("");
    expect(extractResponsesEventScreenText("[DONE]")).toBe("");
    expect(extractResponsesEventScreenText("{bad")).toBe("");
    expect(extractResponsesEventScreenText("")).toBe("");
  });
});

describe("extractResponsesBodyScreenText (non-streaming FSM screen)", () => {
  it("concatenates message output text", () => {
    const text = extractResponsesBodyScreenText(
      JSON.stringify({
        id: "resp_1",
        output: [
          { type: "reasoning", id: "r1" },
          {
            type: "message",
            id: "m1",
            content: [{ type: "output_text", text: "hello " }, { type: "output_text", text: "world" }],
          },
        ],
      }),
    );
    expect(text).toBe("hello world");
  });

  it("returns empty for unparseable bodies", () => {
    expect(extractResponsesBodyScreenText("not json")).toBe("");
    expect(extractResponsesBodyScreenText("{}")).toBe("");
  });
});
