/**
 * @fileoverview Regression tests for the /audio/transcriptions client
 * contract. Locks the Swagger-derived allowlist and the form-data
 * builder logic so the renderer never sends an unknown model slug or
 * unsupported audio container upstream.
 *
 * BUG-REGRESSION (P1 audit): the previous `useTranscription` hook
 * hardcoded `'whisper-large-v3'`, which 400s under the Swagger enum
 * `["nvidia/parakeet-tdt-0.6b-v3", "openai/whisper-large-v3", …]`
 * because the upstream requires a `<provider>/<model>` slug.
 */
import { describe, expect, it } from "vitest";

import {
  AUDIO_EXTENSION_TO_FORMAT,
  VENICE_TRANSCRIPTION_AUDIO_FORMATS,
  VENICE_TRANSCRIPTION_DEFAULT_MODEL,
  VENICE_TRANSCRIPTION_MODELS,
  VENICE_TRANSCRIPTION_RESPONSE_FORMATS,
  buildTranscriptionFormData,
  TranscriptionInputError,
} from "./transcription";

class MockFile {
  readonly name: string;
  readonly type: string;
  readonly _isBlob = true as const;
  private readonly _parts: string[];
  constructor(name: string, type: string, content = "binary-stub") {
    this.name = name;
    this.type = type;
    this._parts = [content];
  }
}

async function readForm(form: FormData): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      out[key] = value;
    } else {
      out[key] = "[blob]";
    }
  }
  return out;
}

describe("transcription contract", () => {
  it("exports the Swagger model enum as a 5-entry closed allowlist", () => {
    expect(VENICE_TRANSCRIPTION_MODELS).toEqual([
      "nvidia/parakeet-tdt-0.6b-v3",
      "openai/whisper-large-v3",
      "fal-ai/wizper",
      "elevenlabs/scribe-v2",
      "stt-xai-v1",
    ]);
  });

  it("default model is the canonical Swagger default", () => {
    expect(VENICE_TRANSCRIPTION_DEFAULT_MODEL).toBe("nvidia/parakeet-tdt-0.6b-v3");
  });

  it("includes every Swagger audio container MIME in the allowlist", () => {
    for (const mime of [
      "audio/wav",
      "audio/wave",
      "audio/flac",
      "audio/m4a",
      "audio/aac",
      "audio/mp4",
      "audio/mpeg",
      "audio/ogg",
      "audio/oga",
      "audio/webm",
    ]) {
      expect(VENICE_TRANSCRIPTION_AUDIO_FORMATS).toContain(mime);
    }
  });

  it("response_format allowlist is json|text", () => {
    expect(VENICE_TRANSCRIPTION_RESPONSE_FORMATS).toEqual(["json", "text"]);
  });

  it("extension map covers all Swagger containers", () => {
    for (const ext of [".wav", ".wave", ".flac", ".m4a", ".aac", ".mp4", ".mp3", ".ogg", ".oga", ".webm"]) {
      expect(AUDIO_EXTENSION_TO_FORMAT[ext]).toMatch(/^audio\//);
    }
  });

  it("builds FormData with the documented Swagger default model and known audio MIME", async () => {
    const file = new MockFile("recording.wav", "audio/wav") as unknown as File;
    const form = buildTranscriptionFormData({ file });
    const fields = await readForm(form);
    expect(fields.model).toBe("nvidia/parakeet-tdt-0.6b-v3");
    expect(fields.response_format).toBe("json");
    expect(fields.timestamps).toBe("false");
    expect(fields.file).toBeTypeOf("string");
    expect(fields.file.length).toBeGreaterThan(0);
  });

  it("accepts an explicit allowlisted model slug", async () => {
    const file = new MockFile("clip.mp3", "audio/mpeg") as unknown as File;
    const form = buildTranscriptionFormData({ file, model: "openai/whisper-large-v3", language: "en" });
    const fields = await readForm(form);
    expect(fields.model).toBe("openai/whisper-large-v3");
    expect(fields.language).toBe("en");
  });

  it("rejects an unknown model slug by throwing TranscriptionInputError", () => {
    const file = new MockFile("clip.mp3", "audio/mpeg") as unknown as File;
    expect(() => buildTranscriptionFormData({ file, model: "whisper-large-v3" }))
      .toThrow(TranscriptionInputError);
  });

  it("falls back to canonical default when model is an empty string", async () => {
    const file = new MockFile("clip.mp3", "audio/mpeg") as unknown as File;
    const form = buildTranscriptionFormData({ file, model: "  " });
    const fields = await readForm(form);
    expect(fields.model).toBe("nvidia/parakeet-tdt-0.6b-v3");
  });

  it("rejects unknown audio container MIME", () => {
    const file = new MockFile("clip.avi", "video/x-msvideo") as unknown as File;
    expect(() => buildTranscriptionFormData({ file })).toThrow(/not in the .* container allowlist/);
  });

  it("resolves an audio container from extension when MIME is empty", async () => {
    // Some browsers/devices leave File.type empty for .wav; the helper
    // must fall back to extension lookup so we never silently send an
    // unsupported container upstream.
    const file = new MockFile("recording.wav", "") as unknown as File;
    const form = buildTranscriptionFormData({ file });
    const fields = await readForm(form);
    expect(fields.model).toBe("nvidia/parakeet-tdt-0.6b-v3");
    expect(fields.file).toBeTruthy();
  });

  it("throws TranscriptionInputError(missing-file) on missing file", () => {
    expect(() => buildTranscriptionFormData({ file: undefined as unknown as File })).toThrow(
      TranscriptionInputError,
    );
  });

  it("preserves explicit timestamps=true", async () => {
    const file = new MockFile("clip.mp3", "audio/mpeg") as unknown as File;
    const form = buildTranscriptionFormData({ file, timestamps: true });
    const fields = await readForm(form);
    expect(fields.timestamps).toBe("true");
  });

  it("falls back to response_format=json when caller passes an unknown format", async () => {
    const file = new MockFile("clip.mp3", "audio/mpeg") as unknown as File;
    const form = buildTranscriptionFormData({
      file,
      response_format: "srt" as unknown as "json",
    });
    const fields = await readForm(form);
    expect(fields.response_format).toBe("json");
  });
});
