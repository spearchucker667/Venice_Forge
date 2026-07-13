import { describe, expect, it } from 'vitest'
import { normalizeAudioRetrieveResponse } from './audio-retrieve-normalizer'

describe('normalizeAudioRetrieveResponse', () => {
  it('normalizes processing JSON', () => {
    expect(normalizeAudioRetrieveResponse({ status: 'PROCESSING', average_execution_time: 100, execution_duration: 25 })).toEqual({
      kind: 'processing', progressRatio: 0.25, averageExecutionTimeMs: 100, executionDurationMs: 25,
    })
  })

  it.each(['audio/mpeg', 'audio/wav', 'audio/flac'] as const)('normalizes %s binary content', (mimeType) => {
    expect(normalizeAudioRetrieveResponse({ dataBase64: 'AQID' }, { 'content-type': mimeType })).toEqual({ kind: 'completed', dataBase64: 'AQID', mimeType })
  })

  it('rejects empty and wrong MIME responses', () => {
    expect(normalizeAudioRetrieveResponse({ dataBase64: '' }, { 'content-type': 'audio/mpeg' }).kind).toBe('failed')
    expect(normalizeAudioRetrieveResponse({ dataBase64: 'AQID' }, { 'content-type': 'text/plain' }).kind).toBe('failed')
  })
})
