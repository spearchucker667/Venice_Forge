/** @fileoverview Venice Responses API (alpha) — normalized client contract.
 *
 *  Phase 8 of the 2026-09-16 Venice API feature-gap handoff
 *  (docs/audits/TODO/VENICE_API_2026-09-16_FEATURE_GAP_AGENT_HANDOFF.md §13).
 *  POST /responses is an EXPLICIT, OPT-IN, EXPERIMENTAL transport. It never
 *  replaces /chat/completions, which remains the default chat path.
 *
 *  Request/response/output-block types below are transcribed from the tracked
 *  OpenAPI snapshot only — no invented fields:
 *
 *    - `ResponsesRequest`      docs/reference/Venice_swagger_api.yaml:1814
 *    - `ResponsesResponse`     docs/reference/Venice_swagger_api.yaml:2423
 *    - POST /responses path    docs/reference/Venice_swagger_api.yaml:7095
 *
 *  Documented endpoint semantics (swagger :7097-7136):
 *    - **Alpha** — available to alpha testers only.
 *    - **Stateless only** — every request carries the full conversation;
 *      no server-side conversation state exists.
 *    - **E2EE models are NOT supported** — "E2EE-capable models are not
 *      supported on /api/v1/responses; use /api/v1/chat/completions with the
 *      required E2EE headers instead." This module fails closed on any model
 *      whose E2EE capability is not explicitly `false`.
 *    - Streaming uses Server-Sent Events when `stream: true` is set. The
 *      swagger documents the SSE capability but not a per-event schema; the
 *      endpoint is declared OpenAI-compatible, so the event envelope is the
 *      OpenAI Responses streaming shape (`data: {json}\n\n` where each payload
 *      carries a `type` field, terminated by `data: [DONE]`). The parser is
 *      deliberately tolerant: unknown event types are ignored (never fatal),
 *      because an alpha upstream may add events at any time.
 *
 *  This module is shared by the renderer transport
 *  (`src/services/veniceClient/responses.ts`), the Electron main process
 *  (`electron/services/veniceClient.ts`), and the web proxy (`server.ts`), so
 *  identical byte streams produce identical delta/terminal outcomes on every
 *  transport. It must stay free of renderer-only or Node-only imports.
 */

// ============================================================================
// Request contract (swagger ResponsesRequest, :1814)
// ============================================================================

/** Input message roles documented on the Responses `input` message item. */
export type ResponsesInputRole = "user" | "assistant" | "system" | "developer";

/** `input_text` content part documented on Responses input messages. */
export interface ResponsesInputTextPart {
  type: "input_text";
  text: string;
}

/** `input_image` content part documented on Responses input messages. */
export interface ResponsesInputImagePart {
  type: "input_image";
  image_url: string | { url: string; detail?: "auto" | "low" | "high" };
  detail?: "auto" | "low" | "high";
}

/** Documented input message item (`type: "message"`). */
export interface ResponsesInputMessage {
  type: "message";
  role: ResponsesInputRole;
  /** String content, or typed parts. This slice emits `input_text` parts. */
  content: string | Array<ResponsesInputTextPart | ResponsesInputImagePart>;
  id?: string;
  status?: "completed" | "in_progress";
}

/** `function_call` input item (swagger :2076) — an assistant tool-call turn
 *  replayed into a stateless Responses request. */
export interface ResponsesInputFunctionCall {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
  id?: string;
  status?: "completed" | "in_progress";
}

/** `function_call_output` input item (swagger :2101) — a tool result replayed
 *  into a stateless Responses request. */
export interface ResponsesInputFunctionCallOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

/** Documented input item union the canonical builder emits. */
export type ResponsesInputItem =
  | ResponsesInputMessage
  | ResponsesInputFunctionCall
  | ResponsesInputFunctionCallOutput;

/** Reasoning configuration documented on ResponsesRequest (`reasoning`,
 *  :2178). Same effort vocabulary as chat completions. */
export interface ResponsesReasoningConfig {
  effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  enabled?: boolean;
  summary?: "auto" | "concise" | "detailed";
}

/** `venice_parameters` documented on ResponsesRequest (:2385). E2EE-capable
 *  models are rejected before dispatch, so `enable_e2ee` never appears on the
 *  wire from the canonical builder. */
export interface ResponsesVeniceParameters {
  character_slug?: string;
  enable_web_search?: "auto" | "off" | "on";
  enable_web_scraping?: boolean;
  enable_web_citations?: boolean;
  include_venice_system_prompt?: boolean;
  include_search_results_in_stream?: boolean;
}

/** Normalized request body for POST /responses. Only documented fields; the
 *  optional `fallbacks` array (Anthropic-only beta, :2163) is intentionally
 *  not represented. */
export interface VeniceResponsesRequest {
  model: string;
  input: string | ResponsesInputItem[];
  include?: string[];
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  reasoning?: ResponsesReasoningConfig;
  stream?: boolean;
  venice_parameters?: ResponsesVeniceParameters;
}

// ============================================================================
// Response contract (swagger ResponsesResponse, :2423)
// ============================================================================

/** Status values documented on the Responses response object. */
export type ResponsesStatus = "completed" | "failed" | "in_progress" | "cancelled";

/** Reasoning output block (`type: "reasoning"`). */
export interface ResponsesReasoningOutput {
  type: "reasoning";
  id: string;
  summary?: string[];
  encrypted_content?: string;
}

/** URL citation annotation on `output_text` parts. */
export interface ResponsesUrlCitationAnnotation {
  type: "url_citation";
  url: string;
  title?: string;
  start_index: number;
  end_index: number;
}

/** `output_text` content part of a message output block. */
export interface ResponsesOutputTextPart {
  type: "output_text";
  text: string;
  annotations?: ResponsesUrlCitationAnnotation[];
}

/** Message output block (`type: "message"`). */
export interface ResponsesMessageOutput {
  type: "message";
  id: string;
  status: "completed" | "in_progress" | "failed";
  role: "assistant";
  content: ResponsesOutputTextPart[];
}

/** Function-call output block (`type: "function_call"`). */
export interface ResponsesFunctionCallOutput {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: "completed" | "in_progress";
}

/** Web-search call output block (`type: "web_search_call"`). */
export interface ResponsesWebSearchCallOutput {
  type: "web_search_call";
  id: string;
  status: "completed";
}

/** Typed output block union documented on the Responses response. */
export type VeniceResponsesOutputBlock =
  | ResponsesReasoningOutput
  | ResponsesMessageOutput
  | ResponsesFunctionCallOutput
  | ResponsesWebSearchCallOutput;

/** Token usage documented on the Responses response. */
export interface ResponsesUsage {
  input_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens: number;
  output_tokens_details?: { reasoning_tokens?: number };
  total_tokens: number;
}

/** Normalized response body for POST /responses (non-streaming shape; the
 *  same object appears as the payload of streaming `response.completed`). */
export interface VeniceResponsesResponse {
  id: string;
  object: "response";
  created_at: number;
  model: string;
  status: ResponsesStatus;
  output: VeniceResponsesOutputBlock[];
  usage?: ResponsesUsage;
  error?: { code: string; message: string };
}

// ============================================================================
// Streaming (SSE) normalization
// ============================================================================

/** SSE event type names for the OpenAI-compatible Responses stream. The
 *  swagger documents SSE streaming (:7128) without a per-event schema; these
 *  are the OpenAI Responses event names the alpha endpoint mirrors. */
export const RESPONSES_SSE_EVENT_TYPES = [
  "response.created",
  "response.queued",
  "response.in_progress",
  "response.output_item.added",
  "response.output_item.done",
  "response.content_part.added",
  "response.content_part.done",
  "response.output_text.delta",
  "response.output_text.done",
  "response.output_text.annotation.added",
  "response.reasoning_summary_text.delta",
  "response.reasoning_summary_text.done",
  "response.function_call_arguments.delta",
  "response.function_call_arguments.done",
  "response.web_search_call.in_progress",
  "response.web_search_call.searching",
  "response.web_search_call.completed",
  "response.completed",
  "response.incomplete",
  "response.failed",
  "error",
] as const;

export type ResponsesSseEventType = (typeof RESPONSES_SSE_EVENT_TYPES)[number];

/** Terminal outcome carried by a completed/failed/incomplete Responses
 *  stream. `completed` maps to the shared `[DONE]`-equivalent contract. */
export type ResponsesStreamTerminal = "completed" | "failed" | "incomplete";

/** Outcome of applying one decoded SSE event to the Responses stream.
 *  Shape-aligned with `SseEventOutcome` in `./sseStreamDecoder` so both
 *  transports consume the result identically. */
export interface ResponsesSseEventOutcome {
  /** True when the event terminated the stream ([DONE] or response.completed). */
  done: boolean;
  /** Terminal status when the stream reported failure/incomplete. */
  terminal: ResponsesStreamTerminal | null;
  /** Extracted assistant text delta (content only, not reasoning). */
  text: string;
  /** Extracted reasoning delta. */
  reasoning: string;
  /** Tool-call fragments normalized to the shared chat delta shape. */
  toolCalls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: { name?: string; arguments?: string };
  }>;
  /** Normalized usage when the terminal event carried it. */
  usage?: Record<string, unknown>;
  /** True when the payload was malformed JSON or an error frame. */
  malformed: boolean;
  /** Raw frame for redacted diagnostics only. */
  rawData?: string;
  /** Normalized (bounded) provider message when derivable from an error frame. */
  errorMessage?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedMessage(value: unknown, max = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/** Derives a bounded, user-safe message from a failed/incomplete/error
 *  Responses event. Never includes raw payload text beyond the provider's
 *  own error message. */
function responsesErrorMessage(record: Record<string, unknown>): string | undefined {
  const response = record.response;
  if (isRecord(response)) {
    const error = response.error;
    if (isRecord(error)) {
      const fromError = boundedMessage(error.message);
      if (fromError) return fromError;
    }
    const fromResponse = boundedMessage(response.message);
    if (fromResponse) return fromResponse;
  }
  const direct = record.error;
  if (isRecord(direct)) {
    const fromDirect = boundedMessage(direct.message);
    if (fromDirect) return fromDirect;
  }
  const topLevel = boundedMessage(record.message);
  if (topLevel) return topLevel;
  return undefined;
}

/** Normalizes a `usage` object to the shared chat usage vocabulary
 *  (`prompt_tokens`/`completion_tokens`/`total_tokens`) so existing delta
 *  consumers keep working unchanged. */
function normalizeUsage(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const source = isRecord(record.usage) ? record.usage : undefined;
  const response = isRecord(record.response) ? record.response : undefined;
  const candidate = source ?? (response && isRecord(response.usage) ? response.usage : undefined);
  if (!candidate) return undefined;
  const input = candidate.input_tokens;
  const output = candidate.output_tokens;
  const total = candidate.total_tokens;
  if (typeof input !== "number" && typeof output !== "number" && typeof total !== "number") {
    return undefined;
  }
  return {
    ...(typeof input === "number" ? { prompt_tokens: input } : {}),
    ...(typeof output === "number" ? { completion_tokens: output } : {}),
    ...(typeof total === "number" ? { total_tokens: total } : {}),
  };
}

/**
 * Applies one decoded SSE event from POST /responses to the shared stream
 * contract. Both transports (web renderer loop, Electron main process) call
 * this so identical byte streams produce identical outcomes:
 *
 *  - `data: [DONE]` and `response.completed` → `done: true` (terminal contract
 *    mirrors the chat 2xx-without-terminator → error lifecycle).
 *  - `response.failed` / `response.incomplete` / `error` → `malformed: true`
 *    with a bounded `errorMessage` (transport promotes it to an error).
 *  - `response.output_text.delta` → `text` delta.
 *  - `response.reasoning_summary_text.delta` → `reasoning` delta.
 *  - `response.output_item.added` with a function_call item → tool-call name
 *    fragment; `response.function_call_arguments.delta` → arguments fragment.
 *  - Everything else documented (lifecycle, web_search_call, content-part
 *    boundaries, `.done` echoes) is benign: parsed, never fatal.
 *
 * @param data The raw joined `data:` payload of one SSE event.
 */
export function applyResponsesSseEvent(data: string): ResponsesSseEventOutcome {
  const base: ResponsesSseEventOutcome = {
    done: false,
    terminal: null,
    text: "",
    reasoning: "",
    malformed: false,
  };
  if (!data || data === "[DONE]") {
    if (data === "[DONE]") base.done = true;
    return base;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { ...base, malformed: true, rawData: data };
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    // Benign non-object / untyped JSON — not a Responses event.
    return base;
  }

  const type = parsed.type;
  switch (type) {
    case "response.completed":
      return { ...base, done: true, terminal: "completed", usage: normalizeUsage(parsed) };
    case "response.failed":
      return {
        ...base,
        malformed: true,
        terminal: "failed",
        rawData: data,
        errorMessage: responsesErrorMessage(parsed) ?? "Venice Responses stream failed.",
      };
    case "response.incomplete":
      return {
        ...base,
        malformed: true,
        terminal: "incomplete",
        rawData: data,
        errorMessage: responsesErrorMessage(parsed) ?? "Venice Responses stream ended incomplete.",
      };
    case "error":
      return {
        ...base,
        malformed: true,
        rawData: data,
        errorMessage: responsesErrorMessage(parsed) ?? "Venice Responses stream returned an error.",
      };
    case "response.output_text.delta": {
      const delta = typeof parsed.delta === "string" ? parsed.delta : "";
      return delta ? { ...base, text: delta } : base;
    }
    case "response.reasoning_summary_text.delta": {
      const delta = typeof parsed.delta === "string" ? parsed.delta : "";
      return delta ? { ...base, reasoning: delta } : base;
    }
    case "response.output_item.added": {
      const item = parsed.item;
      if (isRecord(item) && item.type === "function_call") {
        const index = typeof parsed.output_index === "number" ? parsed.output_index : 0;
        return {
          ...base,
          toolCalls: [
            {
              index,
              id: typeof item.id === "string" ? item.id : undefined,
              type: "function" as const,
              function: { name: typeof item.name === "string" ? item.name : undefined },
            },
          ],
        };
      }
      return base;
    }
    case "response.function_call_arguments.delta": {
      const delta = typeof parsed.delta === "string" ? parsed.delta : "";
      if (!delta) return base;
      const index = typeof parsed.output_index === "number" ? parsed.output_index : 0;
      return {
        ...base,
        toolCalls: [
          {
            index,
            id: typeof parsed.item_id === "string" ? parsed.item_id : undefined,
            type: "function" as const,
            function: { arguments: delta },
          },
        ],
      };
    }
    default:
      // Lifecycle, content-part, output-item.done, web_search_call, and any
      // future alpha event: benign. Content arrives via *.delta events.
      return base;
  }
}

/**
 * Extracts the assistant-visible text from a Responses SSE event for safety
 * screening. Unlike `applyResponsesSseEvent` (display path, deltas only),
 * this includes full text carried by `.done` echoes and completed output
 * blocks so a provider that skips deltas still gets screened. Used by the
 * web-proxy Family Safe Mode SSE gate and the non-streaming response screen.
 * Never throws; returns "" when no text is present.
 *
 * @param data The raw joined `data:` payload of one SSE event.
 */
export function extractResponsesEventScreenText(data: string): string {
  if (!data || data === "[DONE]") return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return "";
  }
  if (!isRecord(parsed) || typeof parsed.type !== "string") return "";

  switch (parsed.type) {
    case "response.output_text.delta":
      return typeof parsed.delta === "string" ? parsed.delta : "";
    case "response.output_text.done":
      return typeof parsed.text === "string" ? parsed.text : "";
    case "response.reasoning_summary_text.delta":
    case "response.reasoning_summary_text.done":
      return typeof parsed.delta === "string"
        ? parsed.delta
        : typeof parsed.text === "string"
          ? parsed.text
          : "";
    case "response.output_item.done": {
      const item = parsed.item;
      if (!isRecord(item) || item.type !== "message") return "";
      const content = Array.isArray(item.content) ? item.content : [];
      let text = "";
      for (const part of content) {
        if (isRecord(part) && part.type === "output_text" && typeof part.text === "string") {
          text += part.text;
        }
      }
      return text;
    }
    case "response.completed": {
      const response = parsed.response;
      if (!isRecord(response) || !Array.isArray(response.output)) return "";
      let text = "";
      for (const block of response.output) {
        if (!isRecord(block) || block.type !== "message") continue;
        const content = Array.isArray(block.content) ? block.content : [];
        for (const part of content) {
          if (isRecord(part) && part.type === "output_text" && typeof part.text === "string") {
            text += part.text;
          }
        }
      }
      return text;
    }
    default:
      return "";
  }
}

/** Extracts assistant text from a non-streaming Responses JSON body for
 *  safety screening (web proxy non-SSE path). Returns "" when unparseable. */
export function extractResponsesBodyScreenText(raw: string): string {
  if (!raw) return "";
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.output)) return "";
    let text = "";
    for (const block of parsed.output) {
      if (!isRecord(block) || block.type !== "message") continue;
      const content = Array.isArray(block.content) ? block.content : [];
      for (const part of content) {
        if (isRecord(part) && part.type === "output_text" && typeof part.text === "string") {
          text += part.text;
        }
      }
    }
    return text;
  } catch {
    return "";
  }
}

// ============================================================================
// Capability gating
// ============================================================================

/** Documented Responses support rule (swagger :7105-7107): E2EE-capable
 *  models are NOT supported on /responses. There is no `supportsResponses`
 *  model flag in the current schema, so the gate is the documented negative:
 *  a model is offered the Responses transport only when its E2EE capability
 *  is EXPLICITLY `false`. Absent metadata fails closed (the handoff requires
 *  fail-closed when metadata is absent); `supportsE2EE === true` is rejected
 *  before dispatch.
 *
 *  @param modelInfo The selected chat model's runtime metadata.
 *  @returns True only when the model is confirmed non-E2EE. */
export function modelSupportsResponsesApi(
  modelInfo:
    | {
        model_spec?: {
          supportsE2EE?: boolean;
          capabilities?: { supportsE2EE?: boolean };
        };
      }
    | undefined,
): boolean {
  const spec = modelInfo?.model_spec;
  if (!spec) return false;
  const e2ee = typeof spec.supportsE2EE === "boolean"
    ? spec.supportsE2EE
    : spec.capabilities?.supportsE2EE;
  return e2ee === false;
}
