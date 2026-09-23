// @vitest-environment node

/** @fileoverview VF-20260923-P1-027 — buildSafetyRuntimeStatus assembles the
 *  four safety concepts from their separate authoritative sources and attaches
 *  the in-process counter snapshots. */

import { describe, it, expect, beforeEach } from "vitest";
import { buildSafetyRuntimeStatus } from "./safetyRuntimeStatus";
import {
  _resetRuntimeSafetySettings_TEST_ONLY,
  setRuntimeLocalFamilySafeModeEnabled,
  setRuntimeVeniceApiSafeMode,
} from "./runtimeSafetySettings";
import {
  _resetSafetyCounters_TEST_ONLY,
  incrementEvaluated,
  incrementSkippedDisabled,
} from "../../src/shared/safety/safetyCounters";
import {
  clearClassifierBackend,
  registerClassifierBackend,
} from "../../src/shared/safety/mediaScreener";

beforeEach(() => {
  _resetRuntimeSafetySettings_TEST_ONLY();
  _resetSafetyCounters_TEST_ONLY();
  clearClassifierBackend();
});

describe("buildSafetyRuntimeStatus (VF-20260923-P1-027)", () => {
  it("reports the fail-closed policy defaults with zeroed counters", () => {
    const status = buildSafetyRuntimeStatus();
    expect(status.localSafeguards.enabled).toBe(true);
    expect(status.localSafeguards.source).toBe("policy");
    expect(status.localSafeguards.lastChangedAt).toBeUndefined();
    expect(status.providerSafety.safeMode).toBe(false);
    expect(status.structuralValidation).toEqual({
      active: true,
      requestsValidated: 0,
      rejectedRequests: 0,
    });
    expect(status.counters).toEqual({
      textEvaluations: 0,
      imageEvaluations: 0,
      audioEvaluations: 0,
      videoEvaluations: 0,
      blocked: 0,
      allowed: 0,
      skippedDisabled: 0,
      errors: 0,
    });
  });

  it("reflects a user-disabled local safeguard with an ISO change timestamp", () => {
    setRuntimeLocalFamilySafeModeEnabled(false);
    const status = buildSafetyRuntimeStatus();
    expect(status.localSafeguards.enabled).toBe(false);
    expect(status.localSafeguards.source).toBe("user");
    expect(status.localSafeguards.lastChangedAt).toBeDefined();
    expect(Number.isNaN(Date.parse(status.localSafeguards.lastChangedAt!))).toBe(false);
  });

  it("tracks the provider safe_mode independently of the local safeguard", () => {
    setRuntimeVeniceApiSafeMode(true);
    let status = buildSafetyRuntimeStatus();
    expect(status.providerSafety.safeMode).toBe(true);
    expect(status.localSafeguards.enabled).toBe(true);

    setRuntimeLocalFamilySafeModeEnabled(false);
    setRuntimeVeniceApiSafeMode(false);
    status = buildSafetyRuntimeStatus();
    expect(status.providerSafety.safeMode).toBe(false);
    expect(status.localSafeguards.enabled).toBe(false);
  });

  it("reports not-configured modalities when no semantic backend is registered", () => {
    const status = buildSafetyRuntimeStatus();
    expect(status.semanticClassifiers).toEqual({
      backendRegistered: false,
      image: "not-configured",
      audio: "not-configured",
      video: "not-configured",
    });
  });

  it("reports the registered backend as available for images only", () => {
    registerClassifierBackend({
      name: "nsfwjs-test",
      classifyImage: async () => ({ allowed: true }),
    });
    const status = buildSafetyRuntimeStatus();
    expect(status.semanticClassifiers).toEqual({
      backendRegistered: true,
      backendName: "nsfwjs-test",
      image: "available",
      audio: "unsupported",
      video: "unsupported",
    });
  });

  it("attaches counter increments recorded before the build", () => {
    incrementSkippedDisabled();
    incrementSkippedDisabled();
    incrementEvaluated("image", "blocked");
    incrementEvaluated("text", "allowed");
    const status = buildSafetyRuntimeStatus();
    expect(status.counters.skippedDisabled).toBe(2);
    expect(status.counters.imageEvaluations).toBe(1);
    expect(status.counters.textEvaluations).toBe(1);
    expect(status.counters.blocked).toBe(1);
    expect(status.counters.allowed).toBe(1);
    expect(status.counters.errors).toBe(0);
  });
});
