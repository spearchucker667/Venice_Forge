import {
  type WorkflowTemplateItem,
  type WorkflowVersion,
  type WorkflowStepKind,
  type WorkflowStepTarget,
} from "../types/workflow";

export interface WorkflowCompileWarning {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  stepId?: string;
}

export interface WorkflowCompiledStep {
  id: string;
  title: string;
  kind: WorkflowStepKind;
  target: WorkflowStepTarget;
  summary: string;
  resolvedInput: Record<string, unknown>;
  outputKey?: string;
  warnings: WorkflowCompileWarning[];
}

export interface WorkflowCompileResult {
  workflowId: string;
  versionId: string;
  steps: WorkflowCompiledStep[];
  warnings: WorkflowCompileWarning[];
  canRun: boolean;
}

export interface WorkflowCompileContext {
  projectId?: string | null;
  prompts?: unknown[];
  scenes?: unknown[];
  media?: unknown[];
  characters?: unknown[];
  scenarios?: unknown[];
}

export function compileWorkflowTemplate(
  workflow: WorkflowTemplateItem,
  version: WorkflowVersion,
  context?: WorkflowCompileContext,
): WorkflowCompileResult {
  const result: WorkflowCompileResult = {
    workflowId: workflow.id,
    versionId: version.id,
    steps: [],
    warnings: [],
    canRun: true,
  };

  const steps = [...version.steps].sort((a, b) => a.order - b.order);

  for (const step of steps) {
    if (!step.enabled) continue;

    const compiledStep: WorkflowCompiledStep = {
      id: step.id,
      title: step.title,
      kind: step.kind,
      target: step.target,
      summary: "",
      resolvedInput: { ...step.input },
      outputKey: step.outputKey,
      warnings: [],
    };

    // Very basic resolution logic for Phase 2G validation tests
    if (step.ref) {
      if (step.ref.promptId) {
        compiledStep.summary = `Uses prompt: ${step.ref.promptId}`;
        const found = (context?.prompts as Array<{ id: string }>)?.find((p) => p.id === step.ref!.promptId);
        if (!found) {
          compiledStep.warnings.push({
            id: crypto.randomUUID(),
            severity: "warning",
            message: `Referenced prompt ${step.ref.promptId} not found in context.`,
            stepId: step.id,
          });
        }
      } else if (step.ref.sceneId) {
        compiledStep.summary = `Uses scene: ${step.ref.sceneId}`;
        const found = (context?.scenes as Array<{ id: string }>)?.find((p) => p.id === step.ref!.sceneId);
        if (!found) {
          compiledStep.warnings.push({
            id: crypto.randomUUID(),
            severity: "warning",
            message: `Referenced scene ${step.ref.sceneId} not found in context.`,
            stepId: step.id,
          });
        }
      } else if (step.ref.mediaId) {
        compiledStep.summary = `Uses media: ${step.ref.mediaId}`;
        // Media blobs are never copied directly; the ID is passed.
      } else if (step.ref.characterId) {
        compiledStep.summary = `Uses character: ${step.ref.characterId}`;
      } else if (step.ref.scenarioId) {
        compiledStep.summary = `Uses scenario: ${step.ref.scenarioId}`;
      }
    }

    if (step.kind !== "prompt" && step.kind !== "image_recipe" && step.kind !== "scene" && step.kind !== "media" && step.kind !== "research" && step.kind !== "rp_character" && step.kind !== "rp_scenario" && step.kind !== "handoff" && step.kind !== "note") {
      compiledStep.warnings.push({
        id: crypto.randomUUID(),
        severity: "error",
        message: `Unsupported step kind: ${step.kind}`,
        stepId: step.id,
      });
      result.canRun = false;
    }

    if (compiledStep.warnings.some(w => w.severity === "error")) {
        result.canRun = false;
    }

    result.steps.push(compiledStep);
  }

  // Aggregate step errors to global canRun
  if (result.steps.some(s => s.warnings.some(w => w.severity === "error"))) {
    result.canRun = false;
  }

  return result;
}