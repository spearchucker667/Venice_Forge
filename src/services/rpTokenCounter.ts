import type { CharacterCardV1 } from '../types/rp'
import { buildCharactersBlock } from './rp/promptBuilderService'

export interface TokenCounter {
  countText(text: string, modelId?: string): Promise<TokenCountResult>
}

export interface TokenCountResult {
  count: number
  method: 'provider-tokenizer' | 'model-tokenizer' | 'approximation'
  modelId?: string
  isEstimate: boolean
}

export const RP_MODEL_CONTEXT_LIMIT = 32_000
export const RP_RESERVED_OUTPUT_TOKENS = 4_096

export function estimateTokenCount(text: string, modelId?: string): TokenCountResult {
  return {
    count: text.length === 0 ? 0 : Math.max(1, Math.ceil(text.length / 4)),
    method: 'approximation',
    modelId,
    isEstimate: true,
  }
}

export const fallbackTokenCounter: TokenCounter = {
  async countText(text, modelId) {
    return estimateTokenCount(text, modelId)
  },
}

export function compileCharacterEditorPrompt(card: CharacterCardV1): string {
  return [
    card.systemPrompt?.trim() ? `[System prompt]\n${card.systemPrompt.trim()}` : '',
    buildCharactersBlock([card]),
    card.scenario?.trim() ? `[Scenario]\n${card.scenario.trim()}` : '',
    card.firstMessage?.trim() ? `[First message]\n${card.firstMessage.trim()}` : '',
    card.postHistoryInstructions?.trim() ? `[Post-history instructions]\n${card.postHistoryInstructions.trim()}` : '',
    card.rawExampleDialogue?.trim() ? `[Raw examples]\n${card.rawExampleDialogue.trim()}` : '',
    ...(card.contextFiles ?? []).map((file) => `[Context: ${file.name}]\n${file.content}`),
  ].filter(Boolean).join('\n\n')
}

export function getCharacterTokenBudget(card: CharacterCardV1) {
  const rawText = [card.description, card.instructions, card.systemPrompt, card.scenario, card.firstMessage,
    ...card.exampleDialogues.flatMap((dialogue) => [dialogue.speaker, dialogue.text]),
    ...(card.contextFiles ?? []).map((file) => file.content),
  ].filter(Boolean).join('\n')
  const raw = estimateTokenCount(rawText, card.modelId)
  const compiled = estimateTokenCount(compileCharacterEditorPrompt(card), card.modelId)
  const inputBudget = RP_MODEL_CONTEXT_LIMIT - RP_RESERVED_OUTPUT_TOKENS
  return {
    raw,
    compiled,
    contextLimit: RP_MODEL_CONTEXT_LIMIT,
    reservedOutputTokens: RP_RESERVED_OUTPUT_TOKENS,
    inputBudget,
    remainingInputTokens: inputBudget - compiled.count,
    overLimit: compiled.count > inputBudget,
  }
}

export class CharacterValidationError extends Error {
  readonly code = "TOKEN_BUDGET_EXCEEDED" as const;
  constructor(message: string) {
    super(message);
    this.name = "CharacterValidationError";
  }
}

export function validateCharacterForPersistence(
  card: CharacterCardV1,
): { ok: true } | { ok: false; message: string } {
  const budget = getCharacterTokenBudget(card);
  if (budget.overLimit) {
    return {
      ok: false,
      message: `Character exceeds the supported context budget by ${Math.abs(budget.remainingInputTokens).toLocaleString()} estimated tokens.`,
    };
  }
  return { ok: true };
}
