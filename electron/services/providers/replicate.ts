/** @fileoverview Fail-closed placeholder for the unavailable Replicate adapter. */

/**
 * Replicate remains unavailable until prediction lifecycle, bounded polling,
 * streaming, cancellation, credential custody, and response normalization have
 * behavioral contract coverage.
 */
export async function executeReplicate(
  _request: unknown,
  _options: unknown,
  _configuration: string | null,
): Promise<never> {
  throw new Error("Replicate provider integration is not available.");
}
