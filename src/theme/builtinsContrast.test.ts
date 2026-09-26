import { describe, it, expect } from "vitest";
import { contrastRatio } from "./contrast";
import { isValidColorValue } from "./validateColor";
import { BUILTIN_THEME_FAMILIES } from "./builtins";
import type { ThemeFamily, ThemeMode } from "./themeTypes";

// THEME-P2-002 regression guards: placeholder text and the primary
// foreground/background semantic pairs must meet WCAG AA (>= 4.5:1) in
// every built-in theme variant, light and dark.
const allVariants = BUILTIN_THEME_FAMILIES.flatMap((family: ThemeFamily) =>
  (["dark", "light"] as ThemeMode[]).map(
    (mode) => [`${family.id}:${mode}`, family, mode] as const,
  ),
);

describe("built-in placeholder WCAG AA (THEME-P2-002)", () => {
  it.each(allVariants)(
    "%s placeholder passes AA on inputBackground",
    (_id, family, mode) => {
      const t = family.variants[mode].tokens;
      expect(isValidColorValue(t.placeholder)).toBe(true);
      expect(contrastRatio(t.placeholder, t.inputBackground)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe("built-in semantic pair WCAG AA guards", () => {
  it.each(allVariants)(
    "%s foreground/background pairs remain AA",
    (_id, family, mode) => {
      const t = family.variants[mode].tokens;
      expect(contrastRatio(t.accentForeground, t.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.buttonPrimaryForeground, t.buttonPrimaryBackground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.selectionForeground, t.selectionBackground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.link, t.background)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
