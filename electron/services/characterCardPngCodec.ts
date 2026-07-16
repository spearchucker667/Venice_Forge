import type { CharacterCardV2Dto } from "../../src/types/character-card-spec";
import { validateCharacterCardV2 } from "../../src/services/characterCards/characterCardAdapter";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_BYTES = 20 * 1024 * 1024;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 40_000_000;
const MAX_CHUNKS = 10_000;

interface PngChunk { type: string; data: Buffer; raw: Buffer }

export interface CharacterCardPngInspection {
  card: CharacterCardV2Dto;
  width: number;
  height: number;
  visiblePng: Buffer;
}

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function parseChunks(png: Buffer): PngChunk[] {
  if (png.length > MAX_PNG_BYTES) throw new Error("Character-card PNG exceeds the 20 MiB limit.");
  if (png.length < 20 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Invalid PNG signature.");
  const chunks: PngChunk[] = [];
  let offset = 8;
  let sawIend = false;
  while (offset < png.length) {
    if (chunks.length >= MAX_CHUNKS) throw new Error("PNG contains too many chunks.");
    if (offset + 12 > png.length) throw new Error("Truncated PNG chunk header.");
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > png.length || end < offset) throw new Error("Truncated PNG chunk payload.");
    const typeBuffer = png.subarray(offset + 4, offset + 8);
    const type = typeBuffer.toString("ascii");
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("Invalid PNG chunk type.");
    const data = png.subarray(offset + 8, offset + 8 + length);
    const expected = png.readUInt32BE(offset + 8 + length);
    if (crc32(Buffer.concat([typeBuffer, data])) !== expected) throw new Error(`PNG ${type} chunk failed CRC validation.`);
    chunks.push({ type, data, raw: png.subarray(offset, end) });
    offset = end;
    if (type === "IEND") {
      if (length !== 0) throw new Error("Invalid PNG IEND chunk.");
      sawIend = true;
      break;
    }
  }
  if (!sawIend || offset !== png.length) throw new Error("PNG must end exactly at a valid IEND chunk.");
  if (chunks[0]?.type !== "IHDR" || chunks[0].data.length !== 13) throw new Error("PNG is missing a valid IHDR chunk.");
  const width = chunks[0].data.readUInt32BE(0);
  const height = chunks[0].data.readUInt32BE(4);
  if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new Error("PNG dimensions exceed character-card limits.");
  }
  return chunks;
}

function isCharaChunk(chunk: PngChunk): boolean {
  if (chunk.type !== "tEXt") return false;
  const separator = chunk.data.indexOf(0);
  return separator === 5 && chunk.data.subarray(0, separator).toString("latin1") === "chara";
}

function isBase64Ascii(data: Buffer): boolean {
  if (!data.length || data.length % 4 !== 0) return false;
  let paddingStarted = false;
  let padding = 0;
  for (const byte of data) {
    if (byte === 61) { paddingStarted = true; padding += 1; if (padding > 2) return false; continue; }
    if (paddingStarted) return false;
    const allowed = (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) || (byte >= 48 && byte <= 57) || byte === 43 || byte === 47;
    if (!allowed) return false;
  }
  return true;
}

function decodeCard(chunk: PngChunk): CharacterCardV2Dto {
  if (chunk.data.length <= 6 || chunk.data.length - 6 > Math.ceil(MAX_METADATA_BYTES * 4 / 3) + 4) {
    throw new Error("Malformed or oversized SillyTavern chara metadata.");
  }
  const encodedBytes = chunk.data.subarray(6);
  if (!isBase64Ascii(encodedBytes)) {
    throw new Error("Malformed SillyTavern chara metadata.");
  }
  const encoded = encodedBytes.toString("ascii");
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.length > MAX_METADATA_BYTES) throw new Error("Decoded character-card metadata exceeds 8 MiB.");
  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Character-card metadata is not valid UTF-8 JSON.");
  }
  const issues = validateCharacterCardV2(parsed as CharacterCardV2Dto);
  if (issues.some((issue) => issue.severity === "error")) throw new Error("Character-card metadata is not a valid V2 card.");
  return parsed as CharacterCardV2Dto;
}

export function inspectCharacterCardPng(png: Buffer): CharacterCardPngInspection {
  const chunks = parseChunks(png);
  const candidates = chunks.filter(isCharaChunk);
  if (candidates.length !== 1) throw new Error(candidates.length ? "PNG contains multiple chara metadata chunks." : "PNG has no SillyTavern chara metadata.");
  const width = chunks[0].data.readUInt32BE(0);
  const height = chunks[0].data.readUInt32BE(4);
  return {
    card: decodeCard(candidates[0]),
    width,
    height,
    visiblePng: Buffer.concat([PNG_SIGNATURE, ...chunks.filter((chunk) => !isCharaChunk(chunk)).map((chunk) => chunk.raw)]),
  };
}

export function embedCharacterCardInPng(png: Buffer, card: CharacterCardV2Dto): Buffer {
  if (validateCharacterCardV2(card).some((issue) => issue.severity === "error")) throw new Error("Refusing to export an invalid V2 character card.");
  const chunks = parseChunks(png);
  const json = Buffer.from(JSON.stringify(card), "utf8");
  if (json.length > MAX_METADATA_BYTES) throw new Error("Character-card metadata exceeds 8 MiB.");
  const text = Buffer.concat([Buffer.from("chara\0", "latin1"), Buffer.from(json.toString("base64"), "ascii")]);
  const outputChunks: Buffer[] = [];
  for (const chunk of chunks) {
    if (isCharaChunk(chunk)) continue;
    if (chunk.type === "IEND") outputChunks.push(makeChunk("tEXt", text));
    outputChunks.push(chunk.raw);
  }
  const output = Buffer.concat([PNG_SIGNATURE, ...outputChunks]);
  if (output.length > MAX_PNG_BYTES) throw new Error("Exported character-card PNG exceeds 20 MiB.");
  const verified = inspectCharacterCardPng(output).card;
  if (JSON.stringify(verified) !== JSON.stringify(card)) throw new Error("Exported character-card PNG failed semantic verification.");
  return output;
}
