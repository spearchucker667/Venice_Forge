import { describe, it, expect } from "vitest";
import { contrastRatio, isAAPass } from "./contrast";
import {
  BUILTIN_CANONICAL_MODES,
  BUILTIN_COPPER,
  BUILTIN_DARK,
  BUILTIN_DRACULA,
  BUILTIN_THEME_FAMILIES,
  BUILTIN_VENICE,
} from "./themes";
import type { ThemeFamily, ThemeMode } from "./themeTypes";

function tokensFor(family: ThemeFamily, mode: ThemeMode = "dark") {
  return family.variants[mode].tokens;
}

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

  it("handles rgb colors without returning NaN", () => {
    expect(contrastRatio("rgb(255, 255, 255)", "rgb(0, 0, 0)")).toBeCloseTo(21, 1);
  });

  it("returns a finite conservative result for unsupported colors", () => {
    expect(contrastRatio("transparent", "#ffffff")).toBe(21);
    expect(Number.isFinite(contrastRatio("not-a-color", "#ffffff"))).toBe(true);
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

  it("composites fully transparent 8-digit hex over the background", () => {
    // #ffffff00 is invisible white: the background shows through untouched.
    expect(contrastRatio("#ffffff00", "#ffffff")).toBeCloseTo(1.0, 5);
    expect(contrastRatio("#ffffff00", "#111111")).toBeCloseTo(1.0, 5);
  });

  it("composites semi-transparent 8-digit hex over the background", () => {
    // 80% white on near-black is high contrast, not the raw ~1.11 the parser
    // would report if the alpha channel were ignored.
    const ratio = contrastRatio("#ffffffcc", "#111111");
    expect(ratio).toBeGreaterThan(10);
    expect(contrastRatio("#ffffffcc", "#ffffff")).toBeCloseTo(1.0, 2);
  });

  it("supports 4-digit hex shorthand (#rgba)", () => {
    expect(contrastRatio("#0000", "#ffffff")).toBeCloseTo(1.0, 5);
    expect(contrastRatio("#000f", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#fffc", "#000000")).toBeGreaterThan(10);
  });

  it("supports modern rgb() with slash alpha", () => {
    expect(contrastRatio("rgb(255 255 255 / 0.8)", "#111111")).toBeCloseTo(
      contrastRatio("#ffffffcc", "#111111"),
      5,
    );
    expect(contrastRatio("rgb(255 255 255 / 0)", "#ffffff")).toBeCloseTo(1.0, 5);
    expect(contrastRatio("rgb(255 255 255 / 80%)", "#111111")).toBeCloseTo(
      contrastRatio("rgb(255 255 255 / 0.8)", "#111111"),
      5,
    );
  });

  it("supports modern hsl() with slash alpha", () => {
    expect(contrastRatio("hsl(0 0% 100% / 0.8)", "#111111")).toBeCloseTo(
      contrastRatio("rgb(255 255 255 / 0.8)", "#111111"),
      5,
    );
    expect(contrastRatio("hsl(0 0% 100% / 0)", "#ffffff")).toBeCloseTo(1.0, 5);
  });

  it("keeps comma-alpha rgba and hsl results alpha-aware", () => {
    // rgba(...) comma alpha previously had its alpha ignored entirely.
    expect(contrastRatio("rgba(255, 255, 255, 0.8)", "#111111")).toBeCloseTo(
      contrastRatio("#ffffffcc", "#111111"),
      1,
    );
  });

  it("keeps opaque hsl() results unchanged", () => {
    expect(contrastRatio("hsl(0, 0%, 100%)", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("hsl(120, 50%, 50%)", "#000000")).toBeCloseTo(
      contrastRatio("#40bf40", "#000000"),
      1,
    );
  });

  it("treats 8-digit hex foregrounds as composites in isAAPass", () => {
    expect(isAAPass("#ffffffcc", "#111111")).toBe(true);
    expect(isAAPass("#ffffff00", "#ffffff")).toBe(false);
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
  const t = tokensFor(BUILTIN_DRACULA, "dark");

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

// VERIFY-092 regression guard: softened body text must stay AA and avoid pure white
// Dracula is dark-only in practice, so we test its dark variant directly.
describe("softened dark-theme body text", () => {
  it.each([
    { name: BUILTIN_VENICE.name, tokens: tokensFor(BUILTIN_VENICE, "dark") },
    { name: BUILTIN_DARK.name, tokens: tokensFor(BUILTIN_DARK, "dark") },
    { name: BUILTIN_COPPER.name, tokens: tokensFor(BUILTIN_COPPER, "dark") },
  ])("$name avoids pure white and remains AA", ({ tokens }) => {
    expect(tokens.textPrimary.toLowerCase()).not.toBe("#ffffff");
    expect(isAAPass(tokens.textPrimary, tokens.background)).toBe(true);
    expect(isAAPass(tokens.textSecondary, tokens.background)).toBe(true);
    expect(isAAPass(tokens.textMuted, tokens.background)).toBe(true);
  });
});

describe("built-in semantic theme contract", () => {
  it("defines every required semantic token for every built-in variant", () => {
    const keys = [
      "background", "surface", "surfaceElevated", "surfaceMuted", "foreground",
      "foregroundMuted", "foregroundSubtle", "border", "borderStrong", "accent",
      "accentForeground", "danger", "dangerForeground", "warning", "warningForeground",
      "success", "successForeground", "inputBackground", "inputForeground", "placeholder",
      "disabledForeground", "buttonPrimaryBackground", "buttonPrimaryForeground",
      "buttonSecondaryBackground", "buttonSecondaryForeground", "link", "focusRing",
      "selectionBackground", "selectionForeground",
    ] as const;
    for (const family of BUILTIN_THEME_FAMILIES) {
      for (const mode of ["light", "dark"] as ThemeMode[]) {
        const t = family.variants[mode].tokens;
        for (const key of keys) expect(t[key], `${family.id}.${mode}.${key}`).toBeTruthy();
      }
    }
  });
});

function canonicalMode(family: ThemeFamily): ThemeMode {
  return BUILTIN_CANONICAL_MODES[family.id] ?? "dark";
}

describe("all built-in themes WCAG contrast regression guard", () => {
  const allVariants = BUILTIN_THEME_FAMILIES.flatMap((f) => {
    const canon = canonicalMode(f);
    const comp: ThemeMode = canon === "dark" ? "light" : "dark";
    return [
      [`${f.id}:${canon}`, f, canon] as const,
      [`${f.id}:${comp}`, f, comp] as const,
    ];
  });

  it.each(allVariants)(
    "%s passes expanded contrast checks",
    (_id, family, mode) => {
      const t = tokensFor(family, mode);
      expect(isAAPass(t.foreground, t.background)).toBe(true);
      expect(isAAPass(t.foregroundMuted, t.background)).toBe(true);
      expect(isAAPass(t.foreground, t.surface)).toBe(true);
      expect(isAAPass(t.foreground, t.surfaceElevated)).toBe(true);
      expect(isAAPass(t.accentForeground, t.accent)).toBe(true);
      expect(isAAPass(t.inputForeground, t.inputBackground)).toBe(true);
      expect(isAAPass(t.buttonPrimaryForeground, t.buttonPrimaryBackground)).toBe(true);
      expect(isAAPass(t.buttonSecondaryForeground, t.buttonSecondaryBackground)).toBe(true);
      expect(isAAPass(t.dangerForeground, t.danger)).toBe(true);
      expect(isAAPass(t.warningForeground, t.warning)).toBe(true);
      expect(isAAPass(t.successForeground, t.success)).toBe(true);
      expect(isAAPass(t.selectionForeground, t.selectionBackground)).toBe(true);
      expect(contrastRatio(t.disabledForeground, t.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.focusRing, t.background)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(t.foregroundSubtle, t.background)).toBeGreaterThanOrEqual(3);
      expect(isAAPass(t.link, t.background)).toBe(true);
      expect(contrastRatio(t.placeholder, t.inputBackground)).toBeGreaterThanOrEqual(3);
      // borderStrong is the visible-boundary token and must clear 3:1. The
      // plain border token is a decorative hairline in built-in themes (it is
      // softened further via --color-border-soft/faint color-mix), so it is
      // not held to the visible-boundary threshold.
      if (t.borderStrong) {
        expect(contrastRatio(t.borderStrong, t.background)).toBeGreaterThanOrEqual(3);
      }
    },
  );
});
