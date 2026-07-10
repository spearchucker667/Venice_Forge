const SENSITIVE_KEY_RE = /(?:api[_-]?key|authorization|bearer|password|passphrase|secret|token|sync(?:folder|path)|absolutePath|localPath)$/i

export function sanitizePortableData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePortableData)
  if (!value || typeof value !== 'object') return value
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) continue
    output[key] = sanitizePortableData(child)
  }
  return output
}
