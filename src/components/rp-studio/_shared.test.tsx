import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { avatarDataUri } from './_shared'

describe('avatarDataUri', () => {
  it('returns undefined for missing avatar', () => {
    expect(avatarDataUri(undefined)).toBeUndefined()
  })

  it('rejects file: URLs', () => {
    expect(avatarDataUri({ data: 'file:///etc/passwd', mimeType: 'image/png' })).toBeUndefined()
  })

  it('rejects http: URLs', () => {
    expect(avatarDataUri({ data: 'http://example.com/avatar.png', mimeType: 'image/png' })).toBeUndefined()
  })

  it('rejects https: URLs', () => {
    expect(avatarDataUri({ data: 'https://example.com/avatar.png', mimeType: 'image/png' })).toBeUndefined()
  })

  it('rejects javascript: and blob: URLs', () => {
    expect(avatarDataUri({ data: 'javascript:alert(1)', mimeType: 'image/png' })).toBeUndefined()
    expect(avatarDataUri({ data: 'blob:http://example.com/abc', mimeType: 'image/png' })).toBeUndefined()
  })

  it('accepts a valid PNG data URI', () => {
    const uri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    expect(avatarDataUri({ data: uri, mimeType: 'image/png' })).toBe(uri)
  })

  it('accepts a valid JPEG data URI', () => {
    const uri = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2NjIpLCBxdWFsaXR5ID0gOTUK/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8AAEQgAAgACAAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAgIEBAQMAwUFBQAABJ0BAAIRAxIhBDFBE1FhBiJxgZGh8BQyscHR4fEVI0JSYnKiFtLxJDM0Q1NzgpOjs8PT/9oADAMBAAIRAxEAPwD5/ooooA//2Q=='
    expect(avatarDataUri({ data: uri, mimeType: 'image/jpeg' })).toBe(uri)
  })

  it('accepts a valid WebP data URI', () => {
    const uri = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'
    expect(avatarDataUri({ data: uri, mimeType: 'image/webp' })).toBe(uri)
  })

  it('rejects a data URI with a non-image MIME type', () => {
    expect(
      avatarDataUri({ data: 'data:text/html;base64,PGh0bWw+PC9odG1sPg==', mimeType: 'image/png' }),
    ).toBeUndefined()
  })

  it('wraps raw base64 with the provided safe MIME type', () => {
    expect(avatarDataUri({ data: 'AAAA', mimeType: 'image/png' })).toBe('data:image/png;base64,AAAA')
    expect(avatarDataUri({ data: 'AAAA', mimeType: 'image/jpeg' })).toBe('data:image/jpeg;base64,AAAA')
    expect(avatarDataUri({ data: 'AAAA', mimeType: 'image/webp' })).toBe('data:image/webp;base64,AAAA')
  })

  it('falls back to image/png for an unrecognised MIME type', () => {
    expect(avatarDataUri({ data: 'AAAA', mimeType: 'image/gif' })).toBe('data:image/png;base64,AAAA')
  })

  it('returns undefined for raw text that is not base64', () => {
    expect(avatarDataUri({ data: 'not base64!', mimeType: 'image/png' })).toBeUndefined()
  })
})
