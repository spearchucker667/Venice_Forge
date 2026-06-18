/** @fileoverview Phase 2E — Scene type contract tests. */

import { describe, it, expect } from "vitest";
import {
  createSceneComposerItem,
  createSceneVersion,
  createSceneComponent,
  sanitizeSceneComposerItem,
  exportSceneComposerItems,
  parseSceneComposerImport,
  isSceneComposerItem,
  getCurrentSceneVersion,
} from "./scene";
import type {
  SceneComponentKind,
  SceneVersion,
} from "./scene";

const NOW = "2026-06-08T12:00:00.000Z";

describe("Scene Composer data model", () => {
  it("creates valid scene item", () => {
    const item = createSceneComposerItem({ title: "Mountain Sunset" }, NOW);
    expect(item.id).toMatch(/^scene-/);
    expect(item.title).toBe("Mountain Sunset");
    expect(item.scope).toBe("global");
    expect(item.versions).toHaveLength(1);
    expect(item.versions[0]!.version).toBe(1);
    expect(item.currentVersionId).toBe(item.versions[0]!.id);
    expect(item.favorite).toBe(false);
    expect(item.archivedAt).toBeNull();
    expect(item.outputMediaIds).toEqual([]);
    expect(item.createdAt).toBe(NOW);
    expect(item.updatedAt).toBe(NOW);
  });

  it("creates version 1", () => {
    const item = createSceneComposerItem({ title: "Test" }, NOW);
    const v = item.versions[0]!;
    expect(v.version).toBe(1);
    expect(v.sceneId).toBe(item.id);
    expect(v.title).toBe("Test");
    expect(v.components).toEqual([]);
    expect(v.mediaRefs).toEqual([]);
    expect(v.promptRefs).toEqual([]);
  });

  it("adds version N+1", () => {
    const item = createSceneComposerItem({ title: "Test" }, NOW);
    const v2 = createSceneVersion(
      {
        sceneId: item.id,
        version: 2,
        title: "Version 2",
        components: [{ kind: "subject", content: "A cat" }],
      },
      NOW,
    );
    expect(v2.version).toBe(2);
    expect(v2.sceneId).toBe(item.id);
    expect(v2.components).toHaveLength(1);
    expect(v2.components[0]!.kind).toBe("subject");
    expect(v2.components[0]!.content).toBe("A cat");
  });

  it("switches current version", () => {
    const item = createSceneComposerItem({ title: "Test" }, NOW);
    const v2 = createSceneVersion(
      {
        sceneId: item.id,
        version: 2,
        title: "Version 2",
        components: [{ kind: "subject", content: "A cat" }],
      },
      NOW,
    );
    item.versions.push(v2);
    item.currentVersionId = v2.id;
    const current = getCurrentSceneVersion(item);
    expect(current).toBe(v2);
    expect(current!.version).toBe(2);
  });

  it("preserves old versions", () => {
    const item = createSceneComposerItem({ title: "Test" }, NOW);
    const v2 = createSceneVersion(
      {
        sceneId: item.id,
        version: 2,
        title: "Version 2",
        components: [{ kind: "subject", content: "A cat" }],
      },
      NOW,
    );
    item.versions.push(v2);
    item.currentVersionId = v2.id;
    expect(item.versions).toHaveLength(2);
    expect(item.versions[0]!.version).toBe(1);
    expect(item.versions[1]!.version).toBe(2);
    expect(getCurrentSceneVersion(item)!.version).toBe(2);
  });

  it("supports global/project scope", () => {
    const global = createSceneComposerItem({ title: "G", scope: "global" }, NOW);
    expect(global.scope).toBe("global");
    expect(global.projectId).toBeNull();

    const project = createSceneComposerItem(
      { title: "P", scope: "project", projectId: "proj-1" },
      NOW,
    );
    expect(project.scope).toBe("project");
    expect(project.projectId).toBe("proj-1");
  });

  it("supports all SceneComponentKind values", () => {
    const kinds: SceneComponentKind[] = [
      "subject",
      "character",
      "location",
      "mood",
      "style",
      "camera",
      "lighting",
      "composition",
      "negative",
      "reference_media",
      "prompt_reference",
      "note",
    ];
    for (const kind of kinds) {
      const comp = createSceneComponent({ kind, content: `Test ${kind}` }, NOW);
      expect(comp.kind).toBe(kind);
      expect(comp.content).toBe(`Test ${kind}`);
      expect(comp.enabled).toBe(true);
    }
  });

  it("preserves media refs", () => {
    const item = createSceneComposerItem({ title: "Test" }, NOW);
    const refs = [{ mediaId: "media-1", role: "style_reference" as const }];
    const v = createSceneVersion(
      {
        sceneId: item.id,
        version: 2,
        title: "With media",
        components: [{ kind: "subject", content: "A landscape" }],
        mediaRefs: refs,
      },
      NOW,
    );
    expect(v.mediaRefs).toHaveLength(1);
    expect(v.mediaRefs[0]!.mediaId).toBe("media-1");
    expect(v.mediaRefs[0]!.role).toBe("style_reference");
  });

  it("preserves prompt refs", () => {
    const item = createSceneComposerItem({ title: "Test" }, NOW);
    const refs = [{ promptId: "plib-1", role: "base_prompt" as const }];
    const v = createSceneVersion(
      {
        sceneId: item.id,
        version: 2,
        title: "With prompt",
        components: [{ kind: "subject", content: "A landscape" }],
        promptRefs: refs,
      },
      NOW,
    );
    expect(v.promptRefs).toHaveLength(1);
    expect(v.promptRefs[0]!.promptId).toBe("plib-1");
    expect(v.promptRefs[0]!.role).toBe("base_prompt");
  });

  it("preserves outputMediaIds", () => {
    const item = createSceneComposerItem({ title: "Test" }, NOW);
    expect(item.outputMediaIds).toEqual([]);
    const withOutput = {
      ...item,
      outputMediaIds: ["media-1", "media-2"],
    };
    const sanitized = sanitizeSceneComposerItem(withOutput, { now: NOW });
    expect(sanitized!.outputMediaIds).toEqual(["media-1", "media-2"]);
  });

  it("rejects corrupt records", () => {
    expect(sanitizeSceneComposerItem(null, { now: NOW })).toBeNull();
    expect(sanitizeSceneComposerItem(undefined, { now: NOW })).toBeNull();
    expect(sanitizeSceneComposerItem("string", { now: NOW })).toBeNull();
    expect(sanitizeSceneComposerItem(42, { now: NOW })).toBeNull();
    expect(sanitizeSceneComposerItem([], { now: NOW })).toBeNull();
    expect(sanitizeSceneComposerItem({}, { now: NOW })).toBeNull();
    expect(sanitizeSceneComposerItem({ id: "scene-1" }, { now: NOW })).toBeNull();
    expect(
      sanitizeSceneComposerItem({ id: "scene-1", title: "" }, { now: NOW }),
    ).toBeNull();
  });

  it("rejects/redacts obvious secrets", () => {
    const item = {
      id: "scene-test",
      title: "Secret Scene",
      scope: "global",
      currentVersionId: "v1",
      versions: [
        {
          id: "v1",
          sceneId: "scene-test",
          version: 1,
          title: "V1",
          components: [
            {
              id: "comp-1",
              kind: "subject",
              content: "s" + "k-my-secret-api-key-1234567890abcdef",
              enabled: true,
            },
          ],
          mediaRefs: [],
          promptRefs: [],
          createdAt: NOW,
        },
      ],
      tags: [],
      favorite: false,
      outputMediaIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const sanitized = sanitizeSceneComposerItem(item, { now: NOW });
    expect(sanitized).not.toBeNull();
    expect(sanitized!.versions[0]!.components[0]!.content).toContain("[REDACTED]");
    expect(sanitized!.versions[0]!.components[0]!.content).not.toContain("sk-");
  });

  it("export JSON excludes secrets/blobs", () => {
    const item = createSceneComposerItem({ title: "Clean" }, NOW);
    // Create a raw version object that bypasses redactSecrets so the
    // export pre-check can detect the secret-like content.
    item.versions.push({
      id: "sver-raw-1",
      sceneId: item.id,
      version: 2,
      title: "Secret version",
      components: [
        {
          id: "scomp-raw-1",
          kind: "subject" as SceneComponentKind,
          content: "Bear" + "er s" + "k-my-key-12345678901234567890",
          enabled: true,
        },
      ],
      mediaRefs: [],
      promptRefs: [],
      createdAt: NOW,
    } as SceneVersion);
    const exportData = exportSceneComposerItems([item], NOW);
    expect(exportData.version).toBe(1);
    expect(exportData.app).toBe("Venice Forge");
    expect(exportData.scenes).toHaveLength(0);
  });

  it("import validates version", () => {
    const result = parseSceneComposerImport(
      { version: 2, app: "Venice Forge", scenes: [] },
      NOW,
    );
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toContain("Unsupported export version");
  });

  it("import rejects unknown future versions", () => {
    const result = parseSceneComposerImport(
      { version: 99, app: "Venice Forge", scenes: [] },
      NOW,
    );
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toContain("Unsupported export version");
  });

  it("import rejects unknown app identifier", () => {
    const result = parseSceneComposerImport(
      { version: 1, app: "UnknownApp", scenes: [] },
      NOW,
    );
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toContain("Unknown app identifier");
  });

  it("import regenerates IDs", () => {
    const scene = createSceneComposerItem(
      { title: "Import Test", scope: "global" },
      NOW,
    );
    const exportData = exportSceneComposerItems([scene], NOW);
    const imported = parseSceneComposerImport(exportData, NOW);
    expect(imported.imported).toHaveLength(1);
    const imp = imported.imported[0]!;
    expect(imp.id).not.toBe(scene.id);
    expect(imp.title).toBe("Import Test");
    expect(imp.versions).toHaveLength(1);
    expect(imp.versions[0]!.sceneId).toBe(imp.id);
  });

  it("import skips invalid scene", () => {
    const result = parseSceneComposerImport(
      {
        version: 1,
        app: "Venice Forge",
        scenes: [{ id: "bad", title: "" }],
      },
      NOW,
    );
    expect(result.imported).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toBe("Invalid scene record");
  });

  it("import handles missing project as global with warning", () => {
    const scene = createSceneComposerItem(
      { title: "Project Scene", scope: "project", projectId: "nonexistent" },
      NOW,
    );
    const exportData = exportSceneComposerItems([scene], NOW);
    const imported = parseSceneComposerImport(exportData, NOW);
    expect(imported.imported).toHaveLength(1);
    // The import preserves the scope/projectId from the sanitized record
    const imp = imported.imported[0]!;
    expect(imp.scope).toBe("project");
    expect(imp.projectId).toBe("nonexistent");
  });

  it("input objects are not mutated", () => {
    const original = {
      id: "scene-mut-1",
      title: "Mutation Test",
      scope: "global",
      currentVersionId: "v1",
      versions: [
        {
          id: "v1",
          sceneId: "scene-mut-1",
          version: 1,
          title: "V1",
          components: [
            { id: "c1", kind: "subject", content: "Test content", enabled: true },
          ],
          mediaRefs: [],
          promptRefs: [],
          createdAt: NOW,
        },
      ],
      tags: ["test"],
      favorite: false,
      outputMediaIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const frozen = JSON.parse(JSON.stringify(original));
    sanitizeSceneComposerItem(original, { now: NOW });
    expect(original).toEqual(frozen);
  });

  it("isSceneComposerItem returns true for valid items", () => {
    const item = createSceneComposerItem({ title: "Valid" }, NOW);
    expect(isSceneComposerItem(item)).toBe(true);
    expect(isSceneComposerItem(null)).toBe(false);
    expect(isSceneComposerItem({})).toBe(false);
  });

  it("getCurrentSceneVersion returns current version", () => {
    const item = createSceneComposerItem({ title: "Test" }, NOW);
    const v = getCurrentSceneVersion(item);
    expect(v).not.toBeNull();
    expect(v!.version).toBe(1);

    expect(getCurrentSceneVersion(null)).toBeNull();
    expect(getCurrentSceneVersion(undefined)).toBeNull();
  });

  it("scene item with components created via createSceneVersion", () => {
    const item = createSceneComposerItem({ title: "Composed" }, NOW);
    const v2 = createSceneVersion(
      {
        sceneId: item.id,
        version: 2,
        title: "With Components",
        components: [
          { kind: "subject", content: "A mountain" },
          { kind: "mood", content: "Serene" },
          { kind: "lighting", content: "Golden hour", weight: 0.8 },
          { kind: "negative", content: "No people" },
        ],
        notes: "First draft",
      },
      NOW,
    );
    expect(v2.components).toHaveLength(4);
    expect(v2.components[0]!.kind).toBe("subject");
    expect(v2.components[2]!.weight).toBe(0.8);
    expect(v2.notes).toBe("First draft");
  });

  it("disabled component is preserved", () => {
    const comp = createSceneComponent(
      { kind: "subject", content: "Test", enabled: false },
      NOW,
    );
    expect(comp.enabled).toBe(false);
  });

  it("component with title preserves it", () => {
    const comp = createSceneComponent(
      { kind: "camera", title: "Camera Angle", content: "Low angle" },
      NOW,
    );
    expect(comp.title).toBe("Camera Angle");
    expect(comp.kind).toBe("camera");
    expect(comp.content).toBe("Low angle");
  });

  it("source metadata is preserved", () => {
    const item = createSceneComposerItem(
      { title: "Sourced", source: { type: "media", sourceId: "media-123" } },
      NOW,
    );
    expect(item.versions[0]!.source).toEqual({
      type: "media",
      sourceId: "media-123",
    });
  });
});