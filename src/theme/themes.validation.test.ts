import { describe, it, expect } from "vitest";
import { BUILTIN_THEME_FAMILIES } from "./builtins";
import { validateThemeFamily } from "./validation";
import { completeThemeTokens, type ThemeMode } from "./themeTypes";
import { isValidColorValue } from "./validateColor";
import { REQUIRED_THEME_TOKEN_KEYS } from "../config/configSchema";

const REQUIRED_SORTED = [...REQUIRED_THEME_TOKEN_KEYS].sort();

describe("built-in theme family validation", () => {
  it.each(
    BUILTIN_THEME_FAMILIES.flatMap((family) =>
      (["light", "dark"] as ThemeMode[]).map((mode) => [`${family.id}:${mode}`, family, mode] as const),
    ),
  )("%s validates cleanly via validateThemeFamily", (_id, family) => {
    expect(validateThemeFamily(family)).toEqual([]);
  });

  it.each(
    BUILTIN_THEME_FAMILIES.flatMap((family) =>
      (["light", "dark"] as ThemeMode[]).map((mode) => [`${family.id}:${mode}`, family, mode] as const),
    ),
  )("%s completes to exactly the required token contract", (_id, family, mode) => {
    const completed = completeThemeTokens(mode, family.variants[mode].tokens);
    expect(Object.keys(completed).sort()).toEqual(REQUIRED_SORTED);
  });

  it.each(
    BUILTIN_THEME_FAMILIES.flatMap((family) =>
      (["light", "dark"] as ThemeMode[]).map((mode) => [`${family.id}:${mode}`, family, mode] as const),
    ),
  )("%s has only safe, valid completed token values", (_id, family, mode) => {
    const completed = completeThemeTokens(mode, family.variants[mode].tokens);
    for (const [key, value] of Object.entries(completed)) {
      expect(isValidColorValue(value), `${family.id}.${mode}.${key} = ${value}`).toBe(true);
    }
  });

  it("has valid code token colors in every variant", () => {
    for (const family of BUILTIN_THEME_FAMILIES) {
      for (const mode of ["light", "dark"] as ThemeMode[]) {
        for (const [key, value] of Object.entries(family.variants[mode].code.tokens)) {
          expect(isValidColorValue(value), `${family.id}.${mode}.code.${key} = ${value}`).toBe(true);
        }
      }
    }
  });
});
