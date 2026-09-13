import type { ImageGenerateRequest, ImageGenerateResponse } from "../types/venice";
import { desktopReplicate, isElectron } from "./desktopBridge";
import { useBackgroundTaskStore } from "../stores/background-task-store";
import type { BackgroundTask } from "../types/background-task";

const REPLICATE_PREFIX = "replicate:";

export function replicateModelIdFromCatalog(model: string | undefined): string | null {
  if (typeof model !== "string") return null;
  const trimmed = model.trim();
  if (!trimmed.startsWith(REPLICATE_PREFIX)) return null;
  const id = trimmed.slice(REPLICATE_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

function asTask(value: unknown): BackgroundTask | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = (value as { id?: unknown }).id;
  if (typeof id !== "string" || id.length === 0) return undefined;
  return value as BackgroundTask;
}

export async function generateReplicateImage(
  req: ImageGenerateRequest,
): Promise<ImageGenerateResponse> {
  const model = replicateModelIdFromCatalog(req.model);
  if (!model) {
    throw new Error("Not a Replicate catalog model.");
  }
  if (!isElectron()) {
    throw new Error("Replicate generation is only available in the desktop app.");
  }

  const input: Record<string, unknown> = { prompt: req.prompt };
  if (typeof req.negative_prompt === "string" && req.negative_prompt.trim()) {
    input.negative_prompt = req.negative_prompt;
  }
  if (typeof req.width === "number") input.width = req.width;
  if (typeof req.height === "number") input.height = req.height;
  if (typeof req.seed === "number") input.seed = req.seed;

  const result = await desktopReplicate.generateImage({ model, input });
  if (!result.ok) {
    throw new Error(result.error || "Replicate generation failed.");
  }

  await useBackgroundTaskStore.getState().ensureDesktopSubscription();
  const task = asTask(result.task);
  const taskId = task?.id ?? `replicate-${Date.now()}`;
  return {
    images: [],
    id: taskId,
    model: req.model,
    queued: true,
    taskId,
  };
}
