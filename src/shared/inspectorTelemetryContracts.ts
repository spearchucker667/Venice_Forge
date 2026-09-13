/** @fileoverview Cross-process Inspector telemetry contract. Shared between
 *  the renderer (useInspectorStore / inspectorTelemetry helpers) and the
 *  Electron main process inspector telemetry bus. The shape is intentionally
 *  additive: an event is identified once by `eventId`, updated by emitting
 *  a follow-up `update` phase with the same id, and consumed in the renderer
 *  store via `upsertByEventId(eventId, partial)`. */

export type InspectorTelemetryPhase =
  | "created"
  | "updated"
  | "completed"
  | "aborted"
  | "timeout"
  | "failed";

export type InspectorTelemetryTransport = "venice" | "jina" | "local" | "background";

export type InspectorTelemetryGuardOutcome =
  | "allow"
  | "block"
  | "skipped"
  | "deferred"
  | "pending";

export type InspectorTelemetrySource =
  | "renderer"
  | "main-guard"
  | "main-background"
  | "main-video"
  | "main-audio"
  | "main-agent"
  | "main-research";

export interface InspectorTelemetryEvent {
  /** Stable id used to merge creates and updates into a single store row. */
  eventId: string;
  /** Lifecycle phase. */
  phase: InspectorTelemetryPhase;
  /** Wall-clock timestamp (ms since epoch). */
  timestamp: number;
  /** Endpoint path (e.g. `/chat/completions`, `/video/retrieve`). */
  endpoint: string;
  /** HTTP method (`GET`/`POST`). Background tasks can use `INTERNAL`. */
  method: string;
  /** Logical transport subsystem emitting the event. */
  transport: InspectorTelemetryTransport;
  /** Process that produced the event. Used by the renderer to bucket rows
   *  in the inspector tab (e.g. "Background Tasks"). */
  source: InspectorTelemetrySource;
  /** Optional caller-provided summary of the operation, always redacted. */
  summaries?: {
    model?: string;
    bytes?: number;
    durationMs?: number;
    taskId?: string;
  };
  /** Current guard outcome if a safety check was awaited. */
  guardOutcome?: InspectorTelemetryGuardOutcome;
  /** Normalized error code/message without leaking prompts or secrets. */
  error?: string;
  /** Optional opaque status (HTTP status, queue id, etc.). */
  status?: number;
  /** Profile that owns this event. Used to scope renderer delivery. */
  profileId?: string;
}

export type InspectorTelemetryListener = (event: InspectorTelemetryEvent) => void;

/** Channel name used by preload + IPC handlers for the inspector bus. */
export const INSPECTOR_TELEMETRY_CHANNEL = "inspector:telemetry";
