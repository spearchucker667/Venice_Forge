import { IngestedAttachmentKind } from "../../types/ingestion";

export interface ClassifiedFile {
  kind: IngestedAttachmentKind;
  name: string;
  extension: string;
  mimeType: string;
}

const DOCUMENT_EXTS = new Set(["pdf", "docx", "rtf", "csv", "xml", "html", "htm"]);
const TEXT_EXTS = new Set(["txt", "json", "jsonl", "yaml", "yml"]);
const MARKDOWN_EXTS = new Set(["md", "markdown"]);
const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "avif",
  "bmp",
  "svg",
  "tif",
  "tiff",
  "heic",
  "heif",
]);
const CODE_EXTS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "rb",
  "php",
  "cs",
  "c",
  "cpp",
  "cc",
  "cxx",
  "h",
  "hpp",
  "java",
  "kt",
  "kts",
  "swift",
  "scala",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "sql",
  "toml",
  "ini",
]);
const CODE_FILES = new Set(["dockerfile", ".dockerfile", ".gitignore", ".gitattributes", ".editorconfig", ".env"]);

function getExtension(name: string): string {
  const parts = name.split(".");
  if (parts.length > 1 && parts[0] !== "") {
    return parts[parts.length - 1].toLowerCase();
  }
  return "";
}

function classifyByExtensionAndName(name: string, mimeType: string): IngestedAttachmentKind {
  const ext = getExtension(name);
  const lowerName = name.toLowerCase();

  // 1. Check exact names/prefixes for code
  if (CODE_FILES.has(lowerName)) {
    return "code";
  }
  if (lowerName.startsWith(".env")) {
    return "code";
  }

  // 2. Map specific extensions
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "doc") return "unknown";
  if (ext === "csv") return "spreadsheet";
  if (ext === "xlsx" || ext === "xls") return "unknown";

  if (MARKDOWN_EXTS.has(ext)) return "markdown";
  if (TEXT_EXTS.has(ext)) return "text";
  if (CODE_EXTS.has(ext) || ext === "c#") return "code";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (DOCUMENT_EXTS.has(ext)) return "text"; // Fallback to text for other doc types if needed, or specific handler

  // 3. Fallback to MIME type
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/")) return "text";
  if (mimeType === "application/json") return "text";
  if (mimeType === "application/pdf") return "pdf";

  return "unknown";
}

export function classifyFile(file: File): ClassifiedFile {
  const kind = classifyByExtensionAndName(file.name, file.type);
  let ext = getExtension(file.name);
  
  if (ext === "c#") {
      ext = "cs"; // Normalization as requested
  }

  return {
    kind,
    name: file.name,
    extension: ext,
    mimeType: file.type,
  };
}

export function isSupportedIngestionFile(file: File): boolean {
  return classifyFile(file).kind !== "unknown";
}

export function isImageLikeFile(file: File): boolean {
  return classifyFile(file).kind === "image";
}

export function isCodeLikeFile(file: File): boolean {
  return classifyFile(file).kind === "code";
}

export function isDocumentLikeFile(file: File): boolean {
  const kind = classifyFile(file).kind;
  return kind === "pdf" || kind === "docx" || kind === "markdown" || kind === "text";
}
