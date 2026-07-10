/** @fileoverview VERIFY-083 — Build SceneReferenceEntity[] from local
 *  character cards and personas. */

import { describe, expect, it } from 'vitest'
import { buildSceneReferenceEntities } from './sceneReferenceResolver'
import type { CharacterCardV1, UserPersonaV1 } from '../types/rp'

const validPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

describe('buildSceneReferenceEntities', () => {
  it('maps character avatars and persona images to entities', () => {
    const cards: CharacterCardV1[] = [
      {
        schema: 'CharacterCardV1',
        id: 'char-1',
        name: 'Alice',
        description: '',
        systemPrompt: '',
        tags: [],
        adult: false,
        exampleDialogues: [],
        createdAt: 1,
        updatedAt: 1,
        avatar: { mimeType: 'image/png', data: validPng, byteLength: 100 },
      },
    ]
    const personas: UserPersonaV1[] = [
      {
        schema: 'UserPersonaV1',
        id: 'persona-1',
        name: 'Bob',
        description: '',
        reference: 'Detective Stone',
        tags: [],
        image: { mimeType: 'image/png', data: validPng, byteLength: 100, contentHash: 'preset-hash' },
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const entities = buildSceneReferenceEntities({ cards, personas })
    expect(entities).toHaveLength(2)
    expect(entities[0]!).toMatchObject({ type: 'character', id: 'char-1', name: 'Alice' })
    expect(entities[0]!.image).toBeDefined()
    expect(entities[1]!).toMatchObject({ type: 'persona', id: 'persona-1', name: 'Bob' })
    expect(entities[1]!.aliases).toContain('Detective Stone')
    expect(entities[1]!.image!.contentHash).toBe('preset-hash')
  })

  it('drops data-url prefix from persona/avatar payloads', () => {
    const cards: CharacterCardV1[] = [
      {
        schema: 'CharacterCardV1',
        id: 'char-1',
        name: 'Alice',
        description: '',
        systemPrompt: '',
        tags: [],
        adult: false,
        exampleDialogues: [],
        createdAt: 1,
        updatedAt: 1,
        avatar: { mimeType: 'image/png', data: `data:image/png;base64,${validPng}`, byteLength: 100 },
      },
    ]
    const entities = buildSceneReferenceEntities({ cards, personas: [] })
    expect(entities[0]!.image!.data).toBe(validPng)
  })

  it('excludes archived cards', () => {
    const cards: CharacterCardV1[] = [
      {
        schema: 'CharacterCardV1',
        id: 'char-active',
        name: 'Active',
        description: '',
        systemPrompt: '',
        tags: [],
        adult: false,
        exampleDialogues: [],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        schema: 'CharacterCardV1',
        id: 'char-archived',
        name: 'Archived',
        description: '',
        systemPrompt: '',
        tags: [],
        adult: false,
        exampleDialogues: [],
        createdAt: 1,
        updatedAt: 1,
        archivedAt: 1,
      },
    ]
    const entities = buildSceneReferenceEntities({ cards, personas: [] })
    expect(entities.map((e) => e.id)).toEqual(['char-active'])
  })

  it('omits malformed image payloads', () => {
    const cards: CharacterCardV1[] = [
      {
        schema: 'CharacterCardV1',
        id: 'char-1',
        name: 'Bad',
        description: '',
        systemPrompt: '',
        tags: [],
        adult: false,
        exampleDialogues: [],
        createdAt: 1,
        updatedAt: 1,
        avatar: { mimeType: 'image/png', data: 'not-base64', byteLength: 0 },
      },
    ]
    const entities = buildSceneReferenceEntities({ cards, personas: [] })
    expect(entities[0]!.image).toBeUndefined()
  })
})
