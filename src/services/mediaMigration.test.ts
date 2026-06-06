import { describe, expect, it } from 'vitest'

import {
  isMigrated,
  migrateAll,
  migrateGalleryImageToMediaItem
} from './mediaMigration'
import { MEDIA_ITEM_VERSION } from '../types/media'
import type { MediaItem } from '../types/media'

describe('mediaMigration', () => {
  it('upgrades a legacy GalleryImage to MediaItem with sensible defaults', () => {
    const legacy = {
      id: 'abc',
      image: 'data:image/png;base64,XYZ',
      prompt: 'a copper city',
      model: 'flux-dev',
      width: '1024',
      height: 1024,
      timestamp: 1700000000000,
    }
    const out = migrateGalleryImageToMediaItem(legacy) as MediaItem
    expect(out.mediaItemVersion).toBe(MEDIA_ITEM_VERSION)
    expect(out.mediaType).toBe('image')
    expect(out.operation).toBe('generate')
    expect(out.parentId).toBeNull()
    expect(out.childrenIds).toEqual([])
    expect(out.tags).toEqual([])
    expect(out.note).toBe('')
    expect(out.favorite).toBe(false)
    expect(out.viewCount).toBe(0)
    // Dimensions are normalised to numbers when possible
    expect(out.width).toBe(1024)
    expect(out.height).toBe(1024)
  })

  it('preserves legacy `upscaled: true` as operation: upscale', () => {
    const out = migrateGalleryImageToMediaItem({
      id: 'u',
      image: 'x',
      prompt: 'p',
      model: 'm',
      timestamp: 1,
      upscaled: true,
    })
    expect(out.operation).toBe('upscale')
  })

  it('infers video-generate for legacy records with mediaType: video', () => {
    const out = migrateGalleryImageToMediaItem({
      id: 'v',
      image: 'x',
      prompt: 'p',
      model: 'wan-2.6',
      timestamp: 1,
      mediaType: 'video',
    })
    expect(out.mediaType).toBe('video')
    expect(out.operation).toBe('video-generate')
  })

  it('is idempotent — re-migrating a MediaItem yields equivalent shape', () => {
    const once = migrateGalleryImageToMediaItem({
      id: 'a',
      image: 'x',
      prompt: 'p',
      model: 'm',
      timestamp: 1,
      mediaType: 'image',
      operation: 'edit',
      parentId: 'root',
      tags: ['Hero', 'hero', ' city '],
      note: 'hello',
      favorite: true,
      viewCount: 4,
    })
    const twice = migrateGalleryImageToMediaItem(once)
    expect(twice).toEqual(once)
    expect(twice.tags).toEqual(['hero', 'city'])
    expect(isMigrated(twice)).toBe(true)
  })

  it('drops invalid tag entries (non-strings, empty, >32 chars)', () => {
    const out = migrateGalleryImageToMediaItem({
      id: 't',
      image: 'x',
      prompt: 'p',
      model: 'm',
      timestamp: 1,
      tags: ['valid', '', '   ', 7, 'a'.repeat(40), 'trim me'],
    })
    expect(out.tags).toEqual(['valid', 'trim me'])
  })

  it('coerces corrupt dimensions to undefined instead of NaN', () => {
    const out = migrateGalleryImageToMediaItem({
      id: 'd',
      image: 'x',
      prompt: 'p',
      model: 'm',
      timestamp: 1,
      width: 'not-a-number',
      height: '',
    })
    expect(out.width).toBeUndefined()
    expect(out.height).toBeUndefined()
  })

  it('handles null and non-object input without throwing', () => {
    expect(migrateGalleryImageToMediaItem(null).id).toBe('')
    expect(migrateGalleryImageToMediaItem(undefined).id).toBe('')
    expect(migrateGalleryImageToMediaItem('not-an-object').id).toBe('')
  })

  it('migrateAll drops null entries and migrates the rest', () => {
    const out = migrateAll([
      null,
      { id: '1', image: 'x', prompt: 'p', model: 'm', timestamp: 1 },
      undefined,
      { id: '2', image: 'y', prompt: 'p', model: 'm', timestamp: 2 },
    ])
    expect(out.map((r) => r.id)).toEqual(['1', '2'])
    expect(out.every((r) => r.mediaItemVersion === MEDIA_ITEM_VERSION)).toBe(true)
  })

  it('isMigrated returns false for legacy records', () => {
    expect(isMigrated({ id: 'a', image: 'x', prompt: 'p', model: 'm', timestamp: 1 })).toBe(false)
    expect(isMigrated({ id: 'a', image: 'x', prompt: 'p', model: 'm', timestamp: 1, mediaItemVersion: 1 })).toBe(true)
  })
})
