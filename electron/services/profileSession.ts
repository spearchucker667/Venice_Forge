/** @fileoverview Main-process profile authority scoped to each renderer WebContents. */

import type { WebContents } from "electron";
import { isValidProfileStorageId } from "../../src/utils/profileIdValidation";

let sessions = new WeakMap<WebContents, string>();

/** Returns the main-authoritative profile for a renderer. Unbound renderers use the system default. */
export function getProfileSessionId(sender: WebContents): string {
  return sessions.get(sender) ?? "default";
}

/** Binds a validated profile to a renderer after the activation gate succeeds. */
export function setProfileSessionId(sender: WebContents, profileId: string): void {
  if (!isValidProfileStorageId(profileId)) {
    throw new Error("Invalid profile id.");
  }
  sessions.set(sender, profileId);
}

export function __resetProfileSessionsForTests(): void {
  sessions = new WeakMap<WebContents, string>();
}
