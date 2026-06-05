import { describe, it, expect } from 'vitest'
import { getNodeSchema, isInputCompatible, isIdealMatch } from './workflow-schema'

describe('workflow-schema', () => {
  it('should retrieve node schemas correctly', () => {
    const chatSchema = getNodeSchema('chat')
    expect(chatSchema).toBeDefined()
    expect(chatSchema.type).toBe('chat')
    expect(chatSchema.params.length).toBeGreaterThan(0)
    
    const outputSchema = getNodeSchema('output')
    expect(outputSchema.type).toBe('output')
  })

  it('should check input compatibility correctly', () => {
    expect(isInputCompatible('text', 'text')).toBe(true)
    expect(isInputCompatible('image', 'text')).toBe(true)
    expect(isInputCompatible('none', 'text')).toBe(false)
    expect(isInputCompatible('text', 'none')).toBe(false)
  })

  it('should determine ideal match correctly', () => {
    // any compatible output to text target is an ideal match (accepts prompt text representation etc.)
    expect(isIdealMatch('text', 'text')).toBe(true)
    expect(isIdealMatch('image', 'text')).toBe(true)
    expect(isIdealMatch('image', 'image')).toBe(true)
    expect(isIdealMatch('audio', 'video')).toBe(false)
    expect(isIdealMatch('none', 'text')).toBe(false)
  })
})
