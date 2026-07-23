import { nativeImage } from "electron";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { MIB } from "../../src/shared/limits";
import type { ImageInspectorInput, ImageInspectorInputSource } from "../../src/types/imageInspector";
import { persistGeneratedMedia, resolveGeneratedMedia } from "./generatedMediaStore";

export const IMAGE_INSPECTOR_MAX_BYTES = 18 * MIB;
export const IMAGE_INSPECTOR_MIN_DIMENSION = 64;
export const IMAGE_INSPECTOR_MAX_PIXELS = 33_177_600;

const SUPPORTED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export function detectImageMimeType(bytes: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (bytes.length >= 2 && bytes.subarray(0, 2).toString("hex") === "ffd8") return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function validateImageInspectorBytes(bytes: Buffer): {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
} {
  if (bytes.length === 0) throw new Error("The selected image is empty.");
  if (bytes.length > IMAGE_INSPECTOR_MAX_BYTES) {
    throw new Error(`The selected image exceeds the ${IMAGE_INSPECTOR_MAX_BYTES}-byte limit.`);
  }

  const mimeType = detectImageMimeType(bytes);
  if (!mimeType) throw new Error("The selected file is not a supported PNG, JPEG, or WebP image.");

  const decoded = nativeImage.createFromBuffer(bytes);
  if (decoded.isEmpty()) throw new Error("The selected image could not be decoded.");
  const { width, height } = decoded.getSize();
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < IMAGE_INSPECTOR_MIN_DIMENSION ||
    height < IMAGE_INSPECTOR_MIN_DIMENSION
  ) {
    throw new Error(`The selected image must be at least ${IMAGE_INSPECTOR_MIN_DIMENSION} pixels in each dimension.`);
  }
  if (width * height > IMAGE_INSPECTOR_MAX_PIXELS) {
    throw new Error(`The selected image exceeds the ${IMAGE_INSPECTOR_MAX_PIXELS}-pixel limit.`);
  }
  return { mimeType, width, height };
}

export async function persistImageInspectorInput(input: {
  bytes: Buffer;
  source: Extract<ImageInspectorInputSource, "file" | "clipboard">;
  displayName: string;
}): Promise<ImageInspectorInput> {
  const validated = validateImageInspectorBytes(input.bytes);
  const durableMedia = await persistGeneratedMedia(input.bytes, validated.mimeType);
  return {
    id: crypto.randomUUID(),
    source: input.source,
    displayName: path.basename(input.displayName).slice(0, 255) || "Image",
    mimeType: validated.mimeType,
    byteLength: input.bytes.length,
    width: validated.width,
    height: validated.height,
    sha256: durableMedia.sha256,
    mediaId: durableMedia.id,
    uri: durableMedia.url,
  };
}

export async function resolveImageInspectorInput(
  mediaId: string,
  source: Extract<ImageInspectorInputSource, "attachment" | "app-media">,
): Promise<ImageInspectorInput> {
  const resolved = await resolveGeneratedMedia(mediaId);
  if (!resolved || !SUPPORTED_IMAGE_MIME.has(resolved.mimeType)) throw new Error("Image media was not found.");
  const bytes = await fs.readFile(resolved.path);
  const validated = validateImageInspectorBytes(bytes);
  if (validated.mimeType !== resolved.mimeType) throw new Error("Stored image metadata did not match its bytes.");
  return {
    id: crypto.randomUUID(),
    source,
    displayName: `Media ${mediaId.slice(0, 8)}`,
    mimeType: validated.mimeType,
    byteLength: bytes.length,
    width: validated.width,
    height: validated.height,
    sha256: mediaId,
    mediaId,
    uri: `venice-media://${mediaId}`,
  };
}

export async function readImageInspectorDataUrl(mediaId: string): Promise<{
  dataUrl: string;
  mimeType: string;
  byteLength: number;
}> {
  const resolved = await resolveGeneratedMedia(mediaId);
  if (!resolved || !SUPPORTED_IMAGE_MIME.has(resolved.mimeType)) throw new Error("Image media was not found.");
  const stat = await fs.stat(resolved.path);
  if (!stat.isFile() || stat.size <= 0 || stat.size > IMAGE_INSPECTOR_MAX_BYTES) {
    throw new Error("Stored image size is invalid.");
  }
  const bytes = await fs.readFile(resolved.path);
  const validated = validateImageInspectorBytes(bytes);
  if (validated.mimeType !== resolved.mimeType) throw new Error("Stored image metadata did not match its bytes.");
  return {
    dataUrl: `data:${validated.mimeType};base64,${bytes.toString("base64")}`,
    mimeType: validated.mimeType,
    byteLength: bytes.length,
  };
}
