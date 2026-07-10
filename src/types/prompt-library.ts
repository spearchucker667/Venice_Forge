/** @fileoverview Phase 2D — Prompt Library data model.
 *
 * A `PromptLibraryItem` is a user-saved, reusable prompt record. Each item
 * has one or more `PromptVersion`s and a pointer to the "current" version
 * (the one the user wants applied by default). Versions are append-only —
 * editing the content creates a new version; old versions remain readable.
 *
 * Items are scoped to a project (or to "global" so the prompt is visible
 * across every project). All persistence is additive and survives schema
 * upgrades — the store uses the same encrypted-at-rest path as Projects
 * and chat history.
 *
 * Safety: prompt records must NEVER carry API keys, bearer tokens, raw
 * authorization headers, provider secrets, or binary data. The
 * `sanitizePromptLibraryItem` and `sanitizePromptVersion` helpers reject
 * or redact obvious secrets at write time so the import / export and
 * restore paths can never re-introduce them.
 *
 * Use this contract for the Phase 2D Prompt Library and any future
 * Scene Composer / workflow / RP surface that needs prompt content.
 */

/** Valid kinds of prompt records. Drives the default UI behaviour
 *  and the "where can I apply this?" filter in the Command Palette. */
export type PromptKind =
  | "chat"
  | "system"
  | "image"
  | "negative"
  | "research"
  | "character"
  | "workflow"
  | "recipe"
  | "general";

/** "global" prompts are visible everywhere; "project" prompts are
 *  visible only in the matching project (or in All Projects). */
export type PromptScope = "global" | "project";

/** Optional declared variable on a prompt. The Phase 2D foundation
 *  exposes the metadata but does not yet wire an interpolation engine —
 *  the contract is forward-compatible with the future templating work
 *  (out of scope here). */
export interface PromptVariable {
  name: string;
  description?: string;
  defaultValue?: string;
  required?: boolean;
}

/** Origin of a prompt version. Stored on every version so the
 *  "Saved from Image Studio" or "Imported from export" lineage stays
 *  visible in the UI without re-deriving it. */
export type PromptSourceType =
  | "manual"
  | "chat"
  | "image"
  | "media"
  | "recipe"
  | "research"
  | "import"
  | "system";

export interface PromptVersionSource {
  type: PromptSourceType;
  sourceId?: string;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  title: string;
  content: string;
  negativeContent?: string;
  notes?: string;
  createdAt: string;
  createdBy?: "user" | "import" | "system";
  source?: PromptVersionSource;
}

export interface PromptLibraryItem {
  id: string;
  kind: PromptKind;
  scope: PromptScope;
  projectId?: string | null;
  title: string;
  description?: string;
  currentVersionId: string;
  versions: PromptVersion[];
  tags: string[];
  favorite: boolean;
  archivedAt?: string | null;
  modelHints?: string[];
  variables?: PromptVariable[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  // ---- Phase 2G Sync Metadata ----
  deletedAt?: number | null;
  schemaVersion?: number;
  revisionId?: string;
  baseRevisionId?: string;
  deviceId?: string;
}

export const PROMPT_LIBRARY_VERSION = 1 as const;

export interface PromptLibraryExport {
  version: 1;
  exportedAt: string;
  app: "Venice Forge";
  prompts: PromptLibraryItem[];
}

export interface PromptLibraryImportSkip {
  reason: string;
  title?: string;
}

export interface PromptLibraryImportResult {
  imported: PromptLibraryItem[];
  reconciled: PromptLibraryItem[];
  skipped: PromptLibraryImportSkip[];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const PROMPT_KINDS: readonly PromptKind[] = [
  "chat",
  "system",
  "image",
  "negative",
  "research",
  "character",
  "workflow",
  "recipe",
  "general",
];

const PROMPT_SCOPES: readonly PromptScope[] = ["global", "project"];

const VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;
const MAX_TEXT = 32_000;
const MAX_TAGS = 64;
const MAX_TAG_LEN = 64;
const MAX_MODEL_HINTS = 32;
const MAX_MODEL_HINT_LEN = 128;
const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 2_000;
const MAX_VERSIONS = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asBoolean(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function clampString(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max);
}

function isValidKind(value: unknown): value is PromptKind {
  return typeof value === "string" && (PROMPT_KINDS as readonly string[]).includes(value);
}

function isValidScope(value: unknown): value is PromptScope {
  return typeof value === "string" && (PROMPT_SCOPES as readonly string[]).includes(value);
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && VALID_ID_RE.test(value);
}

function safeIso(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.length > 0) {
    const t = Date.parse(value);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return fallback;
}

function asCreatedBy(value: unknown): "user" | "import" | "system" {
  if (value === "import" || value === "system" || value === "user") return value;
  return "user";
}

// ---------------------------------------------------------------------------
// Secret detection
// ---------------------------------------------------------------------------

/**
 * Heuristic check for "secret-like" content. Returns true when the
 * content looks like a Venice / OpenAI-style API key, a bearer token,
 * an explicit `Authorization: Bearer …` header, or a long opaque
 * base64 blob that is not a normal-looking prompt.
 *
 * The check is intentionally conservative — false positives on real
 * prompts are tolerable, but a false negative that lets a real key
 * slip into an exported prompt is not.
 */
export function isPromptSecretLike(content: string): boolean {
  if (typeof content !== "string" || content.length === 0) return false;
  const trimmed = content.trim();

  // Explicit `Authorization:` header lines.
  if (/^\s*Authorization\s*:\s*(Bearer|Token|Basic)\b/i.test(trimmed)) return true;

  // Venice / OpenAI-style key: `sk-…` / `venice_…` / `Bearer …` followed
  // by a long token (>= 20 chars of base64-ish).
  if (/\b(?:sk-[A-Za-z0-9_-]{20,}|venice_[A-Za-z0-9_-]{20,}|nv-[A-Za-z0-9_-]{20,})\b/.test(trimmed)) {
    return true;
  }
  if (/\bBearer\s+[A-Za-z0-9_.\-+/=]{20,}\b/.test(trimmed)) return true;

  // Long opaque base64-ish blob with no spaces that doesn't look like
  // a normal sentence (>= 200 chars, only base64 alphabet + + / =).
  if (/^[A-Za-z0-9+/=]{200,}$/.test(trimmed)) return true;

  return false;
}

/** Returns content with obvious secret-looking substrings replaced by
 *  `[REDACTED]`. Used by the import and save paths. */
export function redactPromptSecrets(content: string): string {
  if (typeof content !== "string" || content.length === 0) return content;
  return content
    .replace(/(\b(?:sk-[A-Za-z0-9_-]{20,}|venice_[A-Za-z0-9_-]{20,}|nv-[A-Za-z0-9_-]{20,}))/g, "[REDACTED]")
    .replace(/(\bBearer\s+)([A-Za-z0-9_.\-+/=]{20,})/g, "$1[REDACTED]")
    .replace(/(Authorization\s*:\s*)(Bearer|Token|Basic)\s+[A-Za-z0-9_.\-+/=]+/gi, "$1$2 [REDACTED]");
}

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

/**
 * Sanitise a `PromptVersion` shape into a safe, well-formed object.
 * Returns `null` when the input cannot be coerced into a usable record
 * (missing id, missing content, missing version number, etc.).
 *
 * The function never throws and never mutates the input.
 */
export function sanitizePromptVersion(
  input: unknown,
  fallback: { promptId: string; now: string },
): PromptVersion | null {
  if (!isRecord(input)) return null;
  const id = asString(input.id);
  if (!isValidId(id)) return null;
  const version = asNumber(input.version, 0);
  if (version < 1) return null;
  const title = clampString(asString(input.title, ""), MAX_TITLE_LEN);
  const rawContent = asString(input.content, "");
  if (!rawContent.trim()) return null;
  if (rawContent.length > MAX_TEXT) return null;
  const content = redactPromptSecrets(rawContent);
  const negativeRaw = asString(input.negativeContent, "");
  const negativeContent = negativeRaw
    ? clampString(redactPromptSecrets(negativeRaw), MAX_TEXT)
    : undefined;
  const notesRaw = asString(input.notes, "");
  const notes = notesRaw ? clampString(redactPromptSecrets(notesRaw), MAX_TEXT) : undefined;
  const createdAt = safeIso(input.createdAt, fallback.now);
  const createdBy = asCreatedBy(input.createdBy);
  const sourceRaw = isRecord(input.source) ? input.source : null;
  const source: PromptVersionSource | undefined = sourceRaw
    ? {
        type:
          typeof sourceRaw.type === "string" &&
          [
            "manual",
            "chat",
            "image",
            "media",
            "recipe",
            "research",
            "import",
            "system",
          ].includes(sourceRaw.type)
            ? (sourceRaw.type as PromptSourceType)
            : "manual",
        sourceId:
          typeof sourceRaw.sourceId === "string" ? sourceRaw.sourceId : undefined,
      }
    : undefined;
  return {
    id,
    promptId: asString(input.promptId, fallback.promptId),
    version,
    title,
    content,
    negativeContent,
    notes,
    createdAt,
    createdBy,
    source,
  };
}

/**
 * Sanitise a `PromptLibraryItem` into a safe, well-formed object.
 * Returns `null` when the input cannot be coerced into a usable record.
 *
 * The function:
 *  - Rejects records with no valid id, no title, or no parseable version list
 *  - Re-redacts obvious secrets in title / content / negative / notes
 *  - Caps metadata bag size to a small fixed shape (no opaque blobs)
 *  - Resolves a missing `currentVersionId` to the latest version
 */
export function sanitizePromptLibraryItem(
  input: unknown,
  fallback: { now: string },
): PromptLibraryItem | null {
  if (!isRecord(input)) return null;
  const id = asString(input.id);
  if (!isValidId(id)) return null;
  const kind = isValidKind(input.kind) ? input.kind : "general";
  const scope = isValidScope(input.scope) ? input.scope : "global";
  const projectId =
    scope === "project" && typeof input.projectId === "string" && isValidId(input.projectId)
      ? input.projectId
      : null;
  const title = clampString(redactPromptSecrets(asString(input.title, "")), MAX_TITLE_LEN);
  if (!title) return null;
  const descriptionRaw = asString(input.description, "");
  const description = descriptionRaw
    ? clampString(redactPromptSecrets(descriptionRaw), MAX_DESCRIPTION_LEN)
    : undefined;
  const tags = asArray<unknown>(input.tags)
    .map((t) => clampString(redactPromptSecrets(asString(t, "")).toLowerCase(), MAX_TAG_LEN))
    .filter((t) => t.length > 0)
    .slice(0, MAX_TAGS);
  const modelHints = asArray<unknown>(input.modelHints)
    .map((m) => clampString(asString(m, ""), MAX_MODEL_HINT_LEN))
    .filter((m) => m.length > 0)
    .slice(0, MAX_MODEL_HINTS);
  const variables = asArray<unknown>(input.variables)
    .map((v) => {
      if (!isRecord(v)) return null;
      const name = clampString(asString(v.name, ""), 64);
      if (!name) return null;
      const variable: PromptVariable = {
        name,
        description: typeof v.description === "string"
          ? clampString(redactPromptSecrets(v.description), 200)
          : undefined,
        defaultValue:
          typeof v.defaultValue === "string"
            ? clampString(redactPromptSecrets(v.defaultValue), 1_000)
            : undefined,
        required: asBoolean(v.required, false),
      };
      return variable;
    })
    .filter((v): v is PromptVariable => v !== null)
    .slice(0, 64);
  const favorite = asBoolean(input.favorite, false);
  const archivedAtRaw = input.archivedAt;
  const archivedAt =
    archivedAtRaw === null
      ? null
      : typeof archivedAtRaw === "string" && archivedAtRaw.length > 0
        ? safeIso(archivedAtRaw, fallback.now)
        : undefined;
  const versionsRaw = asArray<unknown>(input.versions)
    .map((v) => sanitizePromptVersion(v, { promptId: id, now: fallback.now }))
    .filter((v): v is PromptVersion => v !== null)
    .slice(0, MAX_VERSIONS);
  if (versionsRaw.length === 0) return null;
  // Versions must be sorted by version number; dedupe by id.
  const seen = new Set<string>();
  const versions: PromptVersion[] = [];
  for (const v of [...versionsRaw].sort((a, b) => a.version - b.version)) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    versions.push(v);
  }
  const currentVersionId =
    typeof input.currentVersionId === "string" && versions.some((v) => v.id === input.currentVersionId)
      ? input.currentVersionId
      : versions[versions.length - 1]!.id;
  const createdAt = safeIso(input.createdAt, fallback.now);
  const updatedAt = safeIso(input.updatedAt, fallback.now);
  // Cap metadata to plain string keys + string|number|boolean values only.
  const metadataRaw = isRecord(input.metadata) ? input.metadata : null;
  let metadata: Record<string, unknown> | undefined;
  if (metadataRaw) {
    metadata = {};
    for (const [k, v] of Object.entries(metadataRaw)) {
      if (metadata && Object.keys(metadata).length >= 32) break;
      if (typeof v === "string" && v.length > 1_000) continue;
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
      metadata[k] = typeof v === "string" ? redactPromptSecrets(v) : v;
    }
    if (Object.keys(metadata).length === 0) metadata = undefined;
  }
  return {
    id,
    kind,
    scope,
    projectId,
    title,
    description,
    currentVersionId,
    versions,
    tags,
    favorite,
    archivedAt: archivedAt ?? null,
    modelHints: modelHints.length > 0 ? modelHints : undefined,
    variables: variables.length > 0 ? variables : undefined,
    createdAt,
    updatedAt,
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

let __idCounter = 0;
function generateStableId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  __idCounter += 1;
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${r}-${__idCounter.toString(36)}`;
}

export interface CreatePromptVersionInput {
  promptId: string;
  version: number;
  title: string;
  content: string;
  negativeContent?: string;
  notes?: string;
  source?: PromptVersionSource;
  createdBy?: "user" | "import" | "system";
}

export function createPromptVersion(input: CreatePromptVersionInput, now: string = new Date().toISOString()): PromptVersion {
  return {
    id: generateStableId("pver"),
    promptId: input.promptId,
    version: input.version,
    title: clampString(input.title, MAX_TITLE_LEN),
    content: redactPromptSecrets(input.content).slice(0, MAX_TEXT),
    negativeContent: input.negativeContent
      ? redactPromptSecrets(input.negativeContent).slice(0, MAX_TEXT)
      : undefined,
    notes: input.notes ? clampString(redactPromptSecrets(input.notes), MAX_TEXT) : undefined,
    createdAt: now,
    createdBy: input.createdBy ?? "user",
    source: input.source,
  };
}

export interface CreatePromptLibraryItemInput {
  title: string;
  kind: PromptKind;
  content: string;
  scope: PromptScope;
  projectId?: string | null;
  description?: string;
  negativeContent?: string;
  tags?: string[];
  modelHints?: string[];
  source?: PromptVersionSource;
  now?: string;
}

export function createPromptLibraryItem(
  input: CreatePromptLibraryItemInput,
  now: string = new Date().toISOString(),
): PromptLibraryItem {
  const id = generateStableId("plib");
  const version = createPromptVersion(
    {
      promptId: id,
      version: 1,
      title: input.title,
      content: input.content,
      negativeContent: input.negativeContent,
      source: input.source,
      createdBy: input.source?.type === "import" ? "import" : "user",
    },
    now,
  );
  return {
    id,
    kind: input.kind,
    scope: input.scope,
    projectId: input.scope === "project" ? input.projectId ?? null : null,
    title: clampString(input.title, MAX_TITLE_LEN),
    description: input.description
      ? clampString(input.description, MAX_DESCRIPTION_LEN)
      : undefined,
    currentVersionId: version.id,
    versions: [version],
    tags: asArray<string>(input.tags)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length > 0)
      .slice(0, MAX_TAGS),
    favorite: false,
    archivedAt: null,
    modelHints: input.modelHints && input.modelHints.length > 0 ? input.modelHints : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

/**
 * Build a safe export payload. The result never contains raw prompts
 * flagged as secret-like, and the function never mutates the input
 * array. Re-uses `redactPromptSecrets` on every content field.
 */
export function exportPromptLibraryItems(
  items: readonly PromptLibraryItem[],
  now: string = new Date().toISOString(),
): PromptLibraryExport {
  const safe: PromptLibraryItem[] = [];
  for (const raw of items) {
    const sanitized = sanitizePromptLibraryItem(raw, { now });
    if (!sanitized) continue;
    if (sanitized.versions.some((v) => isPromptSecretLike(v.content))) continue;
    safe.push(sanitized);
  }
  return {
    version: 1,
    exportedAt: now,
    app: "Venice Forge",
    prompts: safe,
  };
}

/**
 * Parse an import payload. Accepts only the current export version.
 * Returns the successfully imported prompts (already sanitised and
 * with new ids so the caller can persist them without collision),
 * plus a per-skip reason list.
 */
export function parsePromptLibraryImport(
  input: unknown,
  now: string = new Date().toISOString(),
): PromptLibraryImportResult {
  const out: PromptLibraryItem[] = [];
  const skipped: PromptLibraryImportSkip[] = [];
  if (!isRecord(input)) {
    skipped.push({ reason: "Payload is not an object" });
    return { imported: out, reconciled: [], skipped };
  }
  if (input.app !== "Venice Forge") {
    skipped.push({ reason: `Unknown app identifier (${String(input.app)})` });
    return { imported: out, reconciled: [], skipped };
  }
  if (input.version !== 1) {
    skipped.push({ reason: `Unsupported export version (${String(input.version)})` });
    return { imported: out, reconciled: [], skipped };
  }
  const rawPrompts = asArray<unknown>(input.prompts);
  const existingIds = new Set<string>();
  for (const raw of rawPrompts) {
    const sanitized = sanitizePromptLibraryItem(raw, { now });
    if (!sanitized) {
      skipped.push({ reason: "Invalid prompt record", title: isRecord(raw) ? asString(raw.title) : undefined });
      continue;
    }
    // Regenerate id so the import cannot collide with an existing record.
    const fresh = createPromptLibraryItem(
      {
        title: sanitized.title,
        kind: sanitized.kind,
        content: sanitized.versions[0]?.content ?? "",
        scope: sanitized.scope,
        projectId: sanitized.projectId,
        description: sanitized.description,
        negativeContent: sanitized.versions[0]?.negativeContent,
        tags: sanitized.tags,
        modelHints: sanitized.modelHints,
        source: { type: "import" },
      },
      now,
    );
    // Preserve the rest of the version chain.
    fresh.versions = sanitized.versions.map((v) => ({ ...v, promptId: fresh.id }));
    fresh.currentVersionId = sanitized.currentVersionId ?? fresh.versions[0]!.id;
    fresh.favorite = sanitized.favorite;
    fresh.archivedAt = sanitized.archivedAt ?? null;
    if (existingIds.has(fresh.id)) {
      skipped.push({ reason: "Duplicate id after regeneration", title: fresh.title });
      continue;
    }
    existingIds.add(fresh.id);
    out.push(fresh);
  }
  return { imported: out, reconciled: [], skipped };
}

/**
 * True if `value` is a well-formed `PromptLibraryItem` per the
 * sanitiser (no mutation, no throw).
 */
export function isPromptLibraryItem(value: unknown): value is PromptLibraryItem {
  return sanitizePromptLibraryItem(value, { now: new Date().toISOString() }) !== null;
}

/**
 * The current version of a prompt item, or `null` when the item has no
 * versions (impossible per the sanitiser, but the type is permissive).
 */
export function getCurrentPromptVersion(item: PromptLibraryItem | null | undefined): PromptVersion | null {
  if (!item || !item.versions || item.versions.length === 0) return null;
  const v = item.versions.find((x) => x.id === item.currentVersionId);
  if (v) return v;
  return item.versions[item.versions.length - 1] ?? null;
}
