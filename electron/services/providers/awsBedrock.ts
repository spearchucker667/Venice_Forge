/** @fileoverview Fail-closed placeholder for the unavailable AWS Bedrock adapter. */

/**
 * AWS Bedrock remains unavailable until its credential modes, model-specific
 * payloads, streaming, cancellation, and error normalization have behavioral
 * contract coverage. Never fall through to the ambient AWS credential chain.
 */
export async function executeBedrock(
  _request: unknown,
  _options: unknown,
  _configuration: string | null,
): Promise<never> {
  throw new Error("AWS Bedrock provider integration is not available.");
}
