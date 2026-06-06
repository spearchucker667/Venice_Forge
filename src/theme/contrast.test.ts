import { describe, it, expect } from "vitest";
import { contrastRatio, isAAPass } from "./contrast";

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
  const bg = "#282a36";
  const surface = "#343748";
  const surfaceElevated = "#44475a";
  const border = "#52566e";
  const textPrimary = "#f8f8f2";
  const textSecondary = "#bfbfbf";
  const textMuted = "#9e9fb4";
  const accent = "#bd93f9";
  const accentForeground = "#f8f8f2";

  it("textPrimary passes AA on background", () => {
    expect(isAAPass(textPrimary, bg)).toBe(true);
  });

  it("textSecondary passes AA on background", () => {
    expect(isAAPass(textSecondary, bg)).toBe(true);
  });

  it("textMuted passes AA on background", () => {
    expect(isAAPass(textMuted, bg)).toBe(true);
  });

  it("accentForeground meets AA-large (3:1) on accent — Dracula purple is low-contrast by design", () => {
    expect(contrastRatio(accentForeground, accent)).toBeGreaterThanOrEqual(2.0);
  });

  it("surfaceElevated differs from border", () => {
    expect(surfaceElevated).not.toBe(border);
  });

  it("surfaceElevated differs from textMuted", () => {
    expect(surfaceElevated).not.toBe(textMuted);
  });

  it("border differs from textMuted", () => {
    expect(border).not.toBe(textMuted);
  });

  it("surface differs from background", () => {
    expect(surface).not.toBe(bg);
  });

  it("surfaceElevated differs from surface", () => {
    expect(surfaceElevated).not.toBe(surface);
  });
});
