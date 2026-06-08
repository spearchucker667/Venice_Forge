/** @fileoverview Phase 2E — Scene compiler tests. */

import { describe, it, expect } from "vitest";
import { compileSceneToRecipe, type SceneCompilerOptions } from "./sceneCompiler";
import { createSceneComposerItem, createSceneVersion, createSceneComponent } from "../types/scene";
import type { SceneComposerItem, SceneVersion } from "../types/scene";

function makeScene(name: string): SceneComposerItem {
  return createSceneComposerItem({ title: name });
}

function makeVersion(sceneId: string, version: number, components: Parameters<typeof createSceneComponent>[0][]): SceneVersion {
  return createSceneVersion({
    sceneId,
    version,
    title: "v" + version,
    components,
  });
}

describe("sceneCompiler", () => {
  it("compiles components in canonical order into a prompt", () => {
    const scene = makeScene("Test");
    const version = makeVersion(scene.id, 1, [
      { kind: "subject", content: "A warrior" },
      { kind: "location", content: "in a dark forest" },
      { kind: "mood", content: "epic and dramatic" },
      { kind: "camera", content: "wide angle shot" },
      { kind: "character", content: "with a companion wolf" },
      { kind: "lighting", content: "moonlight" },
      { kind: "note", content: "final version" },
    ]);
    const result = compileSceneToRecipe(scene, version);
    expect(result.recipe.prompt).toBe(
      "A warrior, with a companion wolf, in a dark forest, epic and dramatic, wide angle shot, moonlight, final version",
    );
  });

  it("skips disabled components", () => {
    const scene = makeScene("Test");
    const version = makeVersion(scene.id, 1, [
      { kind: "subject", content: "A hero", enabled: true },
      { kind: "mood", content: "happy", enabled: false },
      { kind: "location", content: "on a beach", enabled: true },
    ]);
    const result = compileSceneToRecipe(scene, version);
    expect(result.recipe.prompt).toBe("A hero, on a beach");
  });

  it("extracts negative prompt from negative components", () => {
    const scene = makeScene("Test");
    const version = makeVersion(scene.id, 1, [
      { kind: "subject", content: "A castle" },
      { kind: "negative", content: "no people" },
      { kind: "negative", content: "no cars" },
      { kind: "negative", content: "" },
    ]);
    const result = compileSceneToRecipe(scene, version);
    expect(result.recipe.prompt).toBe("A castle");
    expect(result.recipe.negativePrompt).toBe("no people, no cars");
  });

  it("extracts style from style components", () => {
    const scene = makeScene("Test");
    const version = makeVersion(scene.id, 1, [
      { kind: "subject", content: "A dragon" },
      { kind: "style", content: "oil painting" },
      { kind: "style", content: "impressionist" },
    ]);
    const result = compileSceneToRecipe(scene, version);
    expect(result.recipe.style).toBe("oil painting, impressionist");
  });

  it("maps scene defaults onto the recipe", () => {
    const scene = createSceneComposerItem({
      title: "With Defaults",
      defaultModel: "flux-dev",
      defaultWidth: 1024,
      defaultHeight: 768,
      defaultAspectRatio: "4:3",
    });
    const version = makeVersion(scene.id, 1, [
      { kind: "subject", content: "A landscape" },
    ]);
    const result = compileSceneToRecipe(scene, version);
    expect(result.recipe.model).toBe("flux-dev");
    expect(result.recipe.width).toBe(1024);
    expect(result.recipe.height).toBe(768);
    expect(result.recipe.aspectRatio).toBe("4:3");
  });

  it("model / dimension overrides take precedence over defaults", () => {
    const scene = createSceneComposerItem({
      title: "Overrides",
      defaultModel: "flux-dev",
      defaultWidth: 512,
      defaultHeight: 512,
    });
    const version = makeVersion(scene.id, 1, [
      { kind: "subject", content: "A landscape" },
    ]);
    const options: SceneCompilerOptions = {
      modelOverride: "lustify-sdxl",
      widthOverride: 1024,
      heightOverride: 1024,
      aspectRatioOverride: "1:1",
    };
    const result = compileSceneToRecipe(scene, version, options);
    expect(result.recipe.model).toBe("lustify-sdxl");
    expect(result.recipe.width).toBe(1024);
    expect(result.recipe.height).toBe(1024);
    expect(result.recipe.aspectRatio).toBe("1:1");
  });

  it("resolves Prompt Library references via lookup function", () => {
    const scene = makeScene("Test");
    const version = createSceneVersion({
      sceneId: scene.id,
      version: 1,
      title: "v1",
      components: [
        { kind: "subject", content: "A spaceship" },
      ],
      promptRefs: [
        { promptId: "plib-1", role: "base_prompt" },
        { promptId: "plib-2", role: "style_prompt" },
      ],
    });
    const resolvePrompt: SceneCompilerOptions["resolvePrompt"] = (ref) => {
      if (ref.promptId === "plib-1") {
        return { promptId: "plib-1", title: "Sci-Fi Base", content: "Futuristic sci-fi scene" };
      }
      return null;
    };
    const result = compileSceneToRecipe(scene, version, { resolvePrompt });
    expect(result.recipe.prompt).toBe("Futuristic sci-fi scene, A spaceship");
    expect(result.resolvedPrompts).toHaveLength(1);
    expect(result.unresolvedPrompts).toHaveLength(1);
    expect(result.unresolvedPrompts[0]!.promptId).toBe("plib-2");
  });

  it("includes negative content from resolved prompts", () => {
    const scene = makeScene("Test");
    const version = createSceneVersion({
      sceneId: scene.id,
      version: 1,
      title: "v1",
      components: [
        { kind: "subject", content: "A forest" },
      ],
      promptRefs: [
        { promptId: "plib-1", role: "negative_prompt" },
      ],
    });
    const resolvePrompt: SceneCompilerOptions["resolvePrompt"] = () => ({
      promptId: "plib-1",
      title: "Neg",
      content: "Avoid bad things",
      negativeContent: "no blur, no distortion",
    });
    const result = compileSceneToRecipe(scene, version, { resolvePrompt });
    // The resolved prompt content ("Avoid bad things") is added to the main prompt
    // The negativeContent is NOT added to the recipe's negativePrompt — only
    // "negative" components contribute to negativePrompt. The resolved prompt's
    // negativeContent is available on the ResolvedPromptRef for the UI to use.
    expect(result.recipe.prompt).toContain("Avoid bad things");
    expect(result.resolvedPrompts[0]!.negativeContent).toBe("no blur, no distortion");
  });

  it("handles empty scene gracefully", () => {
    const scene = makeScene("Empty");
    const version = makeVersion(scene.id, 1, []);
    const result = compileSceneToRecipe(scene, version);
    expect(result.recipe.prompt).toBe("");
    expect(result.recipe.negativePrompt).toBeUndefined();
    expect(result.resolvedPrompts).toHaveLength(0);
    expect(result.unresolvedPrompts).toHaveLength(0);
  });

  it("caps prompt at MAX_PROMPT_CHARS", () => {
    const scene = makeScene("Long");
    const longText = "x".repeat(35_000);
    const version = makeVersion(scene.id, 1, [
      { kind: "subject", content: longText },
    ]);
    const result = compileSceneToRecipe(scene, version);
    expect(result.recipe.prompt.length).toBeLessThanOrEqual(32_000);
    expect(result.promptCharCount).toBe(32_000);
  });

  it("sets metadata with source scene info", () => {
    const scene = makeScene("Metadata Test");
    const version = createSceneVersion({
      sceneId: scene.id,
      version: 1,
      title: "v1",
      components: [
        { kind: "subject", content: "A test" },
      ],
      mediaRefs: [
        { mediaId: "media-1", role: "style_reference" },
        { mediaId: "media-2", role: "background_reference" },
      ],
      promptRefs: [
        { promptId: "plib-1", role: "base_prompt" },
      ],
    });
    const resolvePrompt: SceneCompilerOptions["resolvePrompt"] = () => ({
      promptId: "plib-1", title: "P", content: "Prompt content",
    });
    const result = compileSceneToRecipe(scene, version, { resolvePrompt });
    expect(result.recipe.metadata).toBeDefined();
    expect(result.recipe.metadata!.sourceSceneId).toBe(scene.id);
    expect(result.recipe.metadata!.sourceSceneVersionId).toBe(version.id);
    expect(result.recipe.metadata!.sourceSceneVersion).toBe(1);
    expect(result.recipe.metadata!.sourceSceneTitle).toBe("Metadata Test");
    expect(result.recipe.metadata!.mediaRefCount).toBe(2);
    expect(result.recipe.metadata!.promptRefCount).toBe(1);
    expect(result.recipe.metadata!.resolvedPromptCount).toBe(1);
    expect(result.recipe.metadata!.unresolvedPromptCount).toBe(0);
  });

  it("mediaRefs are passed through for UI pre-fill", () => {
    const scene = makeScene("Test");
    const version = createSceneVersion({
      sceneId: scene.id,
      version: 1,
      title: "v1",
      components: [
        { kind: "subject", content: "A test" },
      ],
      mediaRefs: [
        { mediaId: "media-1", role: "character_reference", note: "Use this pose" },
        { mediaId: "media-2", role: "composition_reference" },
      ],
    });
    const result = compileSceneToRecipe(scene, version);
    expect(result.mediaRefs).toHaveLength(2);
    expect(result.mediaRefs[0]!.mediaId).toBe("media-1");
    expect(result.mediaRefs[0]!.note).toBe("Use this pose");
    expect(result.mediaRefs[1]!.mediaId).toBe("media-2");
  });

  it("does not mutate the input scene or version", () => {
    const scene = makeScene("Immutable");
    const version = makeVersion(scene.id, 1, [
      { kind: "subject", content: "A test" },
    ]);
    const sceneSnapshot = JSON.stringify(scene);
    const versionSnapshot = JSON.stringify(version);
    compileSceneToRecipe(scene, version);
    expect(JSON.stringify(scene)).toBe(sceneSnapshot);
    expect(JSON.stringify(version)).toBe(versionSnapshot);
  });
});