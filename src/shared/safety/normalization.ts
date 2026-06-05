/**
 * @fileoverview Text normalization for the child exploitation safety guard.
 *
 * Produces the multi-view normalized text that the guard's decision logic
 * consumes:
 *   - `norm`: leet-folded, for term matching and pattern detection
 *   - `normAges`: digit-preserving, for numeric age extraction only
 *   - `normStitch`: char-stitched then leet-folded, detects "l o l i" evasions
 *
 * Two invariant properties MUST hold:
 *   1. applyLeetFolding() destroys digits — never apply before extractMinorAges().
 *   2. MAX_SCAN_CHARS + TAIL_SCAN_CHARS + MIDDLE_SCAN_CHARS windows must cover
 *      every byte of oversized input (see the SEC-005 middle-scan fix in CHANGELOG).
 */

import { CSAM_GENRE_LABELS, AGE_EXTRACTION_PATTERNS } from "./matchTables";

// ============================================================================
// Scan-window constants
// ============================================================================

/** Maximum characters scanned per field. Oversized inputs are truncated — not an error. */
export const MAX_SCAN_CHARS = 16_384;

/** Tail scan length for content beyond the head truncation boundary. */
export const TAIL_SCAN_CHARS = 8_000;

/** Middle scan length for content between head and tail scan windows.
 *  When a payload exceeds MAX_SCAN_CHARS + TAIL_SCAN_CHARS, content in the gap
 *  is also scanned via a sliding middle window. */
export const MIDDLE_SCAN_CHARS = 8_000;

// ============================================================================
// Character-class regexes
// ============================================================================

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00AD\u2060]/g;
const COMBINING_MARKS_RE = /[\u0300-\u036f]/g;
const WHITESPACE_RE = /\s+/g;

// ============================================================================
// Substitution tables
// ============================================================================

/** Common homoglyph substitutions (lookalike characters → ASCII). */
const HOMOGLYPH_MAP: Readonly<Record<string, string>> = {
  // Cyrillic lookalikes
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "r", "\u0441": "c",
  "\u0456": "i", "\u0454": "e", "\u0458": "j",
  "\u043b": "l", "\u0442": "t", "\u0432": "b", "\u043d": "n",
  "\u043a": "k", "\u043c": "m", "\u0443": "y",
  // Greek lookalikes
  "\u03bf": "o", "\u03b5": "e", "\u03b9": "i",
  "\u03b1": "a", "\u03b2": "b", "\u03b3": "g", "\u03b4": "d",
  "\u03b6": "z", "\u03b7": "n", "\u03ba": "k", "\u03bb": "l",
  "\u03bc": "m", "\u03bd": "n", "\u03c0": "p", "\u03c1": "p",
  "\u03c3": "s", "\u03c4": "t", "\u03c6": "f", "\u03c7": "x", "\u03c9": "w",
  // Fullwidth ASCII
  "\uFF41": "a", "\uFF42": "b", "\uFF43": "c", "\uFF44": "d", "\uFF45": "e",
  "\uFF46": "f", "\uFF47": "g", "\uFF48": "h", "\uFF49": "i", "\uFF4A": "j",
  "\uFF4B": "k", "\uFF4C": "l", "\uFF4D": "m", "\uFF4E": "n", "\uFF4F": "o",
  "\uFF50": "p", "\uFF51": "q", "\uFF52": "r", "\uFF53": "s", "\uFF54": "t",
  "\uFF55": "u", "\uFF56": "v", "\uFF57": "w", "\uFF58": "x", "\uFF59": "y",
  "\uFF5A": "z",
  // Enclosed letters
  "\u24D0": "a", "\u24D4": "e", "\u24D8": "i", "\u24DE": "o", "\u24E4": "u",
  "\u24E2": "s", "\u24E3": "t", "\u24E1": "r", "\u24D1": "b", "\u24D2": "c",
  "\u24D3": "d", "\u24D6": "g", "\u24D9": "j", "\u24DA": "k", "\u24DB": "l",
  "\u24DC": "m", "\u24DD": "n", "\u24DF": "p", "\u24E0": "q", "\u24E5": "v",
  "\u24E6": "w", "\u24E7": "x", "\u24E8": "y", "\u24E9": "z",
};

/** Leetspeak substitutions (digits/symbols → letters).
 *  NOTE: This DESTROYS digits. Never apply before extractMinorAges(). */
const LEET_MAP: Readonly<Record<string, string>> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
  "@": "a", "$": "s", "!": "i", "|": "l",
};

// ============================================================================
// Normalization primitives
// ============================================================================

/** Base normalization: NFKC + zero-width removal + homoglyph folding + whitespace collapse.
 *  Preserves digits — safe for age extraction. */
export function normalizeBase(s: string): string {
  let n = s.slice(0, MAX_SCAN_CHARS);
  // Avoid splitting surrogate pairs at the truncation boundary
  while (n.length > 0 && /[\uD800-\uDBFF]$/.test(n)) {
    n = n.slice(0, -1);
  }
  n = n.trim();
  n = n.replace(/\u2028|\u2029/g, " ");
  n = n.replace(ZERO_WIDTH_RE, "");
  n = n.normalize("NFKC");
  n = Array.from(n).map(ch => HOMOGLYPH_MAP[ch] ?? ch).join("");
  n = n.replace(COMBINING_MARKS_RE, "");
  n = n.replace(WHITESPACE_RE, " ").trim();
  return n.toLowerCase();
}

/** Applies leet-folding on top of base normalization.
 *  Destroys digits — do NOT use for age extraction. */
export function applyLeetFolding(base: string): string {
  return Array.from(base).map(ch => LEET_MAP[ch] ?? ch).join("");
}

/**
 * Collapses space/punctuation-separated single-character sequences into a single token.
 * Handles evasions like "l o l i" → "loli", "p.e.d.o" → "pedo", "c-s-a-m" → "csam".
 * Applied to base-normalized (digit-safe) text before leet-folding.
 */
export function stitchSpacedChars(s: string): string {
  let prev;
  do {
    prev = s;
    // Space-separated single chars (3+ chars required to avoid collapsing ordinary text)
    s = s.replace(/([^a-z\d]|^)([a-z\d](?: [a-z\d]){2,})(?![a-z\d])/g,
      (_m, prefix, seq) => prefix + seq.replace(/ /g, ""));
    // Punctuation-separated single chars: "l.o.l.i", "p-e-d-o", "c_s_a_m"
    s = s.replace(/([^a-z\d]|^)([a-z\d](?:[._\-|,][a-z\d]){2,})(?![a-z\d])/g,
      (_m, prefix, seq) => prefix + seq.replace(/[._\-|,]/g, ""));
  } while (s !== prev);
  return s;
}

/** Matches CSAM genre labels even when obfuscated with separators between every character. */
export function hasObfuscatedCsamGenreLabel(s: string): boolean {
  for (const label of CSAM_GENRE_LABELS) {
    const pattern = new RegExp(
      "\\b" + label.split("").join("[._\\-|, ]*") + "\\b",
      "i"
    );
    if (pattern.test(s)) return true;
  }
  return false;
}

// ============================================================================
// Multi-view normalized output
// ============================================================================

export interface MultiNormResult {
  /** Leet-folded, for term matching and pattern detection. */
  norm: string;
  /** Digit-preserving, for numeric age extraction only. */
  normAges: string;
  /** Char-stitched then leet-folded, detects "l o l i" evasions. */
  normStitch: string;
  /** Optional tail window for content beyond the head truncation boundary. */
  tailNorm?: string;
  tailNormAges?: string;
  tailNormStitch?: string;
  /** Optional sliding middle windows for content between head and tail. */
  middleNorms?: { norm: string; normAges: string; normStitch: string; offset: number }[];
}

/** Produces all normalized views needed for safety assessment from a raw input string. */
export function computeMultiNorm(raw: string): MultiNormResult {
  const base = normalizeBase(raw);
  const result: MultiNormResult = {
    normAges: base,
    norm: applyLeetFolding(base),
    normStitch: applyLeetFolding(stitchSpacedChars(base)),
  };
  if (raw.length > MAX_SCAN_CHARS) {
    const tailBase = normalizeBase(raw.slice(-TAIL_SCAN_CHARS));
    result.tailNormAges = tailBase;
    result.tailNorm = applyLeetFolding(tailBase);
    result.tailNormStitch = applyLeetFolding(stitchSpacedChars(tailBase));

    // Close the head/tail scan gap. When raw.length > MAX_SCAN_CHARS + TAIL_SCAN_CHARS,
    // content in the unscanned middle band [MAX_SCAN_CHARS, length - TAIL_SCAN_CHARS) is
    // covered by sliding MIDDLE_SCAN_CHARS windows. Multiple non-overlapping windows are
    // used for very long inputs (e.g. > 100k chars).
    const headEnd = MAX_SCAN_CHARS;
    const tailStart = raw.length - TAIL_SCAN_CHARS;
    if (tailStart > headEnd) {
      const middleStarts: number[] = [];
      // Place the first middle window centered between headEnd and tailStart so that
      // every byte of the unscanned band is covered by at least one window.
      const firstStart = headEnd;
      for (let start = firstStart; start + MIDDLE_SCAN_CHARS <= tailStart; start += MIDDLE_SCAN_CHARS) {
        middleStarts.push(start);
      }
      // If there's a residual chunk smaller than MIDDLE_SCAN_CHARS between the last
      // full middle window and tailStart, add one more window to cover it.
      const lastStart = middleStarts[middleStarts.length - 1];
      if (lastStart === undefined) {
        middleStarts.push(headEnd);
      } else if (lastStart + MIDDLE_SCAN_CHARS < tailStart) {
        middleStarts.push(tailStart - MIDDLE_SCAN_CHARS);
      }
      result.middleNorms = middleStarts.map((offset) => {
        const mBase = normalizeBase(raw.slice(offset, offset + MIDDLE_SCAN_CHARS));
        return {
          norm: applyLeetFolding(mBase),
          normAges: mBase,
          normStitch: applyLeetFolding(stitchSpacedChars(mBase)),
          offset,
        };
      });
    }
  }
  return result;
}

/** Full normalization: base + leet-folding. Suitable for general term matching.
 *  Exported for use in tests and utilities. Digits are destroyed by leet-folding. */
export function normalizeText(s: string): string {
  return applyLeetFolding(normalizeBase(s));
}

// ============================================================================
// Term/pattern matching utilities
// ============================================================================

/** Strips punctuation to spaces so "child." and "child," still match " child ". */
export function toWordSpace(s: string): string {
  return s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Matches terms with word-boundary semantics, handling punctuation-adjacent terms. */
export function matchesTerms(normalizedText: string, terms: readonly string[]): boolean {
  const cleaned = toWordSpace(normalizedText);
  const padded = ` ${cleaned} `;
  for (const term of terms) {
    if (padded.includes(` ${toWordSpace(term.toLowerCase())} `)) return true;
  }
  return false;
}

export function matchesPatterns(normalizedText: string, patterns: readonly RegExp[]): boolean {
  for (const p of patterns) {
    // Clone to avoid mutating shared regex state (lastIndex)
    const clone = new RegExp(p.source, p.flags);
    if (clone.test(normalizedText)) return true;
  }
  return false;
}

/** Extracts numeric ages < 18 from text.
 *  MUST receive digit-preserving (`normAges`) text — NOT leet-folded text. */
export function extractMinorAges(normAges: string): number[] {
  const ages: number[] = [];
  for (const pattern of AGE_EXTRACTION_PATTERNS) {
    // matchAll requires g flag; clone with reset rather than setting lastIndex
    const cloned = new RegExp(pattern.source, pattern.flags);
    for (const match of normAges.matchAll(cloned)) {
      const grp = match.slice(1).find(g => g != null && /^\d{1,2}$/.test(g));
      if (!grp) continue;
      const age = parseInt(grp, 10);
      if (!isNaN(age) && age >= 0 && age < 18) ages.push(age);
    }
  }
  return ages;
}
