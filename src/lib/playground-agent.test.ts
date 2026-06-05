import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseAgentResponse, callAgent, DEFAULT_AGENT_MODEL } from './playground-agent'
import { venice } from './venice-client'

vi.mock('./venice-client', () => ({
  venice: vi.fn(),
}))

describe('playground-agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseAgentResponse', () => {
    it('should parse valid JSON response', () => {
      const raw = '{"say": "Hello!", "patches": [{"op": "clear"}]}'
      const parsed = parseAgentResponse(raw)
      expect(parsed.say).toBe('Hello!')
      expect(parsed.patches.length).toBe(1)
      expect(parsed.patches[0].op).toBe('clear')
      expect(parsed.invalidPatches).toBe(0)
    })

    it('should strip markdown fences and parse', () => {
      const raw = '```json\n{"say": "Fenced", "patches": []}\n```'
      const parsed = parseAgentResponse(raw)
      expect(parsed.say).toBe('Fenced')
      expect(parsed.patches.length).toBe(0)
    })

    it('should validate and filter invalid patches', () => {
      const raw = '{"say": "Filtered", "patches": [{"op": "invalid_op"}, {"op": "clear"}]}'
      const parsed = parseAgentResponse(raw)
      expect(parsed.say).toBe('Filtered')
      expect(parsed.patches.length).toBe(1)
      expect(parsed.patches[0].op).toBe('clear')
      expect(parsed.invalidPatches).toBe(1)
    })

    it('should sanitize parameters based on node schemas', () => {
      const raw = '{"say": "Sanitised", "patches": [{"op": "add_node", "nodeType": "chat", "params": {"prompt": "hi", "invalid_param": 123}}]}'
      const parsed = parseAgentResponse(raw)
      const patch = parsed.patches[0]
      expect(patch.op).toBe('add_node')
      if (patch.op === 'add_node') {
        expect(patch.params).toHaveProperty('prompt')
        expect(patch.params).not.toHaveProperty('invalid_param')
      }
    })
  })

  describe('callAgent', () => {
    it('should construct message array and call singleCall', async () => {
      vi.mocked(venice).mockResolvedValue({
        choices: [{ message: { content: '{"say": "Hi", "patches": []}' } }]
      })

      const draft = { nodes: [], edges: [] }
      const history: Array<{ role: 'user' | 'assistant'; content: string }> = []
      
      const res = await callAgent({
        userMessage: 'Make a simple chat pipeline',
        draft,
        history,
      })

      expect(res.say).toBe('Hi')
      expect(venice).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(DEFAULT_AGENT_MODEL)
      }))
    })
  })
})
