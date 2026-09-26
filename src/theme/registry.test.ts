import { describe, it, expect } from "vitest";
import { ThemeRegistry, themeRegistry } from "./registry";
import { BUILTIN_THEME_FAMILIES, BUILTIN_LIGHT, BUILTIN_VENICE } from "./builtins";
import { migrateAppearanceMode, migrateLegacyThemeId } from "./migration";
import type { ThemeFamily } from "./themeTypes";

function familyWith(id: string, extra: Partial<ThemeFamily> = {}): ThemeFamily {
  return {
    ...BUILTIN_VENICE,
    id,
    name: `Family ${id}`,
    aliases: [],
    ...extra,
  };
}

describe("ThemeRegistry", () => {
  it("resolves built-in families by id", () => {
    expect(themeRegistry.get("venice")?.id).toBe(BUILTIN_VENICE.id);
    expect(themeRegistry.get("builtin-venice")?.id).toBe(BUILTIN_VENICE.id);
    expect(themeRegistry.get("does-not-exist")).toBeNull();
    expect(themeRegistry.get(null)).toBeNull();
    expect(themeRegistry.get(undefined)).toBeNull();
  });

  it("applies precedence: YAML overrides custom overrides built-in", () => {
    const registry = new ThemeRegistry([familyWith("shared")]);
    registry.registerCustom(familyWith("shared", { name: "Custom version" }));
    expect(registry.get("shared")?.name).toBe("Custom version");
    registry.registerYaml(familyWith("shared", { name: "YAML version" }));
    expect(registry.get("shared")?.name).toBe("YAML version");
  });

  it("finds families through the builtin- alias", () => {
    expect(themeRegistry.get("builtin-light")?.id).toBe(BUILTIN_LIGHT.id);
  });

  it("isBuiltInId resolves exact ids and aliases but not unknown ids", () => {
    expect(themeRegistry.isBuiltInId("builtin-venice")).toBe(true);
    expect(themeRegistry.isBuiltInId("venice")).toBe(true);
    expect(themeRegistry.isBuiltInId("nope")).toBe(false);
  });

  it("list() deduplicates families shadowed across tiers", () => {
    const registry = new ThemeRegistry([familyWith("dup"), familyWith("solo")]);
    registry.registerCustom(familyWith("dup"));
    registry.registerYaml(familyWith("dup"));
    const ids = registry.list().map((f) => f.id);
    expect(ids.filter((id) => id === "dup")).toHaveLength(1);
    expect(ids).toContain("solo");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has() reflects lookup semantics", () => {
    expect(themeRegistry.has("venice")).toBe(true);
    expect(themeRegistry.has("builtin-venice")).toBe(true);
    expect(themeRegistry.has("nope")).toBe(false);
  });

  it("exposes every built-in family exactly once", () => {
    const ids = themeRegistry.list().map((f) => f.id);
    expect(new Set(ids).size).toBe(BUILTIN_THEME_FAMILIES.length);
  });
});

describe("theme id migration", () => {
  it("maps legacy per-mode ids to their families", () => {
    expect(migrateLegacyThemeId("builtin-light")).toEqual({ themeId: "light", preferredMode: "light" });
    expect(migrateLegacyThemeId("builtin-solarized-dark")).toEqual({ themeId: "solarized", preferredMode: "dark" });
    expect(migrateLegacyThemeId("builtin-solarized-light")).toEqual({ themeId: "solarized", preferredMode: "light" });
  });

  it("strips the builtin- prefix for family ids", () => {
    expect(migrateLegacyThemeId("builtin-foo")).toEqual({ themeId: "foo" });
  });

  it("passes through unknown and modern ids unchanged", () => {
    expect(migrateLegacyThemeId("venice")).toEqual({ themeId: "venice" });
    expect(migrateLegacyThemeId("my-custom-theme")).toEqual({ themeId: "my-custom-theme" });
  });
});

describe("appearance mode migration", () => {
  it("accepts valid modes", () => {
    expect(migrateAppearanceMode("light")).toBe("light");
    expect(migrateAppearanceMode("dark")).toBe("dark");
    expect(migrateAppearanceMode("system")).toBe("system");
  });

  it("coerces garbage values to system", () => {
    expect(migrateAppearanceMode("auto")).toBe("system");
    expect(migrateAppearanceMode("")).toBe("system");
    expect(migrateAppearanceMode(undefined)).toBe("system");
    expect(migrateAppearanceMode(null)).toBe("system");
    expect(migrateAppearanceMode(42)).toBe("system");
  });
});
