import { describe, expect, it } from 'vitest'
import { parseSSEStream } from './stream'

describe('parseSSEStream', () => {
  it('parses stream of Uint8Array correctly', async () => {
    const encoder = new TextEncoder()
    const chunks = [
      'data: {"id": "1", "choices": [{"delta": {"content": "Hello"}}]}\n\n',
      'data: {"id": "2", "choices": [{"delta": {"content": " World"}}]}\n\n',
      'data: [DONE]\n\n'
    ]

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      }
    })

    const results = []
    for await (const result of parseSSEStream(stream)) {
      results.push(result)
    }

    expect(results).toHaveLength(2)
    expect(results[0].choices[0].delta.content).toBe('Hello')
    expect(results[1].choices[0].delta.content).toBe(' World')
  })

  it('parses fallback SSE string correctly without getReader errors', async () => {
    const sseString = 
      'data: {"id": "1", "choices": [{"delta": {"content": "Fallback"}}]}\n\n' +
      'data: {"id": "2", "choices": [{"delta": {"content": " Text"}}]}\n\n' +
      'data: [DONE]\n\n'

    const results = []
    for await (const result of parseSSEStream(sseString)) {
      results.push(result)
    }

    expect(results).toHaveLength(2)
    expect(results[0].choices[0].delta.content).toBe('Fallback')
    expect(results[1].choices[0].delta.content).toBe(' Text')
  })

  it('ignores comments and empty lines', async () => {
    const sseString = 
      ': this is a comment\n' +
      'data: {"id": "1", "choices": [{"delta": {"content": "Data"}}]}\n\n'

    const results = []
    for await (const result of parseSSEStream(sseString)) {
      results.push(result)
    }

    expect(results).toHaveLength(1)
    expect(results[0].choices[0].delta.content).toBe('Data')
  })

  it('tolerates malformed JSON', async () => {
    const sseString = 
      'data: {invalid json}\n\n' +
      'data: {"id": "1", "choices": [{"delta": {"content": "Valid"}}]}\n\n'

    const results = []
    for await (const result of parseSSEStream(sseString)) {
      results.push(result)
    }

    expect(results).toHaveLength(1)
    expect(results[0].choices[0].delta.content).toBe('Valid')
  })

  it('respects AbortSignal for string input', async () => {
    const sseString = 
      'data: {"id": "1", "choices": [{"delta": {"content": "One"}}]}\n\n' +
      'data: {"id": "2", "choices": [{"delta": {"content": "Two"}}]}\n\n'

    const controller = new AbortController()
    
    const generator = parseSSEStream(sseString, { signal: controller.signal })
    
    const first = await generator.next()
    expect(first.done).toBe(false)
    expect(first.value?.choices[0].delta.content).toBe('One')

    controller.abort()

    const second = await generator.next()
    expect(second.done).toBe(true)
  })

  it('respects AbortSignal for stream input', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id": "1", "choices": [{"delta": {"content": "One"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"id": "2", "choices": [{"delta": {"content": "Two"}}]}\n\n'))
        controller.close()
      }
    })

    const controller = new AbortController()
    const generator = parseSSEStream(stream, { signal: controller.signal })

    const first = await generator.next()
    expect(first.done).toBe(false)
    expect(first.value?.choices[0].delta.content).toBe('One')

    controller.abort()

    const second = await generator.next()
    expect(second.done).toBe(true)
  })
})
