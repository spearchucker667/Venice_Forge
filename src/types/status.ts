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

import type { SafeApiKeyMetadata } from "./api-connectivity";

/** Severity of a single status item. */
export type StatusSeverity = "ok" | "warn" | "error" | "unknown";

/** Canonical ordered list of severity values (most-severe first). */
export const STATUS_SEVERITIES: readonly StatusSeverity[] = [
  "error",
  "warn",
  "unknown",
  "ok",
] as const;

/** Locale-neutral message descriptor resolved only at a presentation boundary. */
export interface StatusText {
  key: `statusDiagnostics.${string}`;
  values?: Record<string, string | number | boolean>;
}

/** A single status item rendered by the header cluster / drawer. */
export interface AppStatusItem {
  /** Stable id used for tests + (future) telemetry. */
  id: string;
  severity: StatusSeverity;
  /** Locale-neutral one-sentence status summary (no secrets). */
  summary: StatusText;
  /** Optional locale-neutral longer description (no secrets). */
  detail?: StatusText;
  /** Optional translation key for the "next action" button. */
  actionLabelKey?: `statusDiagnostics.actions.${string}`;
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
  summary: StatusText;
}

/**
 * A single redacted prompt excerpt. Only populated when the user
 * explicitly opts in via `settings.diagnosticsIncludePrompts`. Raw
 * `content` is never stored: only the `redactedExcerpt` (first
 * `PROMPT_EXCERPT_CHARS` characters after `redactSecrets()`),
 * a coarse djb2 hash, the source kind, and the prompt-library
 * timestamp. The list is capped at `MAX_PROMPT_EXCERPTS` entries.
 */
export interface RedactedPromptExcerpt {
  id: string;
  hash: string;
  redactedExcerpt: string;
  source: "prompt-library";
  createdAt: number;
}

export interface SafeDiagnosticsSnapshot {
  version: number;
  generatedAt: string;
  appMode: "desktop" | "web" | "unknown";
  statuses: AppStatusSnapshot;
  /**
   * Primary API route the user has selected for the active profile. The
   * effective upstream for a given request is computed by the shared
   * resolver against the per-endpoint capability matrix; this field is
   * the SELECTED id only.
   */
  primaryApiRoute?: "venice" | "fraterna";
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
    apiKey: SafeApiKeyMetadata;
    research?: {
      count: number;
    };
    prompts?: {
      count: number;
      /** Phase 9 opt-in: redacted excerpt list. Absent when opt-in is off. */
      redactedExcerpts?: RedactedPromptExcerpt[];
    };
    scenes?: { count: number };
    rp?: { count: number };
    workflows?: { count: number };
    issuesCount?: number;
    privacyExclusions?: string[];
  };
  checks: AppDiagnosticCheck[];
}

export const SAFE_DIAGNOSTICS_SNAPSHOT_VERSION = 1 as const;

/** Maximum characters of any single redacted prompt excerpt. */
export const PROMPT_EXCERPT_CHARS = 80;

/** Hard cap on the number of prompt excerpts included in any snapshot. */
export const MAX_PROMPT_EXCERPTS = 5;
