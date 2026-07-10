export interface SceneReferenceEntity {
  type: 'character' | 'persona'
  id: string
  name: string
  aliases?: string[]
  image?: { mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string; contentHash?: string }
}

export interface SceneReferencePlan {
  detectedEntities: Array<{ type: 'character' | 'persona'; id: string; name: string; confidence: number }>
  references: Array<{ entityId: string; mimeType: string; contentHash: string; data: string }>
  omitted: Array<{ entityId: string; reason: 'not-mentioned' | 'no-image' | 'model-unsupported' | 'reference-limit' | 'unsafe-or-invalid' }>
}

/** Simple, deterministic hash for local reference identity. Not
 *  cryptographic — just stable enough for deduplication and UI keys. */
export function hashReferenceContent(data: string, mimeType: string): string {
  const input = `${mimeType}:${data}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function mentioned(scene: string, entity: SceneReferenceEntity): boolean {
  const names = [entity.name, ...(entity.aliases ?? [])].map(normalize).filter((name) => name.length >= 3)
  const haystack = ` ${normalize(scene)} `
  return names.some((name) => haystack.includes(` ${name} `))
}

function safeImage(entity: SceneReferenceEntity['image']): entity is NonNullable<SceneReferenceEntity['image']> {
  return Boolean(entity && /^(image\/png|image\/jpeg|image\/webp)$/.test(entity.mimeType)
    && /^[A-Za-z0-9+/]*={0,2}$/.test(entity.data))
}

export function buildSceneReferencePlan(input: {
  sceneDescription: string
  entities: readonly SceneReferenceEntity[]
  modelSupportsReferences: boolean
  referenceLimit: number
  removedEntityIds?: readonly string[]
}): SceneReferencePlan {
  const detectedEntities: SceneReferencePlan['detectedEntities'] = []
  const references: SceneReferencePlan['references'] = []
  const omitted: SceneReferencePlan['omitted'] = []
  const removed = new Set(input.removedEntityIds ?? [])

  for (const entity of input.entities) {
    if (!mentioned(input.sceneDescription, entity)) {
      omitted.push({ entityId: entity.id, reason: 'not-mentioned' })
      continue
    }
    detectedEntities.push({ type: entity.type, id: entity.id, name: entity.name, confidence: 1 })
    if (removed.has(entity.id)) continue
    if (!entity.image) { omitted.push({ entityId: entity.id, reason: 'no-image' }); continue }
    if (!safeImage(entity.image)) { omitted.push({ entityId: entity.id, reason: 'unsafe-or-invalid' }); continue }
    if (!input.modelSupportsReferences) { omitted.push({ entityId: entity.id, reason: 'model-unsupported' }); continue }
    if (references.length >= Math.max(0, input.referenceLimit)) { omitted.push({ entityId: entity.id, reason: 'reference-limit' }); continue }
    references.push({
      entityId: entity.id,
      mimeType: entity.image.mimeType,
      contentHash: entity.image.contentHash ?? hashReferenceContent(entity.image.data, entity.image.mimeType),
      data: entity.image.data,
    })
  }
  return { detectedEntities, references, omitted }
}
