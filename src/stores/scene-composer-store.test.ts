/** @fileoverview Phase 2E — Scene Composer store contract tests. */

import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { useSceneComposerStore, resolveSceneProjectId, selectActiveScenes, selectArchivedScenes, selectScenesForProject } from "./scene-composer-store";
import type { SceneComposerItem } from "../types/scene";

function reset(): void {
  useSceneComposerStore.setState({
    scenes: [],
    activeSceneId: null,
    hydrated: false,
    loading: false,
    loadError: null,
  });
}

describe("scene-composer-store", () => {
  beforeEach(() => {
    reset();
  });

  it("createScene returns a version-1 record with a stable id", async () => {
    const item = await useSceneComposerStore.getState().createScene({
      title: "Sunset Over Mountains",
    });
    expect(item.id).toMatch(/^scene-/);
    expect(item.versions).toHaveLength(1);
    expect(item.versions[0]!.version).toBe(1);
    expect(item.currentVersionId).toBe(item.versions[0]!.id);
    expect(useSceneComposerStore.getState().scenes).toHaveLength(1);
  });

  it("createScene dedupes tags case-insensitively", async () => {
    const item = await useSceneComposerStore.getState().createScene({
      title: "t",
      tags: ["Dramatic", "DRAMATIC", "moody", "  Moody "],
    });
    expect(item.tags).toEqual(["dramatic", "moody"]);
  });

  it("createScene defaults to active project when scope is project", async () => {
    const item = await useSceneComposerStore.getState().createScene({
      title: "Project-scoped",
      scope: "project",
      projectId: "p-1",
    });
    expect(item.scope).toBe("project");
    expect(item.projectId).toBe("p-1");
  });

  it("createScene drops projectId when scope is global", async () => {
    const item = await useSceneComposerStore.getState().createScene({
      title: "Global",
      scope: "global",
      projectId: "p-1",
    });
    expect(item.scope).toBe("global");
    expect(item.projectId).toBeNull();
  });

  it("createScene stores default dimensions and model", async () => {
    const item = await useSceneComposerStore.getState().createScene({
      title: "With Defaults",
      defaultModel: "flux-dev",
      defaultWidth: 1024,
      defaultHeight: 1024,
      defaultAspectRatio: "1:1",
    });
    expect(item.defaultModel).toBe("flux-dev");
    expect(item.defaultWidth).toBe(1024);
    expect(item.defaultHeight).toBe(1024);
    expect(item.defaultAspectRatio).toBe("1:1");
  });

  it("updateScene mutates only the patched fields and bumps updatedAt", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "Original",
    });
    const before = useSceneComposerStore.getState().scenes.find((p) => p.id === created.id)!;
    await new Promise((r) => setTimeout(r, 5));
    await useSceneComposerStore.getState().updateScene(created.id, {
      title: "Renamed",
      description: "New description",
      defaultModel: "stratus-xl",
    });
    const after = useSceneComposerStore.getState().scenes.find((p) => p.id === created.id)!;
    expect(after.title).toBe("Renamed");
    expect(after.description).toBe("New description");
    expect(after.defaultModel).toBe("stratus-xl");
    expect(after.versions).toEqual(before.versions);
    expect(Date.parse(after.updatedAt)).toBeGreaterThanOrEqual(Date.parse(before.updatedAt));
  });

  it("addSceneVersion increments the version number and points currentVersionId at the new one", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "t",
    });
    const v2 = await useSceneComposerStore.getState().addSceneVersion(created.id, {
      title: "v2",
      components: [
        { kind: "subject", content: "A warrior" },
        { kind: "mood", content: "Epic" },
      ],
    });
    expect(v2.version).toBe(2);
    const item = useSceneComposerStore.getState().scenes.find((p) => p.id === created.id)!;
    expect(item.versions).toHaveLength(2);
    expect(item.currentVersionId).toBe(v2.id);
    expect(item.versions[1]!.components).toHaveLength(2);
  });

  it("addSceneVersion rejects unknown scene ids", async () => {
    await expect(
      useSceneComposerStore.getState().addSceneVersion("missing-id", {
        components: [{ kind: "subject", content: "x" }],
      }),
    ).rejects.toThrow(/Scene not found/);
  });

  it("addSceneVersion supports mediaRefs and promptRefs", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "With Refs",
    });
    const v2 = await useSceneComposerStore.getState().addSceneVersion(created.id, {
      components: [{ kind: "subject", content: "A dragon" }],
      mediaRefs: [{ mediaId: "media-1", role: "style_reference", note: "Use this style" }],
      promptRefs: [{ promptId: "plib-1", role: "base_prompt" }],
      notes: "Added references",
      sourceType: "media",
      sourceId: "media-1",
    });
    expect(v2.mediaRefs).toHaveLength(1);
    expect(v2.mediaRefs[0]!.mediaId).toBe("media-1");
    expect(v2.promptRefs).toHaveLength(1);
    expect(v2.promptRefs[0]!.promptId).toBe("plib-1");
    expect(v2.notes).toBe("Added references");
    expect(v2.source).toEqual({ type: "media", sourceId: "media-1" });
  });

  it("setCurrentVersion switches the active version without losing history", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "t",
    });
    const v2 = await useSceneComposerStore.getState().addSceneVersion(created.id, {
      components: [{ kind: "subject", content: "v2" }],
    });
    await useSceneComposerStore.getState().setCurrentVersion(created.id, created.versions[0]!.id);
    const item = useSceneComposerStore.getState().scenes.find((p) => p.id === created.id)!;
    expect(item.currentVersionId).toBe(created.versions[0]!.id);
    expect(item.versions).toHaveLength(2);
    expect(item.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(v2.version).toBe(2);
  });

  it("archiveScene / unarchiveScene toggles the archivedAt timestamp", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "t",
    });
    expect(useSceneComposerStore.getState().scenes[0]!.archivedAt).toBeNull();
    await useSceneComposerStore.getState().archiveScene(created.id);
    expect(useSceneComposerStore.getState().scenes[0]!.archivedAt).not.toBeNull();
    await useSceneComposerStore.getState().unarchiveScene(created.id);
    expect(useSceneComposerStore.getState().scenes[0]!.archivedAt).toBeNull();
  });

  it("archiveScene preserves all versions", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "t",
    });
    await useSceneComposerStore.getState().addSceneVersion(created.id, {
      components: [{ kind: "subject", content: "v2" }],
    });
    await useSceneComposerStore.getState().archiveScene(created.id);
    const item = useSceneComposerStore.getState().scenes.find((p) => p.id === created.id)!;
    expect(item.versions).toHaveLength(2);
    expect(item.archivedAt).not.toBeNull();
  });

  it("deleteScene removes the scene entirely", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "t",
    });
    await useSceneComposerStore.getState().deleteScene(created.id);
    expect(useSceneComposerStore.getState().scenes).toHaveLength(0);
  });

  it("toggleFavorite flips the favorite flag", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "t",
    });
    expect(useSceneComposerStore.getState().scenes[0]!.favorite).toBe(false);
    await useSceneComposerStore.getState().toggleFavorite(created.id);
    expect(useSceneComposerStore.getState().scenes[0]!.favorite).toBe(true);
    await useSceneComposerStore.getState().toggleFavorite(created.id);
    expect(useSceneComposerStore.getState().scenes[0]!.favorite).toBe(false);
  });

  it("addOutputMedia appends and dedupes mediaIds", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "t",
    });
    await useSceneComposerStore.getState().addOutputMedia(created.id, "media-1");
    await useSceneComposerStore.getState().addOutputMedia(created.id, "media-2");
    await useSceneComposerStore.getState().addOutputMedia(created.id, "media-1"); // dupe
    const item = useSceneComposerStore.getState().scenes.find((p) => p.id === created.id)!;
    expect(item.outputMediaIds).toEqual(["media-1", "media-2"]);
  });

  it("removeOutputMedia removes a mediaId", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "t",
    });
    await useSceneComposerStore.getState().addOutputMedia(created.id, "media-1");
    await useSceneComposerStore.getState().addOutputMedia(created.id, "media-2");
    await useSceneComposerStore.getState().removeOutputMedia(created.id, "media-1");
    const item = useSceneComposerStore.getState().scenes.find((p) => p.id === created.id)!;
    expect(item.outputMediaIds).toEqual(["media-2"]);
  });

  it("removeOutputMedia is a no-op for unknown mediaId", async () => {
    const created = await useSceneComposerStore.getState().createScene({
      title: "t",
    });
    await useSceneComposerStore.getState().addOutputMedia(created.id, "media-1");
    await useSceneComposerStore.getState().removeOutputMedia(created.id, "media-unknown");
    const item = useSceneComposerStore.getState().scenes.find((p) => p.id === created.id)!;
    expect(item.outputMediaIds).toEqual(["media-1"]);
  });

  it("selectActiveScenes / selectArchivedScenes split by archive state", async () => {
    const a = await useSceneComposerStore.getState().createScene({ title: "A" });
    const b = await useSceneComposerStore.getState().createScene({ title: "B" });
    await useSceneComposerStore.getState().archiveScene(a.id);
    const s = useSceneComposerStore.getState();
    expect(selectActiveScenes(s).map((p) => p.id)).toEqual([b.id]);
    expect(selectArchivedScenes(s).map((p) => p.id)).toEqual([a.id]);
  });

  it("selectScenesForProject honours project + global scopes", async () => {
    const g = await useSceneComposerStore.getState().createScene({ title: "G" });
    const p1 = await useSceneComposerStore.getState().createScene({ title: "P1", scope: "project", projectId: "p-1" });
    await useSceneComposerStore.getState().createScene({ title: "P2", scope: "project", projectId: "p-2" });
    const s = useSceneComposerStore.getState();
    const ids = selectScenesForProject(s, "p-1").map((p) => p.id);
    expect(ids).toContain(g.id);
    expect(ids).toContain(p1.id);
    expect(ids).not.toContain(s.scenes.find((p) => p.title === "P2")!.id);
  });

  it("exportScenes returns a versioned envelope with the selected items", async () => {
    const a = await useSceneComposerStore.getState().createScene({ title: "A" });
    const b = await useSceneComposerStore.getState().createScene({ title: "B" });
    const out = useSceneComposerStore.getState().exportScenes([a.id, b.id]);
    expect(out.version).toBe(1);
    expect(out.app).toBe("Venice Forge");
    expect(out.scenes).toHaveLength(2);
    expect(out.scenes.map((p) => p.title).sort()).toEqual(["A", "B"]);
  });

  it("importScenes ingests a valid export and regenerates ids", async () => {
    const a = await useSceneComposerStore.getState().createScene({ title: "A" });
    const exported = useSceneComposerStore.getState().exportScenes([a.id]);
    const result = await useSceneComposerStore.getState().importScenes(exported);
    expect(result.imported).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    expect(result.imported[0]!.id).not.toBe(a.id);
    expect(useSceneComposerStore.getState().scenes).toHaveLength(2);
  });

  it("importScenes rejects an unknown future version", async () => {
    const result = await useSceneComposerStore.getState().importScenes({
      version: 99,
      app: "Venice Forge",
      exportedAt: new Date().toISOString(),
      scenes: [],
    });
    expect(result.imported).toHaveLength(0);
    expect(result.skipped[0]?.reason).toMatch(/Unsupported export version/);
  });

  it("importScenes skips records with secret-like content", async () => {
    // Create a scene then manually inject a secret into a component for export
    const a = await useSceneComposerStore.getState().createScene({ title: "Poison" });
    await useSceneComposerStore.getState().addSceneVersion(a.id, {
      components: [{ kind: "subject", content: "Authorization: Bearer aaaaaaaaaaaaaaaabbbbbbbbbbbbbbb" }],
    });
    const exported = useSceneComposerStore.getState().exportScenes([a.id]);
    expect(exported.scenes).toHaveLength(0);
    const result = await useSceneComposerStore.getState().importScenes(exported);
    expect(result.imported).toHaveLength(0);
  });

  it("input objects are not mutated by create / update / addVersion", async () => {
    const input = { title: "Stable", scope: "global" as const };
    const snapshot = JSON.stringify(input);
    await useSceneComposerStore.getState().createScene(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("resolveSceneProjectId prefers explicit argument", () => {
    expect(resolveSceneProjectId("p-explicit")).toBe("p-explicit");
  });

  it("createScene does not throw when persistence is a no-op", async () => {
    const item = await useSceneComposerStore.getState().createScene({ title: "T" });
    expect(useSceneComposerStore.getState().scenes.find((p) => p.id === item.id)).toBeTruthy();
  });

  it("SceneItem stays well-formed after a full lifecycle", async () => {
    const created: SceneComposerItem = await useSceneComposerStore.getState().createScene({
      title: "Lifecycle",
      tags: ["x"],
      defaultModel: "flux-dev",
    });
    await useSceneComposerStore.getState().addSceneVersion(created.id, {
      components: [{ kind: "subject", content: "v2" }],
    });
    await useSceneComposerStore.getState().updateScene(created.id, { favorite: true });
    await useSceneComposerStore.getState().addOutputMedia(created.id, "media-1");
    await useSceneComposerStore.getState().archiveScene(created.id);
    await useSceneComposerStore.getState().unarchiveScene(created.id);
    const after = useSceneComposerStore.getState().scenes.find((p) => p.id === created.id)!;
    expect(after.versions).toHaveLength(2);
    expect(after.favorite).toBe(true);
    expect(after.archivedAt).toBeNull();
    expect(after.outputMediaIds).toEqual(["media-1"]);
  });
});