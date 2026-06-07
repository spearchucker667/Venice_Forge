import { describe, it, expect } from "vitest";
import { contrastRatio, isAAPass } from "./contrast";
import { BUILTIN_DRACULA, BUILTIN_THEMES } from "./themes";

describe("contrastRatio", () => {
  it("returns 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("returns 21:1 for white on black (symmetric)", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("returns 1:1 for identical colors", () => {
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 2);
  });

  it("handles 3-character hex shorthand", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 1);
  });

  it("handles mixed-case hex", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
  });

  it("returns ~4.5 for #767676 on white (AA boundary)", () => {
    const ratio = contrastRatio("#767676", "#ffffff");
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(4.6);
  });

  it("returns a high ratio for dark graphite text on dark background (Forge Graphite)", () => {
    const ratio = contrastRatio("#e5e7eb", "#0d0d0d");
    expect(ratio).toBeGreaterThan(10);
  });
});

describe("isAAPass", () => {
  it("passes for black on white", () => {
    expect(isAAPass("#000000", "#ffffff")).toBe(true);
  });

  it("fails for light gray on white", () => {
    expect(isAAPass("#eeeeee", "#ffffff")).toBe(false);
  });

  it("passes for Forge Graphite accent foreground on accent", () => {
    expect(isAAPass("#ffffff", "#1a6fd6")).toBe(true);
  });
});

describe("Forge Dracula WCAG AA regression guard", () => {
  const t = BUILTIN_DRACULA.tokens;

  it("textPrimary passes AA on background", () => {
    expect(isAAPass(t.foreground, t.background)).toBe(true);
  });

  it("textSecondary passes AA on background", () => {
    expect(isAAPass(t.foregroundMuted, t.background)).toBe(true);
  });

  it("textMuted passes AA on background", () => {
    expect(isAAPass(t.foregroundSubtle, t.background)).toBe(true);
  });

  it("accentForeground passes AA on accent", () => {
    expect(isAAPass(t.accentForeground, t.accent)).toBe(true);
  });

  it.each([
    ["input", t.inputForeground, t.inputBackground],
    ["primary button", t.buttonPrimaryForeground, t.buttonPrimaryBackground],
    ["secondary button", t.buttonSecondaryForeground, t.buttonSecondaryBackground],
    ["danger", t.dangerForeground, t.danger],
    ["warning", t.warningForeground, t.warning],
    ["success", t.successForeground, t.success],
    ["selection", t.selectionForeground, t.selectionBackground],
  ])("%s foreground passes AA", (_name, foreground, background) => {
    expect(isAAPass(foreground, background)).toBe(true);
  });

  it("disabled text and focus ring remain visible", () => {
    expect(contrastRatio(t.disabledForeground, t.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t.focusRing, t.background)).toBeGreaterThanOrEqual(3);
  });

  it("surfaceElevated differs from border", () => {
    expect(t.surfaceElevated).not.toBe(t.border);
  });

  it("surfaceElevated differs from textMuted", () => {
    expect(t.surfaceElevated).not.toBe(t.foregroundSubtle);
  });

  it("border differs from textMuted", () => {
    expect(t.border).not.toBe(t.foregroundSubtle);
  });

  it("surface differs from background", () => {
    expect(t.surface).not.toBe(t.background);
  });

  it("surfaceElevated differs from surface", () => {
    expect(t.surfaceElevated).not.toBe(t.surface);
  });
});

describe("built-in semantic theme contract", () => {
  it("defines every required semantic token for every built-in theme", () => {
    const keys = [
      "background", "surface", "surfaceElevated", "surfaceMuted", "foreground",
      "foregroundMuted", "foregroundSubtle", "border", "borderStrong", "accent",
      "accentForeground", "danger", "dangerForeground", "warning", "warningForeground",
      "success", "successForeground", "inputBackground", "inputForeground", "placeholder",
      "disabledForeground", "buttonPrimaryBackground", "buttonPrimaryForeground",
      "buttonSecondaryBackground", "buttonSecondaryForeground", "link", "focusRing",
      "selectionBackground", "selectionForeground",
    ] as const;
    for (const theme of BUILTIN_THEMES) {
      for (const key of keys) expect(theme.tokens[key], `${theme.id}.${key}`).toBeTruthy();
    }
  });
});
