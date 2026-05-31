/** @fileoverview Attachment reading, validation, and assembly for chat messages. */

// Code Owner: fayeblade (@spearchucker667)
import {
  MAX_ATTACHMENT_FILE_BYTES,
  MAX_TOTAL_ATTACHMENT_CONTEXT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from "../constants/venice";
import { veniceResearchProvider } from "../research/providers/veniceResearchProvider";
import { desktopFileReader } from "./desktopBridge";
import type { Attachment, AssembledAttachmentContext } from "../types/attachment";

/** Supported text MIME types and extensions for file attachments. */
const SUPPORTED_TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
  "text/javascript",
  "application/javascript",
  "text/typescript",
  "text/x-typescript",
  "text/python",
  "text/x-python",
]);

const SUPPORTED_TEXT_EXTENSIONS = /\.(txt|md|markdown|ts|tsx|json|py|js|jsx|css|html|htm|yaml|yml|xml|csv|log|sh|bash|zsh|ps1|go|rs|java|c|cpp|h|hpp|swift|kt|rb|php)$/i;

/** Supported image MIME types. */
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Maximum raw image size before downscaling (2 MiB). */
const MAX_IMAGE_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** Maximum image dimension after downscaling. */
const MAX_IMAGE_DIMENSION = 1024;

/** Checks whether a File object is a supported text file. */
export function isSupportedTextFile(file: File): boolean {
  if (SUPPORTED_TEXT_TYPES.has(file.type)) return true;
  return SUPPORTED_TEXT_EXTENSIONS.test(file.name);
}

/** Checks whether a File object is a supported image. */
export function isSupportedImageFile(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type);
}

/** Reads a browser File object as a text attachment. */
export async function readTextFileAttachment(file: File): Promise<Attachment> {
  const text = await file.text();
  return {
    id: crypto.randomUUID(),
    type: "file",
    name: file.name,
    content: text,
    size: file.size,
  };
}

/** Reads a local file path (desktop only) as a text attachment. */
export async function readLocalPathAttachment(filePath: string): Promise<Attachment> {
  const result = await desktopFileReader.readLocalFile(filePath);
  if (!result.ok || result.content === undefined) {
    throw new Error(result.error || "Failed to read local file.");
  }
  return {
    id: crypto.randomUUID(),
    type: "file",
    name: filePath.split(/[/\\]/).pop() || "file",
    content: result.content,
    size: new TextEncoder().encode(result.content).length,
  };
}

/** Scrapes a URL and returns a text attachment. */
export async function scrapeUrlAttachment(url: string, signal?: AbortSignal): Promise<Attachment> {
  const result = await veniceResearchProvider.scrape!({
    url,
    timeoutMs: 20000,
    signal,
    options: { outputFormat: "text", removeImages: true },
  });
  const text = result.text || result.content || result.markdown || "";
  return {
    id: crypto.randomUUID(),
    type: "url",
    name: url,
    content: text,
    size: new TextEncoder().encode(text).length,
  };
}

/** Downscales an image to fit within max dimension and returns a base64 data URL. */
export async function downscaleImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL(file.type, 0.85);
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for downscaling."));
    };
    img.src = url;
  });
}

/** Reads an image file as an attachment, downscaling if needed. */
export async function readImageAttachment(file: File): Promise<Attachment> {
  let dataUrl: string;
  if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
    dataUrl = await downscaleImageToDataUrl(file);
  } else {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    dataUrl = `data:${file.type};base64,${btoa(binary)}`;
  }
  return {
    id: crypto.randomUUID(),
    type: "image",
    name: file.name,
    content: dataUrl,
    size: new TextEncoder().encode(dataUrl).length,
  };
}

/** Validates and processes a dropped/selected file into an attachment. */
export async function processFileAttachment(file: File): Promise<Attachment> {
  if (isSupportedImageFile(file)) {
    return readImageAttachment(file);
  }
  if (isSupportedTextFile(file)) {
    if (file.size > MAX_ATTACHMENT_FILE_BYTES) {
      const text = (await file.text()).slice(0, MAX_ATTACHMENT_FILE_BYTES);
      return {
        id: crypto.randomUUID(),
        type: "file",
        name: file.name,
        content: text,
        size: new TextEncoder().encode(text).length,
      };
    }
    return readTextFileAttachment(file);
  }
  throw new Error(`Unsupported file type: ${file.type || file.name}. Supported: text files and images (PNG, JPEG, WEBP).`);
}

/** Assembles attachments into injectable context text and image content parts. */
export function assembleAttachmentContext(
  attachments: Attachment[]
): AssembledAttachmentContext {
  const notices: string[] = [];
  const images: Array<{ name: string; dataUrl: string }> = [];
  const textParts: string[] = [];
  let totalTextBytes = 0;
  let truncated = false;

  for (const att of attachments.slice(0, MAX_ATTACHMENTS_PER_MESSAGE)) {
    if (att.type === "image") {
      images.push({ name: att.name, dataUrl: att.content });
      continue;
    }

    const encoded = new TextEncoder().encode(att.content);
    if (totalTextBytes + encoded.length > MAX_TOTAL_ATTACHMENT_CONTEXT_BYTES) {
      const remaining = MAX_TOTAL_ATTACHMENT_CONTEXT_BYTES - totalTextBytes;
      if (remaining > 100) {
        const slice = att.content.slice(0, remaining);
        textParts.push(wrapAttachmentText(att.type, att.name, slice));
        notices.push(`"${att.name}" was truncated to fit the context budget.`);
      } else {
        notices.push(`"${att.name}" was skipped due to context budget.`);
      }
      truncated = true;
      continue;
    }

    textParts.push(wrapAttachmentText(att.type, att.name, att.content));
    totalTextBytes += encoded.length;
  }

  if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    notices.push(`Only the first ${MAX_ATTACHMENTS_PER_MESSAGE} attachments were included.`);
    truncated = true;
  }

  return {
    text: textParts.join("\n\n"),
    images,
    truncated,
    notices,
  };
}

function wrapAttachmentText(type: string, name: string, content: string): string {
  if (type === "url") {
    return `<doc url="${escapeXml(name)}">\n${content}\n</doc>`;
  }
  return `<file name="${escapeXml(name)}">\n${content}\n</file>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
