import { describe, expect, it } from 'vitest'
import { normalizeProgressRatio, normalizeVideoRetrieveResult } from './video-retrieve-normalizer'

describe('normalizeVideoRetrieveResult', () => {
  it('normalizes uppercase processing status and provider timing', () => {
    expect(normalizeVideoRetrieveResult({
      status: 'PROCESSING',
      average_execution_time: 200_000,
      execution_duration: 50_000,
    })).toEqual({
      kind: 'processing',
      progressRatio: 0.25,
      averageExecutionTimeMs: 200_000,
      executionDurationMs: 50_000,
    })
  })

  it('accepts web data URLs and Electron base64 video bodies', () => {
    expect(normalizeVideoRetrieveResult({ dataUrl: 'data:video/mp4;base64,AAAA' })).toEqual({
      kind: 'completed',
      mediaUrl: 'data:video/mp4;base64,AAAA',
      mimeType: 'video/mp4',
    })
    expect(normalizeVideoRetrieveResult(
      { dataBase64: 'BBBB' },
      { 'content-type': 'video/mp4; charset=binary' },
    )).toEqual({
      kind: 'completed',
      mediaUrl: 'data:video/mp4;base64,BBBB',
      mimeType: 'video/mp4',
    })
  })

  it('accepts lowercase legacy responses and rejects incomplete completion bodies', () => {
    expect(normalizeVideoRetrieveResult({ status: 'processing', progress: 50 })).toMatchObject({
      kind: 'processing',
      progressRatio: 0.5,
    })
    expect(normalizeVideoRetrieveResult({ status: 'COMPLETED' })).toEqual({
      kind: 'failed',
      error: 'Video completed without a playable video response.',
    })
  })

  it('clamps progress to the canonical ratio range', () => {
    expect(normalizeProgressRatio(-20)).toBe(0)
    expect(normalizeProgressRatio(0.5)).toBe(0.5)
    expect(normalizeProgressRatio(50)).toBe(0.5)
    expect(normalizeProgressRatio(5000)).toBe(1)
  })
})
