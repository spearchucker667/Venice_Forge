/**
 * @fileoverview VERIFY-016 — Inspector non-mutating preview.
 *
 * Regression guard for P0 #2 of the safety batch:
 *   - Renderer inspector preview does NOT mutate audit counters.
 *   - Electron-mode requests show "electron-main-authoritative" preview.
 *   - Adult Mode shows "skipped" preview.
 *   - Family Safe Mode ON shows real allow/block previews.
 *
 * `previewLocalFamilyGuard` is the non-mutating counterpart of
 * `maybeRunLocalFamilyGuard` — it runs the rule engine but does NOT
 * call `recordDecision`. The inspector must use it.
 */

// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetAuditCounters_TEST_ONLY,
  getAuditSnapshot,
  previewLocalFamilyGuard,
} from "../../src/shared/safety";
import {
  buildInspectorTelemetryPatch,
  deriveGuardOutcome,
  exportRedactedInspectorLogs,
  sanitizeInspectorPayload,
} from "../../src/services/inspectorTelemetry";
import { triggerInput, benignInput } from "./fixtureBuilders";

beforeEach(() => {
  _resetAuditCounters_TEST_ONLY();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VERIFY-016 inspector non-mutating preview", () => {
  it("previewLocalFamilyGuard does NOT increment audit counters on a CSAM trigger", () => {
    previewLocalFamilyGuard(
      { text: triggerInput("CSAM_EXPLICIT"), endpoint: "/chat/completions", method: "POST", source: "venice-client" },
      true,
    );
    const snap = getAuditSnapshot();
    expect(snap.blocked).toBe(0);
    expect(snap.allowed).toBe(0);
  });

  it("previewLocalFamilyGuard does NOT increment audit counters on a benign input", () => {
    previewLocalFamilyGuard(
      { text: benignInput("GENERIC"), endpoint: "/chat/completions", method: "POST", source: "venice-client" },
      true,
    );
    const snap = getAuditSnapshot();
    expect(snap.blocked).toBe(0);
    expect(snap.allowed).toBe(0);
  });

  it("previewLocalFamilyGuard returns a synthetic allow decision when Family Safe Mode is OFF", () => {
    const decision = previewLocalFamilyGuard(
      { text: triggerInput("CSAM_EXPLICIT"), endpoint: "/chat/completions", method: "POST", source: "venice-client" },
      false,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.skipped).toBe(true);
    expect(decision.reason).toBe("local-family-safe-mode-disabled");
  });

  it("previewLocalFamilyGuard does not increment counters in Adult Mode either", () => {
    previewLocalFamilyGuard(
      { text: triggerInput("CSAM_EXPLICIT"), endpoint: "/chat/completions", method: "POST", source: "venice-client" },
      false,
    );
    expect(getAuditSnapshot().blocked).toBe(0);
  });

  it("previewLocalFamilyGuard returns a block decision with reasonCode in Family Safe Mode", () => {
    const decision = previewLocalFamilyGuard(
      { text: triggerInput("CSAM_EXPLICIT"), endpoint: "/chat/completions", method: "POST", source: "venice-client" },
      true,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBeTruthy();
    expect(decision.guardDecision).toBeDefined();
  });

  it("previewLocalFamilyGuard returns an allow decision for benign input in Family Safe Mode", () => {
    const decision = previewLocalFamilyGuard(
      { text: benignInput("GENERIC"), endpoint: "/chat/completions", method: "POST", source: "venice-client" },
      true,
    );
    expect(decision.allowed).toBe(true);
    expect(decision.guardDecision?.allow).toBe(true);
  });

  it("records preview timing and status telemetry without mutating audit counters", () => {
    const previewStartedAt = Date.now();
    const decision = previewLocalFamilyGuard(
      { text: triggerInput("CSAM_EXPLICIT"), endpoint: "/chat/completions", method: "POST", source: "venice-client" },
      true,
    );
    const previewDurationMs = Date.now() - previewStartedAt;

    const telemetry = buildInspectorTelemetryPatch({
      status: decision.allowed ? 200 : 451,
      durationMs: 120,
      previewDurationMs,
      guardOutcome: deriveGuardOutcome(
        decision.allowed
          ? { layer: "local-family-safe-mode", mode: "family", action: "allow" }
          : { layer: "local-family-safe-mode", mode: "family", action: "block", reasonCode: decision.reason },
      ),
      error: decision.allowed ? undefined : "Blocked by Family Safe Mode",
    });

    expect(telemetry.previewDurationMs).toBeGreaterThanOrEqual(0);
    expect(telemetry.durationMs).toBe(120);
    expect(telemetry.callOutcome).toBe(decision.allowed ? "success" : "blocked");
    expect(getAuditSnapshot().blocked).toBe(0);
    expect(getAuditSnapshot().allowed).toBe(0);
  });

  it("never stores raw unsafe prompt text in inspector export payloads", () => {
    const unsafe = triggerInput("CSAM_EXPLICIT");
    const sanitized = sanitizeInspectorPayload({
      messages: [{ role: "user", content: unsafe }],
    });
    const exported = exportRedactedInspectorLogs([
      {
        id: "preview-1",
        timestamp: Date.now(),
        endpoint: "/chat/completions",
        method: "POST",
        transport: "venice",
        requestHeaders: {},
        requestBody: sanitized,
        guardOutcome: "block",
        callOutcome: "blocked",
        status: 451,
      },
    ]);

    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain(unsafe);
    expect(exported[0]).not.toHaveProperty("provider");
  });
});
