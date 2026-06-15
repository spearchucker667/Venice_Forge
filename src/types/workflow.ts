import { isPromptSecretLike, redactPromptSecrets } from "./prompt-library";

export type WorkflowScope = "global" | "project";

export type WorkflowStepKind =
  | "prompt"
  | "image_recipe"
  | "scene"
  | "media"
  | "research"
  | "rp_character"
  | "rp_scenario"
  | "handoff"
  | "note";

export type WorkflowStepTarget =
  | "chat"
  | "image_studio"
  | "media_studio"
  | "research"
  | "scene_composer"
  | "rp_studio"
  | "none";

export interface WorkflowStepRef {
  promptId?: string;
  promptVersionId?: string;
  sceneId?: string;
  sceneVersionId?: string;
  mediaId?: string;
  recipeId?: string;
  characterId?: string;
  scenarioId?: string;
  projectId?: string | null;
}

export interface WorkflowStep {
  id: string;
  kind: WorkflowStepKind;
  title: string;
  description?: string;
  enabled: boolean;
  order: number;
  target: WorkflowStepTarget;
  ref?: WorkflowStepRef;
  input?: Record<string, unknown>;
  outputKey?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  title: string;
  steps: WorkflowStep[];
  notes?: string;
  createdAt: string;
  source?: {
    type:
      | "manual"
      | "prompt"
      | "scene"
      | "media"
      | "recipe"
      | "rp"
      | "research"
      | "import";
    sourceId?: string;
  };
}

export interface WorkflowTemplateItem {
  id: string;
  scope: WorkflowScope;
  projectId?: string | null;

  title: string;
  description?: string;
  currentVersionId: string;
  versions: WorkflowVersion[];

  tags: string[];
  favorite: boolean;
  archivedAt?: string | null;

  createdAt: string;
  updatedAt: string;

  metadata?: Record<string, unknown>;
}

export interface WorkflowTemplateExport {
  version: 1;
  exportedAt: string;
  app: "Venice Forge";
  workflows: WorkflowTemplateItem[];
}

export interface WorkflowImportResult {
  imported: string[];
  skipped: Array<{ reason: string; title?: string }>;
}

export const WORKFLOW_TEMPLATE_VERSION = 1;

function redactObjectSecrets(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = redactPromptSecrets(value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactObjectSecrets(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function sanitizeWorkflowStep(input: unknown): WorkflowStep {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid WorkflowStep: must be an object");
  }
  const obj = input as Record<string, unknown>;

  const id = typeof obj.id === "string" ? obj.id.slice(0, 100) : crypto.randomUUID();
  const kind = isValidWorkflowStepKind(obj.kind) ? obj.kind : "note";
  const title = typeof obj.title === "string" ? obj.title.slice(0, 200) : "Untitled Step";
  const description = typeof obj.description === "string" ? obj.description.slice(0, 1000) : undefined;
  const enabled = typeof obj.enabled === "boolean" ? obj.enabled : true;
  const order = typeof obj.order === "number" && !isNaN(obj.order) ? obj.order : 0;
  const target = isValidWorkflowStepTarget(obj.target) ? obj.target : "none";

  let ref: WorkflowStepRef | undefined;
  if (obj.ref && typeof obj.ref === "object") {
    const r = obj.ref as Record<string, unknown>;
    ref = {
      promptId: typeof r.promptId === "string" ? r.promptId.slice(0, 100) : undefined,
      promptVersionId: typeof r.promptVersionId === "string" ? r.promptVersionId.slice(0, 100) : undefined,
      sceneId: typeof r.sceneId === "string" ? r.sceneId.slice(0, 100) : undefined,
      sceneVersionId: typeof r.sceneVersionId === "string" ? r.sceneVersionId.slice(0, 100) : undefined,
      mediaId: typeof r.mediaId === "string" ? r.mediaId.slice(0, 100) : undefined,
      recipeId: typeof r.recipeId === "string" ? r.recipeId.slice(0, 100) : undefined,
      characterId: typeof r.characterId === "string" ? r.characterId.slice(0, 100) : undefined,
      scenarioId: typeof r.scenarioId === "string" ? r.scenarioId.slice(0, 100) : undefined,
      projectId: typeof r.projectId === "string" ? r.projectId.slice(0, 100) : undefined,
    };
  }

  let stepInput: Record<string, unknown> | undefined;
  if (obj.input && typeof obj.input === "object" && !Array.isArray(obj.input)) {
    stepInput = redactObjectSecrets(obj.input as Record<string, unknown>);
  }

  const outputKey = typeof obj.outputKey === "string" ? obj.outputKey.slice(0, 100) : undefined;

  let metadata: Record<string, unknown> | undefined;
  if (obj.metadata && typeof obj.metadata === "object" && !Array.isArray(obj.metadata)) {
    metadata = redactObjectSecrets(obj.metadata as Record<string, unknown>);
  }

  return {
    id,
    kind,
    title,
    description,
    enabled,
    order,
    target,
    ref,
    input: stepInput,
    outputKey,
    metadata,
  };
}

export function sanitizeWorkflowVersion(input: unknown): WorkflowVersion {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid WorkflowVersion: must be an object");
  }
  const obj = input as Record<string, unknown>;

  const id = typeof obj.id === "string" ? obj.id.slice(0, 100) : crypto.randomUUID();
  const workflowId = typeof obj.workflowId === "string" ? obj.workflowId.slice(0, 100) : crypto.randomUUID();
  const version = typeof obj.version === "number" && !isNaN(obj.version) ? obj.version : 1;
  const title = typeof obj.title === "string" ? obj.title.slice(0, 200) : "Version 1";
  const notes = typeof obj.notes === "string" ? obj.notes.slice(0, 2000) : undefined;
  const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString();

  let source: WorkflowVersion["source"] = undefined;
  if (obj.source && typeof obj.source === "object") {
    const s = obj.source as Record<string, unknown>;
    const type = typeof s.type === "string" ? s.type : "manual";
    const sourceId = typeof s.sourceId === "string" ? s.sourceId.slice(0, 100) : undefined;
    source = { type: type as NonNullable<WorkflowVersion["source"]>["type"], sourceId };
  }

  let steps: WorkflowStep[] = [];
  if (Array.isArray(obj.steps)) {
    steps = obj.steps.map(sanitizeWorkflowStep).filter(Boolean);
  }

  return {
    id,
    workflowId,
    version,
    title,
    steps,
    notes,
    createdAt,
    source,
  };
}

export function sanitizeWorkflowTemplateItem(input: unknown): WorkflowTemplateItem {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid WorkflowTemplateItem: must be an object");
  }
  const obj = input as Record<string, unknown>;

  const id = typeof obj.id === "string" ? obj.id.slice(0, 100) : crypto.randomUUID();
  const scope = obj.scope === "global" || obj.scope === "project" ? obj.scope : "project";
  const projectId = typeof obj.projectId === "string" ? obj.projectId.slice(0, 100) : null;
  const title = typeof obj.title === "string" ? obj.title.slice(0, 200) : "Untitled Workflow";
  const description = typeof obj.description === "string" ? obj.description.slice(0, 1000) : undefined;

  let versions: WorkflowVersion[] = [];
  if (Array.isArray(obj.versions)) {
    versions = obj.versions.map(sanitizeWorkflowVersion).filter(Boolean);
  }

  const currentVersionId = typeof obj.currentVersionId === "string"
    ? obj.currentVersionId.slice(0, 100)
    : versions[0]?.id || crypto.randomUUID();

  let tags: string[] = [];
  if (Array.isArray(obj.tags)) {
    tags = obj.tags.filter((t) => typeof t === "string").map((t) => String(t).slice(0, 50));
  }

  const favorite = Boolean(obj.favorite);
  const archivedAt = typeof obj.archivedAt === "string" ? obj.archivedAt : null;
  const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : new Date().toISOString();
  const updatedAt = typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString();

  let metadata: Record<string, unknown> | undefined;
  if (obj.metadata && typeof obj.metadata === "object" && !Array.isArray(obj.metadata)) {
    metadata = redactObjectSecrets(obj.metadata as Record<string, unknown>);
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
    archivedAt,
    createdAt,
    updatedAt,
    metadata,
  };
}

export function createWorkflowVersion(input: Partial<WorkflowVersion>): WorkflowVersion {
  return sanitizeWorkflowVersion({
    ...input,
    id: input.id || crypto.randomUUID(),
    createdAt: input.createdAt || new Date().toISOString(),
  });
}

export function createWorkflowTemplateItem(input: Partial<WorkflowTemplateItem>): WorkflowTemplateItem {
  const versions = input.versions && input.versions.length > 0
    ? input.versions
    : [createWorkflowVersion({ workflowId: input.id || "temp", version: 1, title: "Initial Version" })];

  const currentVersionId = input.currentVersionId || versions[versions.length - 1].id;

  return sanitizeWorkflowTemplateItem({
    ...input,
    id: input.id || crypto.randomUUID(),
    versions,
    currentVersionId,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: input.updatedAt || new Date().toISOString(),
  });
}

export function exportWorkflowTemplateItems(items: WorkflowTemplateItem[]): WorkflowTemplateExport {
  const safeItems = items
    .filter((item) => {
      try {
        if (isPromptSecretLike(JSON.stringify(item))) return false;
        return true;
      } catch {
        return false;
      }
    })
    .map(sanitizeWorkflowTemplateItem);

  return {
    version: WORKFLOW_TEMPLATE_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Venice Forge",
    workflows: safeItems,
  };
}

export function parseWorkflowTemplateImport(input: unknown): WorkflowImportResult {
  const result: WorkflowImportResult = {
    imported: [],
    skipped: [],
  };

  if (!input || typeof input !== "object") {
    result.skipped.push({ reason: "Invalid import format: not an object" });
    return result;
  }

  const envelope = input as Partial<WorkflowTemplateExport>;

  if (envelope.app !== "Venice Forge") {
    result.skipped.push({ reason: "Invalid import format: missing or incorrect app signature" });
    return result;
  }

  if (envelope.version !== WORKFLOW_TEMPLATE_VERSION) {
    result.skipped.push({ reason: `Unsupported version: expected ${WORKFLOW_TEMPLATE_VERSION}, got ${envelope.version}` });
    return result;
  }

  if (!Array.isArray(envelope.workflows)) {
    result.skipped.push({ reason: "Invalid import format: workflows is not an array" });
    return result;
  }

  for (const rawItem of envelope.workflows) {
    const title = (rawItem && typeof rawItem === "object" && "title" in rawItem) ? String(rawItem.title) : "Unknown";

    try {
      const jsonStr = JSON.stringify(rawItem);
      if (isPromptSecretLike(jsonStr)) {
        result.skipped.push({ title, reason: "Contains secret-like material (blocked by security heuristic)" });
        continue;
      }
      if (jsonStr.includes("exec(") || jsonStr.includes("eval(") || jsonStr.includes("child_process")) {
         result.skipped.push({ title, reason: "Contains executable code patterns (blocked by security heuristic)" });
         continue;
      }

      const item = sanitizeWorkflowTemplateItem(rawItem);
      
      // Regenerate ID
      item.id = crypto.randomUUID();
      
      const versionIdMap = new Map<string, string>();
      for (const v of item.versions) {
        const oldId = v.id;
        v.id = crypto.randomUUID();
        v.workflowId = item.id;
        versionIdMap.set(oldId, v.id);
        
        for (const step of v.steps) {
            step.id = crypto.randomUUID();
        }
      }

      if (versionIdMap.has(item.currentVersionId)) {
        item.currentVersionId = versionIdMap.get(item.currentVersionId)!;
      } else if (item.versions.length > 0) {
         item.currentVersionId = item.versions[item.versions.length - 1].id;
      }

      result.imported.push(item.id);
      
      // we attach the sanitized item to the array so the caller can use it
      // we'll cast result to a private interface to pass the items out without changing the public contract
      const resultWithItems = result as WorkflowImportResult & { _items?: WorkflowTemplateItem[] };
      resultWithItems._items = (resultWithItems._items || []).concat(item);

    } catch {
      result.skipped.push({ title, reason: "Workflow validation failed." });
    }
  }

  return result;
}

function isValidWorkflowStepKind(kind: unknown): kind is WorkflowStepKind {
  const kinds = new Set([
    "prompt", "image_recipe", "scene", "media", "research", "rp_character", "rp_scenario", "handoff", "note"
  ]);
  return typeof kind === "string" && kinds.has(kind);
}

function isValidWorkflowStepTarget(target: unknown): target is WorkflowStepTarget {
  const targets = new Set([
    "chat", "image_studio", "media_studio", "research", "scene_composer", "rp_studio", "none"
  ]);
  return typeof target === "string" && targets.has(target);
}
