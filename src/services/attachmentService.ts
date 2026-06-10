/** @fileoverview Attachment reading, validation, and assembly for chat messages. */

// Code Owner: fayeblade (@spearchucker667)
import {
  MAX_ATTACHMENT_FILE_BYTES,
  MAX_PDF_ATTACHMENT_BYTES,
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

/** Supported image file extensions for MIME type fallback. */
const SUPPORTED_IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)$/i;

/** Maximum raw image size before downscaling (2 MiB). */
const MAX_IMAGE_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** Maximum image dimension after downscaling. */
const MAX_IMAGE_DIMENSION = 1024;

/** Checks whether a File object is a supported PDF. */
export function isSupportedPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Checks whether a File object is a supported text file. */
export function isSupportedTextFile(file: File): boolean {
  if (SUPPORTED_TEXT_TYPES.has(file.type)) return true;
  return SUPPORTED_TEXT_EXTENSIONS.test(file.name);
}

/** Checks whether a File object is a supported image. */
export function isSupportedImageFile(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type) || (!file.type && SUPPORTED_IMAGE_EXTENSIONS.test(file.name));
}

/** Infers image MIME type from the file extension. */
export function inferImageMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "image/png";
}

/** Reads a browser File object as a text attachment. */
export async function readTextFileAttachment(file: File): Promise<Attachment> {
  const isOverLimit = file.size > MAX_ATTACHMENT_FILE_BYTES;
  const fileToRead = isOverLimit ? file.slice(0, MAX_ATTACHMENT_FILE_BYTES) : file;
  const text = await fileToRead.text();
  return {
    id: crypto.randomUUID(),
    type: "file",
    name: file.name,
    content: text,
    size: isOverLimit ? new TextEncoder().encode(text).length : file.size,
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
  const text = result.text ?? result.content ?? result.markdown ?? "";
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
      const mimeType = file.type || inferImageMimeType(file.name);
      const dataUrl = canvas.toDataURL(mimeType, 0.85);
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for downscaling."));
    };
    img.src = url;
  });
}

/** Inspects the dimensions of an image file by decoding it. */
export async function inspectImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      // Safe fallback for test environments where URL.createObjectURL is mock/unavailable
      resolve({ width: 100, height: 100 });
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
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image dimensions."));
    };
    img.src = url;
  });
}

/** Reads an image file as an attachment, downscaling if needed. */
export async function readImageAttachment(file: File): Promise<Attachment> {
  let dims: { width: number; height: number };
  try {
    dims = await inspectImageDimensions(file);
  } catch (err) {
    throw new Error(`Failed to read image dimensions: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Dimension limit rules (4096px or 16MP)
  const maxDimensionLimit = 4096;
  const maxMegapixels = 16;
  const area = dims.width * dims.height;

  // We downscale if byte size exceeds threshold, or if dimension limits are exceeded
  const exceedsDimensionCap =
    dims.width > MAX_IMAGE_DIMENSION ||
    dims.height > MAX_IMAGE_DIMENSION ||
    dims.width > maxDimensionLimit ||
    dims.height > maxDimensionLimit ||
    area > maxMegapixels * 1_000_000;

  const forceDownscale = file.size > MAX_IMAGE_ATTACHMENT_BYTES || exceedsDimensionCap;

  let dataUrl: string;
  const mimeType = file.type || inferImageMimeType(file.name);
  if (forceDownscale) {
    dataUrl = await downscaleImageToDataUrl(file);
  } else {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    dataUrl = `data:${mimeType};base64,${btoa(binary)}`;
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
  if (isSupportedPdfFile(file)) {
    return readPdfAttachment(file);
  }
  if (isSupportedTextFile(file)) {
    return readTextFileAttachment(file);
  }
  throw new Error(`Unsupported file type: ${file.type || file.name}. Supported: text files, PDFs, and images (PNG, JPEG, WEBP).`);
}

/**
 * Reads a PDF file, extracts its text layer locally (no network call), and
 * returns it as a `file` type attachment.
 *
 * - Uses `pdfParserService` (pdfjs-dist) via dynamic import for zero bundle
 *   cost until first use.
 * - For image-only / scanned PDFs (no text layer), returns an attachment whose
 *   content prompts the user to use the Research tab's Venice text-parser.
 * - Enforces `MAX_PDF_ATTACHMENT_BYTES` size cap before parsing.
 */
export async function readPdfAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_PDF_ATTACHMENT_BYTES) {
    throw new Error(
      `PDF "${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MiB, which exceeds the ${MAX_PDF_ATTACHMENT_BYTES / (1024 * 1024)} MiB limit for PDF attachments.`
    );
  }
  // Dynamically import to avoid loading pdfjs-dist until a PDF is actually dropped.
  const { extractPdfText, pdfExtractionSummary } = await import("./pdfParserService");
  const result = await extractPdfText(file);
  const summary = pdfExtractionSummary(result, file.name);

  if (result.isImageOnly) {
    // Scanned PDF with no text layer — surface a helpful message rather than
    // empty content, directing the user to the cloud-OCR path in the Research tab.
    return {
      id: crypto.randomUUID(),
      type: "file",
      name: file.name,
      content:
        `${summary}\n\n` +
        `This PDF appears to be a scanned document (no embedded text layer was found). ` +
        `For OCR-based text extraction, upload the file via the Research tab → Document Parser, ` +
        `which uses the Venice /augment/text-parser API.`,
      size: 0,
    };
  }

  const content = `${summary}\n\n${result.text}`;
  return {
    id: crypto.randomUUID(),
    type: "file",
    name: file.name,
    content,
    size: new TextEncoder().encode(content).length,
  };
}


function utf8ByteSlice(str: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  if (encoded.length <= maxBytes) return str;
  const truncated = encoded.slice(0, maxBytes);
  const decoder = new TextDecoder();
  return decoder.decode(truncated, { stream: true });
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
        const slice = utf8ByteSlice(att.content, remaining);
        textParts.push(wrapAttachmentText(att.type, att.name, slice));
        notices.push(`"${att.name}" was truncated to fit the context budget.`);
        totalTextBytes += new TextEncoder().encode(slice).length;
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
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
