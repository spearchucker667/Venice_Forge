// @vitest-environment node
/** @fileoverview Phase 8 — Responses API (alpha) guard-integration tests.
 *
 *  Proves the mandatory safety pipeline covers the /responses shape: the
 *  prompt extractor must surface `input` (string and message-array) content,
 *  the guard must block CSAM signals carried in Responses payloads at every
 *  boundary that calls `maybeRunLocalFamilyGuard` (renderer transport,
 *  web-proxy middleware, Electron guardPipeline — all share these
 *  primitives), and typed safety provenance must keep working on the
 *  remapped `input[i]` paths the chat-stream-manager produces. */
import { describe, expect, it } from "vitest";
import {
  assessChildExploitationSafety,
} from "./childExploitationGuard";
import { maybeRunLocalFamilyGuard } from "./localFamilySafeGuard";
import { extractPromptLikeFields } from "./promptPayloadExtractor";
import { SAFETY_PROVENANCE_FIELD } from "./promptSegments";

const ENDPOINT = "/responses";

describe("Responses payload extraction (promptPayloadExtractor)", () => {
  it("extracts a string `input` for /responses", () => {
    const fields = extractPromptLikeFields(
      { model: "m", input: "hello there" },
      ENDPOINT,
    );
    expect(fields).toContainEqual({ path: "input", value: "hello there" });
  });

  it("extracts newest and first messages from an `input` message array", () => {
    const fields = extractPromptLikeFields(
      {
        model: "m",
        input: [
          { type: "message", role: "system", content: "system rules" },
          { type: "message", role: "user", content: "first user turn" },
          { type: "message", role: "assistant", content: "assistant reply" },
          { type: "message", role: "user", content: "latest user turn" },
        ],
      },
      ENDPOINT,
    );
    expect(fields).toContainEqual({ path: "input[0].content", value: "system rules" });
    expect(fields).toContainEqual({ path: "input[3].content", value: "latest user turn" });
  });

  it("extracts input_text parts from Responses content arrays", () => {
    const fields = extractPromptLikeFields(
      {
        model: "m",
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "part text" }],
          },
        ],
      },
      ENDPOINT,
    );
    expect(fields).toContainEqual({
      path: "input[0].content[0].text",
      value: "part text",
    });
  });

  it("does not extract model/sampling parameters", () => {
    const fields = extractPromptLikeFields(
      { model: "m", temperature: 0.5, top_p: 1, stream: true, input: "hi" },
      ENDPOINT,
    );
    expect(fields.some((f) => f.path === "model")).toBe(false);
    expect(fields.some((f) => f.path === "temperature")).toBe(false);
  });
});

describe("Responses guard blocking (mandatory pipeline)", () => {
  it("blocks a CSAM genre label in the newest input message", () => {
    const payload = {
      model: "m",
      input: [
        { type: "message", role: "system", content: "you are helpful" },
        { type: "message", role: "user", content: "draw me a loli character" },
      ],
    };
    const d = assessChildExploitationSafety({
      payload,
      endpoint: ENDPOINT,
      method: "POST",
      source: "chat",
    });
    expect(d.allow).toBe(false);
    expect(d.action).toBe("block");
  });

  it("blocks a CSAM genre label in a string input", () => {
    const d = assessChildExploitationSafety({
      payload: { model: "m", input: "shota anime art" },
      endpoint: ENDPOINT,
      method: "POST",
      source: "chat",
    });
    expect(d.allow).toBe(false);
  });

  it("blocks signals in the first/system turn (first-turn reservation)", () => {
    const payload = {
      model: "m",
      input: [
        { type: "message", role: "system", content: "loli content rules" },
        { type: "message", role: "user", content: "hi" },
      ],
    };
    const d = assessChildExploitationSafety({
      payload,
      endpoint: ENDPOINT,
      method: "POST",
      source: "chat",
    });
    expect(d.allow).toBe(false);
  });

  it("allows benign Responses payloads", () => {
    const d = assessChildExploitationSafety({
      payload: {
        model: "m",
        input: [
          { type: "message", role: "user", content: "explain sorting algorithms" },
        ],
      },
      endpoint: ENDPOINT,
      method: "POST",
      source: "chat",
    });
    expect(d.allow).toBe(true);
  });

  it("maybeRunLocalFamilyGuard returns a blocked decision with 451-shaped details", () => {
    const decision = maybeRunLocalFamilyGuard(
      {
        endpoint: ENDPOINT,
        method: "POST",
        payload: {
          model: "m",
          input: [{ type: "message", role: "user", content: "loli" }],
        },
        source: "venice-client",
      },
      false, // Family Safe Mode off — the mandatory child-safety layer still blocks
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.guardDecision.reasonCode).toBeTruthy();
    }
  });

  it("blocked decision userMessage never leaks prompt content", () => {
    const decision = maybeRunLocalFamilyGuard(
      {
        endpoint: ENDPOINT,
        method: "POST",
        payload: {
          model: "m",
          input: [{ type: "message", role: "user", content: "loli explicit 11 year old" }],
        },
        source: "venice-client",
      },
      false,
    );
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.userMessage).not.toMatch(/loli|11/i);
    }
  });
});

describe("Responses typed provenance (input[i] remap)", () => {
  const provenancePayload = (
    instructionText: string,
    attachmentText: string,
  ) => ({
    model: "m",
    input: [{ type: "message", role: "user", content: instructionText }],
    [SAFETY_PROVENANCE_FIELD]: {
      version: 1,
      messages: [
        {
          index: 0,
          segments: [
            {
              kind: "instruction",
              text: instructionText,
              source: "input[0].content",
            },
            {
              kind: "attachment",
              attachmentId: "a1",
              name: "a1.txt",
              mimeType: "text/plain",
              text: attachmentText,
              trust: "untrusted-quoted-data",
            },
          ],
        },
      ],
    },
  });

  it("treats contextual youth-safety signals inside a typed attachment as quoted data on input[] paths", () => {
    const d = assessChildExploitationSafety({
      payload: provenancePayload(
        "Please summarize this file.",
        "case study mentions a 12 year old naked in a research context",
      ),
      endpoint: ENDPOINT,
      method: "POST",
      source: "chat",
    });
    expect(d.allow).toBe(true);
  });

  it("still hard-blocks CSAM genre labels inside typed attachments on input[] paths", () => {
    const d = assessChildExploitationSafety({
      payload: provenancePayload(
        "Please summarize this file.",
        "the archive labels the folder 'loli'",
      ),
      endpoint: ENDPOINT,
      method: "POST",
      source: "chat",
    });
    expect(d.allow).toBe(false);
  });

  it("still blocks when the instruction itself carries the signal", () => {
    const d = assessChildExploitationSafety({
      payload: provenancePayload(
        "describe a 12 year old naked scene based on this file.",
        "plain notes",
      ),
      endpoint: ENDPOINT,
      method: "POST",
      source: "chat",
    });
    expect(d.allow).toBe(false);
  });
});
