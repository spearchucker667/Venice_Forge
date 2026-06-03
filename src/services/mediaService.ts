/** @fileoverview Media generation API client and lifecycle helpers. */

// Code Owner: fayeblade (@spearchucker667)
import { veniceFetch } from "./veniceClient";
import type { AppDispatch } from "../types/app";
import { isValidModelListResponse, isValidImageResponse } from "../utils/veniceValidation";
import type { ModelInfo } from "../types/venice";

export interface QueueVideoRequest {
  model: string;
  prompt?: string;
  duration?: string;
  aspect_ratio?: string;
  resolution?: string;
  audio?: boolean;
  image_url?: string;
  video_url?: string;
  negative_prompt?: string;
  upscale_factor?: number;
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

export interface VideoQuoteRequest {
  model: string;
  duration?: string;
  resolution?: string;
  aspect_ratio?: string;
}

export interface VideoQuoteResponse {
  quote: string;
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

export async function listModels(
  type: string = "all",
  options: { signal?: AbortSignal; dispatch?: AppDispatch } = {}
): Promise<ModelInfo[]> {
  const result = await veniceFetch(`/models?type=${encodeURIComponent(type)}`, {
    method: "GET",
    signal: options.signal,
    dispatch: options.dispatch,
    validator: isValidModelListResponse as (data: unknown) => data is { data: import("../types/venice").ModelInfo[] },
  });
  return (result.data as { data: import("../types/venice").ModelInfo[] }).data;
}

export async function queueVideo(
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

export async function retrieveVideo(
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

export async function completeVideo(
  model: string,
  queue_id: string,
  options: { signal?: AbortSignal; dispatch?: AppDispatch } = {}
): Promise<void> {
  await veniceFetch("/video/complete", {
    method: "POST",
    body: { model, queue_id },
    signal: options.signal,
    dispatch: options.dispatch,
  });
}

export async function quoteVideo(
  payload: VideoQuoteRequest,
  options: { signal?: AbortSignal; dispatch?: AppDispatch } = {}
): Promise<VideoQuoteResponse> {
  const result = await veniceFetch<VideoQuoteResponse>("/video/quote", {
    method: "POST",
    body: payload,
    signal: options.signal,
    dispatch: options.dispatch,
  });
  return result.data;
}

export interface UpscaleImageRequest {
  image: string; // base64, dataUrl, or URL
  scale?: number;
  enhance?: boolean;
  enhanceCreativity?: number;
  enhancePrompt?: string;
  replication?: boolean;
}

export async function upscaleImage(
  payload: UpscaleImageRequest,
  options: { signal?: AbortSignal; dispatch?: AppDispatch } = {}
): Promise<Blob> {
  const result = await veniceFetch("/image/upscale", {
    method: "POST",
    body: payload,
    signal: options.signal,
    dispatch: options.dispatch,
    validator: isValidImageResponse as (data: unknown) => data is Record<string, unknown>,
  });
  const data = result.data as Record<string, unknown>;
  if (Array.isArray(data.images) && data.images.length > 0) {
    const b64 = data.images[0];
    const match = /^data:([^;]+);base64,(.+)$/s.exec(b64);
    if (match) return new Blob([decodeBase64(match[2])], { type: match[1] });
    return new Blob([decodeBase64(b64)], { type: "image/png" });
  }
  if (typeof data.dataUrl === "string") {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(data.dataUrl);
    if (match) return new Blob([decodeBase64(match[2])], { type: match[1] });
  }
  if (typeof data.dataBase64 === "string") {
    return new Blob([decodeBase64(data.dataBase64)], { type: "image/png" });
  }
  throw new Error("No image data returned.");
}

export interface EditImageRequest {
  image: string;
  prompt: string;
  aspect_ratio?: string;
  resolution?: string;
  model: string;
  output_format?: string;
  safe_mode?: boolean;
}

export async function editImage(
  payload: EditImageRequest,
  options: { signal?: AbortSignal; dispatch?: AppDispatch } = {}
): Promise<Blob> {
  const result = await veniceFetch("/image/edit", {
    method: "POST",
    body: payload,
    signal: options.signal,
    dispatch: options.dispatch,
    validator: isValidImageResponse as (data: unknown) => data is Record<string, unknown>,
  });
  const data = result.data as Record<string, unknown>;
  if (Array.isArray(data.images) && data.images.length > 0) {
    const b64 = data.images[0];
    const match = /^data:([^;]+);base64,(.+)$/s.exec(b64);
    if (match) return new Blob([decodeBase64(match[2])], { type: match[1] });
    return new Blob([decodeBase64(b64)], { type: "image/png" });
  }
  if (typeof data.dataUrl === "string") {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(data.dataUrl);
    if (match) return new Blob([decodeBase64(match[2])], { type: match[1] });
  }
  if (typeof data.dataBase64 === "string") {
    return new Blob([decodeBase64(data.dataBase64)], { type: "image/png" });
  }
  throw new Error("No image data returned.");
}

export interface MultiEditImageRequest {
  images: string[];
  prompt: string;
  aspect_ratio?: string;
  modelId: string;
  output_format?: string;
  quality?: string;
  resolution?: string;
  safe_mode?: boolean;
}

export async function multiEditImage(
  payload: MultiEditImageRequest,
  options: { signal?: AbortSignal; dispatch?: AppDispatch } = {}
): Promise<Blob> {
  const result = await veniceFetch("/image/multi-edit", {
    method: "POST",
    body: payload,
    signal: options.signal,
    dispatch: options.dispatch,
    validator: isValidImageResponse as (data: unknown) => data is Record<string, unknown>,
  });
  const data = result.data as Record<string, unknown>;
  if (Array.isArray(data.images) && data.images.length > 0) {
    const b64 = data.images[0];
    const match = /^data:([^;]+);base64,(.+)$/s.exec(b64);
    if (match) return new Blob([decodeBase64(match[2])], { type: match[1] });
    return new Blob([decodeBase64(b64)], { type: "image/png" });
  }
  if (typeof data.dataUrl === "string") {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(data.dataUrl);
    if (match) return new Blob([decodeBase64(match[2])], { type: match[1] });
  }
  if (typeof data.dataBase64 === "string") {
    return new Blob([decodeBase64(data.dataBase64)], { type: "image/png" });
  }
  throw new Error("No image data returned.");
}
