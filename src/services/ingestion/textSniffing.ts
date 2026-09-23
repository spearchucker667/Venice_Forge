import { BinaryContentError } from "./ingestionErrors";

/** Bounded prefix inspected to decide text-versus-binary and the encoding.
 *  Full decoding happens separately after size limits are enforced. */
export const SNIFF_PREFIX_BYTES = 16 * 1024;

export type DetectedTextEncoding = "utf-8" | "utf-16le" | "utf-16be";

export interface TextSniffResult {
  encoding: DetectedTextEncoding;
  /** Script language derived from a shebang line, when present. */
  languageHint?: string;
}

const CONTROL_SAMPLE_CHARS = 8192;
const CONTROL_RATIO_LIMIT = 0.05;

function containsNul(text: string): boolean {
  return text.includes("\0");
}

function hasHeavyControlChars(text: string): boolean {
  const sample = text.length > CONTROL_SAMPLE_CHARS ? text.slice(0, CONTROL_SAMPLE_CHARS) : text;
  if (sample.length === 0) return false;
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) control += 1;
  }
  return control / sample.length > CONTROL_RATIO_LIMIT;
}

function assertTextLike(text: string, name: string): void {
  if (containsNul(text) || hasHeavyControlChars(text)) {
    throw new BinaryContentError(name);
  }
}

function detectUtf16Variant(bytes: Uint8Array): "utf-16le" | "utf-16be" | null {
  const pairsToSample = Math.min(Math.floor(bytes.length / 2), 64);
  if (pairsToSample < 4) return null;
  let zeroAtEven = 0;
  let zeroAtOdd = 0;
  for (let i = 0; i < pairsToSample * 2; i += 2) {
    if (bytes[i] === 0) zeroAtEven += 1;
    if (bytes[i + 1] === 0) zeroAtOdd += 1;
  }
  // ASCII-heavy UTF-16LE shows NULs in odd positions; UTF-16BE in even ones.
  if (zeroAtOdd >= 4 && zeroAtOdd > zeroAtEven * 3 && zeroAtOdd > pairsToSample / 2) {
    return "utf-16le";
  }
  if (zeroAtEven >= 4 && zeroAtEven > zeroAtOdd * 3 && zeroAtEven > pairsToSample / 2) {
    return "utf-16be";
  }
  return null;
}

const SHEBANG_LANGUAGES: Record<string, string> = {
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  dash: "bash",
  ash: "bash",
  ksh: "bash",
  python: "python",
  node: "javascript",
  nodejs: "javascript",
  ruby: "ruby",
  perl: "perl",
  php: "php",
  lua: "lua",
  pwsh: "powershell",
  powershell: "powershell",
  rscript: "r",
  r: "r",
};

export function detectShebangLanguage(text: string): string | undefined {
  if (!text.startsWith("#!")) return undefined;
  const newlineIndex = text.indexOf("\n");
  const firstLine = text.slice(2, newlineIndex === -1 ? undefined : newlineIndex).trim();
  if (!firstLine) return undefined;
  const tokens = firstLine.split(/\s+/);
  let command = tokens[0] ?? "";
  if (command === "env" || command.endsWith("/env")) {
    const rest = tokens.slice(1).filter((token) => !token.startsWith("-"));
    command = rest[0] ?? "";
  }
  const base = command.split("/").pop()?.toLowerCase() ?? "";
  const name = base.replace(/\d+$/, "");
  return SHEBANG_LANGUAGES[name];
}

/** Inspect a bounded byte prefix and decide whether it is decodable text.
 *  Throws BinaryContentError for binary-looking content. */
export function sniffTextBytes(bytes: Uint8Array, name = ""): TextSniffResult {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(3));
    assertTextLike(text, name);
    return { encoding: "utf-8", languageHint: detectShebangLanguage(text) };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const text = new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
    assertTextLike(text, name);
    return { encoding: "utf-16le", languageHint: detectShebangLanguage(text) };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const text = new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2));
    assertTextLike(text, name);
    return { encoding: "utf-16be", languageHint: detectShebangLanguage(text) };
  }

  let utf8Text: string | null = null;
  try {
    utf8Text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    utf8Text = null;
  }
  if (utf8Text !== null && !containsNul(utf8Text) && !hasHeavyControlChars(utf8Text)) {
    return { encoding: "utf-8", languageHint: detectShebangLanguage(utf8Text) };
  }

  // UTF-16 ASCII is valid UTF-8 full of NULs; let the NUL pattern decide.
  const variant = detectUtf16Variant(bytes);
  if (variant) {
    const text = new TextDecoder(variant, { fatal: true }).decode(bytes);
    assertTextLike(text, name);
    return { encoding: variant, languageHint: detectShebangLanguage(text) };
  }

  throw new BinaryContentError(name);
}

/** Fully decode bytes whose prefix already passed sniffing. Rejects NUL and
 *  control-heavy content discovered beyond the sniffed prefix. */
export function decodeSniffedText(bytes: Uint8Array, sniff: TextSniffResult, name = ""): string {
  const text = new TextDecoder(sniff.encoding, { fatal: true }).decode(bytes);
  assertTextLike(text, name);
  return text;
}

/** Read only a bounded prefix of a File for the text-versus-binary decision. */
export async function sniffFilePrefix(file: File, maxBytes = SNIFF_PREFIX_BYTES): Promise<TextSniffResult> {
  const prefix = file.size > maxBytes ? file.slice(0, maxBytes) : file;
  const bytes = new Uint8Array(await prefix.arrayBuffer());
  return sniffTextBytes(bytes, file.name);
}
