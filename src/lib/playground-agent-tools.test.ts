import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAgentTools, RunStep } from './playground-agent-tools'
import { venice } from './venice-client'

vi.mock('./venice-client', () => ({
  venice: vi.fn(),
}))

describe('playground-agent-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should run tools successfully until Done is called', async () => {
    // Return tool calls in the first response, and then done in the second (or in same turn)
    vi.mocked(venice).mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'add_node',
                arguments: JSON.stringify({ node_type: 'textInput', id: 'in', params: { inputText: 'hello' } }),
              },
            },
            {
              id: 'call-2',
              type: 'function',
              function: {
                name: 'done',
                arguments: JSON.stringify({ summary: 'Created an input node.' }),
              },
            }
          ]
        },
        finish_reason: 'tool_calls'
      }]
    })

    const applyPatch = vi.fn().mockReturnValue({ ok: true, id: 'in' })
    const steps: RunStep[] = []
    const onStep = (step: RunStep) => {
      steps.push(step)
    }

    const res = await runAgentTools({
      userMessage: 'Create input',
      draft: { nodes: [], edges: [] },
      history: [],
      model: 'qwen3-next-80b',
      applyPatch,
      onStep,
    })

    expect(res.say).toBe('Created an input node.')
    expect(res.tool_calls).toBe(2)
    expect(res.asked_user).toBe(false)
    expect(applyPatch).toHaveBeenCalledWith({
      op: 'add_node',
      nodeType: 'textInput',
      id: 'in',
      params: { inputText: 'hello' }
    })
    expect(steps.length).toBe(2)
    expect(steps[0].tool).toBe('add_node')
    expect(steps[1].tool).toBe('done')
  })

  it('should handle pick_model tool correctly', async () => {
    vi.mocked(venice).mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'pick_model',
                arguments: JSON.stringify({ node_type: 'chat', prefer: 'fast' }),
              },
            },
            {
              id: 'call-2',
              type: 'function',
              function: {
                name: 'done',
                arguments: JSON.stringify({ summary: 'Finished' }),
              },
            }
          ]
        },
        finish_reason: 'tool_calls'
      }]
    })

    const applyPatch = vi.fn()
    const steps: RunStep[] = []
    const onStep = (step: RunStep) => {
      steps.push(step)
    }

    const catalog = {
      text: ['qwen3-next-80b'],
      image: [],
      tts: [],
      music: [],
      video: [],
    }

    const agentModels: Array<{
      id: string;
      name: string;
      tier: number;
      recommended: boolean;
      uncensored: boolean;
      traits: Array<'default' | 'most_intelligent' | 'most_uncensored' | 'function_calling_default' | 'default_reasoning' | 'default_code' | 'default_vision'>;
      reasoning: boolean;
      capabilities: { supportsReasoning: boolean; supportsResponseSchema: boolean; supportsWebSearch: boolean };
    }> = [
      {
        id: 'qwen3-next-80b',
        name: 'Qwen3',
        tier: 0,
        recommended: true,
        uncensored: false,
        traits: ['function_calling_default'],
        reasoning: false,
        capabilities: { supportsReasoning: false, supportsResponseSchema: true, supportsWebSearch: false },
      }
    ]

    await runAgentTools({
      userMessage: 'recommend model',
      draft: { nodes: [], edges: [] },
      history: [],
      model: 'qwen3-next-80b',
      catalog,
      agentModels,
      applyPatch,
      onStep,
    })

    expect(steps[0].tool).toBe('pick_model')
    expect(steps[0].result).toEqual({ ok: true, model: 'qwen3-next-80b' })
  })

  it('should reject unknown model in add_node', async () => {
    vi.mocked(venice).mockResolvedValueOnce({
      choices: [{
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'add_node',
                arguments: JSON.stringify({ node_type: 'chat', id: 'llm', params: { model: 'nonexistent-model' } }),
              },
            },
            {
              id: 'call-2',
              type: 'function',
              function: {
                name: 'done',
                arguments: JSON.stringify({ summary: 'Failed' }),
              },
            }
          ]
        },
        finish_reason: 'tool_calls'
      }]
    })

    const applyPatch = vi.fn()
    const steps: RunStep[] = []
    const onStep = (step: RunStep) => {
      steps.push(step)
    }

    const catalog = {
      text: ['qwen3-next-80b'],
      image: [],
      tts: [],
      music: [],
      video: [],
    }

    await runAgentTools({
      userMessage: 'add chat node',
      draft: { nodes: [], edges: [] },
      history: [],
      model: 'qwen3-next-80b',
      catalog,
      applyPatch,
      onStep,
    })

    expect(steps[0].result.error).toBeDefined()
    expect(steps[0].result.error).toContain("Unknown model 'nonexistent-model'")
  })
})
