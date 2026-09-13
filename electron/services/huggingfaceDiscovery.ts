/** @fileoverview Hugging Face Inference Providers live model discovery with
 *  bounded disk cache and stale-while-revalidate fallback. */

import fs from "fs";
import path from "path";
import { app } from "electron";
import type {
  ProviderModel,
  ProviderModelCatalogResult,
  ProviderModelLifecycle,
} from "../../src/types/provider";
import { getProviderApiKey } from "./secureStore";
import { redactErrorMessage } from "../../src/shared/redaction";
import { assertValidProfileStorageId } from "../../src/utils/profileIdValidation";
import { atomicReplaceFileSync } from "../utils/atomicFileReplace";

const HF_MODELS_ENDPOINT = "https://router.huggingface.co/v1/models";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_SCHEMA_VERSION = 1;

interface HuggingFaceModelsCache {
  version: number;
  fetchedAt: number;
  models: ProviderModel[];
}

function cacheFilePath(profileId: string): string {
  return path.join(
    app.getPath("userData"),
    "provider-catalogs",
    `huggingface-models-cache-v${CACHE_SCHEMA_VERSION}-${profileId}.json`,
  );
}

function readCache(profileId: string): HuggingFaceModelsCache | null {
  try {
    const raw = fs.readFileSync(cacheFilePath(profileId), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== CACHE_SCHEMA_VERSION) return null;
    if (typeof candidate.fetchedAt !== "number" || !Number.isFinite(candidate.fetchedAt)) return null;
    if (!Array.isArray(candidate.models)) return null;
    return {
      version: candidate.version as number,
      fetchedAt: candidate.fetchedAt as number,
      models: candidate.models as ProviderModel[],
    };
  } catch {
    return null;
  }
}

function writeCache(profileId: string, models: ProviderModel[], fetchedAt: number): void {
  const target = cacheFilePath(profileId);
  // Random temp name inside the utility prevents concurrent refreshes from
  // racing on the same .tmp file; atomic rename gives last-write-wins.
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    atomicReplaceFileSync(
      target,
      JSON.stringify({ version: CACHE_SCHEMA_VERSION, fetchedAt, models }, null, 2),
    );
  } catch (error) {
    // Cache writes are best-effort; discovery still returns live data.
    console.warn("[huggingfaceDiscovery] cache write failed:", redactErrorMessage(error));
  }
}

/** Conservative name-based fallback blacklist for obviously non-chat models. */
function isBlacklistedName(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  const excludedSubstrings = [
    "embedding",
    "embeddings",
    "similarity",
    "classifier",
    "classification",
    "vision-encoder",
    "speecht5",
    "wav2vec",
    "whisper",
    "t5-base",
    "t5-small",
    "sentence-transformers",
    "all-minilm",
  ];
  return excludedSubstrings.some((substring) => lower.includes(substring));
}

function isPositiveChatArchitecture(entry: Record<string, unknown>): boolean {
  const modalities = entry.modalities;
  if (modalities && typeof modalities === "object" && !Array.isArray(modalities)) {
    const m = modalities as Record<string, unknown>;
    const input = Array.isArray(m.input) ? (m.input as string[]) : [];
    const output = Array.isArray(m.output) ? (m.output as string[]) : [];
    if (input.includes("text") && output.includes("text")) {
      return true;
    }
  }

  const pipelineTag = typeof entry.pipeline_tag === "string" ? entry.pipeline_tag.toLowerCase() : "";
  const task = typeof entry.task === "string" ? entry.task.toLowerCase() : "";
  const chatTags = new Set([
    "text-generation",
    "text2text-generation",
    "conversational",
    "chat-completion",
    "chat-completions",
  ]);
  if (chatTags.has(pipelineTag) || chatTags.has(task)) {
    return true;
  }

  const inference = typeof entry.inference === "string" ? entry.inference.toLowerCase() : "";
  if (inference.includes("chat") || inference.includes("conversational")) {
    return true;
  }

  return false;
}

function isUnavailable(entry: Record<string, unknown>): boolean {
  const status = typeof entry.status === "string" ? entry.status.toLowerCase() : "";
  const lifecycle = typeof entry.lifecycle === "string" ? entry.lifecycle.toLowerCase() : "";
  if (["unavailable", "retired", "deprecated", "stale", "disabled"].includes(status)) return true;
  if (["unavailable", "retired"].includes(lifecycle)) return true;

  const providers = entry.providers;
  if (Array.isArray(providers) && providers.length === 0) return true;

  return false;
}

function hasCompatibleProvider(entry: Record<string, unknown>): boolean {
  const providers = entry.providers;
  if (!Array.isArray(providers)) return true; // assume routable if provider list is absent
  if (providers.length === 0) return false;

  // The router can dispatch to any provider returned by the HF /v1/models endpoint
  // that supports the chat-completions interface.
  const providerIds = providers
    .map((p) => (typeof p === "string" ? p : (p as Record<string, unknown>)?.id))
    .filter((id): id is string => typeof id === "string");
  if (providerIds.length === 0) return false;

  const chatProviders = new Set([
    "hf-inference",
    "inference-providers",
    "together",
    "fireworks-ai",
    "hyperbolic",
    "fal-ai",
    "replicate",
    "sambanova",
    "cohere",
    "novita",
    "black-forest-labs",
    "ibm",
    "cmu",
  ]);
  return providerIds.some((id) => chatProviders.has(id.toLowerCase()));
}

function normalizeHfModel(raw: unknown): ProviderModel | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const id = typeof entry.id === "string" ? entry.id : null;
  if (!id) return null;
  if (isBlacklistedName(id)) return null;

  const hasPositiveEvidence = isPositiveChatArchitecture(entry);
  if (!hasPositiveEvidence) return null;
  if (isUnavailable(entry)) return null;
  if (!hasCompatibleProvider(entry)) return null;

  const lifecycle: ProviderModelLifecycle = "active";
  const contextLength =
    typeof entry.context_length === "number"
      ? entry.context_length
      : typeof entry.context === "number"
        ? entry.context
        : undefined;

  const pricing =
    entry.pricing && typeof entry.pricing === "object" && !Array.isArray(entry.pricing)
      ? (entry.pricing as Record<string, unknown>)
      : undefined;

  const toolSupport =
    typeof entry.supports_tool_calling === "boolean"
      ? entry.supports_tool_calling
      : typeof entry.tool_use === "boolean"
        ? entry.tool_use
        : undefined;

  const structuredOutput =
    typeof entry.supports_structured_output === "boolean"
      ? entry.supports_structured_output
      : typeof entry.json_mode === "boolean"
        ? entry.json_mode
        : undefined;

  const providerAvailability = Array.isArray(entry.providers)
    ? entry.providers
        .map((p) => (typeof p === "string" ? p : (p as Record<string, unknown>)?.id))
        .filter((id): id is string => typeof id === "string")
    : undefined;

  return {
    id: `huggingface:${id}`,
    name: id,
    provider: "huggingface",
    capabilities: { chat: true },
    lifecycle,
    contextLength,
    pricing:
      pricing
        ? {
            input: typeof pricing.input === "number" ? pricing.input : undefined,
            output: typeof pricing.output === "number" ? pricing.output : undefined,
          }
        : undefined,
    toolSupport,
    structuredOutput,
    providerAvailability,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveHuggingFaceModels(apiKey: string): Promise<ProviderModel[]> {
  const response = await fetchWithTimeout(HF_MODELS_ENDPOINT, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "unknown");
    throw new Error(`HF model discovery failed (${response.status}): ${body}`);
  }

  const json = (await response.json()) as unknown;
  if (!json || typeof json !== "object" || !Array.isArray((json as Record<string, unknown>).data)) {
    throw new Error("HF model discovery returned an unexpected response shape.");
  }

  const entries = (json as Record<string, unknown>).data as unknown[];
  return entries.map(normalizeHfModel).filter((m): m is ProviderModel => m !== null);
}

/**
 * Returns the Hugging Face model catalog for the profile, using a cached copy
 * when fresh and refreshing in the background when stale or forced.
 */
export async function getHuggingFaceModelCatalog(
  profileId: string,
  options: { force?: boolean } = {},
): Promise<ProviderModelCatalogResult> {
  assertValidProfileStorageId(profileId);
  const checkedAt = Date.now();
  const apiKey = getProviderApiKey("huggingface", profileId);

  if (!apiKey) {
    return {
      providerId: "huggingface",
      models: [],
      fetchedAt: checkedAt,
      stale: true,
      source: "cached",
      error: "Hugging Face API key is not configured.",
    };
  }

  const cached = readCache(profileId);
  const isFresh = cached !== null && checkedAt - cached.fetchedAt < CACHE_TTL_MS;

  if (!options.force && isFresh && cached) {
    return {
      providerId: "huggingface",
      models: cached.models,
      fetchedAt: cached.fetchedAt,
      stale: false,
      source: "cached",
    };
  }

  try {
    const models = await fetchLiveHuggingFaceModels(apiKey);
    writeCache(profileId, models, checkedAt);
    return {
      providerId: "huggingface",
      models,
      fetchedAt: checkedAt,
      stale: false,
      source: "live",
    };
  } catch (error) {
    const message = redactErrorMessage(error);
    if (cached) {
      return {
        providerId: "huggingface",
        models: cached.models,
        fetchedAt: cached.fetchedAt,
        stale: true,
        source: "cached",
        error: message,
      };
    }
    return {
      providerId: "huggingface",
      models: [],
      fetchedAt: checkedAt,
      stale: true,
      source: "bundled",
      error: message,
    };
  }
}

/** Clears the cached Hugging Face model catalog for a profile. */
export function clearHuggingFaceModelCache(profileId: string): void {
  assertValidProfileStorageId(profileId);
  try {
    fs.unlinkSync(cacheFilePath(profileId));
  } catch {
    // Ignore missing-cache deletes.
  }
}
