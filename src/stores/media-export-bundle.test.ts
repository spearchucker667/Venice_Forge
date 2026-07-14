/** @fileoverview VERIFY-044 — media-export-bundle; VERIFY-121 — export truth and audio support. */

import { describe, expect, it } from "vitest";
import {
  EXPORT_BUNDLE_APP,
  EXPORT_BUNDLE_VERSION,
  buildExportBundle,
  buildMediaFilename,
  buildSidecar,
  serialiseBundle,
  validateSidecar,
} from "./media-export-bundle";
import { MEDIA_ITEM_VERSION, type MediaItem } from "../types/media";

function makeItem(over: Partial<MediaItem> = {}, id = "m-1"): MediaItem {
  return {
    id,
    image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=",
    prompt: "A copper city at dusk",
    negative: "fog",
    model: "flux-dev",
    width: 1024,
    height: 1024,
    seed: 42,
    timestamp: 1,
    mediaType: "image",
    operation: "generate",
    parentId: "parent-1",
    childrenIds: ["child-a", "child-b"],
    tags: ["hero", "portrait"],
    note: "Top pick",
    favorite: true,
    projectId: "project-1",
    mediaItemVersion: MEDIA_ITEM_VERSION,
    ...over,
  } as MediaItem;
}

describe("media-export-bundle (VERIFY-044)", () => {
  describe("buildSidecar", () => {
    it("does NOT include image bytes, api keys, tokens, or path tokens", () => {
      const item = makeItem({
        exportedPathToken: "secret/path/token",
        // @ts-expect-error - we explicitly inject a forbidden key to
        // confirm the strip path runs even when the type allows it.
        apiKey: "VENICE-SECRET-KEY",
      })
      const sidecar = buildSidecar(item, "2026-06-08T00:00:00.000Z")
      const text = JSON.stringify(sidecar)
      expect(text).not.toContain("data:image/png;base64")
      expect(text).not.toContain("VENICE-SECRET-KEY")
      expect(text).not.toMatch(/api[_-]?key/i)
      expect(text).not.toMatch(/bearer/i)
      expect(text).not.toMatch(/authorization/i)
      expect(text).not.toContain("secret/path/token")
      expect(text).not.toContain("thumbHash")
      expect(text).not.toContain("sha256")
    })

    it("redacts secrets from prompt fields and nested recipes", () => {
      const sidecar = buildSidecar(makeItem({
        prompt: "use sk-1234567890abcdef",
        negative: "OPENAI_API_KEY=sk-fedcba0987654321",
        recipe: {
          prompt: "Bearer secret-token-value",
          model: "flux-dev",
          metadata: { Api_Key: "nested-secret" },
        } as never,
      }), "2026-06-08T00:00:00.000Z")
      const text = JSON.stringify(sidecar)

      expect(text).not.toContain("sk-1234567890abcdef")
      expect(text).not.toContain("sk-fedcba0987654321")
      expect(text).not.toContain("secret-token-value")
      expect(text).not.toContain("nested-secret")
    })

    it("preserves the media item's original creation timestamp", () => {
      const sidecar = buildSidecar(makeItem({ timestamp: Date.parse("2026-01-02T03:04:05.000Z") }), "2026-06-08T00:00:00.000Z")
      expect(sidecar.createdAt).toBe("2026-01-02T03:04:05.000Z")
    })

    it("includes the recipe when present (without `cfg` legacy alias)", () => {
      const item = makeItem({
        recipe: {
          prompt: "A copper city at dusk",
          model: "flux-dev",
          width: 1024,
          height: 1024,
          seed: 42,
          // Legacy `cfg` should be normalised away.
          cfg: 6,
          cfgScale: 7,
        } as never,
      })
      const sidecar = buildSidecar(item, "2026-06-08T00:00:00.000Z")
      expect(sidecar.recipe).toBeTruthy()
      expect(sidecar.recipe).not.toHaveProperty("cfg")
      expect(sidecar.recipe?.cfgScale).toBe(7)
    })

    it("records the mediaType, operation, and lineage", () => {
      const sidecar = buildSidecar(makeItem(), "2026-06-08T00:00:00.000Z")
      expect(sidecar.type).toBe("image")
      expect(sidecar.source.operation).toBe("generate")
      expect(sidecar.lineage.parentId).toBe("parent-1")
      expect(sidecar.lineage.childrenIds).toEqual(["child-a", "child-b"])
    })

    it("detects image, video, and audio extensions from the data URL prefix", () => {
      expect(buildSidecar(makeItem({ image: "data:image/jpeg;base64,AA" }), "x").mediaFile.extension).toBe("jpg")
      expect(buildSidecar(makeItem({ image: "data:image/webp;base64,AA" }), "x").mediaFile.extension).toBe("webp")
      expect(buildSidecar(makeItem({ image: "data:image/gif;base64,AA" }), "x").mediaFile.extension).toBe("gif")
      expect(buildSidecar(makeItem({ mediaType: "video", image: "data:video/mp4;base64,AA" }), "x").mediaFile.extension).toBe("mp4")
      const audio = buildSidecar(makeItem({ mediaType: "audio", image: "data:audio/ogg;base64,AA" }), "x")
      expect(audio.type).toBe("audio")
      expect(audio.mediaFile.extension).toBe("ogg")
      expect(validateSidecar(audio)).toBeNull()
    })

    it("handles missing / empty image", () => {
      const sidecar = buildSidecar(makeItem({ image: "" }), "x")
      expect(sidecar.mediaFile.base64ByteLength).toBe(0)
    })

    it("circular references in nested metadata are broken (no throw)", () => {
      const item = makeItem()
      // Inject a circular recipe.metadata
      const meta: Record<string, unknown> = {}
      meta.self = meta
      item.recipe = {
        prompt: "x",
        model: "flux-dev",
        metadata: meta as never,
      } as never
      const text = serialiseBundle(buildExportBundle([item]))
      // The bundle string is finite and parseable.
      expect(() => JSON.parse(text)).not.toThrow()
      // The cyclic entry was dropped (returns undefined in the replacer).
      expect(text).not.toContain("circular")
    })
  })

  describe("buildExportBundle", () => {
    it("emits the canonical version, app, and count", () => {
      const bundle = buildExportBundle([makeItem({}, "a"), makeItem({}, "b")], "2026-06-08T00:00:00.000Z")
      expect(bundle.version).toBe(EXPORT_BUNDLE_VERSION)
      expect(bundle.app).toBe(EXPORT_BUNDLE_APP)
      expect(bundle.itemCount).toBe(2)
      expect(bundle.items).toHaveLength(2)
      expect(bundle.exportedAt).toBe("2026-06-08T00:00:00.000Z")
    })

    it("returns an empty manifest for empty input", () => {
      const bundle = buildExportBundle([], "x")
      expect(bundle.itemCount).toBe(0)
      expect(bundle.items).toEqual([])
    })

    it("tolerates non-array input", () => {
      const bundle = buildExportBundle(undefined as unknown as MediaItem[], "x")
      expect(bundle.itemCount).toBe(0)
    })
  })

  describe("buildMediaFilename", () => {
    it("produces a deterministic, sanitised filename", () => {
      const name = buildMediaFilename(makeItem({ prompt: "A copper city / dusk!" }))
      expect(name).toMatch(/^m-1-A_copper_city___dusk_!?.png$/)
    })

    it("falls back to the id when the prompt is empty", () => {
      const name = buildMediaFilename(makeItem({ prompt: "" }))
      expect(name).toMatch(/^m-1.*\.png$/)
    })

    it("sanitises the id prefix so it cannot influence the export path", () => {
      const name = buildMediaFilename(makeItem({ prompt: "safe" }, "../../outside"))
      expect(name).toBe(".._.._outsid-safe.png")
      expect(name).not.toContain("/")
      expect(name).not.toContain("\\")
    })
  })

  describe("validateSidecar", () => {
    it("accepts a sidecar built by buildSidecar", () => {
      const sidecar = buildSidecar(makeItem(), "x")
      expect(validateSidecar(sidecar)).toBeNull()
    })

    it("rejects bad version", () => {
      const sidecar = { ...buildSidecar(makeItem(), "x"), version: 99 }
      expect(validateSidecar(sidecar)).toMatch(/version/i)
    })

    it("rejects missing id", () => {
      const sidecar = { ...buildSidecar(makeItem(), "x"), id: undefined }
      expect(validateSidecar(sidecar)).toMatch(/id/)
    })

    it("rejects non-object input", () => {
      expect(validateSidecar(null)).toMatch(/object/)
      expect(validateSidecar("string")).toMatch(/object/)
    })
  })

  describe("partial failure / missing files", () => {
    it("exports items whose stored recipe is missing by reconstructing from canonical fields (no data loss)", () => {
      // extractGenerationRecipe (Phase 1) reconstructs a recipe from
      // the top-level media item fields when the stored `recipe` slot
      // is empty. The sidecar carries the reconstructed recipe so the
      // export is round-trippable.
      const item = makeItem({ recipe: undefined })
      const sidecar = buildSidecar(item, "x")
      expect(sidecar.recipe).toBeTruthy()
      expect(sidecar.recipe?.model).toBe("flux-dev")
    })

    it("exports items with empty image as zero-byte sidecar", () => {
      const sidecar = buildSidecar(makeItem({ image: "" }), "x")
      expect(sidecar.mediaFile.base64ByteLength).toBe(0)
      // The media filename is still produced so the caller can write
      // a zero-byte file as a placeholder.
      expect(buildMediaFilename(makeItem({ image: "" }))).toMatch(/\.png$/)
    })
  });

  describe("serialiseBundle", () => {
    it("produces valid JSON", () => {
      const text = serialiseBundle(buildExportBundle([makeItem()]))
      expect(() => JSON.parse(text)).not.toThrow()
    })
  })
})
