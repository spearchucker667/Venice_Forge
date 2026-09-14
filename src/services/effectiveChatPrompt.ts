import type { Conversation } from "../types/conversation";

export type SystemPromptMode = "inherit" | "override" | "disabled";

export interface EffectiveChatPromptContext {
  mode: SystemPromptMode;
  effectiveSystemPrompt: string;
  hostedCharacter: boolean;
  characterPromptTokensHint: string | undefined;
}

/**
 * Single source of truth for "which system prompt applies to this chat?".
 * Used by the prompt compiler, attachment admission, and the context meter.
 */
export function resolveEffectiveChatPromptContext(
  conversation: Pick<Conversation, "systemPrompt" | "metadata">,
  globalSystemPrompt: string,
): EffectiveChatPromptContext {
  const mode = (conversation.metadata?.systemPromptMode ??
    "inherit") as SystemPromptMode;
  const characterSystemPrompt = conversation.metadata?.character?.systemPrompt;
  const hostedCharacter = !!conversation.metadata?.character?.slug;
  const systemSegments: string[] = [];

  if (mode === "override") {
    if (conversation.systemPrompt) {
      systemSegments.push(conversation.systemPrompt.trim());
    }
  } else if (mode === "inherit") {
    if (conversation.metadata?.character) {
      if (conversation.systemPrompt) {
        systemSegments.push(conversation.systemPrompt.trim());
      } else if (characterSystemPrompt) {
        systemSegments.push(characterSystemPrompt.trim());
      }
    } else if (conversation.systemPrompt) {
      systemSegments.push(conversation.systemPrompt.trim());
    } else if (globalSystemPrompt) {
      systemSegments.push(globalSystemPrompt.trim());
    }
  }
  // mode === "disabled" → no user system prompt segments

  return {
    mode,
    effectiveSystemPrompt: systemSegments.filter(Boolean).join("\n\n"),
    hostedCharacter,
    characterPromptTokensHint: characterSystemPrompt,
  };
}
