/** @fileoverview Converts bounded character-scene context into a concise image prompt. */

import type { CharacterSceneContext } from './characterSceneContext';
import type { CharacterSceneGenerationSource, CompiledCharacterScenePrompt } from '../types/characterSceneGeneration';

const MAX_PROMPT_LENGTH = 2000;

export function compileCharacterScenePrompt(
  context: CharacterSceneContext,
  source: CharacterSceneGenerationSource,
): CompiledCharacterScenePrompt {
  const parts: string[] = [];

  if (context.characterName?.trim()) {
    parts.push(`Character: ${context.characterName.trim()}.`);
  }

  if (context.visibleContext?.trim()) {
    parts.push(`Scene context: ${context.visibleContext.trim()}`);
  }

  const base = 'A cinematic scene, coherent composition, subject/environment alignment, high detail.';
  let prompt = [base, ...parts].join(' ').trim();

  if (prompt.length > MAX_PROMPT_LENGTH) {
    prompt = prompt.slice(0, MAX_PROMPT_LENGTH);
    const lastPeriod = prompt.lastIndexOf('.');
    if (lastPeriod > MAX_PROMPT_LENGTH * 0.8) {
      prompt = prompt.slice(0, lastPeriod + 1);
    }
  }

  return {
    prompt,
    source,
    sourceMessageIds: context.sourceMessageIds,
  };
}
