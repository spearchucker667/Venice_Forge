import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isAAPass, contrastRatio } from "./contrast";
import {
  BUILTIN_THEMES,
  BUILTIN_NORD,
  BUILTIN_TOKYO_NIGHT,
  BUILTIN_CATPPUCCIN,
  BUILTIN_SOLARIZED_DARK,
  BUILTIN_SOLARIZED_LIGHT,
  BUILTIN_ONE_DARK,
  BUILTIN_MONOKAI,
  BUILTIN_GITHUB_LIGHT,
  BUILTIN_LIGHT,
} from "./themes";

const NEW_BUILTINS = [
  BUILTIN_NORD,
  BUILTIN_TOKYO_NIGHT,
  BUILTIN_CATPPUCCIN,
  BUILTIN_SOLARIZED_DARK,
  BUILTIN_SOLARIZED_LIGHT,
  BUILTIN_ONE_DARK,
  BUILTIN_MONOKAI,
  BUILTIN_GITHUB_LIGHT,
  // Light themes with explicit WCAG AA coverage
  BUILTIN_LIGHT,
];

function expectedYamlNames(themeId: string): string[] {
  const suffix = themeId.replace("builtin-", "");
  return [`${suffix}.yaml`, `${suffix.replace(/-/g, "_")}.yaml`];
}

describe("built-in theme collection", () => {
  it("has unique theme ids", () => {
    const ids = BUILTIN_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique, non-empty display names", () => {
    const names = BUILTIN_THEMES.map((t) => t.name);
    expect(names.every((n) => n.trim().length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("defines every required semantic token for every built-in theme", () => {
    const keys = [
      "background",
      "surface",
      "surfaceElevated",
      "surfaceMuted",
      "foreground",
      "foregroundMuted",
      "foregroundSubtle",
      "border",
      "borderStrong",
      "accent",
      "accentForeground",
      "danger",
      "dangerForeground",
      "warning",
      "warningForeground",
      "success",
      "successForeground",
      "inputBackground",
      "inputForeground",
      "placeholder",
      "disabledForeground",
      "buttonPrimaryBackground",
      "buttonPrimaryForeground",
      "buttonSecondaryBackground",
      "buttonSecondaryForeground",
      "link",
      "focusRing",
      "selectionBackground",
      "selectionForeground",
    ] as const;
    for (const theme of BUILTIN_THEMES) {
      for (const key of keys) {
        expect(theme.tokens[key], `${theme.id}.${key}`).toBeTruthy();
      }
    }
  });

  it.each(NEW_BUILTINS.map((t) => [t.id, t] as const))(
    "%s passes WCAG AA contrast checks",
    (_id, theme) => {
      const t = theme.tokens;
      expect(isAAPass(t.foreground, t.background)).toBe(true);
      expect(isAAPass(t.foregroundMuted, t.background)).toBe(true);
      expect(isAAPass(t.foregroundSubtle, t.background)).toBe(true);
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
      expect(isAAPass(t.foreground, t.surface)).toBe(true);
      expect(isAAPass(t.foreground, t.surfaceElevated)).toBe(true);
    }
  );

  it.each(NEW_BUILTINS.map((t) => [t.id, t] as const))(
    "%s surfaces are visually distinct",
    (_id, theme) => {
      const t = theme.tokens;
      expect(t.surface).not.toBe(t.background);
      expect(t.surfaceElevated).not.toBe(t.surface);
      expect(t.surfaceElevated).not.toBe(t.border);
      expect(t.border).not.toBe(t.foregroundSubtle);
    }
  );

  it("has a YAML starter template for every built-in theme", () => {
    const root = path.resolve(__dirname, "../../config/themes");
    const files = new Set(fs.readdirSync(root));
    for (const theme of BUILTIN_THEMES) {
      const names = expectedYamlNames(theme.id);
      const hasYaml = names.some((n) => files.has(n));
      expect(hasYaml, `${theme.id} missing YAML counterpart (${names.join(" or ")})`).toBe(true);
    }
  });

  it("exports the expected number of built-in themes", () => {
    // This guard ensures the count stays in sync with the handoff-specified inventory.
    expect(BUILTIN_THEMES.length).toBe(35);
  });
});
