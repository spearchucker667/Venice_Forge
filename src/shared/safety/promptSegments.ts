/** @fileoverview Typed safety provenance segments (VF-20260916-P1-002 /
 *  VF-AUD-P1-002-STRUCTURAL).
 *
 *  Why this exists: the mandatory child-safety guard previously reconstructed
 *  the instruction-vs-quoted-attachment trust boundary by regex-parsing
 *  serialized `<external_attachment>` envelopes out of message text. The
 *  concrete split vector is closed (see `xmlEscape.ts`), but a string
 *  protocol still encodes the trust boundary. This module replaces it with
 *  typed segments produced by the chat attachment pipeline and consumed
 *  directly by the guard.
 *
 *  Contract:
 *  - `use-chat.ts` / `attachmentContextSelection.ts` produce ATTACHMENT
 *    segments (untrusted quoted data) and persist them on message metadata.
 *  - `chatPromptCompiler.ts` reconciles them against the final compiled
 *    message text (it owns injected-context prepends and context-window
 *    shrinking) and attaches a `SafetyProvenancePayload` to the outgoing
 *    body under `SAFETY_PROVENANCE_FIELD`.
 *  - The safety guard (`childExploitationGuard.ts`) consumes the typed
 *    segments directly — no regex reconstructs the trust boundary on this
 *    path. The legacy serialized-envelope regex split remains ONLY as a
 *    fallback for payloads without provenance (older persisted messages,
 *    non-chat producers).
 *  - The transport boundary (web proxy / Electron main) serializes the
 *    envelopes into message content for the provider and strips the
 *    internal field before anything leaves the app. See
 *    `serializeSafetyProvenanceIntoPayload` in `xmlEscape.ts`.
 */

/** Internal body field carrying the typed provenance. Never forwarded
 *  upstream — every transport boundary must serialize + strip it. */
export const SAFETY_PROVENANCE_FIELD = "_safetyProvenance";

export const SAFETY_PROVENANCE_VERSION = 1;

/** A single typed prompt segment. Provenance is carried structurally:
 *  `instruction` segments are the user's (or compiler's) intent; `attachment`
 *  segments are untrusted quoted file data. */
export type SafetyPromptSegment =
  | {
      kind: "instruction";
      /** The final compiled text this segment covers. */
      text: string;
      /** Payload path the text was taken from, e.g. `messages[2].content`. */
      source: string;
    }
  | {
      kind: "attachment";
      /** Stable attachment identifier (never a filesystem path). */
      attachmentId: string;
      name: string;
      mimeType: string;
      /** Quoted attachment text. Assessed by the guard (hard CSAM categories
       *  still block) but never treated as user intent. */
      text: string;
      trust: "untrusted-quoted-data";
    };

/** Provenance for one compiled request message. `index` is the message's
 *  index in the outgoing `messages` array. */
export interface SafetyProvenanceMessage {
  index: number;
  segments: SafetyPromptSegment[];
}

export interface SafetyProvenancePayload {
  version: typeof SAFETY_PROVENANCE_VERSION;
  messages: SafetyProvenanceMessage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidSegment(value: unknown): value is SafetyPromptSegment {
  if (!isRecord(value)) return false;
  if (value.kind === "instruction") {
    return typeof value.text === "string" && typeof value.source === "string";
  }
  if (value.kind === "attachment") {
    return (
      typeof value.attachmentId === "string" &&
      typeof value.name === "string" &&
      typeof value.mimeType === "string" &&
      typeof value.text === "string" &&
      value.trust === "untrusted-quoted-data"
    );
  }
  return false;
}

/** Extracts and validates the typed provenance from a request payload.
 *  Returns `undefined` when the field is absent OR malformed — callers must
 *  treat undefined as "no typed provenance" and fall back to the legacy
 *  serialized-envelope path (never trust a malformed structure). */
export function extractSafetyProvenance(
  payload: unknown,
): SafetyProvenancePayload | undefined {
  if (!isRecord(payload)) return undefined;
  const field = payload[SAFETY_PROVENANCE_FIELD];
  if (!isRecord(field)) return undefined;
  if (field.version !== SAFETY_PROVENANCE_VERSION) return undefined;
  if (!Array.isArray(field.messages)) return undefined;

  const messages: SafetyProvenanceMessage[] = [];
  for (const entry of field.messages) {
    if (!isRecord(entry)) return undefined;
    if (!Number.isInteger(entry.index) || (entry.index as number) < 0) {
      return undefined;
    }
    if (!Array.isArray(entry.segments)) return undefined;
    if (!entry.segments.every(isValidSegment)) return undefined;
    if (entry.segments.length === 0) return undefined;
    messages.push({
      index: entry.index as number,
      segments: entry.segments as SafetyPromptSegment[],
    });
  }
  if (messages.length === 0) return undefined;
  return { version: SAFETY_PROVENANCE_VERSION, messages };
}

/** Returns a shallow-structured clone of the payload without the internal
 *  provenance field. The input is never mutated. Non-object payloads are
 *  returned as-is. */
export function stripSafetyProvenance<T>(payload: T): T {
  if (!isRecord(payload)) return payload;
  const clone: Record<string, unknown> = { ...payload };
  delete clone[SAFETY_PROVENANCE_FIELD];
  return clone as T;
}
