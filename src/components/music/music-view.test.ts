import { describe, expect, it } from 'vitest'
import { getMusicModelConfig } from './music-view'
import type { ModelInfo } from '../../types/venice'

describe('music model duration capabilities', () => {
  // VERIFY-143: the UI may only offer durations accepted by the selected
  // music model, preferring live /models metadata over fallbacks.
  it('uses the discrete ACE-Step duration enum instead of offering invalid 30-second requests', () => {
    const config = getMusicModelConfig('ace-step-15')
    expect(config.durationOptions).toEqual([60, 90, 120, 150, 180, 210])
    expect(config.defaultDuration).toBe(60)
    expect(config.durationOptions).not.toContain(30)
  })

  it('prefers live model duration metadata over fallback assumptions', () => {
    const model = {
      id: 'live-music',
      model_spec: {
        duration_options: [120, 60, 90],
        min_duration: 60,
        max_duration: 120,
        default_duration: 90,
        supports_lyrics: true,
      },
    } satisfies ModelInfo
    const config = getMusicModelConfig(model.id, model)
    expect(config.durationOptions).toEqual([60, 90, 120])
    expect(config.defaultDuration).toBe(90)
    expect(config.lyrics).toBe(true)
  })
})
