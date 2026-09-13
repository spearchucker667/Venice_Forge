/** @fileoverview Trusted runtime resolver for the effective image generation model.
 *
 *  The model is resolved deterministically from trusted runtime context:
 *    1. Profile preference (when a persisted default image model is configured).
 *    2. Live Venice image catalog filtered to text-to-image capable models.
 *    3. Static capability registry as a deterministic offline fallback.
 *
 *  The model is never taken from the LLM tool arguments. This prevents prompt-
 *  injection style model swaps and guarantees the approval plan stores a
 *  validated, capability-compatible model id.
 */

import type { VeniceModel } from "../../../src/types/venice";
import { getTextToImageModelCapabilities } from "../../../src/config/image-model-capabilities";
import { performGuardedVeniceRequest } from "../../services/guardPipeline";

/** Safe fallback when no live catalog or preference is available. */
export const CONFIGURED_DEFAULT_IMAGE_MODEL = "flux-dev";

export interface ImageModelResolverContext {
  profileId: string;
  /** Optional profile-scoped preference; validated against capability compatibility. */
  preferredModelId?: string;
  /** Injected for tests; when absent the resolver fetches live catalog. */
  liveCatalog?: VeniceModel[];
}

/** Returns true when the model is a text-to-image model per live metadata. */
function isLiveTextToImageModel(model: VeniceModel): boolean {
  const type = (model.type || "").toLowerCase();
  if (type && type !== "image") return false;

  const constraints = model.model_spec?.constraints;
  if (!constraints || typeof constraints !== "object") return false;

  const c = constraints as Record<string, unknown>;
  const hasImageConstraints =
    Array.isArray(c.aspectRatios) ||
    Array.isArray(c.aspect_ratios) ||
    Array.isArray(c.resolutions);
  if (!hasImageConstraints) return false;

  // Reject edit/inpaint models even if the live catalog does not tag them.
  const staticCaps = getTextToImageModelCapabilities(model.id);
  return staticCaps !== null && staticCaps.operation !== "image-edit";
}

async function fetchLiveImageModels(profileId: string): Promise<VeniceModel[]> {
  try {
    const guarded = await performGuardedVeniceRequest({
      endpoint: "/models?type=image",
      method: "GET",
      profileId,
    });
    if (guarded.kind === "blocked" || !guarded.response.ok) return [];
    const body = (guarded.response.body ?? {}) as { data?: VeniceModel[] };
    return Array.isArray(body.data) ? body.data : [];
  } catch {
    return [];
  }
}

/** Resolves the effective image generation model for `media.generateImage`. */
export async function resolveGenerateImageModel(ctx: ImageModelResolverContext): Promise<string> {
  const catalog = ctx.liveCatalog ?? (await fetchLiveImageModels(ctx.profileId));

  // 1. Honor profile preference if it is compatible.
  if (ctx.preferredModelId) {
    const preferred = catalog.find((m) => m.id === ctx.preferredModelId);
    if (preferred && isLiveTextToImageModel(preferred)) {
      return preferred.id;
    }
    // If catalog is unavailable, fall back to static registry validation.
    const staticCaps = getTextToImageModelCapabilities(ctx.preferredModelId);
    if (staticCaps && staticCaps.operation !== "image-edit") {
      return ctx.preferredModelId;
    }
  }

  // 2. Use the first live text-to-image model.
  for (const model of catalog) {
    if (isLiveTextToImageModel(model)) {
      return model.id;
    }
  }

  // 3. Deterministic offline fallback.
  return CONFIGURED_DEFAULT_IMAGE_MODEL;
}
