/** @fileoverview Validates IPC requests from the renderer to ensure they target
 *  allowed Venice endpoints, methods, and payload sizes. */

// Code Owner: fayeblade (@spearchucker667)
// IPC input validation — critical security boundary between renderer and main process.
import { VENICE_MAX_BODY_BYTES } from "../../src/shared/limits";
export const MAX_VENICE_IPC_BODY_BYTES = VENICE_MAX_BODY_BYTES;

import {
  ALLOWED_VENICE_ENDPOINTS,
  ALLOWED_VENICE_METHODS,
  API_KEYS_ENDPOINT,
  CHARACTERS_ENDPOINT,
  VeniceIpcEndpoint,
  VeniceIpcMethod,
  isAllowedVeniceRequest,
  isAllowedX402Endpoint,
} from "../../src/shared/validation";
import { VENICE_API_HOST } from "../../src/shared/apiConfig";
import type { MutationOrigin } from "../../src/types/sync";
import { assertValidProfileStorageId } from "../../src/utils/profileIdValidation";
import { checkSystemPromptMessages } from "../../src/shared/promptLimits";
import { PROVIDER_REGISTRY } from "../../src/types/provider";

/** Describes a validated Venice IPC request ready for the main process.
 *
 *  P1-015: the `localFamilySafeModeEnabled` field that used to live here was
 *  REMOVED. The main-process runtime snapshot
 *  (`electron/services/runtimeSafetySettings.ts`) is the canonical source of
 *  truth for the local Family Safe Mode toggle, and the centralized
 *  `electron/services/guardPipeline.ts` reads it directly. Renderer-supplied
 *  values are ignored. The legacy `localFamilySafeModeEnabled` field on the
 *  raw IPC input is still accepted (for back-compat with older renderer
 *  builds) but is intentionally dropped here. */
export interface VeniceIpcRequest {
  endpoint: string;
  method: VeniceIpcMethod;
  body?: unknown;
  headers?: Record<string, string>;
  signalId?: string;
  profileId?: string;
  agentSessionId?: string;
  fallbackConfig?: { enabled: boolean; ordering: string[] };
}

/** Headers the renderer is never allowed to set on a forwarded Venice request.
 *  `x-forwarded-*` prefix matches are handled separately because the
 *  blocklist needs to match every variant. */
const BLOCKED_VENICE_HEADERS = new Set([
  "authorization",
  "host",
  "cookie",
  "content-length",
  "transfer-encoding",
  "origin",
  "referer",
  "proxy-authorization",
  "proxy-authenticate",
]);

/** Computes the UTF-8 byte length of a request body. */
function bodySizeBytes(body: unknown): number {
  if (body === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(body), "utf-8");
  } catch {
    throw new Error("Venice request body contains circular references or is not serializable.");
  }
}

/** Parses and validates that a Venice endpoint is relative and on the allowed origin.
 *  @param endpoint The raw endpoint string from the renderer.
 *  @returns A parsed URL constrained to the Venice API host.
 */
function parseEndpoint(endpoint: string): URL {
  if (!endpoint.startsWith("/")) throw new Error("Venice endpoint must be relative.");
  let parsed: URL;
  try {
    parsed = new URL(endpoint, `https://${VENICE_API_HOST}`);
  } catch {
    throw new Error("Venice endpoint is malformed.");
  }
  if (parsed.origin !== `https://${VENICE_API_HOST}`) {
    throw new Error("Venice endpoint must stay on the Venice API origin.");
  }
  return parsed;
}

/** Allowed mutation origins for storage write/delete operations. Only
 *  `local-user` mutations should automatically emit sync packets. */
const MUTATION_ORIGINS = new Set<string>([
  "local-user",
  "remote-sync",
  "manual-import",
  "migration",
]);

/** Validates a mutation origin value, defaulting omitted values to
 *  `"local-user"` for back-compat.
 *  @param origin The raw origin value from an IPC payload.
 *  @returns A valid MutationOrigin.
 *  @throws If the origin is provided but not one of the allowed values.
 */
export function validateMutationOrigin(origin: unknown): MutationOrigin {
  if (origin === undefined) return "local-user";
  if (typeof origin !== "string" || !MUTATION_ORIGINS.has(origin)) {
    throw new Error(`Invalid mutation origin: ${origin}`);
  }
  return origin as MutationOrigin;
}

/** Validates that a user-provided API key is a non-empty string within length limits.
 *  @param key The raw API key value to validate.
 *  @returns The trimmed API key string.
 */
export function validateApiKeyInput(key: unknown): string {
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new Error("Enter a Venice API key before saving.");
  }
  const trimmed = key.trim();
  if (trimmed.length > 512) throw new Error("Venice API key is too long.");
  return trimmed;
}

/** Validates a non-empty string field with a maximum length. */
function validateCredentialString(value: unknown, name: string, maxLength = 512): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new Error(`${name} is too long.`);
  return trimmed;
}

/** Azure resource names are alphanumeric plus hyphens, 2–64 characters. They
 *  must not contain dots, protocol, ports, paths, or other URL metacharacters.
 *  @throws If the value is not a valid Azure resource name.
 */
export function validateAzureResourceName(value: unknown): string {
  const name = validateCredentialString(value, "Azure resource name", 64);
  if (!/^[a-z0-9-]{2,64}$/.test(name)) {
    throw new Error("Azure resource name must be 2–64 lowercase alphanumeric characters or hyphens.");
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    throw new Error("Azure resource name cannot start or end with a hyphen.");
  }
  return name;
}

/** AWS region identifiers are lowercase alphanumeric plus hyphens, 2–32 chars.
 *  @throws If the value is not a valid AWS region.
 */
export function validateAwsRegion(value: unknown): string {
  const region = validateCredentialString(value, "AWS region", 32);
  if (!/^[a-z0-9-]{2,32}$/.test(region)) {
    throw new Error("AWS region must be a valid region identifier.");
  }
  if (region.startsWith("-") || region.endsWith("-")) {
    throw new Error("AWS region cannot start or end with a hyphen.");
  }
  return region;
}

/** Validates a structured provider credential payload before secure storage.
 *  Secret values are accepted; non-secret routing fields are constrained.
 *  @returns A normalized credential object safe to persist.
 */
export function validateProviderCredential(providerId: string, credential: unknown): Record<string, unknown> {
  if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
    throw new Error("Credential must be an object.");
  }
  if (!(providerId in PROVIDER_REGISTRY)) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  const definition = PROVIDER_REGISTRY[providerId as keyof typeof PROVIDER_REGISTRY];
  if (definition.unavailable) {
    throw new Error(`Provider ${providerId} is not available for credential storage.`);
  }
  const c = credential as Record<string, unknown>;
  switch (providerId) {
    case "azure_openai": {
      return {
        providerId,
        resourceName: validateAzureResourceName(c.resourceName),
        deploymentName: validateCredentialString(c.deploymentName, "Azure deployment name", 128),
        apiVersion: validateCredentialString(c.apiVersion, "Azure API version", 64),
        apiKey: validateCredentialString(c.apiKey, "Azure API key", 512),
      };
    }
    case "aws_bedrock": {
      return {
        providerId,
        region: validateAwsRegion(c.region),
        apiKey: validateCredentialString(c.apiKey, "AWS Bedrock API key", 512),
      };
    }
    case "google_vertex": {
      // VF-AUD-20260831-P2-007: only express (API-key) mode is supported.
      // The previous "full" branch was selectable in the UI but guaranteed to
      // fail; it has been removed until service-account/OAuth is implemented.
      return {
        providerId,
        authMode: "express" as const,
        apiKey: validateCredentialString(c.apiKey, "Google Cloud API key", 512),
      };
    }
    default:
      throw new Error(`Provider ${providerId} does not support structured credentials.`);
  }
}

/** Validates and sanitizes a Venice IPC request from the renderer.
 *  @param input The raw request payload from IPC.
 *  @returns A validated and sanitized request object.
 */
export function validateVeniceIpcRequest(input: unknown): VeniceIpcRequest {
  if (!input || typeof input !== "object") throw new Error("Venice request must be an object.");
  const request = input as Record<string, unknown>;
  if (typeof request.endpoint !== "string") throw new Error("Venice endpoint must be a string.");
  const endpoint = parseEndpoint(request.endpoint);
  // Endpoint must be either an exact match in the const allowlist OR
  // a member of the parameterized /characters family. The shared
  // `isAllowedVeniceRequest` predicate (imported from src/shared/validation)
  // understands both shapes.
  const isStatic = ALLOWED_VENICE_ENDPOINTS.includes(endpoint.pathname as VeniceIpcEndpoint);
  const isCharacters = endpoint.pathname === CHARACTERS_ENDPOINT ||
    endpoint.pathname.startsWith(`${CHARACTERS_ENDPOINT}/`);
  const isApiKeys = endpoint.pathname === API_KEYS_ENDPOINT ||
    endpoint.pathname.startsWith(`${API_KEYS_ENDPOINT}/`);
  const isX402 = isAllowedX402Endpoint(endpoint.pathname);
  if (!isStatic && !isCharacters && !isApiKeys && !isX402) {
    throw new Error(`Venice endpoint ${endpoint.pathname} is not allowed.`);
  }

  const method = typeof request.method === "string" ? request.method.toUpperCase() : "";
  if (!ALLOWED_VENICE_METHODS.includes(method as VeniceIpcMethod)) {
    throw new Error(`Venice method ${method || "missing"} is not allowed.`);
  }
  if (!isAllowedVeniceRequest(endpoint.pathname, method)) {
    throw new Error(`Venice method ${method} is not allowed for endpoint ${endpoint.pathname}.`);
  }
  if (method === "GET" && request.body !== undefined) {
    throw new Error("GET Venice requests cannot include a body.");
  }

  const size = bodySizeBytes(request.body);
  if (size > MAX_VENICE_IPC_BODY_BYTES) {
    throw new Error("Venice request payload is too large.");
  }

  const headers: Record<string, string> = {};
  if (request.headers !== undefined) {
    if (!request.headers || typeof request.headers !== "object" || Array.isArray(request.headers)) {
      throw new Error("Venice request headers must be an object.");
    }
    for (const [key, value] of Object.entries(request.headers as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (BLOCKED_VENICE_HEADERS.has(lower)) continue;
      if (lower.startsWith("x-forwarded-")) continue;
      if (typeof value === "string" && value.length <= 4096) headers[key] = value;
    }
  }

  if (request.signalId !== undefined) {
    if (typeof request.signalId !== "string") throw new Error("Venice signalId must be a string.");
    if (request.signalId.length > 128) throw new Error("Venice signalId is too long.");
  }

  // P1-015: the legacy `localFamilySafeModeEnabled` field is accepted on the
  // raw IPC input for back-compat with older renderer builds but is
  // intentionally DROPPED here. The main-process runtime snapshot is the
  // canonical source of truth. We tolerate non-boolean values silently
  // (no error throw) so a malformed renderer payload cannot trip the
  // validator. The expression below is intentionally a no-op marker so
  // older renderer payloads carrying the legacy field do not appear as
  // "unknown property" warnings in code review.
  void request.localFamilySafeModeEnabled;

  if (endpoint.search.length > 512) {
    throw new Error("Venice endpoint query string is too long.");
  }

  let profileId: string | undefined;
  if (request.profileId !== undefined) {
    assertValidProfileStorageId(request.profileId);
    profileId = request.profileId;
  }

  let agentSessionId: string | undefined;
  if (request.agentSessionId !== undefined) {
    if (typeof request.agentSessionId !== "string") throw new Error("Venice agentSessionId must be a string.");
    if (request.agentSessionId.length > 128) throw new Error("Venice agentSessionId is too long.");
    agentSessionId = request.agentSessionId;
  }



  // Enforce system prompt limits at the request boundary.
  if (endpoint.pathname === "/chat/completions" && request.body && typeof request.body === "object") {
    const body = request.body as Record<string, unknown>;
    const result = checkSystemPromptMessages(body.messages);
    if (result?.isOverLimit) throw new Error(result.message);
  }

  return {
    endpoint: `${endpoint.pathname}${endpoint.search}`,
    method: method as VeniceIpcMethod,
    body: request.body,
    headers,
    signalId: request.signalId,
    profileId,
    agentSessionId,
    
    fallbackConfig: parseFallbackConfig(request.fallbackConfig),
  };
}

function parseFallbackConfig(value: unknown): { enabled: boolean; ordering: string[] } | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Venice fallbackConfig must be an object.");
  }
  const rec = value as Record<string, unknown>;
  if (typeof rec.enabled !== "boolean") {
    throw new Error("Venice fallbackConfig.enabled must be a boolean.");
  }
  if (!Array.isArray(rec.ordering) || rec.ordering.length > 32 || rec.ordering.some((item) => typeof item !== "string" || item.length > 64)) {
    throw new Error("Venice fallbackConfig.ordering must be a string array of at most 32 ids.");
  }
  return { enabled: rec.enabled, ordering: rec.ordering as string[] };
}
