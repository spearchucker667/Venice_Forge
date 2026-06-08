/** @fileoverview Phase 2C App status model.
 *
 * Typed status surface for the header cluster + diagnostics drawer.
 * Designed to be safe to render in the renderer without leaking secrets:
 *   - No API keys, bearer tokens, auth headers, raw prompts, base64
 *     media blobs, or full local absolute paths in any field of
 *     `AppStatusItem`.
 *   - Status updates are deterministic + testable (pure functions
 *     over a snapshot of the live stores).
 *   - Severity values are an exhaustive union: `ok` / `warn` / `error`
 *     / `unknown`. The header cluster + diagnostics drawer render the
 *     severity via theme classes (no inline colours).
 *
 * Status computation must NOT spam network requests: it only reads
 * from already-cached store state. Refresh actions are explicit user
 * gestures (Command Palette, header refresh button).
 */

/** Severity of a single status item. */
export type StatusSeverity = "ok" | "warn" | "error" | "unknown";

/** Canonical ordered list of severity values (most-severe first). */
export const STATUS_SEVERITIES: readonly StatusSeverity[] = [
  "error",
  "warn",
  "unknown",
  "ok",
] as const;

/** A single status item rendered by the header cluster / drawer. */
export interface AppStatusItem {
  /** Stable id used for tests + (future) telemetry. */
  id: string;
  /** Short human label, e.g. `API`, `API Key`, `Model`, `Storage`. */
  label: string;
  severity: StatusSeverity;
  /** One-sentence status summary (no secrets). */
  summary: string;
  /** Optional longer description (no secrets). */
  detail?: string;
  /** Optional label for the "next action" button. */
  actionLabel?: string;
  /** Optional canonical tab id to route to when the action fires. */
  actionTargetTabId?: string;
  /** Optional id of a drawer section to focus when the action fires. */
  actionFocusSectionId?: AppStatusItem["id"];
  /** ISO timestamp of the last refresh; populated by the service. */
  updatedAt?: string;
}

/** Snapshot of all status categories, keyed by category id. */
export interface AppStatusSnapshot {
  api: AppStatusItem;
  apiKey: AppStatusItem;
  model: AppStatusItem;
  storage: AppStatusItem;
  project: AppStatusItem;
  safety: AppStatusItem;
  provider: AppStatusItem;
  desktop: AppStatusItem;
  diagnostics: AppStatusItem;
}

/** Diagnostic check entry rendered in the drawer. */
export interface AppDiagnosticCheck {
  id: string;
  severity: StatusSeverity;
  summary: string;
}

/** Top-level safe snapshot. JSON-serialisable; safe to copy to clipboard. */
export interface SafeDiagnosticsSnapshot {
  version: number;
  generatedAt: string;
  appMode: "desktop" | "web" | "unknown";
  statuses: AppStatusSnapshot;
  environment: {
    userAgent?: string;
    platform?: string;
    nodeVersion?: string;
    electronVersion?: string;
    chromeVersion?: string;
    locale?: string;
  };
  stores: {
    projects: {
      count: number;
      activeProjectMode: "project" | "all" | "unknown";
    };
    media: {
      count: number;
      scopedCount: number;
      unscopedCount: number;
    };
    conversations: {
      count: number;
    };
    prompts?: { count: number };
    scenes?: { count: number };
    rp?: { count: number };
    workflows?: { count: number };
    issuesCount?: number;
    privacyExclusions?: string[];
  };
  checks: AppDiagnosticCheck[];
}

export const SAFE_DIAGNOSTICS_SNAPSHOT_VERSION = 1 as const;
