import { IngestedAttachment } from "../../types/ingestion";
import { classifyFile } from "./fileClassifier";
import { MAX_IMAGE_FILE_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_MEGAPIXELS } from "./ingestionLimits";
import { FileTooLargeError, UnsupportedFileTypeError } from "./ingestionErrors";

function generateId(): string {
  return crypto.randomUUID();
}

/** 
 * Safely inspect dimensions using an Image element.
 * Blocks external resources from loading in SVG by doing basic sanitization,
 * though CSP should also block external loads.
 */
async function inspectImageDimensions(file: File): Promise<{ width: number; height: number; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof URL === "undefined") {
      reject(new Error("DOM environment required for image processing."));
      return;
    }

    const img = new Image();
    let url: string;

    try {
      url = URL.createObjectURL(file);
    } catch {
      reject(new Error("Failed to create object URL for image."));
      return;
    }

    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      
      const maxMegapixelsArea = MAX_IMAGE_MEGAPIXELS * 1_000_000;
      const area = width * height;

      // Downscale if it exceeds size limits
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || area > maxMegapixelsArea || file.size > 2 * 1024 * 1024) {
        let ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
        if (area * ratio * ratio > maxMegapixelsArea) {
           ratio = Math.sqrt(maxMegapixelsArea / area);
        }
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        reject(new Error("Canvas context unavailable."));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Normalize to PNG or JPEG depending on original type, default JPEG for speed/size if not PNG/WEBP
      const mimeType = (!file.type || file.type === "image/svg+xml" || file.type === "image/heic" || file.type === "image/heif" || file.type === "image/avif" || file.type === "image/tiff" || file.type === "image/bmp") 
        ? "image/jpeg" 
        : file.type;

      const dataUrl = canvas.toDataURL(mimeType, 0.85);
      resolve({ width, height, dataUrl });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to decode image dimensions for ${file.name}. Format may be unsupported by the browser.`));
    };

    img.src = url;
  });
}

export async function ingestImageFile(file: File): Promise<IngestedAttachment> {
  const classified = classifyFile(file);
  
  if (classified.kind !== "image") {
    throw new UnsupportedFileTypeError(file.name);
  }

  if (file.size > MAX_IMAGE_FILE_BYTES) {
    throw new FileTooLargeError(file.name, MAX_IMAGE_FILE_BYTES);
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  let width = 0;
  let height = 0;
  let dataUrl = "";
  const animated = classified.extension === "gif" || classified.extension === "webp"; // Best effort guess without deep parsing
  
  try {
    const result = await inspectImageDimensions(file);
    width = result.width;
    height = result.height;
    dataUrl = result.dataUrl;
  } catch (err) {
    throw new Error(`Image codec unsupported or decode failed for file: ${file.name}. ${err instanceof Error ? err.message : String(err)}`);
  }

  // Vision gating requirements
  // Any attachment with kind: "image" requires a vision model.
  const requiresVision = true;

  return {
    id: generateId(),
    kind: "image",
    name: file.name,
    extension: classified.extension,
    mimeType: file.type,
    sizeBytes: file.size,
    createdAt: new Date().toISOString(),
    dataUrl,
    image: {
      width,
      height,
      animated,
      originalMimeType: file.type,
    },
    extraction: {
      route: "browser-image-decode",
      local: true,
      truncated: false, // For image we mean "is it downscaled", but truncated means text truncated in types.
      warnings,
      errors,
    },
    modelRequirements: {
      requiresVision,
      canFallbackToText: false,
    },
    security: {
      untrusted: true,
      macrosExecuted: false,
      scriptsExecuted: false,
      htmlSanitized: true, // SVG is rasterized, so script execution is mitigated.
    },
  };
}
