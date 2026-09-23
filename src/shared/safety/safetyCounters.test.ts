/** @fileoverview VF-20260923-P1-027 — runtime safety counter module tests. */

import { describe, expect, it, beforeEach } from "vitest";
import {
  _resetSafetyCounters_TEST_ONLY,
  getSafetyCountersSnapshot,
  getStructuralCountersSnapshot,
  incrementEvaluated,
  incrementSkippedDisabled,
  incrementStructuralRejected,
  incrementStructuralValidated,
} from "./safetyCounters";

beforeEach(() => {
  _resetSafetyCounters_TEST_ONLY();
});

describe("safety counters", () => {
  it("starts zeroed", () => {
    expect(getSafetyCountersSnapshot()).toEqual({
      textEvaluations: 0,
      imageEvaluations: 0,
      audioEvaluations: 0,
      videoEvaluations: 0,
      blocked: 0,
      allowed: 0,
      skippedDisabled: 0,
      errors: 0,
    });
    expect(getStructuralCountersSnapshot()).toEqual({
      requestsValidated: 0,
      rejectedRequests: 0,
    });
  });

  it("aggregates per-modality evaluations with the shared outcome counters", () => {
    incrementEvaluated("text", "allowed");
    incrementEvaluated("text", "blocked");
    incrementEvaluated("image", "allowed");
    incrementEvaluated("image", "blocked");
    incrementEvaluated("audio", "allowed");
    incrementEvaluated("video", "error");

    const snapshot = getSafetyCountersSnapshot();
    expect(snapshot.textEvaluations).toBe(2);
    expect(snapshot.imageEvaluations).toBe(2);
    expect(snapshot.audioEvaluations).toBe(1);
    expect(snapshot.videoEvaluations).toBe(1);
    expect(snapshot.allowed).toBe(3);
    expect(snapshot.blocked).toBe(2);
    expect(snapshot.errors).toBe(1);
  });

  it("aggregates skipped-because-disabled across modalities", () => {
    incrementSkippedDisabled("image");
    incrementSkippedDisabled("text");
    incrementSkippedDisabled();
    expect(getSafetyCountersSnapshot().skippedDisabled).toBe(3);
  });

  it("tracks structural validation entries and rejections", () => {
    incrementStructuralValidated();
    incrementStructuralValidated();
    incrementStructuralRejected();
    expect(getStructuralCountersSnapshot()).toEqual({
      requestsValidated: 2,
      rejectedRequests: 1,
    });
  });

  it("stores no content — snapshots are numbers only", () => {
    incrementEvaluated("text", "blocked");
    incrementSkippedDisabled("image");
    const values = [
      ...Object.values(getSafetyCountersSnapshot()),
      ...Object.values(getStructuralCountersSnapshot()),
    ];
    expect(values.every((v) => typeof v === "number")).toBe(true);
  });

  it("reset returns all counters to zero", () => {
    incrementEvaluated("image", "blocked");
    incrementStructuralValidated();
    _resetSafetyCounters_TEST_ONLY();
    expect(getSafetyCountersSnapshot().blocked).toBe(0);
    expect(getStructuralCountersSnapshot().requestsValidated).toBe(0);
  });
});
