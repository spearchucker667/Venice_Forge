/** @fileoverview VERIFY-082 — Scene reference planner entity detection,
 *  omission reasons, and user removal. */

import { describe, expect, it } from 'vitest'
import { buildSceneReferencePlan, hashReferenceContent, type SceneReferenceEntity } from './sceneReferencePlanner'

const validPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='
const validWebp = 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA'

const entities: SceneReferenceEntity[] = [
  { type: 'character', id: 'alice', name: 'Alice', image: { mimeType: 'image/png', data: validPng } },
  { type: 'persona', id: 'bob', name: 'Bob Stone', aliases: ['Detective Stone'], image: { mimeType: 'image/webp', data: validWebp } },
  { type: 'persona', id: 'bo', name: 'Bo' },
]

describe('buildSceneReferencePlan', () => {
  it('includes only mentioned entities using word boundaries and aliases', () => {
    const plan = buildSceneReferencePlan({ sceneDescription: 'Alice meets Detective Stone.', entities, modelSupportsReferences: true, referenceLimit: 2 })
    expect(plan.references.map((reference) => reference.entityId)).toEqual(['alice', 'bob'])
    expect(plan.references[0]!.data).toBe(validPng)
    expect(plan.references[1]!.mimeType).toBe('image/webp')
    expect(plan.omitted).toContainEqual({ entityId: 'bo', reason: 'not-mentioned' })
  })

  it('surfaces unsupported models and reference limits', () => {
    expect(buildSceneReferencePlan({ sceneDescription: 'Alice', entities, modelSupportsReferences: false, referenceLimit: 1 }).omitted).toContainEqual({ entityId: 'alice', reason: 'model-unsupported' })
    expect(buildSceneReferencePlan({ sceneDescription: 'Alice and Bob Stone', entities, modelSupportsReferences: true, referenceLimit: 1 }).omitted).toContainEqual({ entityId: 'bob', reason: 'reference-limit' })
  })

  it('lets the user remove a suggested reference', () => {
    expect(buildSceneReferencePlan({ sceneDescription: 'Alice', entities, modelSupportsReferences: true, referenceLimit: 2, removedEntityIds: ['alice'] }).references).toEqual([])
  })

  it('omits entities without a valid image', () => {
    const noImage: SceneReferenceEntity = { type: 'character', id: 'carol', name: 'Carol' }
    const badImage: SceneReferenceEntity = { type: 'character', id: 'dave', name: 'Dave', image: { mimeType: 'image/png', data: '!!!' } }
    const plan = buildSceneReferencePlan({ sceneDescription: 'Carol and Dave', entities: [noImage, badImage], modelSupportsReferences: true, referenceLimit: 2 })
    expect(plan.omitted).toContainEqual({ entityId: 'carol', reason: 'no-image' })
    expect(plan.omitted).toContainEqual({ entityId: 'dave', reason: 'unsafe-or-invalid' })
  })

  it('respects a zero reference limit', () => {
    const plan = buildSceneReferencePlan({ sceneDescription: 'Alice', entities, modelSupportsReferences: true, referenceLimit: 0 })
    expect(plan.references).toEqual([])
    expect(plan.omitted).toContainEqual({ entityId: 'alice', reason: 'reference-limit' })
  })

  it('computes a deterministic content hash when one is absent', () => {
    const entity: SceneReferenceEntity = { type: 'character', id: 'alice', name: 'Alice', image: { mimeType: 'image/png', data: validPng } }
    const plan = buildSceneReferencePlan({ sceneDescription: 'Alice', entities: [entity], modelSupportsReferences: true, referenceLimit: 2 })
    expect(plan.references[0]!.contentHash).toBe(hashReferenceContent(validPng, 'image/png'))
  })
})

describe('hashReferenceContent', () => {
  it('produces deterministic hex hashes', () => {
    expect(hashReferenceContent('a', 'image/png')).toBe(hashReferenceContent('a', 'image/png'))
    expect(hashReferenceContent('a', 'image/png')).not.toBe(hashReferenceContent('b', 'image/png'))
  })
})
