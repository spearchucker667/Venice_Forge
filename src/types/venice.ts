/** @fileoverview Venice API response type definitions. */

/** Metadata for a single model returned by the Venice API. */
export interface ModelInfo {
  id: string;
  name?: string;
  type?: string;
  traits?: unknown;
  isFallback?: boolean;
  source?: "live" | "fallback" | string;
  // Raw API fields
  created?: number;
  object?: string;
  owned_by?: string;
  model?: string;
  display_name?: string;
  model_type?: string;
  modelType?: string;
  capabilities?: unknown;
  features?: unknown;
}



export interface DiagnosticsEntry {
  id: string;
  timestamp: number;
  type: "info" | "warn" | "error" | "success";
  endpoint: string;
  status: number | string | null;
  latencyMs: number | null;
  reqSize?: number;
  resSize?: number;
  error?: string;
  data?: unknown;
  method?: string;
  ok?: boolean;
  headers?: Record<string, string>;
  model?: string | null;
  message?: string;
  startedAt?: string;
  endedAt?: string;
}
