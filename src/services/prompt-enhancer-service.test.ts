/** @fileoverview Tests for the internal prompt-enhancer LLM service. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/venice-client", () => ({
  venice: vi.fn(),
}));

import { venice } from "../lib/venice-client";
import {
  DEFAULT_ENHANCER_MODEL,
  DEFAULT_ENHANCE_SYSTEM_PROMPT,
  DEFAULT_REMIX_SYSTEM_PROMPT,
  PromptEnhancerDisabledError,
  enhancePrompt,
  remixPrompt,
  stripEnhancerOutput,
} from "./prompt-enhancer-service";

const mockedVenice = vi.mocked(venice);

beforeEach(() => {
  mockedVenice.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("stripEnhancerOutput", () => {
  it("removes leading/trailing markdown fences", () => {
    expect(stripEnhancerOutput("```\nhello world\n```")).toBe("hello world");
    expect(stripEnhancerOutput("```txt\nhello world\n```")).toBe("hello world");
  });

  it("strips surrounding double and single quotes", () => {
    expect(stripEnhancerOutput('"hello world"')).toBe("hello world");
    expect(stripEnhancerOutput("'hello world'")).toBe("hello world");
  });

  it("strips trailing dash separators", () => {
    expect(stripEnhancerOutput("hello world\n---")).toBe("hello world");
  });

  it("strips a leading 'Here is your enhanced prompt:' prefix", () => {
    expect(stripEnhancerOutput("Here is your enhanced prompt: hello")).toBe("hello");
    expect(stripEnhancerOutput("Sure, here is a remix: hello")).toBe("hello");
  });
});

describe("default safety posture", () => {
  it("default system prompts do not contain 'ZERO CENSORSHIP' / 'no refusals' / safety-bypass framing", () => {
    expect(DEFAULT_ENHANCE_SYSTEM_PROMPT).not.toMatch(/ZERO CENSORSHIP/i);
    expect(DEFAULT_ENHANCE_SYSTEM_PROMPT).not.toMatch(/No refusals?/i);
    expect(DEFAULT_ENHANCE_SYSTEM_PROMPT).not.toMatch(/bypass safety/i);
    expect(DEFAULT_ENHANCE_SYSTEM_PROMPT).not.toMatch(/ignore.*(policy|safety|guard)/i);
    expect(DEFAULT_REMIX_SYSTEM_PROMPT).not.toMatch(/ZERO CENSORSHIP/i);
    expect(DEFAULT_REMIX_SYSTEM_PROMPT).not.toMatch(/No refusals?/i);
    expect(DEFAULT_REMIX_SYSTEM_PROMPT).not.toMatch(/bypass safety/i);
    expect(DEFAULT_REMIX_SYSTEM_PROMPT).not.toMatch(/ignore.*(policy|safety|guard)/i);
  });

  it("default system prompts affirm that safety guard is authoritative", () => {
    expect(DEFAULT_ENHANCE_SYSTEM_PROMPT).toMatch(/safety guard/i);
    expect(DEFAULT_REMIX_SYSTEM_PROMPT).toMatch(/safety guard/i);
  });
});

describe("enhancePrompt routing", () => {
  it("calls venice /chat/completions (never raw fetch)", async () => {
    mockedVenice.mockResolvedValueOnce({
      choices: [{ message: { content: "A vivid improved prompt." } }],
    });
    await enhancePrompt({ mode: "enhance", prompt: "a cat" });
    expect(mockedVenice).toHaveBeenCalledTimes(1);
    const [path, opts] = mockedVenice.mock.calls[0];
    expect(path).toBe("/chat/completions");
    expect(opts?.method).toBe("POST");
  });

  it("uses the configured model, temperature, and max_tokens", async () => {
    mockedVenice.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" } }],
    });
    await enhancePrompt(
      { mode: "enhance", prompt: "x" },
      {
        enabled: true,
        model: "custom-model-1",
        temperature: 0.9,
        maxTokens: 250,
        systemPrompt: "",
        remixSystemPrompt: "",
      },
    );
    const body = mockedVenice.mock.calls[0][1]?.body as Record<string, unknown>;
    expect(body.model).toBe("custom-model-1");
    expect(body.temperature).toBe(0.9);
    expect(body.max_tokens).toBe(250);
  });

  it("clamps temperature and maxTokens to safe ranges", async () => {
    mockedVenice.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" } }],
    });
    await enhancePrompt(
      { mode: "enhance", prompt: "x" },
      {
        enabled: true,
        model: "m",
        temperature: 99,
        maxTokens: 99999,
        systemPrompt: "",
        remixSystemPrompt: "",
      },
    );
    const body = mockedVenice.mock.calls[0][1]?.body as Record<string, unknown>;
    expect(body.temperature).toBeLessThanOrEqual(2);
    expect(body.max_tokens).toBeLessThanOrEqual(4000);
  });

  it("uses the configured system prompt when provided", async () => {
    mockedVenice.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" } }],
    });
    const custom = "Custom system instruction. Be terse.";
    await enhancePrompt(
      { mode: "enhance", prompt: "x" },
      {
        enabled: true,
        model: "m",
        temperature: 0.5,
        maxTokens: 100,
        systemPrompt: custom,
        remixSystemPrompt: "",
      },
    );
    const body = mockedVenice.mock.calls[0][1]?.body as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe(custom);
  });

  it("falls back to the default enhance system prompt when config is missing", async () => {
    mockedVenice.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" } }],
    });
    await enhancePrompt({ mode: "enhance", prompt: "x" });
    const body = mockedVenice.mock.calls[0][1]?.body as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toBe(DEFAULT_ENHANCE_SYSTEM_PROMPT);
  });

  it("throws PromptEnhancerDisabledError when enabled is false", async () => {
    await expect(
      enhancePrompt(
        { mode: "enhance", prompt: "x" },
        {
          enabled: false,
          model: "m",
          temperature: 0.4,
          maxTokens: 100,
          systemPrompt: "",
          remixSystemPrompt: "",
        },
      ),
    ).rejects.toBeInstanceOf(PromptEnhancerDisabledError);
    expect(mockedVenice).not.toHaveBeenCalled();
  });

  it("defaults to the canonical Venice model id when model is missing", async () => {
    mockedVenice.mockResolvedValueOnce({
      choices: [{ message: { content: "ok" } }],
    });
    await enhancePrompt({ mode: "enhance", prompt: "x" });
    const body = mockedVenice.mock.calls[0][1]?.body as Record<string, unknown>;
    expect(body.model).toBe(DEFAULT_ENHANCER_MODEL);
  });
});

describe("enhancePrompt output handling", () => {
  it("strips markdown fences from the LLM response", async () => {
    mockedVenice.mockResolvedValueOnce({
      choices: [{ message: { content: "```\nA vivid improved prompt.\n```" } }],
    });
    const result = await enhancePrompt({ mode: "enhance", prompt: "cat" });
    expect(result.prompt).toBe("A vivid improved prompt.");
  });

  it("falls back to the original prompt when output is empty after stripping", async () => {
    mockedVenice.mockResolvedValueOnce({
      choices: [{ message: { content: "```\n```" } }],
    });
    const result = await enhancePrompt({ mode: "enhance", prompt: "cat" });
    expect(result.prompt).toBe("cat");
  });

  it("falls back to the original prompt when the LLM returns no content", async () => {
    mockedVenice.mockResolvedValueOnce({ choices: [] });
    const result = await enhancePrompt({ mode: "enhance", prompt: "cat" });
    expect(result.prompt).toBe("cat");
  });
});

describe("remixPrompt routing", () => {
  it("uses the configured remix system prompt", async () => {
    mockedVenice.mockResolvedValueOnce({
      choices: [{ message: { content: "remixed" } }],
    });
    const custom = "Custom remix instruction.";
    await remixPrompt(
      { mode: "remix", prompt: "x" },
      {
        enabled: true,
        model: "m",
        temperature: 0.4,
        maxTokens: 100,
        systemPrompt: "",
        remixSystemPrompt: custom,
      },
    );
    const body = mockedVenice.mock.calls[0][1]?.body as Record<string, unknown>;
    const messages = body.messages as Array<{ role: string; content: string }>;
    expect(messages[0].content).toBe(custom);
  });

  it("throws PromptEnhancerDisabledError when disabled", async () => {
    await expect(
      remixPrompt(
        { mode: "remix", prompt: "x" },
        {
          enabled: false,
          model: "m",
          temperature: 0.4,
          maxTokens: 100,
          systemPrompt: "",
          remixSystemPrompt: "",
        },
      ),
    ).rejects.toBeInstanceOf(PromptEnhancerDisabledError);
  });
});
