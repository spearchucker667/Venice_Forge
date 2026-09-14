// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { compileChatPrompt } from "./chatPromptCompiler";
import { notify } from "./notification-service";
import type { Conversation, ConversationMessage } from "../types/conversation";
import type { ContentPart, ModelInfo } from "../types/venice";

function makeConversation(
  messages: Array<Pick<ConversationMessage, "role" | "content">>,
  systemPrompt?: string,
): Conversation {
  return {
    id: "conv-1",
    title: "Test",
    createdAt: 1,
    updatedAt: 1,
    model: "test-model",
    systemPrompt,
    messages: messages.map((m, i) => ({
      id: `m${i}`,
      timestamp: i + 1,
      ...m,
    })) as ConversationMessage[],
  };
}

const SMALL_MODEL: ModelInfo = {
  id: "small",
  contextLength: 8192,
  maxOutputTokens: 4096,
};

describe("compileChatPrompt context truncation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("truncates an oversized newest message instead of throwing", () => {
    const infoSpy = vi.spyOn(notify, "info");
    const hugeText = "word ".repeat(9000); // ~11k estimated tokens
    const conv = makeConversation([{ role: "user", content: hugeText }]);

    const result = compileChatPrompt(conv, "", SMALL_MODEL, 512);

    expect(result.messages).toHaveLength(1);
    const content = result.messages[0].content as string;
    expect(content.length).toBeLessThan(hugeText.length);
    expect(content).toContain("truncated to fit the context window");
    expect(infoSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it("does not mutate the persisted conversation message (array content)", () => {
    const parts: ContentPart[] = [
      { type: "text", text: "word ".repeat(9000) },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    ];
    const conv = makeConversation([{ role: "user", content: parts }]);
    const originalText = parts[0].text as string;

    const result = compileChatPrompt(conv, "", SMALL_MODEL, 512);

    expect(parts[0].text).toBe(originalText);
    const compiledParts = result.messages[0].content as ContentPart[];
    expect(compiledParts).not.toBe(parts);
    const textPart = compiledParts.find((p) => p.type === "text");
    expect((textPart?.text ?? "").length).toBeLessThan(originalText.length);
    expect(textPart?.text).toContain("truncated to fit the context window");
    expect(compiledParts.find((p) => p.type === "image_url")).toEqual(parts[1]);
  });

  it("drops oldest turns first when history exceeds the budget", () => {
    const turns = Array.from({ length: 12 }, (_, i) => [
      { role: "user" as const, content: `question ${i} ` + "x".repeat(900) },
      { role: "assistant" as const, content: `answer ${i} ` + "y".repeat(2700) },
    ]).flat();
    const conv = makeConversation(turns);

    const result = compileChatPrompt(conv, "", SMALL_MODEL, 512);

    // Oldest turns removed; newest exchange survives, provider order valid.
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages.length).toBeLessThan(turns.length);
    const first = result.messages.find((m) => m.role !== "system");
    expect(first?.role).toBe("user");
    const last = result.messages[result.messages.length - 1];
    expect(last.role).toBe("assistant");
  });

  it("still throws when even an empty request cannot fit (system prompt alone overflows)", () => {
    const errorSpy = vi.spyOn(notify, "error");
    const conv = makeConversation(
      [{ role: "user", content: "hi" }],
      "s".repeat(60_000), // ~15k tokens of system prompt alone
    );

    expect(() => compileChatPrompt(conv, "", SMALL_MODEL, 512)).toThrow(
      /Context budget exceeded/,
    );
    expect(errorSpy).toHaveBeenCalled();
    // System prompt is never modified or dropped.
    expect(result_systemPrompt(conv)).toBe("s".repeat(60_000));
  });
});

function result_systemPrompt(conv: Conversation): string | undefined {
  return conv.systemPrompt;
}
