import StorageService from "./storageService";
import { AppDispatch } from "../types/app";
import { GalleryImage } from "../types/storage";
import { veniceFetch } from "./veniceClient";
import { extractImages, galleryFilename } from "../utils/image";
import { downloadImage } from "../utils/download";
import { isValidImageResponse } from "../utils/veniceValidation";

export const refreshGallery = async (dispatch: AppDispatch) => {
  const items = await StorageService.getItems("images");
  dispatch({ type: "SET_GALLERY", items });
};

export const saveImageRecord = async (dispatch: AppDispatch, record: GalleryImage, skipRefresh?: boolean) => {
  const saved = await StorageService.saveItem("images", {
    ...record,
    id: record.id || crypto.randomUUID(),
    timestamp: record.timestamp || Date.now(),
  });
  if (!skipRefresh) {
    await refreshGallery(dispatch);
  }
  return saved;
};

interface UpscaleOptions {
  model?: string;
  onComplete?: () => void;
  onError?: (err: Error) => void;
}

export const upscaleGalleryImage = async (
  item: GalleryImage,
  dispatch: AppDispatch,
  options: UpscaleOptions = {}
) => {
  const { model = "upscale-model", onComplete, onError } = options;
  try {
    const { data } = await veniceFetch("/image/upscale", {
      method: "POST",
      body: {
        image: item.image,
      },
      dispatch,
    });

    if (!isValidImageResponse(data)) {
      throw new Error("Upscaler returned an unexpected response shape.");
    }
    const images = extractImages(data);
    if (!images.length) throw new Error("No image data returned from upscaler.");

    const saved = await saveImageRecord(dispatch, {
      id: crypto.randomUUID(),
      image: images[0],
      prompt: item.prompt,
      negative: item.negative,
      model,
      timestamp: Date.now(),
      upscaled: true,
      parentId: item.id,
      batchId: item.batchId || null,
      batchIndex: item.batchIndex || null,
      batchCount: item.batchCount || null,
      disableWatermark: item.disableWatermark ?? true,
    });
    
    if (onComplete) onComplete();
    return saved;
  } catch (err: any) {
    console.error("Upscale failed", err);
    if (onError) onError(err);
    throw err;
  }
};

export interface DownloadAllOptions {
  onProgress?: (current: number, total: number) => void;
  cancelSignal?: { current: boolean };
}

export const downloadAllGallery = async (
  items: GalleryImage[],
  addToast: (msg: string, type: "info" | "success" | "error") => void,
  options: DownloadAllOptions = {}
) => {
  const { onProgress, cancelSignal } = options;

  if (!items.length) {
    addToast("No images to download.", "info");
    return;
  }

  const max = Math.min(items.length, 50);
  if (items.length > 50) {
    addToast("Downloading first 50 images. Large downloads may take time.", "info");
  }

  let downloaded = 0;
  let failed = 0;
  for (let i = 0; i < max; i++) {
    if (cancelSignal?.current) {
      addToast(`Download cancelled. Saved ${downloaded} of ${max} images.`, "info");
      return;
    }
    const item = items[i];
    try {
      await downloadImage(item.image, galleryFilename(item));
      downloaded++;
    } catch {
      failed++;
    }
    onProgress?.(downloaded + failed, max);
    if (i < max - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  addToast(`Saved ${downloaded} images${failed ? ` (${failed} failed)` : ''}.`, "success");
};
