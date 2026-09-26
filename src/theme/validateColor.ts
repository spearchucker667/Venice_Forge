/** @fileoverview Validates that a CSS color value is safe and well-formed. */

/**
 * Dangerous CSS patterns that must be rejected to prevent injection via
 * theme token values (e.g. malicious `url(...)`, `expression(...)`, etc.).
 */
const DANGEROUS_PATTERNS = /url\(|expression\(|javascript:|@import/i;

/**
 * Allowed CSS color formats:
 * - Hex: #rgb, #rgba, #rrggbb, #rrggbbaa (5/7-digit lengths rejected)
 * - RGB/RGBA: rgb(...), rgba(...) — comma or space separated, optional alpha
 *   (number or percent, comma or modern slash syntax)
 * - HSL/HSLA: hsl(...), hsla(...) — hue (deg optional), saturation %,
 *   lightness %, optional alpha (number or percent, comma or slash syntax)
 * - Safe keywords: transparent, currentColor
 */
const SAFE_COLOR_RE = /^(?:#[0-9a-fA-F]{8}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{4}|#[0-9a-fA-F]{3}|rgba?\(\s*[-+.\d]+\s*[, ]\s*[-+.\d]+\s*[, ]\s*[-+.\d]+(?:\s*[,/]\s*[-+.\d]+%?)?\s*\)|hsla?\(\s*[-+.\d]+(?:deg)?\s*[, ]\s*[-+.\d]+%\s*[, ]\s*[-+.\d]+%(?:\s*[,/]\s*[-+.\d]+%?)?\s*\)|transparent|currentColor)$/i;

/**
 * Returns true if the string is a safe, recognized CSS color value.
 * Rejects values containing dangerous CSS functions or at-rules.
 */
export function isValidColorValue(value: string): boolean {
  if (typeof value !== "string") return false;
  if (value.length > 128) return false;
  if (DANGEROUS_PATTERNS.test(value)) return false;
  return SAFE_COLOR_RE.test(value);
}
