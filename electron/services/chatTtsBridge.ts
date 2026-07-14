import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { performGuardedVeniceRequest } from './guardPipeline';
import { logError } from './logger';

export interface SynthesizeSpeechOptions {
  text: string;
  model?: string;
  voice?: string;
  speed?: number;
}

export interface SynthesizeSpeechResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const CACHE_DIR = path.join(app.getPath('userData'), 'tts-cache');

/**
 * Initializes the TTS cache directory.
 */
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (err) {
    logError('Failed to create TTS cache dir', err);
  }
}

/**
 * Generates a content-addressed SHA-256 hash for the requested speech.
 */
function getCacheKey(opts: SynthesizeSpeechOptions): string {
  const hash = createHash('sha256');
  hash.update(opts.text);
  hash.update(opts.model || '');
  hash.update(opts.voice || '');
  hash.update(String(opts.speed || 1.0));
  return hash.digest('hex');
}

export async function clearTtsCache(): Promise<{ ok: boolean; error?: string }> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      if (file.endsWith('.mp3') || file.endsWith('.ogg')) {
        await fs.unlink(path.join(CACHE_DIR, file)).catch(() => {});
      }
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * Handles IPC requests for text-to-speech synthesis.
 */
export async function synthesizeSpeech(opts: SynthesizeSpeechOptions, cacheEnabled: boolean): Promise<SynthesizeSpeechResult> {
  try {
    await ensureCacheDir();

    const cacheKey = getCacheKey(opts);
    const cachePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);

    if (cacheEnabled) {
      try {
        const stats = await fs.stat(cachePath);
        if (stats.isFile() && stats.size > 0) {
          return { ok: true, id: cacheKey };
        }
      } catch {
        // Cache miss
      }
    }

    const payload = {
      model: opts.model || 'tts-chatterbox-hd',
      input: opts.text,
      voice: opts.voice || 'chatterbox',
      speed: opts.speed || 1.0,
    };

    // Use the guarded pipeline which handles auth, rate-limiting, and Local Family Safe Mode
    const guarded = await performGuardedVeniceRequest({
      endpoint: '/audio/speech',
      method: 'POST',
      body: payload,
    });

    if (guarded.kind === 'blocked') {
      return { ok: false, error: guarded.block.body.error || 'Blocked by Family Safe Mode' };
    }

    const result = guarded.response;

    if (!result.ok || !result.body) {
      // The response body in guarded request on error is a JSON object with error details
      const errMsg = typeof result.body === 'object' && result.body !== null && 'error' in result.body
        ? String((result.body as any).error)
        : `HTTP ${result.status}`;
      return { ok: false, error: errMsg };
    }

    let audioBuffer: Buffer;
    if (Buffer.isBuffer(result.body)) {
      audioBuffer = result.body;
    } else if (result.body instanceof ArrayBuffer || result.body instanceof Uint8Array) {
      audioBuffer = Buffer.from(result.body);
    } else {
      // If it parsed as JSON but it's supposed to be audio...
      logError('Unexpected response type for audio/speech', typeof result.body);
      return { ok: false, error: 'Unexpected response type from API' };
    }

    await fs.writeFile(cachePath, audioBuffer);
    
    return { ok: true, id: cacheKey };
  } catch (err: any) {
    logError('synthesizeSpeech error', err);
    return { ok: false, error: err.message };
  }
}
