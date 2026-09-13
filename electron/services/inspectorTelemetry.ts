/** @fileoverview Process-local Inspector telemetry bus. Main-process emitters
 *  (backgroundTaskManager, guardPipeline, video/audio/agent services) publish
 *  redacted telemetry events through `emitInspectorTelemetry`. The IPC
 *  handler attaches via `subscribeInspectorTelemetry` and forwards new
 *  events to subscribed renderers over the `inspector:telemetry` channel.
 *
 *  IMPORTANT: This module is main-process-only. Do not import from renderer
 *  code (preload sandbox breaks if you do). The shared contract types live in
 *  `src/shared/inspectorTelemetryContracts.ts` and are imported by both sides.
 */

import type {
  InspectorTelemetryEvent,
  InspectorTelemetryListener,
  InspectorTelemetrySource,
  InspectorTelemetryTransport,
} from "../../src/shared/inspectorTelemetryContracts";

const listeners = new Set<InspectorTelemetryListener>();
let counter = 0;

function nextEventId(): string {
  counter = (counter + 1) >>> 0;
  // Combine a timestamp prefix with the monotonic counter so ids remain
  // monotonically increasing within a single process even when two emits
  // share the same millisecond.
  return `mt-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function subscribeInspectorTelemetry(listener: InspectorTelemetryListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearInspectorTelemetryListeners(): void {
  listeners.clear();
}

export function emitInspectorTelemetry(
  partial: Omit<InspectorTelemetryEvent, "eventId" | "timestamp"> & {
    eventId?: string;
    timestamp?: number;
  },
): string {
  const event: InspectorTelemetryEvent = {
    eventId: partial.eventId ?? nextEventId(),
    timestamp: partial.timestamp ?? Date.now(),
    phase: partial.phase,
    endpoint: partial.endpoint,
    method: partial.method,
    transport: partial.transport,
    source: partial.source,
    summaries: partial.summaries,
    guardOutcome: partial.guardOutcome,
    error: partial.error,
    status: partial.status,
    profileId: partial.profileId,
  };
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch {
      // Listener errors must never pollute the calling emitter. Swallow to
      // preserve the contract that telemetry is best-effort.
    }
  }
  return event.eventId;
}

/** Convenience constructor for the most common emitter — a request about to
 *  leave the main process. Carries only summary data; never accepts raw
 *  prompts, signed URLs, or filesystem paths. */
export function publishInspectorRequest(args: {
  source: InspectorTelemetrySource;
  transport: InspectorTelemetryTransport;
  endpoint: string;
  method: string;
  summaries?: InspectorTelemetryEvent["summaries"];
  guardOutcome?: InspectorTelemetryEvent["guardOutcome"];
  profileId?: string;
}): string {
  return emitInspectorTelemetry({
    phase: "updated",
    endpoint: args.endpoint,
    method: args.method,
    transport: args.transport,
    source: args.source,
    summaries: args.summaries,
    guardOutcome: args.guardOutcome,
    profileId: args.profileId,
  });
}

/** Convenience constructor for emit-on-completion. */
export function publishInspectorCompletion(args: {
  source: InspectorTelemetrySource;
  transport: InspectorTelemetryTransport;
  endpoint: string;
  method: string;
  summaries?: InspectorTelemetryEvent["summaries"];
  guardOutcome?: InspectorTelemetryEvent["guardOutcome"];
  status?: number;
  error?: string;
  eventId?: string;
  profileId?: string;
}): string {
  return emitInspectorTelemetry({
    eventId: args.eventId,
    phase: args.error ? "failed" : "completed",
    endpoint: args.endpoint,
    method: args.method,
    transport: args.transport,
    source: args.source,
    summaries: args.summaries,
    guardOutcome: args.guardOutcome,
    status: args.status,
    error: args.error,
    profileId: args.profileId,
  });
}
