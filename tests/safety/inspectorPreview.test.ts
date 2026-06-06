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
});
