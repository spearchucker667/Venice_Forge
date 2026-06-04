/** @fileoverview Unit test for src/theme/fallbacks.ts (single exported constant). */

import { describe, it, expect } from "vitest";
import { COLOR_INPUT_FALLBACK } from "./fallbacks";

describe("fallbacks", () => {
  it("exports a valid hex color fallback", () => {
    expect(COLOR_INPUT_FALLBACK).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
