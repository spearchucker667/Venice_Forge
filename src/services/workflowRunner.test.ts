import { describe, it, expect } from "vitest";
import { createWorkflowRunPlan, getWorkflowTargetTabId } from "./workflowRunner";
import { isTabId } from "../config/tabs";
import type { WorkflowStepTarget } from "../types/workflow";
import type { WorkflowCompileResult, WorkflowCompiledStep } from "./workflowCompiler";

describe("Workflow Runner", () => {
  it("creates an empty plan if compiled workflow cannot run", () => {
    const compiled: WorkflowCompileResult = {
      workflowId: "wf-1",
      versionId: "v1",
      steps: [
        { id: "s1", kind: "prompt", target: "chat", title: "Step 1", summary: "", resolvedInput: {}, warnings: [] } as WorkflowCompiledStep
      ],
      warnings: [],
      canRun: false,
    };

    const plan = createWorkflowRunPlan(compiled);
    expect(plan.actions).toHaveLength(0);
  });

  it("creates handoff actions for prompt and image_recipe", () => {
    const compiled: WorkflowCompileResult = {
      workflowId: "wf-1",
      versionId: "v1",
      steps: [
        { id: "s1", kind: "prompt", target: "chat", title: "Step 1", summary: "", resolvedInput: { text: "hello" }, warnings: [] },
        { id: "s2", kind: "image_recipe", target: "image_studio", title: "Step 2", summary: "", resolvedInput: { prompt: "world" }, warnings: [] },
      ],
      warnings: [],
      canRun: true,
    };

    const plan = createWorkflowRunPlan(compiled);
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0].kind).toBe("handoff_prompt");
    expect(plan.actions[0].tabId).toBe("chat");
    expect(plan.actions[0].payload).toEqual({ text: "hello" });

    expect(plan.actions[1].kind).toBe("handoff_image_recipe");
    expect(plan.actions[1].tabId).toBe("image");
    expect(plan.actions[1].payload).toEqual({ prompt: "world" });
  });

  it("creates correct actions for scene, media, and RP contexts", () => {
    const compiled: WorkflowCompileResult = {
      workflowId: "wf-1",
      versionId: "v1",
      steps: [
        { id: "s1", kind: "scene", target: "scene_composer", title: "Step 1", summary: "", resolvedInput: {}, warnings: [] },
        { id: "s2", kind: "media", target: "media_studio", title: "Step 2", summary: "", resolvedInput: {}, warnings: [] },
        { id: "s3", kind: "rp_character", target: "rp_studio", title: "Step 3", summary: "", resolvedInput: {}, warnings: [] },
      ],
      warnings: [],
      canRun: true,
    };

    const plan = createWorkflowRunPlan(compiled);
    expect(plan.actions).toHaveLength(3);
    
    expect(plan.actions[0].kind).toBe("handoff_scene");
    expect(plan.actions[0].tabId).toBe("scenes");
    
    expect(plan.actions[1].kind).toBe("select_media");
    expect(plan.actions[1].tabId).toBe("media");
    
    expect(plan.actions[2].kind).toBe("open_rp_context");
    expect(plan.actions[2].tabId).toBe("rp-studio");
  });

  it("creates open_tab action for generic targets", () => {
    const compiled: WorkflowCompileResult = {
      workflowId: "wf-1",
      versionId: "v1",
      steps: [
        { id: "s1", kind: "research", target: "research", title: "Step 1", summary: "", resolvedInput: {}, warnings: [] },
      ],
      warnings: [],
      canRun: true,
    };

    const plan = createWorkflowRunPlan(compiled);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].kind).toBe("open_tab");
    expect(plan.actions[0].tabId).toBe("search");
  });

  // VERIFY-139 regression guard: workflow target handoffs only emit canonical tab ids.
  it.each<[WorkflowStepTarget, string | undefined]>([
    ["chat", "chat"],
    ["image_studio", "image"],
    ["media_studio", "media"],
    ["research", "search"],
    ["scene_composer", "scenes"],
    ["rp_studio", "rp-studio"],
    ["none", undefined],
  ])("maps %s to canonical tab %s", (target, expected) => {
    const tabId = getWorkflowTargetTabId(target);
    expect(tabId).toBe(expected);
    expect(tabId === undefined || isTabId(tabId)).toBe(true);
  });

  // VERIFY-139 regression guard: plan creation is run-local and deterministic.
  it("emits independent runs and warns without dropping duplicate-key actions", () => {
    const compiled: WorkflowCompileResult = {
      workflowId: "wf-repeatable",
      versionId: "v1",
      steps: [
        { id: "s1", kind: "prompt", target: "chat", title: "First", summary: "", resolvedInput: { text: "first" }, outputKey: "shared", warnings: [] },
        { id: "s2", kind: "prompt", target: "chat", title: "Second", summary: "", resolvedInput: { text: "second" }, outputKey: "shared", warnings: [] },
      ],
      warnings: [],
      canRun: true,
    };

    const first = createWorkflowRunPlan(compiled);
    const second = createWorkflowRunPlan({ ...compiled, workflowId: "wf-independent" });

    expect(first.actions).toHaveLength(2);
    expect(second.actions).toHaveLength(2);
    expect(first.outputs.shared).toEqual({ text: "second" });
    expect(second.outputs.shared).toEqual({ text: "second" });
    expect(first.warnings).toContainEqual(expect.objectContaining({ id: "duplicate-output-key:shared" }));
  });

  it("collects warnings from steps", () => {
    const compiled: WorkflowCompileResult = {
      workflowId: "wf-1",
      versionId: "v1",
      steps: [
        { 
          id: "s1", 
          kind: "prompt", 
          target: "chat", 
          title: "Step 1", 
          summary: "", 
          resolvedInput: {}, 
          warnings: [{ id: "w1", severity: "warning", message: "Step warning" }] 
        },
      ],
      warnings: [{ id: "w2", severity: "info", message: "Global warning" }],
      canRun: true,
    };

    const plan = createWorkflowRunPlan(compiled);
    expect(plan.warnings).toHaveLength(2);
    expect(plan.warnings[0].message).toBe("Global warning");
    expect(plan.warnings[1].message).toBe("Step warning");
  });
});
