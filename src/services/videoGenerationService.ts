/** @fileoverview Video generation API client and lifecycle helpers. */

// Code Owner: fayeblade (@spearchucker667)
import { veniceFetch } from "./veniceClient";
import type { AppDispatch } from "../types/app";

export interface QueueVideoRequest {
  model: string;
  prompt: string;
  duration?: string;
  aspect_ratio?: string;
  resolution?: string;
  audio?: boolean;
  image_url?: string;
  video_url?: string;
  negative_prompt?: string;
}

export interface QueueVideoResponse {
  model: string;
  queue_id: string;
  download_url?: string;
}

export interface RetrieveVideoResponse {
  status: "PROCESSING" | "COMPLETED";
  average_execution_time: number;
  execution_duration: number;
}

interface DataUrlBody {
  dataUrl: string;
}

interface DataBase64Body {
  dataBase64: string;
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function blobFromDataUrl(dataUrl: string): Blob | null {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  const [, mimeType, base64] = match;
  return new Blob([decodeBase64(base64)], { type: mimeType || "video/mp4" });
}

/** Queues a new Venice video generation request. */
export async function queueVideoGeneration(
  payload: QueueVideoRequest,
  options: { signal?: AbortSignal; dispatch?: AppDispatch } = {}
): Promise<QueueVideoResponse> {
  const result = await veniceFetch<QueueVideoResponse>("/video/queue", {
    method: "POST",
    body: payload,
    signal: options.signal,
    dispatch: options.dispatch,
  });
  return result.data;
}

/**
 * Retrieves the status or completed content of a queued video.
 * veniceFetch normalizes binary video responses to `{ dataUrl }` in web mode
 * or `{ dataBase64 }` in Electron mode, so this helper decodes those payloads.
 */
export async function retrieveVideoGeneration(
  model: string,
  queue_id: string,
  options: { signal?: AbortSignal; dispatch?: AppDispatch } = {}
): Promise<{ status: "PROCESSING" | "COMPLETED"; blob?: Blob; average_execution_time?: number; execution_duration?: number; error?: string }> {
  const result = await veniceFetch<RetrieveVideoResponse | DataUrlBody | DataBase64Body>("/video/retrieve", {
    method: "POST",
    body: { model, queue_id },
    signal: options.signal,
    dispatch: options.dispatch,
  });

  const data = result.data as RetrieveVideoResponse | DataUrlBody | DataBase64Body;
  if ("dataUrl" in data && typeof data.dataUrl === "string") {
    const blob = blobFromDataUrl(data.dataUrl);
    if (blob) return { status: "COMPLETED", blob };
    return { status: "COMPLETED", error: "Failed to decode video payload." };
  }

  if ("dataBase64" in data && typeof data.dataBase64 === "string") {
    return { status: "COMPLETED", blob: new Blob([decodeBase64(data.dataBase64)], { type: "video/mp4" }) };
  }

  if ("status" in data) {
    return {
      status: data.status,
      average_execution_time: data.average_execution_time,
      execution_duration: data.execution_duration,
    };
  }

  return { status: "COMPLETED", error: "Unexpected video retrieval response format." };
}
