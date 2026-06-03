/** @fileoverview Unit tests for the global application reducer. */

import { describe, it, expect } from "vitest";
import { appReducer, flattenModels, initialState } from "./appReducer";

/** Validates state transitions for each appReducer action type. */
describe("appReducer", () => {
  /** Changes the active tab when receiving SET_TAB. */
  it("should change active tab", () => {
    const nextState = appReducer(initialState, { type: "SET_TAB", tab: "gallery" });
    expect(nextState.activeTab).toBe("gallery");
  });

  /** Toggles the source panel visibility when receiving TOGGLE_SOURCE_PANEL. */
  it("should toggle source panel", () => {
    const before = initialState.sourcePanelOpen;
    const nextState = appReducer(initialState, { type: "TOGGLE_SOURCE_PANEL" });
    expect(nextState.sourcePanelOpen).toBe(!before);
  });

  /** Formats diagnostics and prepends them to the log. */
  it("should format and push diagnostics logs", () => {
    const entry = { type: "info" as const, message: "Testing" };
    const nextState = appReducer(initialState, { type: "SET_DIAGNOSTICS", diagnostics: entry });
    expect(nextState.diagnosticsLog.length).toBe(1);
    expect(nextState.diagnosticsLog[0].message).toBe("Testing");
  });

  /** Adds and subsequently removes toast messages. */
  it("should add and remove toasts", () => {
    const toast = { id: "t1", message: "Hello", type: "info" as const };
    const state1 = appReducer(initialState, { type: "ADD_TOAST", toast });
    expect(state1.toasts.length).toBe(1);
    expect(state1.toasts[0].id).toBe("t1");

    const state2 = appReducer(state1, { type: "REMOVE_TOAST", id: "t1" });
    expect(state2.toasts.length).toBe(0);
  });

  /**
   * SEC-019 regression guard: ignores prototype pollution keys in SET_SETTINGS.
   *
   * Verifies that __proto__ and constructor keys do not alter the prototype.
   */
  it("should ignore __proto__ and constructor keys in SET_SETTINGS", () => {
    const nextState = appReducer(initialState, {
      type: "SET_SETTINGS",
      settings: { __proto__: { evil: true }, constructor: { evil: true }, defaultSystemPrompt: "updated" } as any,
    });
    expect(nextState.settings.defaultSystemPrompt).toBe("updated");
    // Verify evil property was NOT added to the prototype
    expect((Object.getPrototypeOf(nextState.settings) as any).evil).toBeUndefined();
    expect(Object.getPrototypeOf(nextState.settings)).toBe(Object.prototype);
  });

  /**
   * Sentinel regression guard: rejects primitive or array settings payloads.
   *
   * Verifies that string, array, and null values do not crash the reducer.
   */
  it("ignores non-object settings payloads", () => {
    const stringState = appReducer(initialState, { type: "SET_SETTINGS", settings: "evil" as any });
    expect(stringState.settings).toEqual(initialState.settings);

    const arrayState = appReducer(initialState, { type: "SET_SETTINGS", settings: ["evil"] as any });
    expect(arrayState.settings).toEqual(initialState.settings);

    const nullState = appReducer(initialState, { type: "SET_SETTINGS", settings: null as any });
    expect(nullState.settings).toEqual(initialState.settings);
  });

  it("keeps video models grouped and selected through model refresh", () => {
    const grouped = flattenModels({
      data: [
        { id: "llama-3.3-70b", type: "text" },
        { id: "flux-dev", type: "image" },
        { id: "kling-2.6-pro-text-to-video", type: "video", traits: ["text-to-video"] },
      ],
    });
    expect(grouped.video.map((model) => model.id)).toEqual(["kling-2.6-pro-text-to-video"]);

    const nextState = appReducer(initialState, { type: "SET_MODELS", models: grouped, fallback: false });
    expect(nextState.selectedVideoModel).toBe("kling-2.6-pro-text-to-video");
    expect(nextState.models.video).toHaveLength(1);
  });

  /**
   * BUG-005 regression guard: null/undefined patch must not crash draft reducers.
   */
  it("ignores null or undefined patch in draft reducers", () => {
    // @ts-expect-error deliberate invalid payload for robustness test
    expect(() => appReducer(initialState, { type: "SET_CHAT_DRAFT", patch: null })).not.toThrow();
    // @ts-expect-error deliberate invalid payload for robustness test
    expect(() => appReducer(initialState, { type: "SET_IMAGE_DRAFT", patch: undefined })).not.toThrow();
    // @ts-expect-error deliberate invalid payload for robustness test
    expect(() => appReducer(initialState, { type: "SET_BATCH_DRAFT", patch: null })).not.toThrow();
  });

  /**
   * BUG-007 regression guard: coerces legacy boolean webSearch settings.
   *
   * Ensures true/false/invalid values become canonical "on"/"off" strings.
   */
  it("coerces legacy webSearch values to allowed enum strings", () => {
    const fromTrue = appReducer(initialState, {
      type: "SET_SETTINGS",
      settings: { webSearch: true as any },
    });
    expect(fromTrue.settings.webSearch).toBe("on");

    const fromFalse = appReducer(initialState, {
      type: "SET_SETTINGS",
      settings: { webSearch: false as any },
    });
    expect(fromFalse.settings.webSearch).toBe("off");

    const fromInvalid = appReducer(initialState, {
      type: "SET_SETTINGS",
      settings: { webSearch: "invalid" as any },
    });
    expect(fromInvalid.settings.webSearch).toBe("off");
  });
});
