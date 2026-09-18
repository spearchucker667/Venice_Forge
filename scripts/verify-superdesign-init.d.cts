/** Type shim for `scripts/verify-superdesign-init.cjs` so the test file
 *  can import the verifier with full TypeScript visibility. The runtime
 *  implementation is the `.cjs` file (executed by vitest via Node); this
 *  shim only declares the public shape.
 *
 *  Keep this file in sync with `scripts/verify-superdesign-init.cjs`
 *  `module.exports = { ... }`.
 */

export type VerifierResult = {
  passed: boolean;
  errors: string[];
  fingerprint: string;
};

export type ComponentRow = {
  name: string;
  sourcePath: string;
  props: string[];
};

export function verifySuperdesignInit(repoRoot: string): VerifierResult;

export const REQUIRED_FILES: readonly string[];
export const REQUIRED_SOURCE_PATHS: readonly string[];
export const REQUIRED_COMPONENT_SOURCES: readonly string[];

export function parseComponentsTable(markdown: string): ComponentRow[];

export function extractComponentPropsFromSource(
  source: string,
  componentName: string | null | undefined,
): string[] | null;