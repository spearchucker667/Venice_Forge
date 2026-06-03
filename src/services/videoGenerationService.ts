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
  video_url?: string;
  image_url?: string;
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

/**
 * Queues a new video generation request.
 */
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
 * Note: When the video is completed and download_url was NOT provided at queue time,
 * the response will contain the raw video/mp4 data in the response, not in JSON.
 */
export async function retrieveVideoGeneration(
  model: string,
  queue_id: string,
  options: { signal?: AbortSignal; dispatch?: AppDispatch } = {}
): Promise<{ status: "PROCESSING" | "COMPLETED"; blob?: Blob; average_execution_time?: number; execution_duration?: number; error?: string }> {
  const result = await veniceFetch<RetrieveVideoResponse | Blob>("/video/retrieve", {
    method: "POST",
    body: { model, queue_id },
    signal: options.signal,
    dispatch: options.dispatch,
  });

  // Depending on whether it's JSON or a blob, veniceFetch will parse it differently.
  // Note: We might need to adjust veniceFetch to support Blob responses correctly if it doesn't already,
  // or we can just rely on the existing support if it handles non-JSON responses.
  if (result.data instanceof Blob) {
    return { status: "COMPLETED", blob: result.data };
  } else {
    // Should be JSON status
    const data = result.data as RetrieveVideoResponse;
    return {
      status: data.status,
      average_execution_time: data.average_execution_time,
      execution_duration: data.execution_duration,
    };
  }
}
