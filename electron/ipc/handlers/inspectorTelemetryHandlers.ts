/** @fileoverview Inspector telemetry IPC bridge. Subscribes to the main-process
 *  bus defined in `electron/services/inspectorTelemetry.ts` and forwards each
 *  event to one or more subscribed webContents keyed on the active profile.
 *
 *  The renderer pulls events through `window.veniceForge.inspector.onTelemetry`
 *  (added in `electron/preload.ts`) and merges them into `useInspectorStore`
 *  via the new `upsertByEventId` action — see `src/stores/inspector-store.ts`.
 */

import { type WebContents } from "electron";
import type { InspectorTelemetryEvent } from "../../../src/shared/inspectorTelemetryContracts";
import { INSPECTOR_TELEMETRY_CHANNEL } from "../../../src/shared/inspectorTelemetryContracts";
import { subscribeInspectorTelemetry } from "../../services/inspectorTelemetry";
import { registerPrivilegedIpcChannel, safeSendToRenderer } from "./common";
import { getProfileSessionId } from "../../services/profileSession";

const subscribers = new Set<WebContents>();
let busAttached = false;
let handlersRegistered = false;

export function __resetInspectorTelemetryHandlersForTests(): void {
  subscribers.clear();
  busAttached = false;
  handlersRegistered = false;
}

export function registerInspectorTelemetryHandlers(): void {
  attachBusOnce();
  if (handlersRegistered) return;
  handlersRegistered = true;

  registerPrivilegedIpcChannel("inspector:telemetry:subscribe", (event) => {
    subscribers.add(event.sender);
    return { ok: true };
  });

  registerPrivilegedIpcChannel("inspector:telemetry:unsubscribe", (event) => {
    subscribers.delete(event.sender);
    return { ok: true };
  });
}

function broadcast(event: InspectorTelemetryEvent): void {
  for (const webContents of Array.from(subscribers)) {
    if (webContents.isDestroyed()) {
      subscribers.delete(webContents);
      continue;
    }
    if (event.profileId && getProfileSessionId(webContents) !== event.profileId) continue;
    safeSendToRenderer(webContents, INSPECTOR_TELEMETRY_CHANNEL, event);
  }
}

function attachBusOnce(): void {
  if (busAttached) return;
  busAttached = true;
  subscribeInspectorTelemetry(broadcast);
}

