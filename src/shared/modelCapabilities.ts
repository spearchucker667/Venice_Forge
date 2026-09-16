/** @fileoverview Shared, transport-independent model capability gates.
 *
 *  Gate tool injection and capability-gated request fields ONLY on explicit
 *  runtime metadata (P1-005/P3-001): missing metadata fails closed so an
 *  unsupported model never receives `tools` / tool choice from the canonical
 *  body builder. Never hard-code production model IDs here.
 */

export interface FunctionCallingCapableModel {
  capabilities?: { supportsFunctionCalling?: boolean };
}

/** True only when the model explicitly advertises function calling. */
export function supportsFunctionCalling(
  modelInfo: FunctionCallingCapableModel | undefined,
): boolean {
  return modelInfo?.capabilities?.supportsFunctionCalling === true;
}

/** True only when the model explicitly advertises vision. */
export function supportsVision(modelInfo: FunctionCallingCapableModel & {
  capabilities?: { supportsVision?: boolean };
} | undefined): boolean {
  return modelInfo?.capabilities?.supportsVision === true;
}

/** True only when the model explicitly advertises end-to-end encryption.
 *  Used to capability-gate `venice_parameters.enable_e2ee` so the field is
 *  omitted for models that do not declare `supportsE2EE`. The Swagger field
 *  is documented as nested under `model.model_spec.capabilities`, but
 *  legacy normalized records may carry the boolean at the top of
 *  `model_spec`. Both shapes are honored — absent/unspecified fails closed. */
export function supportsE2EE(
  modelInfo: {
    model_spec?: {
      supportsE2EE?: boolean;
      capabilities?: { supportsE2EE?: boolean };
    };
  } | undefined,
): boolean {
  if (!modelInfo?.model_spec) return false;
  if (typeof modelInfo.model_spec.supportsE2EE === 'boolean') {
    return modelInfo.model_spec.supportsE2EE;
  }
  return modelInfo.model_spec.capabilities?.supportsE2EE === true;
}