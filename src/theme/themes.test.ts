import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isAAPass, contrastRatio } from "./contrast";
import {
  BUILTIN_THEME_FAMILIES,
  BUILTIN_NORD,
  BUILTIN_TOKYO_NIGHT,
  BUILTIN_CATPPUCCIN,
  BUILTIN_SOLARIZED,
  BUILTIN_ONE_DARK,
  BUILTIN_MONOKAI,
  BUILTIN_GITHUB_LIGHT,
  BUILTIN_LIGHT,
  BUILTIN_COTTON_CANDY_CONSOLE,
  BUILTIN_SWEET_NIGHTMARE,
  BUILTIN_DUAL_PERSONA,
  BUILTIN_POLAROID_BOARD,
} from "./themes";
import { CODE_THEME_TOKEN_KEYS } from "./themeTypes";
import { isCodeSyntaxPresetId } from "./codeSyntax";
import { isValidColorValue } from "./validateColor";
import type { ThemeFamily, ThemeMode } from "./themeTypes";

const NEW_BUILTINS = [
  { family: BUILTIN_NORD, mode: "dark" as const },
  { family: BUILTIN_TOKYO_NIGHT, mode: "dark" as const },
  { family: BUILTIN_CATPPUCCIN, mode: "dark" as const },
  { family: BUILTIN_SOLARIZED, mode: "dark" as const },
  { family: BUILTIN_ONE_DARK, mode: "dark" as const },
  { family: BUILTIN_MONOKAI, mode: "dark" as const },
  { family: BUILTIN_GITHUB_LIGHT, mode: "light" as const },
  // Light themes with explicit WCAG AA coverage
  { family: BUILTIN_LIGHT, mode: "light" as const },
  { family: BUILTIN_COTTON_CANDY_CONSOLE, mode: "light" as const },
  { family: BUILTIN_SWEET_NIGHTMARE, mode: "dark" as const },
  { family: BUILTIN_DUAL_PERSONA, mode: "light" as const },
  { family: BUILTIN_POLAROID_BOARD, mode: "light" as const },
];

function expectedYamlNames(familyId: string): string[] {
  if (familyId === "solarized") {
    return ["solarized.yaml", "solarized_dark.yaml", "solarized_light.yaml"];
  }
  return [`${familyId}.yaml`, `${familyId.replace(/-/g, "_")}.yaml`];
}

function familyVariantTokens(family: ThemeFamily, mode: ThemeMode) {
  return family.variants[mode].tokens;
}

describe("built-in theme families", () => {
  it("has unique theme family ids", () => {
    const ids = BUILTIN_THEME_FAMILIES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique, non-empty display names", () => {
    const names = BUILTIN_THEME_FAMILIES.map((f) => f.name);
    expect(names.every((n) => n.trim().length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it("defines every required semantic token for every variant of every family", () => {
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
    for (const family of BUILTIN_THEME_FAMILIES) {
      for (const mode of ["light", "dark"] as ThemeMode[]) {
        const tokens = familyVariantTokens(family, mode);
        for (const key of keys) {
          expect(tokens[key], `${family.id}.${mode}.${key}`).toBeTruthy();
        }
      }
    }
  });

  it.each(NEW_BUILTINS.map(({ family, mode }) => [`${family.id}:${mode}`, family, mode] as const))(
    "%s passes WCAG AA contrast checks",
    (_id, family, mode) => {
      const t = familyVariantTokens(family, mode);
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

  it.each(NEW_BUILTINS.map(({ family, mode }) => [`${family.id}:${mode}`, family, mode] as const))(
    "%s surfaces are visually distinct",
    (_id, family, mode) => {
      const t = familyVariantTokens(family, mode);
      expect(t.surface).not.toBe(t.background);
      expect(t.surfaceElevated).not.toBe(t.surface);
      expect(t.surfaceElevated).not.toBe(t.border);
      expect(t.border).not.toBe(t.foregroundSubtle);
    }
  );

  it("has a YAML starter template for every built-in family", () => {
    const root = path.resolve(__dirname, "../../config/themes");
    const files = new Set(fs.readdirSync(root));
    for (const family of BUILTIN_THEME_FAMILIES) {
      // config/themes/copper.yaml was removed: a shipped V1 YAML sharing a
      // built-in family id flattens both variants to the YAML's single mode.
      if (family.id === "copper") {
        expect(files.has("copper.yaml"), "copper.yaml must not shadow the dual-mode built-in").toBe(false);
        continue;
      }
      const names = expectedYamlNames(family.id);
      const hasYaml = names.some((n) => files.has(n));
      expect(hasYaml, `${family.id} missing YAML counterpart (${names.join(" or ")})`).toBe(true);
    }
  });

  it("exports the expected number of built-in theme families", () => {
    // 44 single-mode built-ins were consolidated into 43 families (solarized merged).
    expect(BUILTIN_THEME_FAMILIES.length).toBe(43);
  });

  it("defines a complete code theme config for every variant of every family", () => {
    for (const family of BUILTIN_THEME_FAMILIES) {
      for (const mode of ["light", "dark"] as ThemeMode[]) {
        const code = family.variants[mode].code;
        expect(code, `${family.id}.${mode}.code`).toBeDefined();
        expect(isCodeSyntaxPresetId(code.preset), `${family.id}.${mode}.preset=${code.preset}`).toBe(true);
        for (const key of CODE_THEME_TOKEN_KEYS) {
          expect(code.tokens[key], `${family.id}.${mode}.code.tokens.${key}`).toBeTruthy();
          expect(isValidColorValue(code.tokens[key]), `${family.id}.${mode}.code.tokens.${key}`).toBe(true);
        }
      }
    }
  });

  it("does not rely on the automatic fallback for built-in code themes", () => {
    for (const family of BUILTIN_THEME_FAMILIES) {
      for (const mode of ["light", "dark"] as ThemeMode[]) {
        expect(family.variants[mode].code.preset, `${family.id}.${mode}`).not.toBe("automatic");
      }
    }
  });

  it.each(BUILTIN_THEME_FAMILIES.flatMap((family) =>
    (["light", "dark"] as ThemeMode[]).map((mode) => [`${family.id}:${mode}`, family, mode] as const),
  ))("%s code surfaces meet WCAG AA contrast", (_id, family, mode) => {
    const c = family.variants[mode].code.tokens;
    expect(isAAPass(c.foreground, c.background)).toBe(true);
    expect(isAAPass(c.inlineForeground, c.inlineBackground)).toBe(true);
    expect(isAAPass(c.headerForeground, c.headerBackground)).toBe(true);
  });
});
