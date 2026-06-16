/** @fileoverview Unit tests for personaPreferenceService.ts. */

import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { getActivePersonaId, setActivePersonaId } from "./personaPreferenceService";

describe("personaPreferenceService", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockLocalStorage = {
      getItem: vi.fn((key) => store[key] || null),
      setItem: vi.fn((key, value) => { store[key] = value.toString(); }),
      removeItem: vi.fn((key) => { delete store[key]; }),
      clear: vi.fn(() => { store = {}; })
    };
    vi.stubGlobal("window", { localStorage: mockLocalStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getActivePersonaId returns null when nothing is set", async () => {
    const id = await getActivePersonaId();
    expect(id).toBeNull();
  });

  it("getActivePersonaId returns the saved id", async () => {
    window.localStorage.setItem("venice_active_persona_id", "p_123");
    const id = await getActivePersonaId();
    expect(id).toBe("p_123");
  });

  it("setActivePersonaId saves the id", async () => {
    await setActivePersonaId("p_456");
    expect(window.localStorage.getItem("venice_active_persona_id")).toBe("p_456");
  });

  it("setActivePersonaId clears the id when passed null", async () => {
    window.localStorage.setItem("venice_active_persona_id", "p_123");
    await setActivePersonaId(null);
    expect(window.localStorage.getItem("venice_active_persona_id")).toBeNull();
  });
});
