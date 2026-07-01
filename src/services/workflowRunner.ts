import { type WorkflowCompileResult, type WorkflowCompileWarning } from "./workflowCompiler";
import { type WorkflowStepTarget } from "../types/workflow";

export type WorkflowRunActionKind =
  | "open_tab"
  | "handoff_prompt"
  | "handoff_image_recipe"
  | "handoff_scene"
  | "select_media"
  | "open_rp_context"
  | "show_note";

export interface WorkflowRunAction {
  id: string;
  kind: WorkflowRunActionKind;
  target: WorkflowStepTarget;
  tabId?: string;
  label: string;
  payload?: Record<string, unknown>;
  outputKey?: string;
}

export interface WorkflowRunPlan {
  workflowId: string;
  versionId: string;
  actions: WorkflowRunAction[];
  outputs: Record<string, Record<string, unknown>>;
  warnings: WorkflowCompileWarning[];
}

export function createWorkflowRunPlan(compiled: WorkflowCompileResult): WorkflowRunPlan {
  const plan: WorkflowRunPlan = {
    workflowId: compiled.workflowId,
    versionId: compiled.versionId,
    actions: [],
    outputs: {},
    warnings: [...compiled.warnings],
  };

  if (!compiled.canRun) {
    return plan;
  }

  for (const step of compiled.steps) {
    plan.warnings.push(...step.warnings);

    let tabId: string | undefined;
    switch (step.target) {
      case "chat": tabId = "chat"; break;
      case "image_studio": tabId = "image"; break;
      case "media_studio": tabId = "gallery"; break;
      case "research": tabId = "research"; break;
      case "scene_composer": tabId = "scenes"; break;
      case "rp_studio": tabId = "rp-studio"; break;
      case "none": tabId = undefined; break;
    }

    if (step.outputKey) {
      plan.outputs[step.outputKey] = { ...step.resolvedInput };
    }

    if (step.kind === "prompt") {
      plan.actions.push({
        id: step.id,
        kind: "handoff_prompt",
        target: step.target,
        tabId,
        label: `Send prompt to ${step.target}`,
        payload: { ...step.resolvedInput },
        outputKey: step.outputKey,
      });
    } else if (step.kind === "image_recipe") {
      plan.actions.push({
        id: step.id,
        kind: "handoff_image_recipe",
        target: step.target,
        tabId,
        label: `Send recipe to ${step.target}`,
        payload: { ...step.resolvedInput },
        outputKey: step.outputKey,
      });
    } else if (step.kind === "scene") {
      plan.actions.push({
        id: step.id,
        kind: "handoff_scene",
        target: step.target,
        tabId,
        label: `Send scene to ${step.target}`,
        payload: { ...step.resolvedInput },
        outputKey: step.outputKey,
      });
    } else if (step.kind === "media") {
      plan.actions.push({
        id: step.id,
        kind: "select_media",
        target: step.target,
        tabId,
        label: `Select media`,
        payload: { ...step.resolvedInput },
        outputKey: step.outputKey,
      });
    } else if (step.kind === "rp_character" || step.kind === "rp_scenario") {
      plan.actions.push({
        id: step.id,
        kind: "open_rp_context",
        target: step.target,
        tabId,
        label: `Open RP context`,
        payload: { ...step.resolvedInput },
        outputKey: step.outputKey,
      });
    } else if (step.kind === "note") {
       plan.actions.push({
        id: step.id,
        kind: "show_note",
        target: step.target,
        tabId,
        label: `Show note`,
        payload: { ...step.resolvedInput },
        outputKey: step.outputKey,
      });
    } else {
        plan.actions.push({
            id: step.id,
            kind: "open_tab",
            target: step.target,
            tabId,
            label: `Open ${step.target}`,
            payload: { ...step.resolvedInput },
            outputKey: step.outputKey,
        });
    }
  }

  return plan;
}