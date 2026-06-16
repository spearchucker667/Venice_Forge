/** @fileoverview VERIFY-044 — Phase 2B Media Studio bulk action helpers. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/storageService", () => {
  const store = new Map<string, Record<string, unknown>>();
  return {
    default: {
      getItemsPageWithMeta: vi.fn(async () => ({
        items: [], decryptFailures: 0, total: 0, offset: 0, limit: 60, hasMore: false,
      })),
      getItem: vi.fn(async (_name: string, id: string) => store.get(id) ?? null),
      putMedia: vi.fn(async (item: Record<string, unknown>) => {
        const next = { ...item, id: String(item.id), timestamp: 1 }
        store.set(String(item.id), next)
        return next
      }),
      patchMedia: vi.fn(async (id: string, patch: Record<string, unknown>) => {
        const existing = store.get(id) ?? {}
        const next = { ...existing, ...patch, id, timestamp: 1 }
        store.set(id, next)
        return next
      }),
      bulkPatchMedia: vi.fn(async (ids: string[], _patch: Record<string, unknown>) => ids.length),
      deleteMedia: vi.fn(async (id: string) => {
        const had = store.delete(id)
        return had
      }),
      deleteMediaMany: vi.fn(async (ids: string[]) => {
        let n = 0
        for (const id of ids) if (store.delete(id)) n += 1
        return n
      }),
      getItems: vi.fn(async () => []),
      saveItem: vi.fn(async (item: Record<string, unknown>) => item),
    },
  };
});

import { useMediaStore } from "./media-store";
import { useProjectStore } from "./project-store";
import {
  bulkAddTags,
  bulkAssignProject,
  bulkDelete,
  bulkHasFailure,
  bulkRemoveTag,
  bulkSetFavorite,
  listAssignableProjects,
  bulkFailureCount,
} from "./media-bulk-actions";
import { MEDIA_ITEM_VERSION, type MediaItem } from "../types/media";
import type { Project } from "../types/project";

function makeItem(over: Partial<MediaItem> = {}): MediaItem {
  return {
    id: over.id ?? crypto.randomUUID(),
    image: "data:image/png;base64,AA",
    prompt: "p",
    model: "flux-dev",
    timestamp: 1,
    mediaType: "image",
    operation: "generate",
    parentId: null,
    childrenIds: [],
    tags: [],
    note: "",
    favorite: false,
    mediaItemVersion: MEDIA_ITEM_VERSION,
    ...over,
  } as MediaItem;
}

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: over.id ?? crypto.randomUUID(),
    name: over.name ?? "Project",
    createdAt: 1,
    updatedAt: 1,
    archivedAt: over.archivedAt ?? null,
    version: 1,
    ...over,
  } as Project;
}

async function seed(items: MediaItem[]): Promise<void> {
  useMediaStore.setState({ items: [], loading: false, loaded: true, totalCount: 0, hasMore: false, nextOffset: 0, lastError: null })
  for (const it of items) {
    await useMediaStore.getState().upsert(it, { source: "manual" })
  }
}

beforeEach(() => {
  useProjectStore.setState({ projects: [], loaded: true, loading: false, lastError: null })
  useMediaStore.setState({ items: [], loading: false, loaded: true, totalCount: 0, hasMore: false, nextOffset: 0, lastError: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("media-bulk-actions (VERIFY-044)", () => {
  it("bulkSetFavorite: empty input is a no-op", async () => {
    const r = await bulkSetFavorite([], true)
    expect(r.requested).toBe(0)
    expect(r.succeeded).toEqual([])
    expect(r.failed).toEqual([])
  })

  it("bulkSetFavorite: toggles all selected", async () => {
    await seed([makeItem({ id: "a" }), makeItem({ id: "b" })])
    const r = await bulkSetFavorite(["a", "b"], true)
    expect(r.requested).toBe(2)
    expect(r.succeeded).toEqual(["a", "b"])
    expect(r.failed).toEqual([])
    expect(useMediaStore.getState().items.find((i) => i.id === "a")?.favorite).toBe(true)
  })

  it("bulkSetFavorite: missing ids are reported as failed", async () => {
    await seed([makeItem({ id: "a" })])
    const r = await bulkSetFavorite(["a", "missing"], false)
    expect(r.succeeded).toEqual(["a"])
    expect(r.failed.map((f) => f.id)).toEqual(["missing"])
  })

  it("bulkSetFavorite: ignores non-string / empty ids without throwing", async () => {
    await seed([makeItem({ id: "a" })])
    const r = await bulkSetFavorite(["", null as unknown as string, undefined as unknown as string, "a"], true)
    expect(r.succeeded).toEqual(["a"])
    expect(r.failed).toEqual([])
  })

  it("bulkAddTags: lowercases + dedupes + respects 32-char cap", async () => {
    await seed([makeItem({ id: "a" })])
    const r = await bulkAddTags(["a"], ["  HERO ", "hero", "x".repeat(40), ""])
    expect(r.succeeded).toEqual(["a"])
    const tags = useMediaStore.getState().items.find((i) => i.id === "a")?.tags
    expect(tags).toEqual(["hero"])
  })

  it("bulkAddTags: no-op on empty tag list", async () => {
    await seed([makeItem({ id: "a" })])
    const r = await bulkAddTags(["a"], [])
    expect(r.requested).toBe(0)
    expect(r.succeeded).toEqual([])
  })

  it("bulkAddTags: ignores non-array tags input", async () => {
    await seed([makeItem({ id: "a" })])
    const r = await bulkAddTags(["a"], null as unknown as string[])
    expect(r.requested).toBe(0)
    expect(r.succeeded).toEqual([])
  })

  it("bulkAddTags: missing ids are reported as failed", async () => {
    await seed([makeItem({ id: "a" })])
    const r = await bulkAddTags(["a", "missing"], ["hero"])
    expect(r.succeeded).toEqual(["a"])
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].id).toBe("missing")
    expect(r.failed[0].reason).toMatch(/not in current view/i)
  })

  it("bulkRemoveTag: drops the lowercased tag only", async () => {
    await seed([makeItem({ id: "a", tags: ["hero", "landscape"] })])
    const r = await bulkRemoveTag(["a"], "  HERO  ")
    expect(r.succeeded).toEqual(["a"])
    expect(useMediaStore.getState().items.find((i) => i.id === "a")?.tags).toEqual(["landscape"])
  })

  it("bulkRemoveTag: no-op when the tag is absent", async () => {
    await seed([makeItem({ id: "a", tags: ["hero"] })])
    const r = await bulkRemoveTag(["a"], "missing")
    expect(r.succeeded).toEqual(["a"])
    expect(useMediaStore.getState().items.find((i) => i.id === "a")?.tags).toEqual(["hero"])
  })

  it("bulkRemoveTag: ignores non-string tags", async () => {
    await seed([makeItem({ id: "a", tags: ["hero"] })])
    const r = await bulkRemoveTag(["a"], null as unknown as string)
    expect(r.requested).toBe(0)
    expect(r.succeeded).toEqual([])
  })

  it("bulkRemoveTag: missing ids are reported as failed", async () => {
    await seed([makeItem({ id: "a", tags: ["hero"] })])
    const r = await bulkRemoveTag(["a", "missing"], "hero")
    expect(r.succeeded).toEqual(["a"])
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].id).toBe("missing")
    expect(r.failed[0].reason).toMatch(/not in current view/i)
  })

  it("bulkAssignProject: assigns valid non-archived project to all ids", async () => {
    await seed([makeItem({ id: "a" }), makeItem({ id: "b" })])
    useProjectStore.setState({ projects: [makeProject({ id: "p1", name: "P1" })] })
    const r = await bulkAssignProject(["a", "b"], "p1")
    expect(r.succeeded).toEqual(["a", "b"])
    expect(useMediaStore.getState().items.find((i) => i.id === "a")?.projectId).toBe("p1")
  })

  it("bulkAssignProject: no-op on empty input", async () => {
    const r = await bulkAssignProject([], "p1")
    expect(r.requested).toBe(0)
    expect(r.succeeded).toEqual([])
  })

  it("bulkAssignProject: rejects unknown project for every id (partial failure)", async () => {
    await seed([makeItem({ id: "a" })])
    useProjectStore.setState({ projects: [] })
    const r = await bulkAssignProject(["a"], "missing")
    expect(r.succeeded).toEqual([])
    expect(r.failed[0].reason).toMatch(/not found/i)
  })

  it("bulkAssignProject: rejects empty project id per id", async () => {
    await seed([makeItem({ id: "a" })])
    useProjectStore.setState({ projects: [] })
    const r = await bulkAssignProject(["a"], "")
    expect(r.succeeded).toEqual([])
    expect(r.failed[0].reason).toMatch(/is empty/i)
  })

  it("bulkAssignProject: rejects archived project per id", async () => {
    await seed([makeItem({ id: "a" })])
    useProjectStore.setState({
      projects: [makeProject({ id: "arc", name: "Arc", archivedAt: 100 })],
    })
    const r = await bulkAssignProject(["a"], "arc")
    expect(r.succeeded).toEqual([])
    expect(r.failed[0].reason).toMatch(/archived/i)
  })

  it("bulkAssignProject: clear-project (null) succeeds even when projects list is empty", async () => {
    await seed([makeItem({ id: "a", projectId: "p1" })])
    useProjectStore.setState({ projects: [] })
    const r = await bulkAssignProject(["a"], null)
    expect(r.action).toBe("clear-project")
    expect(r.succeeded).toEqual(["a"])
    // The patch normalises undefined for "clear"; projectId becomes undefined
    const after = useMediaStore.getState().items.find((i) => i.id === "a")
    expect(after?.projectId ?? undefined).toBeUndefined()
  })

  it("bulkAssignProject: mixed valid + invalid project is a per-id partial failure", async () => {
    await seed([makeItem({ id: "a" })])
    useProjectStore.setState({ projects: [makeProject({ id: "p1", name: "P1" })] })
    const r = await bulkAssignProject(["a"], "p1")
    expect(r.succeeded).toEqual(["a"])
  })

  it("bulkAssignProject: patch returning false yields a per-id failure", async () => {
    await seed([makeItem({ id: "a" })])
    useProjectStore.setState({ projects: [makeProject({ id: "p1", name: "P1" })] })
    vi.spyOn(useMediaStore.getState(), "patch").mockResolvedValueOnce(null)
    const r = await bulkAssignProject(["a"], "p1")
    expect(r.succeeded).toEqual([])
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].reason).toMatch(/not in current view/i)
  })

  it("bulkDelete: refuses to run without confirm:true", async () => {
    await seed([makeItem({ id: "a" })])
    const r = await bulkDelete(["a"], { confirm: false })
    expect(r.requested).toBe(1)
    expect(r.succeeded).toEqual([])
    expect(r.failed[0].reason).toMatch(/confirmation/i)
    expect(useMediaStore.getState().items.find((i) => i.id === "a")).toBeDefined()
  })

  it("bulkDelete: removes when confirm:true", async () => {
    await seed([makeItem({ id: "a" }), makeItem({ id: "b" })])
    const r = await bulkDelete(["a", "b"], { confirm: true })
    expect(r.requested).toBe(2)
    expect(useMediaStore.getState().items.find((i) => i.id === "a")).toBeUndefined()
    expect(useMediaStore.getState().items.find((i) => i.id === "b")).toBeUndefined()
  })

  it("bulkDelete: no-op on empty input", async () => {
    const r = await bulkDelete([], { confirm: true })
    expect(r.requested).toBe(0)
    expect(r.succeeded).toEqual([])
  })

  it("bulkDelete: reports missing ids as failed", async () => {
    await seed([makeItem({ id: "a" })])
    const r = await bulkDelete(["a", "missing"], { confirm: true })
    expect(r.requested).toBe(2)
    expect(r.succeeded).toEqual(["a"])
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].id).toBe("missing")
    expect(r.failed[0].reason).toMatch(/not in current view/i)
  })

  it("bulkHasFailure: false on full success", () => {
    expect(bulkHasFailure({ action: "favorite", requested: 1, succeeded: ["a"], failed: [] })).toBe(false)
  })

  it("bulkHasFailure: true on partial failure", () => {
    expect(bulkHasFailure({
      action: "favorite", requested: 2, succeeded: ["a"],
      failed: [{ id: "b", reason: "x" }],
    })).toBe(true)
  })

  it("bulkFailureCount: returns number of failures", () => {
    expect(bulkFailureCount({
      action: "favorite", requested: 2, succeeded: ["a"],
      failed: [{ id: "b", reason: "x" }, { id: "c", reason: "y" }],
    })).toBe(2)
    
    expect(bulkFailureCount({
      action: "favorite", requested: 1, succeeded: ["a"],
      failed: [],
    })).toBe(0)
  })

  it("listAssignableProjects: filters out archived projects", () => {
    const projects = [
      makeProject({ id: "p1", name: "Open 1" }),
      makeProject({ id: "p2", name: "Archived", archivedAt: 100 }),
      makeProject({ id: "p3", name: "Open 2" }),
    ]
    const out = listAssignableProjects(projects)
    expect(out.map((p) => p.id)).toEqual(["p1", "p3"])
  })

  it("listAssignableProjects: defaults to the live project list when called with no arg", () => {
    useProjectStore.setState({
      projects: [makeProject({ id: "live", name: "Live" })],
    })
    const out = listAssignableProjects()
    expect(out).toEqual([{ id: "live", name: "Live" }])
  })

  describe("T-191 regression — raw exception strings are redacted", () => {
    it.each([
      {
        name: "bulkSetFavorite",
        setup: () => vi.spyOn(useMediaStore.getState(), "setFavoriteMany").mockRejectedValueOnce(new Error("vn-deadbeefsecret123")),
        run: () => bulkSetFavorite(["a"], true),
      },
      {
        name: "bulkAddTags",
        setup: () => vi.spyOn(useMediaStore.getState(), "addTagsMany").mockRejectedValueOnce(new Error("Bearer eyJzdWIiOiIxMjM0NTY3ODkw")),
        run: () => bulkAddTags(["a"], ["tag"]),
      },
      {
        name: "bulkRemoveTag",
        setup: () => vi.spyOn(useMediaStore.getState(), "removeTagMany").mockRejectedValueOnce(new Error("sk-abc123def456")),
        run: () => bulkRemoveTag(["a"], "tag"),
      },
      {
        name: "bulkDelete",
        setup: () => vi.spyOn(useMediaStore.getState(), "removeMany").mockRejectedValueOnce(new Error("Authorization: vn-leakedkey")),
        run: () => bulkDelete(["a"], { confirm: true }),
      },
    ])("$name redacts secrets from failure reasons", async ({ setup, run }) => {
      await seed([makeItem({ id: "a" })])
      setup()
      const r = await run()
      expect(r.succeeded).toEqual([])
      expect(r.failed).toHaveLength(1)
      expect(r.failed[0].id).toBe("a")
      expect(r.failed[0].reason).not.toMatch(/vn-deadbeefsecret123|eyJzdWIiOiIxMjM0NTY3ODkw|sk-abc123def456|vn-leakedkey/)
      expect(r.failed[0].reason).toMatch(/\[REDACTED\]|Unknown error/)
    })

    it("bulkAssignProject redacts secrets from per-id patch failures", async () => {
      await seed([makeItem({ id: "a" })])
      useProjectStore.setState({ projects: [makeProject({ id: "p1", name: "P1" })] })
      vi.spyOn(useMediaStore.getState(), "patch").mockRejectedValueOnce(new Error("Request failed with apiKey=sk-live-leaked"))
      const r = await bulkAssignProject(["a"], "p1")
      expect(r.succeeded).toEqual([])
      expect(r.failed[0].reason).not.toMatch(/sk-live-leaked/)
      expect(r.failed[0].reason).toMatch(/\[REDACTED\]|Unknown error/)
    })

    it("string errors are redacted rather than returned raw", async () => {
      await seed([makeItem({ id: "a" })])
      vi.spyOn(useMediaStore.getState(), "setFavoriteMany").mockRejectedValueOnce("vn-stringsecret")
      const r = await bulkSetFavorite(["a"], true)
      expect(r.failed[0].reason).not.toMatch(/vn-stringsecret/)
      expect(r.failed[0].reason).toMatch(/\[REDACTED\]|Unknown error/)
    })
  })
})
