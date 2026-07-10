import { describe, expect, it } from 'vitest'
import type { CharacterCardV1 } from '../types/rp'
import {
  compileCharacterEditorPrompt,
  estimateTokenCount,
  getCharacterTokenBudget,
  RP_MODEL_CONTEXT_LIMIT,
  RP_RESERVED_OUTPUT_TOKENS,
} from './rpTokenCounter'

const card: CharacterCardV1 = {
  schema: 'CharacterCardV1', id: 'alice', name: 'Alice', description: 'Detective', systemPrompt: 'Stay in character',
  instructions: 'Be concise', scenario: 'A rainy city', firstMessage: 'Hello', tags: [], adult: false, exampleDialogues: [], createdAt: 1, updatedAt: 1,
}

// VERIFY-078 regression guard — RP token counter fallback is labeled "Estimated tokens"
// and the budget math (context limit minus output reserve) is correct.
describe('RP token counting', () => {
  it('counts the same compiled character representation as the request builder', () => {
    expect(compileCharacterEditorPrompt(card)).toContain('[Creator instructions]\nBe concise')
    expect(getCharacterTokenBudget(card).compiled.count).toBe(Math.ceil(compileCharacterEditorPrompt(card).length / 4))
  })

  it('labels the fallback count as an estimate', () => {
    expect(getCharacterTokenBudget(card).compiled).toMatchObject({ method: 'approximation', isEstimate: true })
  })

  it('estimateTokenCount returns 0 for empty text and never returns 0 for non-empty text', () => {
    expect(estimateTokenCount('')).toMatchObject({ count: 0, isEstimate: true, method: 'approximation' })
    expect(estimateTokenCount('a')).toMatchObject({ count: 1, isEstimate: true, method: 'approximation' })
  })

  it('compiled prompt includes scenario, first message, and context files', () => {
    const prompt = compileCharacterEditorPrompt({
      ...card,
      scenario: 'A rainy city',
      firstMessage: 'Hello there',
      contextFiles: [{ id: 'f1', name: 'notes.txt', content: 'Some notes', size: 10 }],
    })
    expect(prompt).toContain('[Scenario]\nA rainy city')
    expect(prompt).toContain('[First message]\nHello there')
    expect(prompt).toContain('[Context: notes.txt]\nSome notes')
  })

  it('reports a healthy budget for a small card', () => {
    const budget = getCharacterTokenBudget(card)
    expect(budget.contextLimit).toBe(RP_MODEL_CONTEXT_LIMIT)
    expect(budget.reservedOutputTokens).toBe(RP_RESERVED_OUTPUT_TOKENS)
    expect(budget.inputBudget).toBe(RP_MODEL_CONTEXT_LIMIT - RP_RESERVED_OUTPUT_TOKENS)
    expect(budget.overLimit).toBe(false)
    expect(budget.remainingInputTokens).toBeGreaterThan(0)
  })

  it('reports overLimit when the compiled prompt exceeds the input budget', () => {
    const bigDescription = 'x'.repeat(130_000)
    const overloaded: CharacterCardV1 = { ...card, description: bigDescription }
    const budget = getCharacterTokenBudget(overloaded)
    expect(budget.overLimit).toBe(true)
    expect(budget.remainingInputTokens).toBeLessThan(0)
    expect(budget.compiled.isEstimate).toBe(true)
  })
})
