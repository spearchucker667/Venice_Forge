import { describe, it, expect } from 'vitest';
import { compileCharacterScenePrompt } from './characterScenePromptCompiler';
import type { CharacterSceneContext } from './characterSceneContext';

describe('compileCharacterScenePrompt', () => {
  it('builds a cinematic prompt from character and visible context', () => {
    const context: CharacterSceneContext = {
      conversationId: 'conv-1',
      characterSlug: 'picnic-bot',
      characterName: 'Picnic Bot',
      visibleContext: 'User: We are having a sunset picnic.\nAssistant: The meadow is full of wildflowers.',
      sourceMessageIds: ['m1', 'm2'],
    };
    const result = compileCharacterScenePrompt(context, 'on_demand');
    expect(result.prompt).toContain('cinematic');
    expect(result.prompt).toContain('Picnic Bot');
    expect(result.prompt).toContain('sunset picnic');
    expect(result.prompt).toContain('wildflowers');
    expect(result.source).toBe('on_demand');
    expect(result.sourceMessageIds).toEqual(['m1', 'm2']);
  });

  it('works without a character name', () => {
    const context: CharacterSceneContext = {
      conversationId: 'conv-1',
      characterSlug: 'picnic-bot',
      visibleContext: 'User: Sunset.',
      sourceMessageIds: ['m1'],
    };
    const result = compileCharacterScenePrompt(context, 'automatic');
    expect(result.prompt).toContain('cinematic');
    expect(result.prompt).toContain('Sunset');
    expect(result.source).toBe('automatic');
  });
});
