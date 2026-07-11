import { describe, expect, it } from 'vitest'
import { sanitizePortableData } from './syncDataSanitizer'

describe('sanitizePortableData', () => {
  it('recursively excludes secrets and machine-local sync paths', () => {
    expect(sanitizePortableData({
      id: 'a',
      apiKey: 'secret',
      nested: { bearerToken: 'secret', title: 'safe', source: '/Users/alice/private/file.txt' },
      syncFolder: '/private',
    })).toEqual({ id: 'a', nested: { title: 'safe', source: '[redacted-local-path]' } })
  })
})
