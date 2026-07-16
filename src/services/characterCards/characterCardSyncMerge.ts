type SyncCard = Record<string, unknown>;

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stableStringUnion(primary: unknown, secondary: unknown): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of [...stringArray(primary), ...stringArray(secondary)]) {
    const key = value.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key); result.push(value);
  }
  return result;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function mergeNamespaces(primary: unknown, secondary: unknown): Record<string, unknown> {
  const left = object(primary) ?? {};
  const right = object(secondary) ?? {};
  const merged = structuredClone(left);
  for (const [namespace, value] of Object.entries(right)) if (!(namespace in merged)) merged[namespace] = structuredClone(value);
  return merged;
}

function entryIdentity(value: unknown): string {
  const entry = object(value);
  if (!entry) return JSON.stringify(value);
  if (typeof entry.id === "number" || typeof entry.id === "string") return `id:${String(entry.id)}`;
  return `content:${JSON.stringify([entry.name ?? "", entry.keys ?? [], entry.content ?? ""])}`;
}

function mergeCharacterBook(primary: unknown, secondary: unknown): unknown {
  const left = object(primary);
  const right = object(secondary);
  if (!left) return right ? structuredClone(right) : undefined;
  if (!right) return structuredClone(left);
  const entries = Array.isArray(left.entries) ? structuredClone(left.entries) : [];
  const seen = new Set(entries.map(entryIdentity));
  for (const entry of Array.isArray(right.entries) ? right.entries : []) {
    const identity = entryIdentity(entry);
    if (!seen.has(identity)) { seen.add(identity); entries.push(structuredClone(entry)); }
  }
  return { ...structuredClone(left), extensions: mergeNamespaces(left.extensions, right.extensions), entries };
}

function mergeVersions(primary: unknown, secondary: unknown): unknown[] {
  const left = Array.isArray(primary) ? structuredClone(primary) : [];
  const seen = new Set(left.map((version) => object(version)?.id).filter((id): id is string => typeof id === "string"));
  for (const version of Array.isArray(secondary) ? secondary : []) {
    const id = object(version)?.id;
    if (typeof id === "string" && !seen.has(id)) { seen.add(id); left.push(structuredClone(version)); }
  }
  return left.sort((a, b) => Number(object(a)?.createdAt ?? 0) - Number(object(b)?.createdAt ?? 0));
}

/** Safely merges collection fields while leaving scalar/avatar conflicts on
 * the deterministic winner. The caller must also persist the losing full
 * record as a conflict copy, so no same-field value is discarded. */
export function mergeCharacterCardConflict(winner: SyncCard, loser: SyncCard): SyncCard {
  return {
    ...structuredClone(winner),
    alternateGreetings: stableStringUnion(winner.alternateGreetings, loser.alternateGreetings),
    tags: stableStringUnion(winner.tags, loser.tags),
    tavernExtensions: mergeNamespaces(winner.tavernExtensions, loser.tavernExtensions),
    embeddedCharacterBook: mergeCharacterBook(winner.embeddedCharacterBook, loser.embeddedCharacterBook),
    versions: mergeVersions(winner.versions, loser.versions),
    metadata: mergeNamespaces(winner.metadata, loser.metadata),
  };
}
