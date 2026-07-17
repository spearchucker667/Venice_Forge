/** @fileoverview Local-first PDF text extraction using pdfjs-dist.
 *
 * Uses Mozilla's pdf.js to parse PDF files entirely in-process (renderer or
 * Node/Electron main) — no cloud API call required, no internet access needed.
 *
 * For PDFs that have an embedded text layer (the majority of modern PDFs) the
 * extraction is fast and accurate. For scanned PDFs with only a raster image
 * layer, `extractPdfText` returns an empty string and callers should surface a
 * message prompting the user to use the Venice `/augment/text-parser` endpoint
 * (which has server-side OCR) or another OCR tool.
 *
 * ### Worker configuration
 * pdfjs-dist requires a worker script. In the renderer/Electron environment we
 * point it at the bundled `pdf.worker.min.mjs` included with the package. The
 * worker is loaded once globally and reused across calls.
 *
 * ### Bundle impact
 * This module is dynamically imported in `attachmentService.ts` so the pdf.js
 * bundle (~3 MB gzipped) is not loaded until the user first drops a PDF file.
 */

import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { warn } from "../shared/logger";

/** Maximum characters extracted per page to avoid context explosion. */
const MAX_CHARS_PER_PAGE = 4_000;

/** Maximum total characters returned across all pages. */
const MAX_TOTAL_CHARS = 100_000;

/** Lazily-initialised pdf.js library reference (loaded once per session). */
let pdfJsLib: typeof import("pdfjs-dist") | null = null;

/**
 * Loads pdfjs-dist if not already loaded and configures the worker URL.
 * Safe to call multiple times — returns the cached instance after first load.
 */
async function getPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (pdfJsLib) return pdfJsLib;
  // Dynamic import keeps pdf.js out of the main bundle until first use.
  const lib = await import("pdfjs-dist");
  // Configure the worker. pdfjs-dist ships the worker next to the main module.
  // Vite/Electron serves it from the same origin as the app assets.
  if (!lib.GlobalWorkerOptions.workerSrc) {
    // Use the legacy worker for Electron (file:// protocol) and web alike.
    // The `?url` Vite import would be cleaner but requires vite-specific syntax.
    // Instead we rely on pdfjs-dist's built-in worker fallback (fake worker)
    // for environments where a blob/url worker cannot be loaded.
    lib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).href;
  }
  pdfJsLib = lib;
  return lib;
}

/** Result returned by extractPdfText(). */
export interface PdfExtractionResult {
  /** Concatenated text from all pages, truncated to MAX_TOTAL_CHARS. */
  text: string;
  /** Number of pages in the document. */
  pageCount: number;
  /** True when extraction yielded no text (likely a scanned/image-only PDF). */
  isImageOnly: boolean;
  /** True when the output was truncated at MAX_TOTAL_CHARS. */
  truncated: boolean;
}

/**
 * Extracts human-readable text from a PDF File or ArrayBuffer.
 *
 * @param source - A browser `File` (drag-and-drop) or raw `ArrayBuffer`.
 * @returns Extracted text and metadata. Returns `isImageOnly: true` when the
 *          PDF has no text layer (common for scanned documents).
 * @throws On corrupt / unreadable PDFs (password-protected, zero pages, etc.)
 */
export async function extractPdfText(
  source: File | ArrayBuffer
): Promise<PdfExtractionResult> {
  const lib = await getPdfJs();

  // Resolve source to a Uint8Array — pdfjs-dist's loadingTask accepts this.
  let data: Uint8Array;
  if (source instanceof File) {
    const buffer = await source.arrayBuffer();
    data = new Uint8Array(buffer);
  } else {
    data = new Uint8Array(source);
  }

  let loadingTask: PDFDocumentLoadingTask;
  let doc: PDFDocumentProxy;
  try {
    loadingTask = lib.getDocument({ data, useWorkerFetch: false });
    doc = await loadingTask.promise;
  } catch (err) {
    throw new Error(
      `Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const pageCount = doc.numPages;
  const parts: string[] = [];
  let totalChars = 0;
  let truncated = false;

  for (let i = 1; i <= pageCount; i++) {
    if (truncated) break;
    let page;
    try {
      page = await doc.getPage(i);
    } catch (err) {
      warn(`[pdfParserService] Could not load page ${i}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    let textContent;
    try {
      textContent = await page.getTextContent();
    } catch (err) {
      warn(`[pdfParserService] Could not extract text from page ${i}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    // Concatenate text items, preserving newlines at paragraph boundaries.
    const pageText = textContent.items
      .filter((item): item is import("pdfjs-dist/types/src/display/api").TextItem =>
        "str" in item
      )
      .map((item) => item.str + (item.hasEOL ? "\n" : " "))
      .join("")
      .trim();


    const sliced =
      pageText.length > MAX_CHARS_PER_PAGE
        ? pageText.slice(0, MAX_CHARS_PER_PAGE) + "…"
        : pageText;

    if (totalChars + sliced.length > MAX_TOTAL_CHARS) {
      const remaining = MAX_TOTAL_CHARS - totalChars;
      if (remaining > 100) {
        parts.push(sliced.slice(0, remaining));
      }
      truncated = true;
      break;
    }

    parts.push(sliced);
    totalChars += sliced.length;
  }

  await loadingTask.destroy();

  const text = parts.join("\n\n");
  return {
    text,
    pageCount,
    isImageOnly: text.trim().length === 0,
    truncated,
  };
}

/**
 * Returns a human-readable extraction summary suitable for attaching as a
 * context header in the assembled prompt (e.g. "(3-page PDF, text extracted)").
 */
export function pdfExtractionSummary(result: PdfExtractionResult, fileName: string): string {
  const pages = result.pageCount === 1 ? "1 page" : `${result.pageCount} pages`;
  if (result.isImageOnly) {
    return `[PDF: "${fileName}", ${pages}, no text layer — upload to Venice Research tab for OCR]`;
  }
  const truncNote = result.truncated ? ", truncated to fit context budget" : "";
  return `[PDF: "${fileName}", ${pages}${truncNote}]`;
}
