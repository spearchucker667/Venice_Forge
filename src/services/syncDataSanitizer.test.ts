import { describe, expect, it } from 'vitest'
import { sanitizePortableData } from './syncDataSanitizer'

describe('sanitizePortableData', () => {
  it('recursively excludes secrets and machine-local sync paths', () => {
    expect(sanitizePortableData({ id: 'a', apiKey: 'secret', nested: { bearerToken: 'secret', title: 'safe' }, syncFolder: '/private' })).toEqual({ id: 'a', nested: { title: 'safe' } })
  })
})
