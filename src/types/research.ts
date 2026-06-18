/** @fileoverview Research Workspace data model (Phase 2I).
 *
 * This model defines the structure for research sessions, sources, findings,
 * and citations. It includes sanitization and safety redaction for secrets.
 */

export type ResearchScope = "global" | "project";

export type ResearchSourceKind =
  | "search_result"
  | "scraped_page"
  | "manual_url"
  | "manual_note"
  | "citation"
  | "import";

export type ResearchProvider =
  | "venice"
  | "venice-brave"
  | "venice-google"
  | "jina"
  | "jina-search"
  | "jina-reader"
  | "generic-http"
  | "browser"
  | "manual"
  | "unknown";

export interface ResearchCitation {
  id: string;
  sourceId: string;
  title?: string;
  url?: string;
  quote?: string;
  excerpt?: string;
  retrievedAt: string;
  provider?: ResearchProvider;
  metadata?: Record<string, unknown>;
}

export interface ResearchSource {
  id: string;
  kind: ResearchSourceKind;
  provider: ResearchProvider;
  title: string;
  url?: string;
  query?: string;
  excerpt?: string;
  summary?: string;
  retrievedAt: string;
  citations: ResearchCitation[];
  tags: string[];
  archivedAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ResearchFinding {
  id: string;
  title: string;
  content: string;
  sourceIds: string[];
  citationIds: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ResearchSession {
  id: string;
  scope: ResearchScope;
  projectId?: string | null;

  title: string;
  description?: string;

  queryHistory: string[];
  sources: ResearchSource[];
  findings: ResearchFinding[];

  tags: string[];
  favorite: boolean;
  archivedAt?: string | null;

  createdAt: string;
  updatedAt: string;

  metadata?: Record<string, unknown>;
}

export interface ResearchExport {
  version: 1;
  exportedAt: string;
  app: "Venice Forge";
  sessions: ResearchSession[];
}

export interface ResearchImportResult {
  imported: string[];
  skipped: Array<{ reason: string; title?: string }>;
}

export const RESEARCH_WORKSPACE_VERSION = 1;

const MAX_TITLE_LENGTH = 240;
const MAX_TEXT_LENGTH = 100_000;
const MAX_LIST_ITEMS = 1_000;

const SOURCE_KINDS = new Set<ResearchSourceKind>([
  "search_result", "scraped_page", "manual_url", "manual_note", "citation", "import",
]);
const PROVIDERS = new Set<ResearchProvider>([
  "venice", "venice-brave", "venice-google", "jina", "jina-search", "jina-reader", "generic-http", "browser", "manual", "unknown",
]);

function safeText(value: unknown, fallback = "", maxLength = MAX_TEXT_LENGTH): string {
  return typeof value === "string"
    ? redactResearchSecrets(value).slice(0, maxLength)
    : fallback;
}

function safeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
      .slice(0, MAX_LIST_ITEMS)
      .map((item) => safeText(item, "", MAX_TITLE_LENGTH))
    : [];
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  const seen = new WeakSet<object>();
  const walk = (input: unknown, depth: number): unknown => {
    if (depth > 6) return "[TRUNCATED]";
    if (typeof input === "string") return safeText(input);
    if (typeof input === "number" || typeof input === "boolean" || input === null) return input;
    if (Array.isArray(input)) return input.slice(0, MAX_LIST_ITEMS).map((item) => walk(item, depth + 1));
    if (!input || typeof input !== "object") return undefined;
    if (seen.has(input)) return "[CIRCULAR]";
    seen.add(input);
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .slice(0, MAX_LIST_ITEMS)
        .map(([key, item]) => [safeText(key, "", MAX_TITLE_LENGTH), walk(item, depth + 1)]),
    );
  };
  const result = walk(value, 0);
  return result && typeof result === "object" && !Array.isArray(result)
    ? result as Record<string, unknown>
    : {};
}

/**
 * Sanitize a research session object from unknown input.
 */
export function sanitizeResearchSession(input: unknown): ResearchSession {
  const now = new Date().toISOString();
  const data = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    id: safeText(data.id, crypto.randomUUID(), 128),
    scope: data.scope === 'project' ? 'project' : 'global',
    projectId: typeof data.projectId === 'string' ? data.projectId : null,
    title: safeText(data.title, 'Untitled Research', MAX_TITLE_LENGTH),
    description: typeof data.description === 'string' ? safeText(data.description) : undefined,
    queryHistory: safeStringList(data.queryHistory),
    sources: Array.isArray(data.sources) ? data.sources.slice(0, MAX_LIST_ITEMS).map(sanitizeResearchSource) : [],
    findings: Array.isArray(data.findings) ? data.findings.slice(0, MAX_LIST_ITEMS).map(sanitizeResearchFinding) : [],
    tags: safeStringList(data.tags),
    favorite: !!data.favorite,
    archivedAt: typeof data.archivedAt === 'string' ? data.archivedAt : null,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : now,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
    metadata: sanitizeMetadata(data.metadata),
  };
}

/**
 * Sanitize a research source object.
 */
export function sanitizeResearchSource(input: unknown): ResearchSource {
  const data = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    id: safeText(data.id, crypto.randomUUID(), 128),
    kind: SOURCE_KINDS.has(data.kind as ResearchSourceKind) ? data.kind as ResearchSourceKind : 'import',
    provider: PROVIDERS.has(data.provider as ResearchProvider) ? data.provider as ResearchProvider : 'unknown',
    title: safeText(data.title, 'Untitled Source', MAX_TITLE_LENGTH),
    url: sanitizeResearchUrl(data.url),
    query: typeof data.query === 'string' ? safeText(data.query) : undefined,
    excerpt: typeof data.excerpt === 'string' ? safeText(data.excerpt) : undefined,
    summary: typeof data.summary === 'string' ? safeText(data.summary) : undefined,
    retrievedAt: typeof data.retrievedAt === 'string' ? data.retrievedAt : new Date().toISOString(),
    citations: Array.isArray(data.citations) ? data.citations.slice(0, MAX_LIST_ITEMS).map(sanitizeResearchCitation) : [],
    tags: safeStringList(data.tags),
    archivedAt: typeof data.archivedAt === 'string' ? data.archivedAt : null,
    metadata: sanitizeMetadata(data.metadata),
  };
}

/**
 * Sanitize a research finding object.
 */
export function sanitizeResearchFinding(input: unknown): ResearchFinding {
  const now = new Date().toISOString();
  const data = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    id: safeText(data.id, crypto.randomUUID(), 128),
    title: safeText(data.title, 'Untitled Finding', MAX_TITLE_LENGTH),
    content: safeText(data.content),
    sourceIds: safeStringList(data.sourceIds),
    citationIds: safeStringList(data.citationIds),
    tags: safeStringList(data.tags),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : now,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
    metadata: sanitizeMetadata(data.metadata),
  };
}

/**
 * Sanitize a research citation object.
 */
export function sanitizeResearchCitation(input: unknown): ResearchCitation {
  const data = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    id: safeText(data.id, crypto.randomUUID(), 128),
    sourceId: safeText(data.sourceId, 'unknown', 128),
    title: typeof data.title === 'string' ? safeText(data.title, '', MAX_TITLE_LENGTH) : undefined,
    url: sanitizeResearchUrl(data.url),
    quote: typeof data.quote === 'string' ? safeText(data.quote) : undefined,
    excerpt: typeof data.excerpt === 'string' ? safeText(data.excerpt) : undefined,
    retrievedAt: typeof data.retrievedAt === 'string' ? data.retrievedAt : new Date().toISOString(),
    provider: PROVIDERS.has(data.provider as ResearchProvider) ? data.provider as ResearchProvider : 'unknown',
    metadata: sanitizeMetadata(data.metadata),
  };
}

/**
 * Redact sensitive patterns (API keys, tokens) from research content.
 */
export function redactResearchSecrets(content: string): string {
  if (!content) return content;
  
  let redacted = content;
  
  // Venice / Jina / Generic keys
  redacted = redacted
    .replace(/\b(?:venice|jina)_[a-zA-Z0-9]{20,}\b/g, '[REDACTED_KEY]')
    .replace(/\bsk-[a-zA-Z0-9._~-]{20,}\b/g, '[REDACTED_KEY]');
  
  // Bearer tokens
  redacted = redacted.replace(/Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g, 'Bearer [REDACTED_TOKEN]');
  
  // Authorization headers
  redacted = redacted.replace(/Authorization:\s*[^\n]+/gi, 'Authorization: [REDACTED]');
  
  // Cookies (basic)
  redacted = redacted.replace(/Cookie:\s*[^\n]+/gi, 'Cookie: [REDACTED]');
  
  return redacted;
}

/**
 * Check if content contains something that looks like a secret.
 */
export function isResearchSecretLike(content: string): boolean {
  if (!content) return false;
  return redactResearchSecrets(content) !== content;
}

/**
 * Sanitize and validate research URLs.
 */
export function sanitizeResearchUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  
  try {
    const parsed = new URL(url);
    
    // Allow only http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return undefined;
    }
    
    // Remove credentials from URL
    parsed.username = '';
    parsed.password = '';

    if (!researchUrlIsSafe(parsed.toString())) {
      return undefined;
    }
    
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function researchUrlIsSafe(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
    if (/^[0.]+$/.test(hostname) || /^\d+$/.test(hostname) || /^0x[0-9a-f]+(?:\.[0-9a-f]+){0,3}$/i.test(hostname)) return false;
    const parts = hostname.split(".").map(Number);
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      const [a, b] = parts;
      if (a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    const isIpv6 = hostname.includes(":");
    if (isIpv6 && (hostname === "::" || hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe8") || hostname.startsWith("fe9") || hostname.startsWith("fea") || hostname.startsWith("feb"))) return false;
    if (hostname.startsWith("::ffff:")) return researchUrlIsSafe(`http://${hostname.slice(7)}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Export a list of research sessions to a safe JSON envelope.
 */
export function exportResearchSessions(sessions: ResearchSession[]): ResearchExport {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "Venice Forge",
    sessions: sessions.map(s => sanitizeResearchSession(JSON.parse(JSON.stringify(s)))),
  };
}
