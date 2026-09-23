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
  // Hosted (and local) character chats pre-bypass the user system prompt
  // by default so the character's own prompt is the single source. New
  // conversations created in chat-store.ts set
  // `metadata.systemPromptMode = "disabled"` explicitly; this fallback
  // also covers older conversations saved before that field existed. The
  // test covers both `slug` (hosted) and `localCharacterId` (local) ids.
  const hasCharacter = Boolean(
    conversation.metadata?.character?.slug ||
      conversation.metadata?.character?.localCharacterId,
  );
  const hostedCharacter = Boolean(conversation.metadata?.character?.slug);
  const mode = (conversation.metadata?.systemPromptMode ??
    (hasCharacter ? "disabled" : "inherit")) as SystemPromptMode;
  const characterSystemPrompt = conversation.metadata?.character?.systemPrompt;
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
  } else if (mode === "disabled") {
    // User-supplied system prompt is bypassed.
    // For local characters, the character's compiled system prompt defines
    // the character voice and must still be sent (Venice does not host it).
    if (characterSystemPrompt && !hostedCharacter) {
      systemSegments.push(characterSystemPrompt.trim());
    }
  }

  return {
    mode,
    effectiveSystemPrompt: systemSegments.filter(Boolean).join("\n\n"),
    hostedCharacter,
    characterPromptTokensHint: characterSystemPrompt,
  };
}
