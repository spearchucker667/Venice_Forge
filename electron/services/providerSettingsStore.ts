/** @fileoverview Profile-scoped, main-process authority for fallback-provider consent
 *  AND the user-selected primary-API route (Venice or Fraterna). */

import fs from "fs";
import path from "path";
import { app } from "electron";
import { PROVIDER_REGISTRY, type ProviderId } from "../../src/types/provider";
import {
  DEFAULT_PRIMARY_API_ROUTE,
  isPrimaryApiRouteId,
  type PrimaryApiRouteId,
} from "../../src/shared/primaryApiRoute";
import { atomicReplaceFileSync } from "../utils/atomicFileReplace";

const STORE_FILE = "provider-settings.json";

const NATIVE_FALLBACK_MODELS: Partial<Record<ProviderId, string>> = {
  together: "meta-llama/Llama-3-70b-chat-hf",
  groq: "llama3-70b-8192",
  fireworks: "accounts/fireworks/models/llama-v3p1-70b-instruct",
  google_gemini: "gemini-2.5-flash",
  google_vertex: "gemini-2.5-flash",
  mistral: "mistral-large-latest",
  anthropic: "claude-3-5-sonnet-latest",
  perplexity: "sonar",
  cohere: "command-a-03-2025",
  huggingface: "deepseek-ai/DeepSeek-R1:fastest",
  aws_bedrock: "openai.gpt-oss-20b",
};

export interface ProviderSettingsSnapshot {
  enabledProviders: Partial<Record<ProviderId, boolean>>;
  autoFallbackEnabled: boolean;
  fallbackOrdering: ProviderId[];
  nativeFallbackModels: Partial<Record<ProviderId, string>>;
  /** User-selected primary API route. `venice` is the default; `fraterna`
   *  is the public upstream that mirrors a curated subset of the same
   *  contract. Per-endpoint capability is enforced by the shared resolver,
   *  not here. */
  primaryApiRoute: PrimaryApiRouteId;
}

export interface ProviderSettingsUpdate {
  enabledProviders?: Record<string, boolean>;
  autoFallbackEnabled?: boolean;
  fallbackOrdering?: string[];
  primaryApiRoute?: PrimaryApiRouteId;
}

/** On-disk schema. Version 2 adds `primaryApiRoute` per profile; version 1
 *  files are still readable and silently migrate on next write. */
interface ProviderSettingsFileV1 {
  version: 1;
  profiles: Record<string, V1ProfileSettings>;
}

interface V1ProfileSettings {
  enabledProviders: Partial<Record<ProviderId, boolean>>;
  autoFallbackEnabled: boolean;
  fallbackOrdering: ProviderId[];
}

interface ProviderSettingsFileV2 {
  version: 2;
  profiles: Record<string, V2ProfileSettings>;
}

interface V2ProfileSettings extends V1ProfileSettings {
  primaryApiRoute: PrimaryApiRouteId;
}

type ProviderSettingsFile = ProviderSettingsFileV1 | ProviderSettingsFileV2;

const DEFAULT_PRIMARY_API_ROUTE_FOR_PROFILE: PrimaryApiRouteId = DEFAULT_PRIMARY_API_ROUTE;

const DEFAULT_PROFILE_SETTINGS: V2ProfileSettings = {
  enabledProviders: {},
  autoFallbackEnabled: false,
  fallbackOrdering: [],
  primaryApiRoute: DEFAULT_PRIMARY_API_ROUTE_FOR_PROFILE,
};

function nativeFallbackModels(): Partial<Record<ProviderId, string>> {
  return { ...NATIVE_FALLBACK_MODELS };
}

export function isProviderAvailableForFallback(providerId: string): providerId is ProviderId {
  const definition = PROVIDER_REGISTRY[providerId as ProviderId];
  // A provider is available for fallback consent if it is not Venice and not deferred.
  // Native fallback models are only required for automatic fallback routing; explicit
  // prefix routing (e.g. azure_openai:<deploymentName>) works without one.
  return Boolean(definition && definition.id !== "venice" && !definition.unavailable);
}

function isAvailableFallbackProvider(value: string): value is ProviderId {
  return isProviderAvailableForFallback(value);
}

/** Validates and coerces a raw value into a `PrimaryApiRouteId`. Unknown
 *  values fall back to the default; this mirrors the contract that the
 *  renderer migration uses. */
function sanitizePrimaryApiRoute(value: unknown): PrimaryApiRouteId {
  return isPrimaryApiRouteId(value) ? value : DEFAULT_PRIMARY_API_ROUTE_FOR_PROFILE;
}

function sanitizeProfileSettings(value: unknown): V2ProfileSettings {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawEnabled = record.enabledProviders && typeof record.enabledProviders === "object" && !Array.isArray(record.enabledProviders)
    ? record.enabledProviders as Record<string, unknown>
    : {};
  const enabledProviders: Partial<Record<ProviderId, boolean>> = {};
  for (const [providerId, enabled] of Object.entries(rawEnabled)) {
    if (isAvailableFallbackProvider(providerId) && enabled === true) {
      enabledProviders[providerId] = true;
    }
  }
  const fallbackOrdering = Array.isArray(record.fallbackOrdering)
    ? [...new Set(record.fallbackOrdering.filter(
      (providerId): providerId is ProviderId => typeof providerId === "string" && isAvailableFallbackProvider(providerId),
    ))]
    : [];
  return {
    enabledProviders,
    autoFallbackEnabled: record.autoFallbackEnabled === true,
    fallbackOrdering,
    primaryApiRoute: sanitizePrimaryApiRoute(record.primaryApiRoute),
  };
}

function storePath(): string {
  return path.join(app.getPath("userData"), STORE_FILE);
}

function readFile(): ProviderSettingsFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { version: 2, profiles: {} };
    }
    const root = parsed as Record<string, unknown>;
    const profilesValue = root.profiles;
    if (!profilesValue || typeof profilesValue !== "object" || Array.isArray(profilesValue)) {
      return { version: 2, profiles: {} };
    }
    const profiles: ProviderSettingsFileV2["profiles"] = {};
    for (const [profileId, settings] of Object.entries(profilesValue)) {
      profiles[profileId] = sanitizeProfileSettings(settings);
    }
    // Always re-emit as the latest schema so subsequent reads are fast
    // and older files transparently migrate on next write.
    return { version: 2, profiles };
  } catch {
    return { version: 2, profiles: {} };
  }
}

function writeFile(data: ProviderSettingsFile): void {
  const target = storePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  atomicReplaceFileSync(target, JSON.stringify(data, null, 2));
}

export function getProviderSettings(profileId = "default"): ProviderSettingsSnapshot {
  const stored = readFile().profiles[profileId] ?? DEFAULT_PROFILE_SETTINGS;
  const sanitized = sanitizeProfileSettings(stored);
  return {
    enabledProviders: sanitized.enabledProviders,
    autoFallbackEnabled: sanitized.autoFallbackEnabled,
    fallbackOrdering: sanitized.fallbackOrdering,
    primaryApiRoute: sanitized.primaryApiRoute,
    nativeFallbackModels: nativeFallbackModels(),
  };
}

export function updateProviderSettings(profileId: string, update: ProviderSettingsUpdate): ProviderSettingsSnapshot {
  const file = readFile();
  const current = file.profiles[profileId] ?? DEFAULT_PROFILE_SETTINGS;
  const candidate = {
    ...current,
    ...(update.enabledProviders === undefined ? {} : { enabledProviders: update.enabledProviders }),
    ...(update.autoFallbackEnabled === undefined ? {} : { autoFallbackEnabled: update.autoFallbackEnabled }),
    ...(update.fallbackOrdering === undefined ? {} : { fallbackOrdering: update.fallbackOrdering }),
    ...(update.primaryApiRoute === undefined ? {} : { primaryApiRoute: update.primaryApiRoute }),
  };
  const next = sanitizeProfileSettings(candidate);
  file.profiles[profileId] = next;
  writeFile(file);
  return {
    enabledProviders: next.enabledProviders,
    autoFallbackEnabled: next.autoFallbackEnabled,
    fallbackOrdering: next.fallbackOrdering,
    primaryApiRoute: next.primaryApiRoute,
    nativeFallbackModels: nativeFallbackModels(),
  };
}

export function disableProvider(profileId: string, providerId: string): ProviderSettingsSnapshot {
  const current = getProviderSettings(profileId);
  return updateProviderSettings(profileId, {
    enabledProviders: { ...current.enabledProviders, [providerId]: false },
    fallbackOrdering: current.fallbackOrdering.filter((entry) => entry !== providerId),
  });
}
