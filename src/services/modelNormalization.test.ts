/**
 * Cross-layer regression: raw Venice `/models` records must surface their real
 * context window through normalization → canonical cache → budget engine.
 * Guards against the "context locked at 8,192 regardless of model" defect.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  getCanonicalModelById,
  mergeCanonicalModels,
  replaceCanonicalModels,
} from "./modelCatalogCache";
import { flattenModels, normalizeModelInfo } from "./modelClassification";
import {
  calculateChatContextBudget,
  computeAttachmentTextAllowance,
} from "./chatContextBudget";
import { compileChatPrompt } from "./chatPromptCompiler";
import type { Conversation } from "../types/conversation";

/** Shape captured from the live Venice /models?type=text response. */
const RAW_GLM_5 = {
  id: "zai-org-glm-5",
  object: "model",
  created: 1,
  owned_by: "zai",
  type: "text",
  context_length: 198_000,
  model_spec: {
    name: "GLM 5",
    availableContextTokens: 198_000,
    maxCompletionTokens: 64_000,
    capabilities: { supportsVision: true },
  },
};

const RAW_CONTEXT_LENGTH_ONLY = {
  id: "context-length-only",
  object: "model",
  created: 1,
  owned_by: "x",
  type: "llm",
  context_length: 1_000_000,
};

describe("model normalization (cross-layer)", () => {
  beforeEach(() => replaceCanonicalModels([]));

  it("normalizeModelInfo maps availableContextTokens/maxCompletionTokens and snake_case fallbacks", () => {
    const a = normalizeModelInfo(RAW_GLM_5);
    expect(a.contextLength).toBe(198_000);
    expect(a.maxOutputTokens).toBe(64_000);

    const b = normalizeModelInfo(RAW_CONTEXT_LENGTH_ONLY);
    expect(b.contextLength).toBe(1_000_000);
    expect(b.type).toBe("llm"); // explicit provider type preserved
  });

  it("mergeCanonicalModels stores normalized records (useModels('text') path)", () => {
    // Raw records as delivered by use-models.ts (no flattenModels on this path).
    mergeCanonicalModels("text", [RAW_GLM_5 as never]);
    const cached = getCanonicalModelById("zai-org-glm-5");
    expect(cached?.contextLength).toBe(198_000);
    expect(cached?.maxOutputTokens).toBe(64_000);
  });

  it("budget engine uses the real window, not the 8,192 fallback", () => {
    mergeCanonicalModels("text", [RAW_GLM_5 as never]);
    const modelInfo = getCanonicalModelById("zai-org-glm-5");

    // ~40k tokens of history fits a 198k window but would overflow 8,192.
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: "user" as const,
      content: `question ${i} ` + "x".repeat(1600),
    }));
    const budget = calculateChatContextBudget(
      [...history, { role: "assistant", content: "y".repeat(6400) }],
      "",
      modelInfo,
      512,
    );
    expect(budget.contextLimit).toBe(198_000);
    expect(budget.remainingInputBudget).toBeGreaterThan(0);
  });

  it("compileChatPrompt keeps full history for a 1M model that would truncate at 8,192", () => {
    mergeCanonicalModels("text", [RAW_CONTEXT_LENGTH_ONLY as never]);
    const modelInfo = getCanonicalModelById("context-length-only");

    const turns = Array.from({ length: 30 }, (_, i) => [
      { role: "user" as const, content: `q${i} ` + "x".repeat(900) },
      { role: "assistant" as const, content: `a${i} ` + "y".repeat(2700) },
    ]).flat();
    const conv = {
      id: "c1",
      title: "t",
      createdAt: 1,
      updatedAt: 1,
      model: "context-length-only",
      messages: turns.map((m, i) => ({ id: `m${i}`, timestamp: i, ...m })),
    } as Conversation;

    const result = compileChatPrompt(conv, "", modelInfo, 512);
    // ~30 turns ≈ 27k tokens: kept whole on a 1M window.
    expect(result.messages.length).toBe(turns.length);
  });

  it("flattenModels output is normalized per record", () => {
    const grouped = flattenModels({ data: [RAW_GLM_5, RAW_CONTEXT_LENGTH_ONLY] });
    const all = Object.values(grouped).flat();
    expect(all.find((m) => m.id === "zai-org-glm-5")?.contextLength).toBe(198_000);
    expect(all.find((m) => m.id === "context-length-only")?.contextLength).toBe(1_000_000);
  });
});

describe("computeAttachmentTextAllowance", () => {
  it("scales with the selected model's remaining window", () => {
    const base = {
      maxTokens: 512,
      systemPrompt: "",
      messages: [],
      userMessage: "hi",
    };
    const small = computeAttachmentTextAllowance({
      ...base,
      modelInfo: { id: "small", contextLength: 8_192, maxOutputTokens: 4_096 } as never,
    });
    const large = computeAttachmentTextAllowance({
      ...base,
      modelInfo: { id: "large", contextLength: 1_000_000, maxOutputTokens: 64_000 } as never,
    });
    expect(small.mode).toBe("tokens");
    expect(large.mode).toBe("tokens");
    expect(large.allowanceTokens).toBeGreaterThan(small.allowanceTokens * 50);
  });

  it("reserves space for history, system prompt, memory context, and margin", () => {
    const allowance = computeAttachmentTextAllowance({
      modelInfo: { id: "m", contextLength: 8_192, maxOutputTokens: 4_096 } as never,
      maxTokens: 1_024,
      systemPrompt: "s".repeat(4000), // ~1000 tokens
      messages: [{ role: "user", content: "x".repeat(8000) }], // ~2000 tokens
      userMessage: "y".repeat(400), // ~100 tokens
      injectedContext: "z".repeat(1600), // ~400 tokens
    });
    // 8192 - 1024 - 200 - 1000 - 2000 - 100 - 400 - 512 = 2956
    expect(allowance.allowanceTokens).toBeGreaterThan(2500);
    expect(allowance.allowanceTokens).toBeLessThan(3200);
  });

  it("falls back to the legacy byte ceiling when context length is unknown", () => {
    const allowance = computeAttachmentTextAllowance({
      modelInfo: { id: "unknown" } as never,
      maxTokens: 512,
      systemPrompt: "",
      messages: [],
      userMessage: "hi",
    });
    expect(allowance.mode).toBe("bytes");
    expect(allowance.allowanceBytes).toBe(1024 * 1024);
  });
});
