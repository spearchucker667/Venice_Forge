import { describe, it, expect } from "vitest";
import { compileWorkflowTemplate } from "./workflowCompiler";
import { createWorkflowTemplateItem } from "../types/workflow";

describe("Workflow Compiler", () => {
  it("compiles basic workflow", () => {
    const item = createWorkflowTemplateItem({
      title: "Test",
      versions: [
        {
          id: "v1",
          workflowId: "temp",
          version: 1,
          title: "V1",
          createdAt: new Date().toISOString(),
          steps: [
            { id: "s1", kind: "prompt", target: "chat", title: "Step 1", enabled: true, order: 0 },
            { id: "s2", kind: "note", target: "none", title: "Step 2", enabled: true, order: 1 },
          ],
        },
      ],
    });

    const result = compileWorkflowTemplate(item, item.versions[0]);
    expect(result.canRun).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].kind).toBe("prompt");
    expect(result.steps[1].kind).toBe("note");
  });

  it("skips disabled steps", () => {
    const item = createWorkflowTemplateItem({
      title: "Test",
      versions: [
        {
          id: "v1",
          workflowId: "temp",
          version: 1,
          title: "V1",
          createdAt: new Date().toISOString(),
          steps: [
            { id: "s1", kind: "prompt", target: "chat", title: "Step 1", enabled: true, order: 0 },
            { id: "s2", kind: "note", target: "none", title: "Step 2", enabled: false, order: 1 },
          ],
        },
      ],
    });

    const result = compileWorkflowTemplate(item, item.versions[0]);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].id).toBe("s1");
  });

  it("orders steps deterministically", () => {
    const item = createWorkflowTemplateItem({
      title: "Test",
      versions: [
        {
          id: "v1",
          workflowId: "temp",
          version: 1,
          title: "V1",
          createdAt: new Date().toISOString(),
          steps: [
            { id: "s2", kind: "note", target: "none", title: "Step 2", enabled: true, order: 5 },
            { id: "s1", kind: "prompt", target: "chat", title: "Step 1", enabled: true, order: 1 },
          ],
        },
      ],
    });

    const result = compileWorkflowTemplate(item, item.versions[0]);
    expect(result.steps[0].id).toBe("s1");
    expect(result.steps[1].id).toBe("s2");
  });

  it("missing refs produce warnings", () => {
    const item = createWorkflowTemplateItem({
      title: "Test",
      versions: [
        {
          id: "v1",
          workflowId: "temp",
          version: 1,
          title: "V1",
          createdAt: new Date().toISOString(),
          steps: [
            { id: "s1", kind: "prompt", target: "chat", title: "Step 1", enabled: true, order: 0, ref: { promptId: "missing-123" } },
          ],
        },
      ],
    });

    const result = compileWorkflowTemplate(item, item.versions[0], { prompts: [] });
    expect(result.steps[0].warnings).toHaveLength(1);
    expect(result.steps[0].warnings[0].severity).toBe("warning");
    expect(result.canRun).toBe(true); // Warnings don't block run, only errors do
  });

  it("injects resolved prompt references into resolvedInput", () => {
    const item = createWorkflowTemplateItem({
      title: "Test",
      versions: [
        {
          id: "v1",
          workflowId: "temp",
          version: 1,
          title: "V1",
          createdAt: new Date().toISOString(),
          steps: [
            {
              id: "s1",
              kind: "prompt",
              target: "chat",
              title: "Step 1",
              enabled: true,
              order: 0,
              input: { temperature: 0.4 },
              ref: { promptId: "prompt-1" },
            },
          ],
        },
      ],
    });

    const result = compileWorkflowTemplate(item, item.versions[0], {
      prompts: [
        {
          id: "prompt-1",
          title: "Opening prompt",
          currentVersionId: "pv1",
          versions: [{ id: "pv1", content: "Write a concise launch brief." }],
        },
      ],
    });

    expect(result.steps[0].resolvedInput).toMatchObject({
      temperature: 0.4,
      promptId: "prompt-1",
      promptVersionId: "pv1",
      promptTitle: "Opening prompt",
      prompt: "Write a concise launch brief.",
    });
    expect(result.steps[0].warnings).toEqual([]);
  });

  it("injects resolved scene and character references into resolvedInput", () => {
    const item = createWorkflowTemplateItem({
      title: "Test",
      versions: [
        {
          id: "v1",
          workflowId: "temp",
          version: 1,
          title: "V1",
          createdAt: new Date().toISOString(),
          steps: [
            {
              id: "scene-step",
              kind: "scene",
              target: "scene_composer",
              title: "Scene Step",
              enabled: true,
              order: 0,
              ref: { sceneId: "scene-1" },
            },
            {
              id: "character-step",
              kind: "rp_character",
              target: "rp_studio",
              title: "Character Step",
              enabled: true,
              order: 1,
              ref: { characterId: "char-1" },
            },
          ],
        },
      ],
    });

    const result = compileWorkflowTemplate(item, item.versions[0], {
      scenes: [{ id: "scene-1", title: "Rainy station", currentVersionId: "sv1" }],
      characters: [{ id: "char-1", name: "Mara", instructions: "Speak plainly." }],
    });

    expect(result.steps[0].resolvedInput).toMatchObject({
      sceneId: "scene-1",
      sceneTitle: "Rainy station",
      scene: { id: "scene-1", title: "Rainy station", currentVersionId: "sv1" },
    });
    expect(result.steps[1].resolvedInput).toMatchObject({
      characterId: "char-1",
      characterName: "Mara",
      character: { id: "char-1", name: "Mara", instructions: "Speak plainly." },
    });
  });

  it("unsupported step kind produces error", () => {
    // Bypass createWorkflowTemplateItem's sanitization for this test to actually pass an invalid kind to the compiler
    const item = {
      id: "wf-1",
      scope: "project",
      title: "Test",
      versions: [],
      currentVersionId: "v1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
      favorite: false,
    } as any;

    const version = {
      id: "v1",
      workflowId: "wf-1",
      version: 1,
      title: "V1",
      createdAt: new Date().toISOString(),
      steps: [
        { id: "s1", kind: "invalid_kind" as any, target: "chat", title: "Step 1", enabled: true, order: 0 },
      ],
    } as any;

    item.versions.push(version);

    const result = compileWorkflowTemplate(item, version);
    expect(result.canRun).toBe(false);
    expect(result.steps[0].warnings).toHaveLength(1);
    expect(result.steps[0].warnings[0].severity).toBe("error");
  });
});
