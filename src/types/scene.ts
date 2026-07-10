/** @fileoverview Phase 2E — Scene Composer data model.
 *
 * A `SceneComposerItem` is a reusable visual scene that combines
 * subject/character/location/mood/style/camera/lighting/note components,
 * media references, and Prompt Library references into a structured
 * record. Each scene has one or more `SceneVersion`s with an append-only
 * version chain. The scene compiler (`src/services/sceneCompiler.ts`)
 * turns a scene version into a `GenerationRecipe` for Image Studio.
 *
 * Scenes are scoped to a project (or to "global" so the scene is
 * visible across every project). All persistence is additive and
 * follows the same encrypted-at-rest path as Projects and Prompt Library.
 *
 * Safety: scene records must NEVER carry API keys, bearer tokens, raw
 * authorization headers, provider secrets, or binary data. The
 * `sanitizeSceneComposerItem` and `sanitizeSceneVersion` helpers reject
 * or redact obvious secrets at write time.
 */

export const SCENE_COMPOSER_VERSION = 1 as const;

export type SceneScope = "global" | "project";

export type SceneComponentKind =
  | "subject"
  | "character"
  | "location"
  | "mood"
  | "style"
  | "camera"
  | "lighting"
  | "composition"
  | "negative"
  | "reference_media"
  | "prompt_reference"
  | "note";

export interface SceneComponent {
  id: string;
  kind: SceneComponentKind;
  title?: string;
  content: string;
  weight?: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface SceneMediaRef {
  mediaId: string;
  role:
    | "character_reference"
    | "style_reference"
    | "background_reference"
    | "composition_reference"
    | "output"
    | "other";
  note?: string;
}

export interface ScenePromptRef {
  promptId: string;
  versionId?: string;
  role:
    | "base_prompt"
    | "style_prompt"
    | "negative_prompt"
    | "research_prompt"
    | "other";
}

export interface SceneVersion {
  id: string;
  sceneId: string;
  version: number;
  title: string;
  components: SceneComponent[];
  mediaRefs: SceneMediaRef[];
  promptRefs: ScenePromptRef[];
  notes?: string;
  createdAt: string;
  source?: {
    type: "manual" | "media" | "recipe" | "prompt" | "import";
    sourceId?: string;
  };
}

export interface SceneComposerItem {
  id: string;
  scope: SceneScope;
  projectId?: string | null;

  title: string;
  description?: string;
  currentVersionId: string;
  versions: SceneVersion[];

  tags: string[];
  favorite: boolean;
  archivedAt?: string | null;

  defaultModel?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  defaultAspectRatio?: string;

  outputMediaIds: string[];

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

export interface SceneComposerExport {
  version: 1;
  exportedAt: string;
  app: "Venice Forge";
  scenes: SceneComposerItem[];
}

export interface SceneImportSkip {
  reason: string;
  title?: string;
}

export interface SceneImportResult {
  imported: SceneComposerItem[];
  skipped: SceneImportSkip[];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const COMPONENT_KINDS: readonly SceneComponentKind[] = [
  "subject",
  "character",
  "location",
  "mood",
  "style",
  "camera",
  "lighting",
  "composition",
  "negative",
  "reference_media",
  "prompt_reference",
  "note",
];

const SCENE_SCOPES: readonly SceneScope[] = ["global", "project"];

const VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/;
const MAX_TEXT = 32_000;
const MAX_TAGS = 64;
const MAX_TAG_LEN = 64;
const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 2_000;
const MAX_VERSIONS = 200;
const MAX_COMPONENTS = 128;
const MAX_MEDIA_REFS = 64;
const MAX_PROMPT_REFS = 64;
const MAX_OUTPUT_MEDIA = 512;

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

// ---------------------------------------------------------------------------
// Secret detection
// ---------------------------------------------------------------------------

function isSecretLike(content: string): boolean {
  if (typeof content !== "string" || content.length === 0) return false;
  const trimmed = content.trim();

  if (/^\s*Authorization\s*:\s*(Bearer|Token|Basic)\b/i.test(trimmed)) return true;
  if (/\b(?:sk-[A-Za-z0-9_-]{20,}|venice_[A-Za-z0-9_-]{20,}|nv-[A-Za-z0-9_-]{20,})\b/.test(trimmed)) {
    return true;
  }
  if (/\bBearer\s+[A-Za-z0-9_.\-+/=]{20,}\b/.test(trimmed)) return true;
  if (/^[A-Za-z0-9+/=]{200,}$/.test(trimmed)) return true;

  return false;
}

function redactSecrets(content: string): string {
  if (typeof content !== "string" || content.length === 0) return content;
  return content
    .replace(/(\b(?:sk-[A-Za-z0-9_-]{20,}|venice_[A-Za-z0-9_-]{20,}|nv-[A-Za-z0-9_-]{20,}))/g, "[REDACTED]")
    .replace(/(\bBearer\s+)([A-Za-z0-9_.\-+/=]{20,})/g, "$1[REDACTED]")
    .replace(/(Authorization\s*:\s*)(Bearer|Token|Basic)\s+[A-Za-z0-9_.\-+/=]+/gi, "$1$2 [REDACTED]");
}

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

export function sanitizeSceneComponent(
  input: unknown,
  _now: string,
): SceneComponent | null {
  if (!isRecord(input)) return null;
  const id = asString(input.id);
  if (!isValidId(id)) return null;
  const kindRaw = asString(input.kind, "");
  const kind = (COMPONENT_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as SceneComponentKind)
    : "note";
  const titleRaw = asString(input.title, "");
  const title = titleRaw
    ? clampString(redactSecrets(titleRaw), MAX_TITLE_LEN)
    : undefined;
  const rawContent = asString(input.content, "");
  if (!rawContent.trim()) return null;
  if (rawContent.length > MAX_TEXT) return null;
  const content = redactSecrets(rawContent);
  const weightRaw = asNumber(input.weight, -1);
  const weight = weightRaw >= 0 ? weightRaw : undefined;
  const enabled = asBoolean(input.enabled, true);
  const metadataRaw = isRecord(input.metadata) ? input.metadata : null;
  let metadata: Record<string, unknown> | undefined;
  if (metadataRaw) {
    metadata = {};
    for (const [k, v] of Object.entries(metadataRaw)) {
      if (Object.keys(metadata).length >= 16) break;
      if (typeof v === "string" && v.length > 1_000) continue;
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
      metadata[k] = v;
    }
    if (Object.keys(metadata).length === 0) metadata = undefined;
  }
  return {
    id,
    kind,
    title,
    content,
    weight,
    enabled,
    metadata,
  };
}

export function sanitizeSceneVersion(
  input: unknown,
  fallback: { sceneId: string; now: string },
): SceneVersion | null {
  if (!isRecord(input)) return null;
  const id = asString(input.id);
  if (!isValidId(id)) return null;
  const version = asNumber(input.version, 0);
  if (version < 1) return null;
  const title = clampString(redactSecrets(asString(input.title, "")), MAX_TITLE_LEN);
  const components = asArray<unknown>(input.components)
    .map((c) => sanitizeSceneComponent(c, fallback.now))
    .filter((c): c is SceneComponent => c !== null)
    .slice(0, MAX_COMPONENTS);
  const mediaRefs = asArray<unknown>(input.mediaRefs)
    .map((r) => {
      if (!isRecord(r)) return null;
      const mediaId = asString(r.mediaId);
      if (!isValidId(mediaId)) return null;
      const roleRaw = asString(r.role, "");
      const validRoles = [
        "character_reference",
        "style_reference",
        "background_reference",
        "composition_reference",
        "output",
        "other",
      ];
      const role = validRoles.includes(roleRaw)
        ? (roleRaw as SceneMediaRef["role"])
        : "other";
      const noteRaw = asString(r.note, "");
      const note = noteRaw ? clampString(redactSecrets(noteRaw), 1_000) : undefined;
      return { mediaId, role, note } as SceneMediaRef;
    })
    .filter((r): r is SceneMediaRef => r !== null)
    .slice(0, MAX_MEDIA_REFS);
  const promptRefs = asArray<unknown>(input.promptRefs)
    .map((r) => {
      if (!isRecord(r)) return null;
      const promptId = asString(r.promptId);
      if (!isValidId(promptId)) return null;
      const roleRaw = asString(r.role, "");
      const validRoles = [
        "base_prompt",
        "style_prompt",
        "negative_prompt",
        "research_prompt",
        "other",
      ];
      const role = validRoles.includes(roleRaw)
        ? (roleRaw as ScenePromptRef["role"])
        : "other";
      const versionIdRaw = asString(r.versionId, "");
      const versionId = isValidId(versionIdRaw) ? versionIdRaw : undefined;
      return { promptId, versionId, role } as ScenePromptRef;
    })
    .filter((r): r is ScenePromptRef => r !== null)
    .slice(0, MAX_PROMPT_REFS);
  const notesRaw = asString(input.notes, "");
  const notes = notesRaw ? clampString(redactSecrets(notesRaw), MAX_TEXT) : undefined;
  const createdAt = safeIso(input.createdAt, fallback.now);
  const sourceRaw = isRecord(input.source) ? input.source : null;
  const source: SceneVersion["source"] | undefined = sourceRaw
    ? {
        type:
          typeof sourceRaw.type === "string" &&
          ["manual", "media", "recipe", "prompt", "import"].includes(sourceRaw.type)
            ? (sourceRaw.type as "manual" | "media" | "recipe" | "prompt" | "import")
            : "manual",
        sourceId:
          typeof sourceRaw.sourceId === "string" && isValidId(sourceRaw.sourceId)
            ? sourceRaw.sourceId
            : undefined,
      }
    : undefined;
  return {
    id,
    sceneId: asString(input.sceneId, fallback.sceneId),
    version,
    title,
    components,
    mediaRefs,
    promptRefs,
    notes,
    createdAt,
    source,
  };
}

export function sanitizeSceneComposerItem(
  input: unknown,
  fallback: { now: string },
): SceneComposerItem | null {
  if (!isRecord(input)) return null;
  const id = asString(input.id);
  if (!isValidId(id)) return null;
  const scopeRaw = asString(input.scope, "");
  const scope = (SCENE_SCOPES as readonly string[]).includes(scopeRaw)
    ? (scopeRaw as SceneScope)
    : "global";
  const projectId =
    scope === "project" && typeof input.projectId === "string" && isValidId(input.projectId)
      ? input.projectId
      : null;
  const title = clampString(redactSecrets(asString(input.title, "")), MAX_TITLE_LEN);
  if (!title) return null;
  const descriptionRaw = asString(input.description, "");
  const description = descriptionRaw
    ? clampString(redactSecrets(descriptionRaw), MAX_DESCRIPTION_LEN)
    : undefined;
  const tags = asArray<unknown>(input.tags)
    .map((t) => clampString(redactSecrets(asString(t, "")).toLowerCase(), MAX_TAG_LEN))
    .filter((t) => t.length > 0)
    .slice(0, MAX_TAGS);
  const versionsRaw = asArray<unknown>(input.versions)
    .map((v) => sanitizeSceneVersion(v, { sceneId: id, now: fallback.now }))
    .filter((v): v is SceneVersion => v !== null)
    .slice(0, MAX_VERSIONS);
  if (versionsRaw.length === 0) return null;
  const seen = new Set<string>();
  const versions: SceneVersion[] = [];
  for (const v of [...versionsRaw].sort((a, b) => a.version - b.version)) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    versions.push(v);
  }
  const currentVersionId =
    typeof input.currentVersionId === "string" && versions.some((v) => v.id === input.currentVersionId)
      ? input.currentVersionId
      : versions[versions.length - 1]!.id;
  const favorite = asBoolean(input.favorite, false);
  const archivedAtRaw = input.archivedAt;
  const archivedAt =
    archivedAtRaw === null
      ? null
      : typeof archivedAtRaw === "string" && archivedAtRaw.length > 0
        ? safeIso(archivedAtRaw, fallback.now)
        : undefined;
  const defaultModel = typeof input.defaultModel === "string" && input.defaultModel.length > 0
    ? clampString(input.defaultModel, 128)
    : undefined;
  const defaultWidth = asNumber(input.defaultWidth, 0);
  const defaultHeight = asNumber(input.defaultHeight, 0);
  const defaultAspectRatio = typeof input.defaultAspectRatio === "string" && input.defaultAspectRatio.length > 0
    ? clampString(input.defaultAspectRatio, 32)
    : undefined;
  const outputMediaIds = asArray<unknown>(input.outputMediaIds)
    .map((m) => asString(m, ""))
    .filter((m) => isValidId(m))
    .slice(0, MAX_OUTPUT_MEDIA);
  const createdAt = safeIso(input.createdAt, fallback.now);
  const updatedAt = safeIso(input.updatedAt, fallback.now);
  const metadataRaw = isRecord(input.metadata) ? input.metadata : null;
  let metadata: Record<string, unknown> | undefined;
  if (metadataRaw) {
    metadata = {};
    for (const [k, v] of Object.entries(metadataRaw)) {
      if (Object.keys(metadata).length >= 32) break;
      if (typeof v === "string" && v.length > 1_000) continue;
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
      metadata[k] = v;
    }
    if (Object.keys(metadata).length === 0) metadata = undefined;
  }
  return {
    id,
    scope,
    projectId,
    title,
    description,
    currentVersionId,
    versions,
    tags,
    favorite,
    archivedAt: archivedAt ?? null,
    defaultModel,
    defaultWidth: defaultWidth > 0 ? defaultWidth : undefined,
    defaultHeight: defaultHeight > 0 ? defaultHeight : undefined,
    defaultAspectRatio,
    outputMediaIds,
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

export interface CreateSceneComponentInput {
  kind: SceneComponentKind;
  title?: string;
  content: string;
  weight?: number;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export function createSceneComponent(
  input: CreateSceneComponentInput,
  _now: string = new Date().toISOString(),
): SceneComponent {
  return {
    id: generateStableId("scomp"),
    kind: input.kind,
    title: input.title ? clampString(input.title, MAX_TITLE_LEN) : undefined,
    content: redactSecrets(input.content).slice(0, MAX_TEXT),
    weight: input.weight,
    enabled: input.enabled ?? true,
    metadata: input.metadata,
  };
}

export type VersionSource = { type: "manual" | "media" | "recipe" | "prompt" | "import"; sourceId?: string };

export interface CreateSceneVersionInput {
  sceneId: string;
  version: number;
  title: string;
  components: CreateSceneComponentInput[];
  mediaRefs?: SceneMediaRef[];
  promptRefs?: ScenePromptRef[];
  notes?: string;
  source?: VersionSource;
}

export function createSceneVersion(
  input: CreateSceneVersionInput,
  now: string = new Date().toISOString(),
): SceneVersion {
  const components = input.components.map((c) => createSceneComponent(c, now));
  return {
    id: generateStableId("sver"),
    sceneId: input.sceneId,
    version: input.version,
    title: clampString(input.title, MAX_TITLE_LEN),
    components,
    mediaRefs: input.mediaRefs ?? [],
    promptRefs: input.promptRefs ?? [],
    notes: input.notes ? clampString(input.notes, MAX_TEXT) : undefined,
    createdAt: now,
    source: input.source,
  };
}

export interface CreateSceneComposerItemInput {
  title: string;
  description?: string;
  scope?: SceneScope;
  projectId?: string | null;
  tags?: string[];
  defaultModel?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  defaultAspectRatio?: string;
  source?: VersionSource;
}

export function createSceneComposerItem(
  input: CreateSceneComposerItemInput,
  now: string = new Date().toISOString(),
): SceneComposerItem {
  const id = generateStableId("scene");
  const scope = input.scope ?? "global";
  const version = createSceneVersion(
    {
      sceneId: id,
      version: 1,
      title: input.title,
      components: [],
      source: input.source,
    },
    now,
  );
  return {
    id,
    scope,
    projectId: scope === "project" ? input.projectId ?? null : null,
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
    defaultModel: input.defaultModel
      ? clampString(input.defaultModel, 128)
      : undefined,
    defaultWidth: input.defaultWidth && input.defaultWidth > 0 ? input.defaultWidth : undefined,
    defaultHeight: input.defaultHeight && input.defaultHeight > 0 ? input.defaultHeight : undefined,
    defaultAspectRatio: input.defaultAspectRatio
      ? clampString(input.defaultAspectRatio, 32)
      : undefined,
    outputMediaIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Import / export
// ---------------------------------------------------------------------------

export function exportSceneComposerItems(
  items: readonly SceneComposerItem[],
  now: string = new Date().toISOString(),
): SceneComposerExport {
  const safe: SceneComposerItem[] = [];
  for (const raw of items) {
    // Pre-check raw components for secret-like content before sanitisation
    const rawVersions = asArray<unknown>(isRecord(raw) ? (raw as Record<string, unknown>).versions : undefined);
    const hasRawSecret = rawVersions.some((v) => {
      if (!isRecord(v)) return false;
      const comps = asArray<unknown>(v.components);
      return comps.some(
        (c) => isRecord(c) && isSecretLike(asString(c.content, "")),
      );
    });
    if (hasRawSecret) continue;
    const sanitized = sanitizeSceneComposerItem(raw, { now });
    if (!sanitized) continue;
    safe.push(sanitized);
  }
  return {
    version: 1,
    exportedAt: now,
    app: "Venice Forge",
    scenes: safe,
  };
}

export function parseSceneComposerImport(
  input: unknown,
  now: string = new Date().toISOString(),
): SceneImportResult {
  const out: SceneComposerItem[] = [];
  const skipped: SceneImportSkip[] = [];
  if (!isRecord(input)) {
    skipped.push({ reason: "Payload is not an object" });
    return { imported: out, skipped };
  }
  if (input.app !== "Venice Forge") {
    skipped.push({ reason: `Unknown app identifier (${String(input.app)})` });
    return { imported: out, skipped };
  }
  if (input.version !== 1) {
    skipped.push({ reason: `Unsupported export version (${String(input.version)})` });
    return { imported: out, skipped };
  }
  const rawScenes = asArray<unknown>(input.scenes);
  const existingIds = new Set<string>();
  for (const raw of rawScenes) {
    const sanitized = sanitizeSceneComposerItem(raw, { now });
    if (!sanitized) {
      skipped.push({
        reason: "Invalid scene record",
        title: isRecord(raw) ? asString(raw.title) : undefined,
      });
      continue;
    }
    const fresh = createSceneComposerItem(
      {
        title: sanitized.title,
        description: sanitized.description,
        scope: sanitized.scope,
        projectId: sanitized.projectId,
        tags: sanitized.tags,
        defaultModel: sanitized.defaultModel,
        defaultWidth: sanitized.defaultWidth,
        defaultHeight: sanitized.defaultHeight,
        defaultAspectRatio: sanitized.defaultAspectRatio,
        source: { type: "import" },
      },
      now,
    );
    fresh.versions = sanitized.versions.map((v) => ({
      ...v,
      sceneId: fresh.id,
      components: v.components.map((c) => ({ ...c, id: generateStableId("scomp") })),
    }));
    fresh.currentVersionId = fresh.versions[0]?.id ?? fresh.currentVersionId;
    fresh.favorite = sanitized.favorite;
    fresh.archivedAt = sanitized.archivedAt ?? null;
    fresh.outputMediaIds = [];
    if (existingIds.has(fresh.id)) {
      skipped.push({ reason: "Duplicate id after regeneration", title: fresh.title });
      continue;
    }
    existingIds.add(fresh.id);
    out.push(fresh);
  }
  return { imported: out, skipped };
}

export function isSceneComposerItem(value: unknown): value is SceneComposerItem {
  return sanitizeSceneComposerItem(value, { now: new Date().toISOString() }) !== null;
}

export function getCurrentSceneVersion(
  item: SceneComposerItem | null | undefined,
): SceneVersion | null {
  if (!item || !item.versions || item.versions.length === 0) return null;
  const v = item.versions.find((x) => x.id === item.currentVersionId);
  if (v) return v;
  return item.versions[item.versions.length - 1] ?? null;
}