import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_DRACULA,
  BUILTIN_GRUVBOX_DARK,
  BUILTIN_NORD,
  BUILTIN_TOKYO_NIGHT,
  BUILTIN_CATPPUCCIN,
  BUILTIN_SOLARIZED,
  BUILTIN_ONE_DARK,
  BUILTIN_MONOKAI,
  BUILTIN_GITHUB_LIGHT,
  BUILTIN_CANONICAL_MODES,
  luminance,
  type Theme,
  type ThemeFamily,
} from "../theme";
import { themeToYaml, yamlToTheme } from "./ThemeMaker";

function familyToTheme(family: ThemeFamily, mode: "dark" | "light" = "dark"): Theme {
  return {
    id: family.id,
    name: family.name,
    mode,
    tokens: family.variants[mode].tokens,
    code: family.variants[mode].code,
  };
}

const NEW_THEME_YAMLS = [
  "dracula.yaml",
  "gruvbox_dark.yaml",
  "nord.yaml",
  "tokyo_night.yaml",
  "catppuccin.yaml",
  "solarized_dark.yaml",
  "solarized_light.yaml",
  "one_dark.yaml",
  "monokai.yaml",
  "github_light.yaml",
];

const BUILTIN_SOLARIZED_DARK = familyToTheme(BUILTIN_SOLARIZED, "dark");
const BUILTIN_SOLARIZED_LIGHT = familyToTheme(BUILTIN_SOLARIZED, "light");

describe("ThemeMaker YAML", () => {
  it("round-trips the complete semantic token contract", async () => {
    const theme = familyToTheme(BUILTIN_DRACULA, "dark");
    const yaml = await themeToYaml(theme);
    const imported = await yamlToTheme(yaml);

    expect(imported.name).toBe(theme.name);
    expect(imported.mode).toBe("dark");
    expect(imported.tokens).toEqual(theme.tokens);
    expect(imported.code.tokens).toEqual(theme.code.tokens);
    expect(imported.code.preset).toBe(theme.code.preset);
    expect(yaml).toContain("selection_background:");
    expect(yaml).toContain("button_primary_foreground:");
    expect(yaml).toContain("code:");
  });

  it("normalizes snake_case semantic token overrides", async () => {
    const imported = await yamlToTheme(`
version: 1
themes:
  custom:
    display_name: Custom Theme
    mode: dark
    tokens:
      background: "#101010"
      input_background: "#202020"
      input_foreground: "#f0f0f0"
      selection_background: "#ff00ff"
      selection_foreground: "#101010"
`);

    expect(imported.tokens.inputBackground).toBe("#202020");
    expect(imported.tokens.inputForeground).toBe("#f0f0f0");
    expect(imported.tokens.selectionBackground).toBe("#ff00ff");
    expect(imported.tokens.selectionForeground).toBe("#101010");
  });

  it("keeps legacy terminal-color themes importable", async () => {
    const imported = await yamlToTheme(`
accent: "#bd93f9"
background: "#282a36"
details: "Legacy Dracula"
foreground: "#f8f8f2"
terminal_colors:
  bright:
    black: "#9e9fb4"
    blue: "#ff79c6"
    cyan: "#8be9fd"
    green: "#50fa7b"
    red: "#ff5555"
    yellow: "#f1fa8c"
  normal:
    black: "#343748"
    white: "#bfbfbf"
`);

    expect(imported.name).toBe("Legacy Dracula");
    expect(imported.tokens.foreground).toBe("#f8f8f2");
    expect(imported.tokens.inputBackground).toBe(imported.tokens.surfaceElevated);
  });
});

describe("ThemeMaker new built-in theme round-trips", () => {
  // Mirrors ThemeMaker's getCanonicalMode: the exporter intentionally does
  // not emit a top-level `mode` field, so yamlToTheme returns the family
  // canonical variant. Both variants carry the same authored tokens, which
  // is what actually round-trips.
  function expectedCanonicalMode(theme: Theme): "dark" | "light" {
    const normId = theme.id.replace(/^builtin-/, "");
    if (normId in BUILTIN_CANONICAL_MODES) {
      return BUILTIN_CANONICAL_MODES[normId];
    }
    return luminance(theme.tokens.background) > 0.55 ? "light" : "dark";
  }

  it.each([
    familyToTheme(BUILTIN_DRACULA, "dark"),
    familyToTheme(BUILTIN_GRUVBOX_DARK, "dark"),
    familyToTheme(BUILTIN_NORD, "dark"),
    familyToTheme(BUILTIN_TOKYO_NIGHT, "dark"),
    familyToTheme(BUILTIN_CATPPUCCIN, "dark"),
    BUILTIN_SOLARIZED_DARK,
    BUILTIN_SOLARIZED_LIGHT,
    familyToTheme(BUILTIN_ONE_DARK, "dark"),
    familyToTheme(BUILTIN_MONOKAI, "dark"),
    familyToTheme(BUILTIN_GITHUB_LIGHT, "light"),
  ])("round-trips $name via themeToYaml/yamlToTheme", async (theme) => {
    const yaml = await themeToYaml(theme);
    const imported = await yamlToTheme(yaml);

    expect(imported.name).toBe(theme.name);
    expect(imported.mode).toBe(expectedCanonicalMode(theme));
    expect(imported.tokens).toEqual(theme.tokens);
    expect(imported.code.tokens).toEqual(theme.code.tokens);
    expect(imported.code.preset).toBe(theme.code.preset);
  });

  it("imports a single-mode theme whose mode disagrees with the canonical mode via the canonical variant", async () => {
    // Engine contract change: serializeThemeFamilyYaml intentionally does not
    // emit the top-level `mode` field (nothing reads it back after import).
    // BUILTIN_SOLARIZED_LIGHT therefore imports as the solarized canonical
    // (dark) variant with its authored light tokens preserved.
    const lightTheme = familyToTheme(BUILTIN_SOLARIZED, "light");
    const yaml = await themeToYaml(lightTheme);
    expect(yaml).not.toMatch(/^mode:/m);

    const imported = await yamlToTheme(yaml);

    expect(imported.mode).toBe("dark");
    expect(imported.tokens).toEqual(lightTheme.tokens);
    expect(imported.code.tokens).toEqual(lightTheme.code.tokens);
  });
});

describe("ThemeMaker legacy YAML import", () => {
  it("uses the name field and detects a light theme from a white background", async () => {
    const imported = await yamlToTheme(`
name: "Forge GitHub Light"
accent: "#0969da"
background: "#ffffff"
details: "#d0d7de"
foreground: "#24292f"
terminal_colors:
  bright:
    green: "#1a7f37"
    yellow: "#9a6700"
    red: "#a40e26"
  normal:
    green: "#116329"
    white: "#f6f8fa"
`);

    expect(imported.name).toBe("Forge GitHub Light");
    expect(imported.mode).toBe("light");
    expect(imported.tokens.background).toBe("#ffffff");
    expect(imported.tokens.foreground).toBe("#24292f");
  });

  it("treats a color-valued details field as a surface/border color", async () => {
    const imported = await yamlToTheme(`
accent: "#bd93f9"
background: "#282a36"
details: "#44475a"
foreground: "#f8f8f2"
terminal_colors:
  normal:
    black: "#21222c"
`);

    expect(imported.name).toBe("Imported Theme");
    expect(imported.tokens.surface).toBe("#44475a");
    expect(imported.tokens.border).toBe("#44475a");
  });

  it("falls back to details as the name when details is not a color", async () => {
    const imported = await yamlToTheme(`
accent: "#bd93f9"
background: "#282a36"
details: "Legacy Dracula"
foreground: "#f8f8f2"
terminal_colors:
  normal:
    black: "#21222c"
`);

    expect(imported.name).toBe("Legacy Dracula");
  });

  it("respects an explicit mode field over luminance inference", async () => {
    const imported = await yamlToTheme(`
name: "Dark on white"
mode: dark
accent: "#bd93f9"
background: "#ffffff"
foreground: "#24292f"
`);

    expect(imported.mode).toBe("dark");
  });
});

describe("ThemeMaker built-in theme YAML templates", () => {
  it.each(NEW_THEME_YAMLS)("parses %s and exposes required tokens", async (file) => {
    const yaml = readFileSync(resolve("config/themes", file), "utf8");
    const imported = await yamlToTheme(yaml);

    expect(imported.name).toBeTruthy();
    expect(imported.tokens.background).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(imported.tokens.foreground).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(imported.tokens.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
