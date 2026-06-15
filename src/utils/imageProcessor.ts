/**
 * @fileoverview Isomorphic utility for stripping image metadata (JPEG, PNG, WebP)
 * and routing generated assets dynamically based on prompt keywords and regex.
 */

export interface ImagePostProcessReport {
  originalBytes: number;
  processedBytes: number;
  mimeType: string;
  extension: string;
  metadataRemoved: boolean;
  warnings: string[];
}

export interface AssetRouteRule {
  id: string;
  label: string;
  directoryName: string;
  priority: number;
  match: {
    keywords?: string[];
    regex?: RegExp[];
    negativeKeywords?: string[];
  };
}

export const DEFAULT_ASSET_ROUTE_RULES: AssetRouteRule[] = [
  {
    id: "anime",
    label: "Anime / Manga / Illustration",
    directoryName: "anime",
    priority: 10,
    match: {
      keywords: ["anime", "manga", "illustration", "drawn", "cartoon", "lineart", "chibi", "comic", "fanart"],
      regex: [/\b(?:draw|illustrate|sketch|painting|watercolor|vector)\b/i]
    }
  },
  {
    id: "cinematic",
    label: "Cinematic / Film",
    directoryName: "cinematic",
    priority: 9,
    match: {
      keywords: ["cinematic", "movie", "film", "hollywood", "shot on", "photorealistic", "ultrarealistic", "bokeh"],
      regex: [/\b(?:directed by|production design|35mm|imax|panavision)\b/i]
    }
  },
  {
    id: "portraits",
    label: "Portraits / People",
    directoryName: "portraits",
    priority: 8,
    match: {
      keywords: ["portrait", "face", "close up", "model", "woman", "man", "person", "human", "girl", "boy", "actor", "actress"],
      regex: [/\b(?:studio lighting|headshot|eyes|skin texture)\b/i]
    }
  },
  {
    id: "landscapes",
    label: "Landscapes & Nature",
    directoryName: "landscapes",
    priority: 7,
    match: {
      keywords: ["landscape", "mountain", "river", "forest", "nature", "scenery", "valley", "ocean", "sunset", "sky", "beach"],
      regex: [/\b(?:golden hour|aerial view|drone shot|scenic)\b/i]
    }
  },
  {
    id: "product",
    label: "Product / Commercial Studio",
    directoryName: "product",
    priority: 6,
    match: {
      keywords: ["product", "packaging", "commercial", "advertisement", "studio shot", "mockup", "display", "renders"],
      regex: [/\b(?:advertising photography|commercial render|studio background)\b/i]
    }
  }
];

export function base64ToUint8Array(base64: string): Uint8Array {
  const raw = base64.replace(/^data:image\/\w+;base64,/, "");
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(raw, "base64"));
  }
  const binaryString = atob(raw);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array, mimeType: string): string {
  if (typeof Buffer !== "undefined") {
    return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function detectMimeType(bytes: Uint8Array): { mimeType: string; extension: string } | null {
  if (bytes.length >= 4) {
    // PNG: 89 50 4E 47
    if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
      return { mimeType: "image/png", extension: "png" };
    }
    // JPEG: FF D8
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      return { mimeType: "image/jpeg", extension: "jpg" };
    }
    // WebP: RIFF ... WEBP (offset 8)
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      const decoder = new TextDecoder("ascii");
      const sub = decoder.decode(bytes.subarray(8, 12));
      if (sub === "WEBP") {
        return { mimeType: "image/webp", extension: "webp" };
      }
    }
  }
  return null;
}

function stripJpeg(data: Uint8Array, report: ImagePostProcessReport): Uint8Array {
  if (data.length < 4 || data[0] !== 0xFF || data[1] !== 0xD8) {
    report.warnings.push("Invalid JPEG signature");
    return data;
  }

  const parts: Uint8Array[] = [new Uint8Array([0xFF, 0xD8])];
  let pos = 2;
  let hasApp1 = false;

  while (pos < data.length) {
    if (data[pos] !== 0xFF) {
      parts.push(data.subarray(pos));
      break;
    }
    const marker = data[pos + 1];
    if (marker === 0xD9) { // EOI (End of Image)
      parts.push(new Uint8Array([0xFF, 0xD9]));
      break;
    }
    if (marker === 0x00 || (marker >= 0xD0 && marker <= 0xD7)) {
      parts.push(data.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }

    if (pos + 3 >= data.length) {
      parts.push(data.subarray(pos));
      break;
    }
    const len = (data[pos + 2] << 8) | data[pos + 3];
    const nextPos = pos + 2 + len;

    if (nextPos > data.length) {
      parts.push(data.subarray(pos));
      break;
    }

    // APP1 marker is 0xE1 (EXIF and XMP metadata)
    if (marker === 0xE1) {
      hasApp1 = true;
    } else {
      parts.push(data.subarray(pos, nextPos));
    }
    pos = nextPos;
  }

  if (hasApp1) {
    report.metadataRemoved = true;
  }

  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function stripPng(data: Uint8Array, report: ImagePostProcessReport): Uint8Array {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 8) {
    report.warnings.push("Invalid PNG signature");
    return data;
  }
  for (let i = 0; i < 8; i++) {
    if (data[i] !== sig[i]) {
      report.warnings.push("Invalid PNG signature");
      return data;
    }
  }

  const parts: Uint8Array[] = [sig];
  const CRITICAL_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND", "sRGB", "gAMA"]);
  let pos = 8;
  let metadataRemoved = false;
  const decoder = new TextDecoder("ascii");

  while (pos < data.length) {
    if (pos + 8 > data.length) {
      parts.push(data.subarray(pos));
      break;
    }
    const view = new DataView(data.buffer, data.byteOffset + pos, 8);
    const len = view.getUint32(0, false);
    const type = decoder.decode(data.subarray(pos + 4, pos + 8));
    const totalChunkLen = 12 + len;

    if (pos + totalChunkLen > data.length) {
      parts.push(data.subarray(pos));
      break;
    }

    if (CRITICAL_CHUNKS.has(type)) {
      parts.push(data.subarray(pos, pos + totalChunkLen));
    } else {
      if (["tEXt", "zTXt", "iTXt", "tIME"].includes(type)) {
        metadataRemoved = true;
      }
    }
    pos += totalChunkLen;
  }

  if (metadataRemoved) {
    report.metadataRemoved = true;
  }

  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function stripWebp(data: Uint8Array, report: ImagePostProcessReport): Uint8Array {
  if (data.length < 12) {
    report.warnings.push("Invalid WebP container size");
    return data;
  }
  const decoder = new TextDecoder("ascii");
  const riff = decoder.decode(data.subarray(0, 4));
  const webp = decoder.decode(data.subarray(8, 12));

  if (riff !== "RIFF" || webp !== "WEBP") {
    report.warnings.push("Invalid WebP signature");
    return data;
  }

  const parts: Uint8Array[] = [];
  const METADATA_CHUNKS = new Set(["EXIF", "XMP ", "ICCP"]);
  let pos = 12;
  let metadataRemoved = false;

  while (pos < data.length) {
    if (pos + 8 > data.length) {
      parts.push(data.subarray(pos));
      break;
    }
    const type = decoder.decode(data.subarray(pos, pos + 4));
    const view = new DataView(data.buffer, data.byteOffset + pos + 4, 4);
    const len = view.getUint32(0, true); // Little-endian size in RIFF
    const paddedLen = len + (len % 2);
    const totalChunkLen = 8 + paddedLen;

    if (pos + totalChunkLen > data.length) {
      parts.push(data.subarray(pos));
      break;
    }

    if (METADATA_CHUNKS.has(type)) {
      metadataRemoved = true;
    } else {
      parts.push(data.subarray(pos, pos + totalChunkLen));
    }
    pos += totalChunkLen;
  }

  if (metadataRemoved) {
    report.metadataRemoved = true;
  }

  const bodyLength = parts.reduce((acc, p) => acc + p.length, 0);
  const totalLength = 12 + bodyLength;
  const result = new Uint8Array(totalLength);

  result.set(data.subarray(0, 4), 0); // "RIFF"
  const sizeView = new DataView(result.buffer, result.byteOffset + 4, 4);
  sizeView.setUint32(0, totalLength - 8, true); // Update RIFF size (little-endian)
  result.set(data.subarray(8, 12), 8); // "WEBP"

  let offset = 12;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function stripImageMetadata(
  bytes: Uint8Array
): { data: Uint8Array; report: ImagePostProcessReport } {
  const detected = detectMimeType(bytes);
  if (!detected) {
    return {
      data: bytes,
      report: {
        originalBytes: bytes.length,
        processedBytes: bytes.length,
        mimeType: "application/octet-stream",
        extension: "bin",
        metadataRemoved: false,
        warnings: ["Unsupported image format"],
      },
    };
  }
  const { mimeType, extension } = detected;
  const report: ImagePostProcessReport = {
    originalBytes: bytes.length,
    processedBytes: bytes.length,
    mimeType,
    extension,
    metadataRemoved: false,
    warnings: [],
  };

  let processed = bytes;
  try {
    if (mimeType === "image/jpeg") {
      processed = stripJpeg(bytes, report);
    } else if (mimeType === "image/png") {
      processed = stripPng(bytes, report);
    } else if (mimeType === "image/webp") {
      processed = stripWebp(bytes, report);
    }
    report.processedBytes = processed.length;
  } catch {
    report.warnings.push("Image metadata scrubbing failed");
  }

  return { data: processed, report };
}

export function processBase64Image(
  base64: string
): { base64: string; report: ImagePostProcessReport } {
  const bytes = base64ToUint8Array(base64);
  const { data, report } = stripImageMetadata(bytes);
  return {
    base64: uint8ArrayToBase64(data, report.mimeType),
    report
  };
}

export function routeAsset(prompt: string, rules: AssetRouteRule[] = DEFAULT_ASSET_ROUTE_RULES): string {
  const norm = prompt.toLowerCase();
  let bestFolder = "uncategorized";
  let maxPriority = -1;

  for (const rule of rules) {
    let matches = false;

    // Check negative keywords first
    if (rule.match.negativeKeywords?.some(k => norm.includes(k.toLowerCase()))) {
      continue;
    }

    // Check keywords
    if (rule.match.keywords?.some(k => norm.includes(k.toLowerCase()))) {
      matches = true;
    }

    // Check regex
    if (!matches && rule.match.regex?.some(rx => rx.test(norm))) {
      matches = true;
    }

    if (matches && rule.priority > maxPriority) {
      maxPriority = rule.priority;
      bestFolder = rule.directoryName;
    }
  }

  return bestFolder;
}
