import { describe, it, expect } from "vitest";
import { resolveEffectiveChatPromptContext } from "./effectiveChatPrompt";
import type { Conversation } from "../types/conversation";

function conv(
  partial: Partial<Conversation> & { metadata?: Conversation["metadata"] },
): Pick<Conversation, "systemPrompt" | "metadata"> {
  return {
    systemPrompt: partial.systemPrompt,
    metadata: partial.metadata,
  };
}

describe("resolveEffectiveChatPromptContext (VF-CUR-P2-001)", () => {
  it("inherit + standard uses global prompt", () => {
    const r = resolveEffectiveChatPromptContext(
      conv({ metadata: { tags: [], pinned: false, archived: false, source: "chat", messageCount: 0, systemPromptMode: "inherit" } }),
      "GLOBAL_PROMPT",
    );
    expect(r.effectiveSystemPrompt).toBe("GLOBAL_PROMPT");
    expect(r.hostedCharacter).toBe(false);
  });

  it("override uses conversation prompt", () => {
    const r = resolveEffectiveChatPromptContext(
      conv({
        systemPrompt: "CONV_OVERRIDE",
        metadata: { tags: [], pinned: false, archived: false, source: "chat", messageCount: 0, systemPromptMode: "override" },
      }),
      "GLOBAL_PROMPT",
    );
    expect(r.effectiveSystemPrompt).toBe("CONV_OVERRIDE");
  });

  it("disabled yields empty system prompt", () => {
    const r = resolveEffectiveChatPromptContext(
      conv({
        systemPrompt: "IGNORED",
        metadata: { tags: [], pinned: false, archived: false, source: "chat", messageCount: 0, systemPromptMode: "disabled" },
      }),
      "GLOBAL_PROMPT",
    );
    expect(r.effectiveSystemPrompt).toBe("");
  });

  it("inherit + local character uses character prompt", () => {
    const r = resolveEffectiveChatPromptContext(
      conv({
        metadata: {
          tags: [],
          pinned: false,
          archived: false,
          source: "chat",
          messageCount: 0,
          systemPromptMode: "inherit",
          character: { name: "Ada", systemPrompt: "CHAR_PROMPT" },
        },
      }),
      "GLOBAL_PROMPT",
    );
    expect(r.effectiveSystemPrompt).toBe("CHAR_PROMPT");
    expect(r.hostedCharacter).toBe(false);
  });

  it("hosted character marks hostedCharacter", () => {
    const r = resolveEffectiveChatPromptContext(
      conv({
        metadata: {
          tags: [],
          pinned: false,
          archived: false,
          source: "chat",
          messageCount: 0,
          systemPromptMode: "inherit",
          character: { name: "Hosted", slug: "hosted-slug", systemPrompt: "HOSTED" },
        },
      }),
      "GLOBAL",
    );
    expect(r.hostedCharacter).toBe(true);
    expect(r.effectiveSystemPrompt).toBe("HOSTED");
  });
});
