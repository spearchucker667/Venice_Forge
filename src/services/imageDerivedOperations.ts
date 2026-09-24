/** @fileoverview Shared direct derived-image operations for Media Studio.
 *
 * Runs Upscale 2x/4x, Background Removal, and Inpainting against a selected
 * MediaItem through the canonical media-request-adapter builders and the
 * centralized `veniceBlob` transport, then persists the result as a DERIVED
 * asset (lineage via `upsertDerivative`; the source is never overwritten).
 */

import { veniceBlob } from "../lib/venice-client";
import {
  buildBackgroundRemoveRequest,
  buildImageInpaintRequest,
  buildImageUpscaleRequest,
  validateImageBlob,
} from "./media-request-adapter";
import { normalizeError } from "./veniceClient/errors";
import { resolvePlayableMediaUrl } from "./playableMediaUrl";
import { useMediaStore } from "../stores/media-store";
import { mediaItemSource } from "../utils/mediaItem";
import { blobToDataUrl } from "../utils/image";
import { generateId } from "../lib/utils";
import { DEFAULT_IMAGE_EDIT_MODEL } from "../constants/venice";
import type { MediaItem, MediaOperation } from "../types/media";

import { convertImageFormat } from "../utils/imageFormatConverter";

export type ImageDerivedOperation =
  | { kind: "upscale"; scale: 2 | 4 }
  | { kind: "remove-background" }
  | { kind: "inpaint"; mask: Blob; prompt?: string };

export type ImageDerivedOperationOutcome =
  | { status: "completed"; asset: MediaItem }
  | { status: "failed"; operation: ImageDerivedOperation; error: string; retryable: boolean }
  | { status: "cancelled" };

export interface RunImageDerivedOperationInput {
  sourceAsset: MediaItem;
  operation: ImageDerivedOperation;
  /** Edit-capable model used for inpainting. Ignored for upscale/background
   *  removal, whose endpoints take no model selector. */
  modelId?: string;
  /** Requested target image format (Workstream B). Converts to WebP when requested. */
  targetFormat?: "png" | "webp";
  signal?: AbortSignal;
}

const NON_RETRYABLE_STATUSES = new Set([400, 401, 402, 403, 404, 413, 415]);

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function classifyFailure(error: unknown): { error: string; retryable: boolean } {
  const status =
    error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;
  const raw = error instanceof Error ? error.message : String(error);
  return {
    error: normalizeError(status, raw),
    retryable: status === null ? true : !NON_RETRYABLE_STATUSES.has(status),
  };
}

/** Resolves a MediaItem into the image input string accepted by the canonical
 *  adapter builders (data URL, HTTPS URL, or legacy base64). Durable
 *  `venice-media://` and transient `blob:` sources are fetched through the
 *  established capability-URL resolution path and inlined as a data URL. */
export async function resolveMediaItemImageInput(item: MediaItem): Promise<string> {
  const source = mediaItemSource(item);
  if (!source) throw new Error("This source asset is no longer available locally.");
  if (
    source.startsWith("data:") ||
    source.startsWith("http://") ||
    source.startsWith("https://")
  ) {
    return source;
  }
  const resolved = await resolvePlayableMediaUrl(source);
  const fetchUrl = resolved || source;
  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Could not read the source asset bytes (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("The source asset is empty.");
  return blobToDataUrl(blob);
}

export async function runImageDerivedOperation({
  sourceAsset,
  operation,
  modelId,
  targetFormat,
  signal,
}: RunImageDerivedOperationInput): Promise<ImageDerivedOperationOutcome> {
  try {
    if (signal?.aborted) return { status: "cancelled" };
    const image = await resolveMediaItemImageInput(sourceAsset);

    let blob: Blob;
    let mediaOperation: MediaOperation;
    let derivedModel: string;
    let derivedPrompt: string;
    let upscaleFactor: 2 | 4 | undefined;

    if (operation.kind === "upscale") {
      blob = await veniceBlob(
        "/image/upscale",
        buildImageUpscaleRequest({ image, scale: operation.scale }),
        { signal },
      );
      blob = validateImageBlob(blob);
      mediaOperation = "upscale";
      derivedModel = modelId ?? "venice-image-tools";
      derivedPrompt = sourceAsset.prompt;
      upscaleFactor = operation.scale;
    } else if (operation.kind === "remove-background") {
      blob = await veniceBlob(
        "/image/background-remove",
        buildBackgroundRemoveRequest(image),
        { signal },
      );
      blob = validateImageBlob(blob, "image/png");
      mediaOperation = "background-remove";
      derivedModel = modelId ?? "venice-image-tools";
      derivedPrompt = sourceAsset.prompt;
    } else {
      const prompt = operation.prompt?.trim() ?? "";
      blob = await veniceBlob(
        "/image/multi-edit",
        buildImageInpaintRequest({
          image,
          mask: await blobToDataUrl(operation.mask),
          prompt,
          model: modelId ?? DEFAULT_IMAGE_EDIT_MODEL,
          output_format: targetFormat ?? "png",
        }),
        { signal },
      );
      blob = validateImageBlob(blob);
      mediaOperation = "edit";
      derivedModel = modelId ?? DEFAULT_IMAGE_EDIT_MODEL;
      derivedPrompt = prompt || sourceAsset.prompt;
    }

    if (signal?.aborted) return { status: "cancelled" };
    let dataUrl = await blobToDataUrl(blob);
    let finalMimeType: "image/png" | "image/webp" =
      blob.type === "image/webp" ? "image/webp" : "image/png";

    if (targetFormat === "webp" && finalMimeType !== "image/webp") {
      const converted = await convertImageFormat(dataUrl, "webp");
      dataUrl = converted.dataUrl;
      finalMimeType = "image/webp";
    }

    const asset: MediaItem = {
      id: generateId(),
      image: dataUrl,
      prompt: derivedPrompt,
      model: derivedModel,
      timestamp: Date.now(),
      mediaType: "image",
      mimeType: finalMimeType,
      operation: mediaOperation,
      parentId: sourceAsset.id,
      childrenIds: [],
      tags: [],
      note: "",
      favorite: false,
      upscaleFactor,
    };
    const saved = await useMediaStore.getState().upsertDerivative(asset, sourceAsset.id);
    return { status: "completed", asset: saved };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return { status: "cancelled" };
    return { status: "failed", operation, ...classifyFailure(error) };
  }
}
