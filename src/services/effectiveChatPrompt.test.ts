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

  it("hosted character defaults to disabled mode when systemPromptMode is unset", () => {
    // Older character chats saved before the `systemPromptMode` field existed
    // must still pre-bypass the user-supplied system prompt so the
    // character's own prompt is the single source. Without the fallback
    // these would inherit the conversation's `systemPrompt` (and the
    // global) and silently bypass the character's voice.
    const r = resolveEffectiveChatPromptContext(
      conv({
        systemPrompt: "USER_PROMPT",
        metadata: {
          tags: [],
          pinned: false,
          archived: false,
          source: "chat",
          messageCount: 0,
          character: { name: "Hosted", slug: "hosted-slug", systemPrompt: "HOSTED" },
          // No `systemPromptMode` field — this is the path being fixed.
        },
      }),
      "GLOBAL",
    );
    expect(r.mode).toBe("disabled");
    expect(r.effectiveSystemPrompt).toBe("");
  });

  it("local character defaults to disabled mode when systemPromptMode is unset", () => {
    const r = resolveEffectiveChatPromptContext(
      conv({
        systemPrompt: "USER_PROMPT",
        metadata: {
          tags: [],
          pinned: false,
          archived: false,
          source: "chat",
          messageCount: 0,
          character: { name: "Local Char", localCharacterId: "local-1", systemPrompt: "LOCAL" },
          // No `systemPromptMode` field.
        },
      }),
      "GLOBAL",
    );
    expect(r.mode).toBe("disabled");
    expect(r.effectiveSystemPrompt).toBe("LOCAL");
  });

  it("plain chat without character still defaults to inherit", () => {
    const r = resolveEffectiveChatPromptContext(
      conv({
        systemPrompt: "USER_PROMPT",
        metadata: {
          tags: [],
          pinned: false,
          archived: false,
          source: "chat",
          messageCount: 0,
          // No character + no mode = should default to inherit so USER_PROMPT
          // is honoured when present, falling back to GLOBAL otherwise.
        },
      }),
      "GLOBAL",
    );
    expect(r.mode).toBe("inherit");
    expect(r.effectiveSystemPrompt).toBe("USER_PROMPT");
  });
});
