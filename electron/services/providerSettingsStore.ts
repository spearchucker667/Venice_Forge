/** @fileoverview Profile-scoped, main-process authority for fallback-provider consent. */

import fs from "fs";
import path from "path";
import { app } from "electron";
import { PROVIDER_REGISTRY, type ProviderId } from "../../src/types/provider";

const STORE_FILE = "provider-settings.json";

const NATIVE_FALLBACK_MODELS: Partial<Record<ProviderId, string>> = {
  together: "meta-llama/Llama-3-70b-chat-hf",
  groq: "llama3-70b-8192",
  fireworks: "accounts/fireworks/models/llama-v3p1-70b-instruct",
  google_gemini: "gemini-2.5-flash",
  mistral: "mistral-large-latest",
  anthropic: "claude-3-5-sonnet-latest",
  perplexity: "sonar",
};

export interface ProviderSettingsSnapshot {
  enabledProviders: Partial<Record<ProviderId, boolean>>;
  autoFallbackEnabled: boolean;
  fallbackOrdering: ProviderId[];
  nativeFallbackModels: Partial<Record<ProviderId, string>>;
}

export interface ProviderSettingsUpdate {
  enabledProviders?: Record<string, boolean>;
  autoFallbackEnabled?: boolean;
  fallbackOrdering?: string[];
}

interface ProviderSettingsFile {
  version: 1;
  profiles: Record<string, Omit<ProviderSettingsSnapshot, "nativeFallbackModels">>;
}

const DEFAULT_PROFILE_SETTINGS: Omit<ProviderSettingsSnapshot, "nativeFallbackModels"> = {
  enabledProviders: {},
  autoFallbackEnabled: false,
  fallbackOrdering: [],
};

function nativeFallbackModels(): Partial<Record<ProviderId, string>> {
  return { ...NATIVE_FALLBACK_MODELS };
}

export function isProviderAvailableForFallback(providerId: string): providerId is ProviderId {
  const definition = PROVIDER_REGISTRY[providerId as ProviderId];
  return Boolean(definition && definition.id !== "venice" && !definition.unavailable && NATIVE_FALLBACK_MODELS[definition.id]);
}

function isAvailableFallbackProvider(value: string): value is ProviderId {
  return isProviderAvailableForFallback(value);
}

function sanitizeProfileSettings(value: unknown): Omit<ProviderSettingsSnapshot, "nativeFallbackModels"> {
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
  };
}

function storePath(): string {
  return path.join(app.getPath("userData"), STORE_FILE);
}

function readFile(): ProviderSettingsFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { version: 1, profiles: {} };
    }
    const profilesValue = (parsed as Record<string, unknown>).profiles;
    if (!profilesValue || typeof profilesValue !== "object" || Array.isArray(profilesValue)) {
      return { version: 1, profiles: {} };
    }
    const profiles: ProviderSettingsFile["profiles"] = {};
    for (const [profileId, settings] of Object.entries(profilesValue)) {
      profiles[profileId] = sanitizeProfileSettings(settings);
    }
    return { version: 1, profiles };
  } catch {
    return { version: 1, profiles: {} };
  }
}

function writeFile(data: ProviderSettingsFile): void {
  const target = storePath();
  const temporary = `${target}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* best-effort temporary cleanup */ }
    throw error;
  }
}

export function getProviderSettings(profileId = "default"): ProviderSettingsSnapshot {
  const stored = readFile().profiles[profileId] ?? DEFAULT_PROFILE_SETTINGS;
  return {
    ...sanitizeProfileSettings(stored),
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
  };
  const next = sanitizeProfileSettings(candidate);
  file.profiles[profileId] = next;
  writeFile(file);
  return { ...next, nativeFallbackModels: nativeFallbackModels() };
}

export function disableProvider(profileId: string, providerId: string): ProviderSettingsSnapshot {
  const current = getProviderSettings(profileId);
  return updateProviderSettings(profileId, {
    enabledProviders: { ...current.enabledProviders, [providerId]: false },
    fallbackOrdering: current.fallbackOrdering.filter((entry) => entry !== providerId),
  });
}
