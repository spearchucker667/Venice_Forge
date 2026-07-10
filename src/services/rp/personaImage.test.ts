import { describe, expect, it } from 'vitest'
import { MAX_PERSONA_IMAGE_BYTES, normalizePersonaImage } from './personaService'

describe('persona image validation', () => {
  it('accepts a bounded supported image', () => expect(normalizePersonaImage({ mimeType: 'image/png', data: 'YQ==', byteLength: 1 })).toEqual({ mimeType: 'image/png', data: 'YQ==', byteLength: 1 }))
  it('rejects invalid MIME and oversized images', () => {
    expect(normalizePersonaImage({ mimeType: 'image/svg+xml', data: 'YQ==', byteLength: 1 })).toBeUndefined()
    expect(normalizePersonaImage({ mimeType: 'image/png', data: 'YQ==', byteLength: MAX_PERSONA_IMAGE_BYTES + 1 })).toBeUndefined()
  })
})
