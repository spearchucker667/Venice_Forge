import { describe, expect, it } from "vitest";
import { BUILTIN_DRACULA } from "../theme";
import { themeToYaml, yamlToTheme } from "./ThemeMaker";

describe("ThemeMaker YAML", () => {
  it("round-trips the complete semantic token contract", async () => {
    const yaml = await themeToYaml(BUILTIN_DRACULA);
    const imported = await yamlToTheme(yaml);

    expect(imported.name).toBe(BUILTIN_DRACULA.name);
    expect(imported.mode).toBe("dark");
    expect(imported.tokens).toEqual(BUILTIN_DRACULA.tokens);
    expect(yaml).toContain("selection_background:");
    expect(yaml).toContain("button_primary_foreground:");
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
