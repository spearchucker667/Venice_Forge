/** @fileoverview Current-conversation-only scene context extractor for character chats. */

import type { ConversationMessage } from '../types/conversation';
import type { ContentPart } from '../types/venice';

export interface CharacterSceneContextInput {
  conversationId: string;
  activeMessageId?: string;
  messages: Array<Pick<ConversationMessage, 'id' | 'role' | 'content' | 'metadata' | 'timestamp'>>;
  character?: {
    slug?: string;
    name?: string;
    description?: string;
    visualDescription?: string;
    avatarUrl?: string;
  } | null;
  maxMessages?: number;
  maxChars?: number;
}

export interface CharacterSceneContext {
  conversationId: string;
  characterSlug: string;
  characterName?: string;
  visibleContext: string;
  selectedTurnText?: string;
  sourceMessageIds: string[];
}

export const DEFAULT_SCENE_CONTEXT_MAX_MESSAGES = 12;
export const DEFAULT_SCENE_CONTEXT_MAX_CHARS = 6000;

type SceneMessage = {
  id?: string;
  role: 'user' | 'assistant';
  text: string;
};

export function extractCharacterSceneContext(input: CharacterSceneContextInput): CharacterSceneContext {
  const {
    conversationId,
    activeMessageId,
    messages,
    character,
    maxMessages = DEFAULT_SCENE_CONTEXT_MAX_MESSAGES,
    maxChars = DEFAULT_SCENE_CONTEXT_MAX_CHARS,
  } = input;

  const characterSlug = character?.slug?.trim();
  if (!characterSlug) {
    throw new Error('Character slug is required for scene context extraction');
  }

  const visible: SceneMessage[] = messages
    .filter((m): m is typeof m & { role: 'user' | 'assistant' } => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      id: m.id,
      role: m.role,
      text: messageContentToText(m.content, m.metadata),
    }))
    .filter((m) => m.text.trim().length > 0);

  let selectedIndex = visible.findIndex((m) => m.id === activeMessageId);
  if (selectedIndex === -1) {
    selectedIndex = visible.length - 1;
  }

  const halfWindow = Math.floor(maxMessages / 2);
  const start = Math.max(0, selectedIndex - halfWindow);
  const window = visible.slice(start, start + maxMessages);

  const lines = window.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`);
  let contextText = lines.join('\n');

  if (contextText.length > maxChars) {
    contextText = contextText.slice(0, maxChars);
    const lastBreak = contextText.lastIndexOf('\n');
    if (lastBreak > maxChars * 0.8) {
      contextText = contextText.slice(0, lastBreak);
    }
  }

  return {
    conversationId,
    characterSlug,
    characterName: character?.name,
    visibleContext: contextText.trim(),
    selectedTurnText: activeMessageId ? visible[selectedIndex]?.text.trim() : undefined,
    sourceMessageIds: window.map((m) => m.id).filter((id): id is string => typeof id === 'string'),
  };
}

function messageContentToText(
  content: string | ContentPart[] | undefined,
  _metadata?: Record<string, unknown>,
): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  const text = content
    .filter((part): part is ContentPart & { type: 'text' } => part.type === 'text')
    .map((part) => part.text ?? '')
    .join(' ')
    .trim();
  // Deliberately ignore metadata.injectedContext; visible message text only.
  return text;
}
