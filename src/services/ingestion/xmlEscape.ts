/**
 * Escape a string for safe use inside an XML attribute value.
 *
 * Files uploaded by users may contain quotes, angle brackets, or ampersands
 * in their names. Without escaping, a malicious file name can close the
 * wrapper tag and inject instructions into the prompt.
 */
export function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escape a string for safe use as XML body text.
 *
 * Attachment bodies are untrusted model context. Escaping angle brackets keeps
 * uploaded text from closing the wrapper and adding fake structural tags.
 */
export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
