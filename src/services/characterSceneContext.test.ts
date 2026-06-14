import { describe, it, expect } from 'vitest';
import { extractCharacterSceneContext, DEFAULT_SCENE_CONTEXT_MAX_MESSAGES, DEFAULT_SCENE_CONTEXT_MAX_CHARS } from './characterSceneContext';
import type { ConversationMessage } from '../types/conversation';

function makeMessage(overrides: Partial<ConversationMessage>): ConversationMessage {
  return {
    id: 'm',
    role: 'user',
    content: '',
    timestamp: Date.now(),
    ...overrides,
  } as ConversationMessage;
}

describe('extractCharacterSceneContext', () => {
  it('throws when character slug is missing', () => {
    expect(() =>
      extractCharacterSceneContext({
        conversationId: 'conv-1',
        messages: [],
        character: null,
      }),
    ).toThrow('Character slug is required');
  });

  it('uses only visible user and assistant text', () => {
    const result = extractCharacterSceneContext({
      conversationId: 'conv-1',
      messages: [
        makeMessage({ id: 'm1', role: 'user', content: 'We are having a sunset picnic.' }),
        makeMessage({ id: 'm2', role: 'assistant', content: 'The meadow is full of wildflowers.' }),
        makeMessage({ id: 'm3', role: 'system', content: 'You are helpful.' }),
        makeMessage({ id: 'm4', role: 'tool', content: '{"result": 42}' }),
      ],
      character: { slug: 'picnic-bot', name: 'Picnic Bot' },
    });
    expect(result.visibleContext).toContain('sunset picnic');
    expect(result.visibleContext).toContain('wildflowers');
    expect(result.visibleContext).not.toContain('You are helpful');
    expect(result.visibleContext).not.toContain('result');
    expect(result.sourceMessageIds).toEqual(['m1', 'm2']);
  });

  it('excludes hidden injectedContext from user messages', () => {
    const result = extractCharacterSceneContext({
      conversationId: 'conv-1',
      messages: [
        makeMessage({
          id: 'm1',
          role: 'user',
          content: 'What do you see?',
          metadata: { injectedContext: 'SECRET MEMORY ABOUT CYBERPUNK CITY' },
        }),
        makeMessage({ id: 'm2', role: 'assistant', content: 'A peaceful meadow.' }),
      ],
      character: { slug: 'picnic-bot', name: 'Picnic Bot' },
    });
    expect(result.visibleContext).toContain('What do you see?');
    expect(result.visibleContext).toContain('peaceful meadow');
    expect(result.visibleContext).not.toContain('SECRET MEMORY');
    expect(result.visibleContext).not.toContain('CYBERPUNK');
  });

  it('extracts text from ContentPart[] and ignores image data URLs', () => {
    const result = extractCharacterSceneContext({
      conversationId: 'conv-1',
      messages: [
        makeMessage({
          id: 'm1',
          role: 'user',
          content: [
            { type: 'text', text: 'Look at this sunset.' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,ABC123' } },
          ],
        }),
      ],
      character: { slug: 'picnic-bot', name: 'Picnic Bot' },
    });
    expect(result.visibleContext).toContain('Look at this sunset');
    expect(result.visibleContext).not.toContain('ABC123');
  });

  it('prefers the selected message window', () => {
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMessage({ id: `m${i}`, role: i % 2 === 0 ? 'user' : 'assistant', content: `Message ${i}` }),
    );
    const result = extractCharacterSceneContext({
      conversationId: 'conv-1',
      activeMessageId: 'm10',
      messages,
      character: { slug: 'picnic-bot', name: 'Picnic Bot' },
      maxMessages: 6,
    });
    expect(result.selectedTurnText).toContain('Message 10');
    expect(result.sourceMessageIds).toHaveLength(6);
    expect(result.sourceMessageIds).toContain('m10');
  });

  it('caps visible context to maxChars', () => {
    const longMessage = 'word '.repeat(2000);
    const result = extractCharacterSceneContext({
      conversationId: 'conv-1',
      messages: [makeMessage({ id: 'm1', role: 'user', content: longMessage })],
      character: { slug: 'picnic-bot', name: 'Picnic Bot' },
      maxChars: 100,
    });
    expect(result.visibleContext.length).toBeLessThanOrEqual(100);
  });

  it('exports default limits', () => {
    expect(DEFAULT_SCENE_CONTEXT_MAX_MESSAGES).toBe(12);
    expect(DEFAULT_SCENE_CONTEXT_MAX_CHARS).toBe(6000);
  });
});
