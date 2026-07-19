import type { InternalToolName } from "../registry/tool-name-map";

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

export function safeToolError(
  toolName: InternalToolName,
  requestId: string,
  code: ToolError["code"],
  message: string,
  retryable = false,
): ToolResult<never> {
  return {
    ok: false,
    toolName,
    requestId,
    error: { code, message: message.slice(0, 500), retryable },
  };
}
