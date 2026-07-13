/** @fileoverview Fail-closed placeholder for the unavailable Google Vertex adapter. */

/**
 * Google Vertex remains unavailable until project, location, and credential
 * custody plus streaming and response behavior have behavioral contract
 * coverage. Never fall through to ambient Application Default Credentials.
 */
export async function executeVertexAI(
  _request: unknown,
  _options: unknown,
  _configuration: string | null,
): Promise<never> {
  throw new Error("Google Vertex provider integration is not available.");
}
