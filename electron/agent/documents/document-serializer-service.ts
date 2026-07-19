import { createHash } from "node:crypto";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { DocumentBlock, DocumentFormat, DocumentWarning } from "../../../src/agent/contracts/documents";

export interface SerializationResult {
  format: DocumentFormat;
  bytes: Uint8Array;
  contentHash: string;
  warnings: DocumentWarning[];
  validation: { valid: boolean; details: string[] };
}

export type SerializableDocument =
  | { kind: "blocks"; title?: string; blocks: DocumentBlock[] }
  | { kind: "json"; value: unknown; indentation: 2 | 4 }
  | { kind: "csv"; columns: string[]; rows: string[][]; delimiter: "," | ";" | "\t"; includeHeader: boolean };

const encoder = new TextEncoder();

function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function plainBlock(block: DocumentBlock): string {
  switch (block.type) {
    case "heading": return `${"#".repeat(block.level)} ${block.text}`;
    case "paragraph": return block.text;
    case "list": return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${item.text}`).join("\n");
    case "table": return block.rows.map((row) => row.cells.map((cell) => cell.text).join("\t")).join("\n");
    case "code": return `\`\`\`${block.language ?? ""}\n${block.text}\n\`\`\``;
    case "quote": return `> ${block.text}`;
    case "image": return `[Image: ${block.altText ?? block.caption ?? "managed image"}]`;
    case "pageBreak": return "\f";
  }
}

function blocksToText(blocks: DocumentBlock[]): string {
  return blocks.map(plainBlock).join("\n\n");
}

function blocksToHtml(blocks: DocumentBlock[], title?: string): string {
  const body = blocks.map((block) => {
    switch (block.type) {
      case "heading": return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
      case "paragraph": return `<p>${escapeHtml(block.text)}</p>`;
      case "list": return `<${block.ordered ? "ol" : "ul"}>${block.items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</${block.ordered ? "ol" : "ul"}>`;
      case "table": return `<table><tbody>${block.rows.map((row) => `<tr>${row.cells.map((cell) => `<td>${escapeHtml(cell.text)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      case "code": return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
      case "quote": return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
      case "image": return `<p>[Image: ${escapeHtml(block.altText ?? block.caption ?? "managed image")}]</p>`;
      case "pageBreak": return '<hr class="page-break">';
    }
  }).join("\n");
  return `<!doctype html>\n<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'none'; img-src data:"><title>${escapeHtml(title ?? "Document")}</title></head><body>${body}</body></html>`;
}

function protectCsvFormula(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string, delimiter: string): string {
  const safe = protectCsvFormula(value);
  return safe.includes(delimiter) || /["\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function serializeCsv(document: Extract<SerializableDocument, { kind: "csv" }>): string {
  if (document.columns.length === 0 || document.columns.length > 500 || document.rows.length > 100_000) throw new Error("CSV dimensions exceed safe limits.");
  if (document.rows.some((row) => row.length !== document.columns.length)) throw new Error("CSV rows must match the declared column width.");
  const rows = document.includeHeader ? [document.columns, ...document.rows] : document.rows;
  return rows.map((row) => row.map((cell) => csvCell(cell, document.delimiter)).join(document.delimiter)).join("\r\n");
}

function docxChildren(blocks: DocumentBlock[]): Array<Paragraph | Table> {
  return blocks.flatMap((block): Array<Paragraph | Table> => {
    switch (block.type) {
      case "heading":
        return [new Paragraph({ text: block.text, heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][block.level - 1] })];
      case "paragraph": return [new Paragraph(block.text)];
      case "list": return block.items.map((item, index) => new Paragraph({ text: item.text, bullet: block.ordered ? undefined : { level: 0 }, numbering: block.ordered ? { reference: "vf-numbering", level: 0, instance: index } : undefined }));
      case "table": return [new Table({ rows: block.rows.map((row) => new TableRow({ children: row.cells.map((cell) => new TableCell({ children: [new Paragraph(cell.text)] })) })) })];
      case "code": return [new Paragraph({ children: [new TextRun({ text: block.text, font: "Courier New" })] })];
      case "quote": return [new Paragraph({ text: block.text, style: "Intense Quote" })];
      case "image": return [new Paragraph(`[Image: ${block.altText ?? block.caption ?? "managed image"}]`)];
      case "pageBreak": return [new Paragraph({ pageBreakBefore: true })];
    }
  });
}

async function serializeDocx(document: Extract<SerializableDocument, { kind: "blocks" }>): Promise<Uint8Array> {
  const output = new Document({
    numbering: { config: [{ reference: "vf-numbering", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "start" }] }] },
    sections: [{ children: docxChildren(document.blocks) }],
  });
  return new Uint8Array(await Packer.toBuffer(output));
}

async function serializePdf(document: Extract<SerializableDocument, { kind: "blocks" }>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = blocksToText(document.blocks).replaceAll("\f", "\n").split("\n");
  let page = pdf.addPage();
  let y = page.getHeight() - 54;
  for (const sourceLine of lines) {
    const chunks = sourceLine.match(/.{1,90}(?:\s|$)|.{1,90}/g) ?? [""];
    for (const line of chunks) {
      if (y < 54) { page = pdf.addPage(); y = page.getHeight() - 54; }
      page.drawText(line.trimEnd(), { x: 54, y, size: 11, font, maxWidth: page.getWidth() - 108 });
      y -= 15;
    }
    y -= 5;
  }
  return pdf.save();
}

export async function serializeDocument(format: DocumentFormat, document: SerializableDocument): Promise<SerializationResult> {
  let bytes: Uint8Array;
  const warnings: DocumentWarning[] = [];
  if (format === "json") {
    if (document.kind !== "json") throw new Error("JSON export requires a validated JSON representation.");
    const json = JSON.stringify(document.value, null, document.indentation);
    if (json === undefined) throw new Error("The value cannot be represented as JSON.");
    bytes = encoder.encode(`${json}\n`);
  } else if (format === "csv") {
    if (document.kind !== "csv") throw new Error("CSV export requires a validated tabular representation.");
    bytes = encoder.encode(serializeCsv(document));
  } else {
    if (document.kind !== "blocks") throw new Error(`${format.toUpperCase()} export requires normalized document blocks.`);
    if (format === "txt") bytes = encoder.encode(blocksToText(document.blocks));
    else if (format === "md") bytes = encoder.encode(blocksToText(document.blocks));
    else if (format === "html") bytes = encoder.encode(blocksToHtml(document.blocks, document.title));
    else if (format === "docx") bytes = await serializeDocx(document);
    else if (format === "pdf") {
      bytes = await serializePdf(document);
      warnings.push({ code: "pdf_reflow", message: "PDF output is a reflowed derivative of the normalized document." });
    } else throw new Error("Unsupported document format.");
  }
  const valid = bytes.byteLength > 0
    && (format !== "pdf" || new TextDecoder("latin1").decode(bytes.slice(0, 5)) === "%PDF-")
    && (format !== "docx" || bytes[0] === 0x50 && bytes[1] === 0x4b);
  return {
    format,
    bytes,
    contentHash: contentHash(bytes),
    warnings,
    validation: { valid, details: valid ? ["Output signature and non-empty content validated."] : ["Output validation failed."] },
  };
}
