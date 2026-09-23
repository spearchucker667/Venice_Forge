/**
 * @fileoverview In-memory runtime safety counters for the Status surface.
 *
 * Records aggregate counts ONLY — no prompt text, media bytes, matched terms,
 * credentials, or any user-controlled content is ever stored here. Each
 * process (Electron main, renderer/web) owns its own instance; the Status tab
 * reads the main-process instance through IPC.
 */

export type SafetyCounterModality = "text" | "image" | "audio" | "video";

export interface SafetyCountersSnapshot {
  textEvaluations: number;
  imageEvaluations: number;
  audioEvaluations: number;
  videoEvaluations: number;
  blocked: number;
  allowed: number;
  skippedDisabled: number;
  errors: number;
}

export interface StructuralValidationCountersSnapshot {
  requestsValidated: number;
  rejectedRequests: number;
}

const EVALUATION_KEY_BY_MODALITY: Record<SafetyCounterModality, keyof SafetyCountersSnapshot> = {
  text: "textEvaluations",
  image: "imageEvaluations",
  audio: "audioEvaluations",
  video: "videoEvaluations",
};

const counters: SafetyCountersSnapshot = {
  textEvaluations: 0,
  imageEvaluations: 0,
  audioEvaluations: 0,
  videoEvaluations: 0,
  blocked: 0,
  allowed: 0,
  skippedDisabled: 0,
  errors: 0,
};

const structuralCounters: StructuralValidationCountersSnapshot = {
  requestsValidated: 0,
  rejectedRequests: 0,
};

/** Records that a request entered structural/protocol validation. */
export function incrementStructuralValidated(): void {
  structuralCounters.requestsValidated++;
}

/** Records that structural validation rejected a request (invalid/unsupported). */
export function incrementStructuralRejected(): void {
  structuralCounters.rejectedRequests++;
}

/** Records a semantic/local evaluation outcome for a modality. */
export function incrementEvaluated(
  modality: SafetyCounterModality,
  outcome: "allowed" | "blocked" | "error",
): void {
  counters[EVALUATION_KEY_BY_MODALITY[modality]]++;
  if (outcome === "allowed") counters.allowed++;
  else if (outcome === "blocked") counters.blocked++;
  else counters.errors++;
}

/** Records that screening was skipped because local safeguards are disabled. */
export function incrementSkippedDisabled(_modality?: SafetyCounterModality): void {
  counters.skippedDisabled++;
}

/** Returns a copy of the evaluation counters. */
export function getSafetyCountersSnapshot(): SafetyCountersSnapshot {
  return { ...counters };
}

/** Returns a copy of the structural validation counters. */
export function getStructuralCountersSnapshot(): StructuralValidationCountersSnapshot {
  return { ...structuralCounters };
}

/** Resets all counters. Use in tests only — not callable from the renderer. */
export function _resetSafetyCounters_TEST_ONLY(): void {
  counters.textEvaluations = 0;
  counters.imageEvaluations = 0;
  counters.audioEvaluations = 0;
  counters.videoEvaluations = 0;
  counters.blocked = 0;
  counters.allowed = 0;
  counters.skippedDisabled = 0;
  counters.errors = 0;
  structuralCounters.requestsValidated = 0;
  structuralCounters.rejectedRequests = 0;
}
