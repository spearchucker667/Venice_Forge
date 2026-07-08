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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function findRecordById(items: unknown[] | undefined, id: string): Record<string, unknown> | null {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (!isRecord(item)) continue;
    if (item.id === id) return item;
  }
  return null;
}

function resolvePromptVersion(
  prompt: Record<string, unknown>,
  preferredVersionId?: string,
): Record<string, unknown> | null {
  const versions = Array.isArray(prompt.versions) ? prompt.versions.filter(isRecord) : [];
  if (versions.length === 0) return null;
  if (preferredVersionId) {
    const preferred = versions.find((version) => version.id === preferredVersionId);
    if (preferred) return preferred;
  }
  const currentVersionId = stringField(prompt, "currentVersionId");
  if (currentVersionId) {
    const current = versions.find((version) => version.id === currentVersionId);
    if (current) return current;
  }
  return versions[versions.length - 1] ?? null;
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
        const found = findRecordById(context?.prompts, step.ref.promptId);
        if (!found) {
          compiledStep.warnings.push({
            id: crypto.randomUUID(),
            severity: "warning",
            message: `Referenced prompt ${step.ref.promptId} not found in context.`,
            stepId: step.id,
          });
        } else {
          const promptVersion = resolvePromptVersion(found, step.ref.promptVersionId);
          compiledStep.resolvedInput = {
            ...compiledStep.resolvedInput,
            promptId: step.ref.promptId,
            promptVersionId: stringField(promptVersion ?? {}, "id"),
            promptTitle: stringField(found, "title"),
            prompt: stringField(promptVersion ?? {}, "content") ?? "",
            negativePrompt: stringField(promptVersion ?? {}, "negativeContent"),
          };
        }
      } else if (step.ref.sceneId) {
        compiledStep.summary = `Uses scene: ${step.ref.sceneId}`;
        const found = findRecordById(context?.scenes, step.ref.sceneId);
        if (!found) {
          compiledStep.warnings.push({
            id: crypto.randomUUID(),
            severity: "warning",
            message: `Referenced scene ${step.ref.sceneId} not found in context.`,
            stepId: step.id,
          });
        } else {
          compiledStep.resolvedInput = {
            ...compiledStep.resolvedInput,
            sceneId: step.ref.sceneId,
            sceneVersionId: step.ref.sceneVersionId ?? stringField(found, "currentVersionId"),
            sceneTitle: stringField(found, "title"),
            scene: { ...found },
          };
        }
      } else if (step.ref.mediaId) {
        compiledStep.summary = `Uses media: ${step.ref.mediaId}`;
        // Media blobs are never copied directly; the ID is passed.
      } else if (step.ref.characterId) {
        compiledStep.summary = `Uses character: ${step.ref.characterId}`;
        const found = findRecordById(context?.characters, step.ref.characterId);
        if (!found) {
          compiledStep.warnings.push({
            id: crypto.randomUUID(),
            severity: "warning",
            message: `Referenced character ${step.ref.characterId} not found in context.`,
            stepId: step.id,
          });
        } else {
          compiledStep.resolvedInput = {
            ...compiledStep.resolvedInput,
            characterId: step.ref.characterId,
            characterName: stringField(found, "name") ?? stringField(found, "title"),
            character: { ...found },
          };
        }
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
