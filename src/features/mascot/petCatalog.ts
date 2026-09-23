/**
 * @fileoverview Typed catalogue of all seven Codex-style pet assets.
 *
 * Asset resolution uses Vite's `?url` suffix so spritesheets are emitted into
 * the production renderer bundle and referenced by hashed URLs — no absolute
 * local paths appear in runtime code.
 *
 * The `kind` field from individual pet.json manifests is intentionally omitted
 * here because it is inconsistent across bundles (see handoff §2) and is not
 * required for rendering or rotation.
 */

// Vite resolves `?url` imports to the hashed asset URL at build time.
import frierenUrl from '../../../assets/0028-frieren/spritesheet.webp?url';
import dianaUrl from '../../../assets/0455-diana/spritesheet.webp?url';
import palantirPatrickUrl from '../../../assets/0471-palantir-patrick/spritesheet.webp?url';
import planaUrl from '../../../assets/0688-plana/spritesheet.webp?url';
import icebellUrl from '../../../assets/0694-icebell/spritesheet.webp?url';
import powerpetUrl from '../../../assets/0780-powerpet/spritesheet.webp?url';
import kleeUrl from '../../../assets/0781-klee/spritesheet.webp?url';

/**
 * Fixed atlas geometry for all Codex V1 spritesheets supplied with this
 * feature. All seven sheets share an identical layout.
 */
export const SPRITE_GEOMETRY = {
  columns: 8,
  rows: 9,
  frameWidth: 192,
  frameHeight: 208,
} as const;

export type SpriteGeometry = typeof SPRITE_GEOMETRY;

export interface PetAsset {
  /** Stable identifier matching the pet.json `id` field. */
  id: string;
  /** Human-readable display name. Not exposed in UI copy (pet is decorative). */
  displayName: string;
  /** Bundled spritesheet URL resolved by Vite at build time. */
  spritesheetUrl: string;
  /** Atlas geometry shared by all V1 assets. */
  sprite: SpriteGeometry;
}

export const PET_CATALOG: readonly PetAsset[] = [
  {
    id: 'frieren',
    displayName: 'Frieren',
    spritesheetUrl: frierenUrl,
    sprite: SPRITE_GEOMETRY,
  },
  {
    id: 'diana',
    displayName: 'Diana',
    spritesheetUrl: dianaUrl,
    sprite: SPRITE_GEOMETRY,
  },
  {
    id: 'palantir-patrick',
    displayName: 'Palantir Patrick',
    spritesheetUrl: palantirPatrickUrl,
    sprite: SPRITE_GEOMETRY,
  },
  {
    id: 'plana',
    displayName: 'Plana',
    spritesheetUrl: planaUrl,
    sprite: SPRITE_GEOMETRY,
  },
  {
    id: 'icebell',
    displayName: 'Azuma Seren',
    spritesheetUrl: icebellUrl,
    sprite: SPRITE_GEOMETRY,
  },
  {
    id: 'powerpet',
    displayName: 'PowerPet',
    spritesheetUrl: powerpetUrl,
    sprite: SPRITE_GEOMETRY,
  },
  {
    id: 'klee',
    displayName: 'Klee可莉',
    spritesheetUrl: kleeUrl,
    sprite: SPRITE_GEOMETRY,
  },
] as const;
