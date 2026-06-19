/**
 * @fileoverview Centralized ID validation to prevent prototype pollution
 * and data corruption in IndexedDB operations (AUDIT-005).
 */

const VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;
const FORBIDDEN_IDS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Validates that an id is safe for use as an IndexedDB key.
 * @param id The id to validate.
 * @returns True if the id is safe.
 */
export function isValidId(id: string): boolean {
  if (typeof id !== "string") return false;
  if (!id) return false;
  if (id.length > 128) return false;
  if (FORBIDDEN_IDS.has(id)) return false;
  return VALID_ID_RE.test(id);
}

/**
 * Asserts that an id is valid, throwing a descriptive error if not.
 * @param id The id to validate.
 * @param context Optional context string for the error message.
 */
export function assertValidId(id: string, context?: string): void {
  if (!isValidId(id)) {
    throw new Error(
      `Invalid id${context ? ` (${context})` : ""}: "${id}". ` +
        "Ids must be non-empty, <= 128 chars, and match [a-zA-Z0-9_.-]. " +
        "Forbidden values: __proto__, constructor, prototype."
    );
  }
}
