/** Main-process TTS validation, guarded synthesis, and optional cache custody. */

import { app } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { performGuardedVeniceRequest } from "./guardPipeline";
import { logError } from "./logger";
import { DEFAULT_TTS_MODEL } from "../../src/constants/venice";
import { DEFAULT_TTS_VOICE } from "../../src/constants/tts";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";

export interface SynthesizeSpeechOptions {
  text: string;
  model?: string;
  voice?: string;
  speed?: number;
}

export interface SynthesizeSpeechResult {
  ok: boolean;
  id?: string;
  profileId?: string;
  audioBase64?: string;
  mimeType?: "audio/mpeg";
  cacheMode?: "disk" | "memory";
  error?: string;
}

const MAX_TTS_TEXT_LENGTH = 10_000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const SAFE_CATALOG_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const CACHE_DIR = path.join(app.getPath("userData"), "tts-cache");

/** Returns the profile-scoped cache directory. Every profile — including the
 *  default one — uses its own subdirectory so cached audio cannot collide
 *  across profiles and can be deterministically purged. */
function getProfileCacheDir(profileId: string): string {
  if (!isValidProfileStorageId(profileId)) throw new Error("Invalid profile id.");
  return path.join(CACHE_DIR, "profiles", profileId);
}

function parseOptionalCatalogId(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const trimmed = value.trim();
  if (!SAFE_CATALOG_ID.test(trimmed)) throw new Error(`Invalid ${field}.`);
  return trimmed;
}

export function validateSynthesizeSpeechOptions(value: unknown): SynthesizeSpeechOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid TTS request.");
  }
  const input = value as Record<string, unknown>;
  if (typeof input.text !== "string") throw new Error("TTS text must be a string.");
  const text = input.text.trim();
  if (!text || text.length > MAX_TTS_TEXT_LENGTH) {
    throw new Error(`TTS text must contain 1-${MAX_TTS_TEXT_LENGTH} characters.`);
  }
  const speed = input.speed === undefined ? undefined : Number(input.speed);
  if (speed !== undefined && (!Number.isFinite(speed) || speed < 0.25 || speed > 4)) {
    throw new Error("TTS speed must be between 0.25 and 4.");
  }
  return {
    text,
    model: parseOptionalCatalogId(input.model, "TTS model"),
    voice: parseOptionalCatalogId(input.voice, "TTS voice"),
    speed,
  };
}

/** Includes the profile id in the hash so identical audio across profiles
 *  is never shared. Each profile gets its own keyspace. */
function getCacheKey(opts: SynthesizeSpeechOptions, profileId: string): string {
  const hash = createHash("sha256");
  hash.update(profileId);
  hash.update("|");
  hash.update(opts.text);
  hash.update("|");
  hash.update(opts.model ?? "");
  hash.update("|");
  hash.update(opts.voice ?? "");
  hash.update("|");
  hash.update(String(opts.speed ?? 1));
  return hash.digest("hex");
}

/** Clears the TTS cache of the supplied profile only. */
export async function clearTtsCache(profileId: string): Promise<{ ok: boolean; removed: number; error?: string }> {
  try {
    const profileDir = getProfileCacheDir(profileId);
    const files = await fs.readdir(profileDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    let removed = 0;
    await Promise.all(files
      .filter((file) => /^[a-f0-9]{64}\.(mp3|ogg)$/.test(file))
      .map(async (file) => {
        await fs.unlink(path.join(profileDir, file));
        removed += 1;
      }));
    return { ok: true, removed };
  } catch (error: unknown) {
    logError("clearTtsCache error", error);
    return { ok: false, removed: 0, error: "Unable to clear the TTS cache." };
  }
}

/** Purges the full TTS cache directory owned by a non-default profile. */
export async function purgeProfileTtsCache(
  profileId: string,
): Promise<{ ok: boolean; removed: boolean; error?: string }> {
  if (!isValidProfileStorageId(profileId)) {
    return { ok: false, removed: false, error: "Invalid profile id." };
  }
  if (profileId === "default") {
    return { ok: false, removed: false, error: "The default profile TTS cache cannot be purged." };
  }
  try {
    const profileDir = getProfileCacheDir(profileId);
    let removed = true;
    try {
      await fs.access(profileDir);
    } catch {
      removed = false;
    }
    await fs.rm(profileDir, { recursive: true, force: true });
    return { ok: true, removed };
  } catch (error: unknown) {
    logError("purgeProfileTtsCache error", error);
    return { ok: false, removed: false, error: "Failed to purge the TTS cache." };
  }
}

export async function synthesizeSpeech(
  rawOptions: unknown,
  cacheEnabled: unknown,
  profileId: string,
): Promise<SynthesizeSpeechResult> {
  try {
    const opts = validateSynthesizeSpeechOptions(rawOptions);
    if (typeof cacheEnabled !== "boolean") {
      return { ok: false, error: "Invalid TTS cache setting." };
    }

    const profileDir = getProfileCacheDir(profileId);
    const cacheKey = getCacheKey(opts, profileId);
    const cachePath = path.join(profileDir, `${cacheKey}.mp3`);
    if (cacheEnabled) {
      await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
      try {
        const stats = await fs.stat(cachePath);
        if (stats.isFile() && stats.size > 0 && stats.size <= MAX_AUDIO_BYTES) {
          return { ok: true, id: cacheKey, profileId, cacheMode: "disk" };
        }
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    const guarded = await performGuardedVeniceRequest({
      endpoint: "/audio/speech",
      method: "POST",
      profileId,
      body: {
        model: opts.model ?? DEFAULT_TTS_MODEL,
        input: opts.text,
        voice: opts.voice ?? DEFAULT_TTS_VOICE,
        speed: opts.speed ?? 1,
      },
    });

    if (guarded.kind === "blocked") {
      return { ok: false, error: "Speech request blocked by Family Safe Mode." };
    }
    const result = guarded.response;
    if (!result.ok || !result.body) {
      return { ok: false, error: `Speech provider request failed (HTTP ${result.status}).` };
    }

    const audioBuffer = Buffer.isBuffer(result.body)
      ? result.body
      : result.body instanceof ArrayBuffer || result.body instanceof Uint8Array
        ? Buffer.from(result.body)
        : null;
    if (!audioBuffer || audioBuffer.length === 0 || audioBuffer.length > MAX_AUDIO_BYTES) {
      logError("Unexpected response for audio/speech", { type: typeof result.body, bytes: audioBuffer?.length });
      return { ok: false, error: "Speech provider returned invalid audio." };
    }

    if (!cacheEnabled) {
      return {
        ok: true,
        audioBase64: audioBuffer.toString("base64"),
        mimeType: "audio/mpeg",
        cacheMode: "memory",
      };
    }

    const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, audioBuffer, { mode: 0o600 });
      await fs.rename(temporaryPath, cachePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
    return { ok: true, id: cacheKey, profileId, cacheMode: "disk" };
  } catch (error: unknown) {
    logError("synthesizeSpeech error", error);
    const isValidationError = error instanceof Error && /^(Invalid TTS|TTS )/.test(error.message);
    return { ok: false, error: isValidationError ? error.message : "Speech synthesis failed." };
  }
}
