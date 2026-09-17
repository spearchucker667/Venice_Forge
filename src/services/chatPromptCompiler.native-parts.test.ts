// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { compileChatPrompt } from "./chatPromptCompiler";
import { notify } from "./notification-service";
import type { Conversation, ConversationMessage } from "../types/conversation";
import type { ContentPart, ModelInfo } from "../types/venice";
import type { NativeContentPartRef } from "../types/chatAttachment";

function makeConversation(
  messages: Array<
    Pick<ConversationMessage, "role" | "content"> & {
      metadata?: Record<string, unknown>;
    }
  >,
): Conversation {
  return {
    id: "conv-1",
    title: "Test",
    createdAt: 1,
    updatedAt: 1,
    model: "test-model",
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

const FILE_REF: NativeContentPartRef = {
  id: "conv-1:att-1:part-1",
  type: "file",
  filename: "report.pdf",
  sizeBytes: 4,
  mimeType: "application/pdf",
};

const FILE_PART: ContentPart = {
  type: "file",
  file: { file_data: "data:application/pdf;base64,QUJD", filename: "report.pdf" },
};

describe("compileChatPrompt native content parts (FEAT-006)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("expands native part refs into the outgoing content via the resolver", () => {
    const conv = makeConversation([
      { role: "user", content: "Summarize this", metadata: { nativeParts: [FILE_REF] } },
    ]);
    const resolver = vi.fn(() => FILE_PART);

    const result = compileChatPrompt(conv, "", SMALL_MODEL, 512, true, {
      resolveNativePart: resolver,
    });

    expect(resolver).toHaveBeenCalledWith(FILE_REF);
    const parts = result.messages[0].content as ContentPart[];
    expect(parts[0]).toEqual({ type: "text", text: "Summarize this" });
    expect(parts).toContainEqual(FILE_PART);
  });

  it("omits refs the resolver cannot resolve (evicted / app restarted)", () => {
    const conv = makeConversation([
      { role: "user", content: "Summarize this", metadata: { nativeParts: [FILE_REF] } },
    ]);
    const resolver = vi.fn(() => null);

    const result = compileChatPrompt(conv, "", SMALL_MODEL, 512, true, {
      resolveNativePart: resolver,
    });

    // String content survives untouched; no empty part is fabricated.
    expect(result.messages[0].content).toBe("Summarize this");
  });

  it("keeps native parts out of the compiled output without a resolver", () => {
    const conv = makeConversation([
      { role: "user", content: "Summarize this", metadata: { nativeParts: [FILE_REF] } },
    ]);

    const result = compileChatPrompt(conv, "", SMALL_MODEL, 512);

    expect(result.messages[0].content).toBe("Summarize this");
  });

  it("does not mutate the persisted message when expanding array content", () => {
    const persisted: ContentPart[] = [
      { type: "text", text: "Look at this" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    ];
    const conv = makeConversation([
      { role: "user", content: persisted, metadata: { nativeParts: [FILE_REF] } },
    ]);
    const resolver = vi.fn(() => FILE_PART);

    const result = compileChatPrompt(conv, "", SMALL_MODEL, 512, true, {
      resolveNativePart: resolver,
    });

    const compiled = result.messages[0].content as ContentPart[];
    expect(compiled).not.toBe(persisted);
    expect(persisted).toHaveLength(2);
    expect(compiled).toHaveLength(3);
    expect(compiled[2]).toEqual(FILE_PART);
  });

  it("appends native parts after injected context without touching text parts", () => {
    const conv = makeConversation([
      {
        role: "user",
        content: "Summarize this",
        metadata: {
          injectedContext: "Earlier we discussed quarterly numbers.",
          nativeParts: [FILE_REF],
        },
      },
    ]);
    const resolver = vi.fn(() => FILE_PART);

    const result = compileChatPrompt(conv, "", SMALL_MODEL, 512, true, {
      resolveNativePart: resolver,
    });

    const parts = result.messages[0].content as ContentPart[];
    expect(parts[0].type).toBe("text");
    expect(parts[0].text).toContain("Earlier we discussed quarterly numbers.");
    expect(parts[0].text).toContain("Summarize this");
    expect(parts[parts.length - 1]).toEqual(FILE_PART);
  });

  it("expansion does not disturb safety provenance reconciliation", () => {
    const conv = makeConversation([
      {
        role: "user",
        content: "Summarize this",
        metadata: {
          nativeParts: [FILE_REF],
          safetySegments: [
            {
              kind: "attachment",
              attachmentId: "att-1",
              name: "a.txt",
              mimeType: "text/plain",
              text: '<file name="a.txt">x</file>',
              trust: "untrusted-quoted-data",
            },
          ],
        },
      },
    ]);
    const resolver = vi.fn(() => FILE_PART);
    const infoSpy = vi.spyOn(notify, "info");

    const result = compileChatPrompt(conv, "", SMALL_MODEL, 512, true, {
      resolveNativePart: resolver,
    });

    expect(result.safetyProvenance).toBeDefined();
    expect(result.safetyProvenance?.messages).toHaveLength(1);
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
