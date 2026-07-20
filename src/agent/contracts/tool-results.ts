import type { InternalToolName } from "../registry/tool-name-map";
import { sanitizeErrorText } from "../../shared/redaction";

export interface ToolWarning {
  code: string;
  message: string;
}

export interface ToolError {
  code:
    | "CAPABILITY_DENIED"
    | "INVALID_ARGUMENTS"
    | "RESOURCE_NOT_FOUND"
    | "STALE_REVISION"
    | "PATH_OUTSIDE_WORKSPACE"
    | "SYMLINK_ESCAPE"
    | "UNSUPPORTED_FILE_TYPE"
    | "FILE_TOO_LARGE"
    | "CHANGESET_TOO_LARGE"
    | "APPROVAL_REQUIRED"
    | "APPROVAL_EXPIRED"
    | "APPROVAL_MISMATCH"
    | "FORMAT_VALIDATION_FAILED"
    | "SERIALIZATION_FAILED"
    | "PARSER_FAILED"
    | "CONFLICT"
    | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
  safeDetails?: Record<string, string | number | boolean>;
}

export type ToolResult<TData = unknown> =
  | { ok: true; toolName: InternalToolName; requestId: string; data: TData; warnings?: ToolWarning[] }
  | { ok: false; toolName: InternalToolName; requestId: string; error: ToolError };

// Returns a failure ToolResult with secrets and local paths automatically
// redacted from the message. Defense-in-depth: even if the caller forgets to
// wrap raw `error.message` text with `sanitizeErrorText`, we still scrub the
// token before it can reach the model.
export function safeToolError(
  toolName: InternalToolName,
  requestId: string,
  code: ToolError["code"],
  message: string,
  retryable = false,
  safeDetails?: Record<string, string | number | boolean>,
): ToolResult<never> {
  const scrubbed = sanitizeErrorText(message);
  const scrubbedDetails: Record<string, string | number | boolean> | undefined = safeDetails
    ? Object.fromEntries(
        Object.entries(safeDetails).map(([k, v]) => [
          k,
          typeof v === "string" ? sanitizeErrorText(v).slice(0, 500) : v,
        ]),
      )
    : undefined;
  return {
    ok: false,
    toolName,
    requestId,
    error: {
      code,
      message: scrubbed.slice(0, 500),
      retryable,
      safeDetails: scrubbedDetails,
    },
  };
}
