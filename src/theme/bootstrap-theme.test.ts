// @vitest-environment jsdom
// THEME-P2-004 regression guards for the pre-paint bootstrap cache contract.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILTIN_THEME_FAMILIES,
  BUILTIN_VENICE,
  buildThemeVariableMap,
  resolveTheme,
} from "./index";

const BOOTSTRAP_SOURCE_PATH = resolve(
  __dirname,
  "../../public/bootstrap-theme.js",
);

/** Execute the vanilla bootstrap script inside the jsdom window, like the
 *  inline `<script src="/bootstrap-theme.js">` tag in index.html does. */
function runBootstrapScript(): void {
  const source = readFileSync(BOOTSTRAP_SOURCE_PATH, "utf8");
  window.eval(source);
}

/** Mirror of the value validator embedded in public/bootstrap-theme.js. */
function validVarValue(v: unknown): boolean {
  if (typeof v !== "string" || v.length > 128) return false;
  if (/url\(|expression\(|javascript:|@import/i.test(v)) return false;
  return (
    /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[-+\d\s.,%/]+\s*\)|hsla?\(\s*[-+\d\s.,deg%/]+\s*\)|transparent|currentColor)$/i.test(
      v,
    ) || /^\d{1,3}(\.\d{1,4})?$/.test(v)
  );
}

function v2Cache(vars: Record<string, string>): Record<string, unknown> {
  return {
    selectedThemeId: "builtin-venice",
    appearanceMode: "dark",
    customTheme: null,
    resolved: {
      mode: "dark",
      themeId: "builtin-venice",
      colorScheme: "dark",
      vars,
    },
  };
}

describe("public/bootstrap-theme.js resolved-map cache (THEME-P2-004)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme-mode");
    document.documentElement.style.cssText = "";
  });

  it("replays a valid resolved.vars map verbatim and pins mode + colorScheme", () => {
    const vars = {
      ...buildThemeVariableMap(resolveTheme(BUILTIN_VENICE, "dark")),
      "--bg": "#123456",
    };
    window.localStorage.setItem(
      "vf.theme.bootstrap",
      JSON.stringify(v2Cache(vars)),
    );
    const setPropertySpy = vi.spyOn(
      document.documentElement.style,
      "setProperty",
    );

    runBootstrapScript();

    expect(setPropertySpy).toHaveBeenCalledTimes(Object.keys(vars).length);
    expect(setPropertySpy).toHaveBeenCalledWith("--bg", "#123456");
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(
      "#123456",
    );
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    setPropertySpy.mockRestore();
  });

  it("rejects a resolved map containing an unsafe value and falls back to the legacy palette", () => {
    const vars = {
      ...buildThemeVariableMap(resolveTheme(BUILTIN_VENICE, "dark")),
      "--accent": "url(javascript:alert(1))",
    };
    window.localStorage.setItem(
      "vf.theme.bootstrap",
      JSON.stringify(v2Cache(vars)),
    );

    runBootstrapScript();

    // Legacy venice palette wins instead of the injected value.
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(
      "#050a0f",
    );
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
      "#63b3ed",
    );
    expect(document.documentElement.dataset.themeMode).toBe("dark");
  });

  it("rejects a resolved map containing a key outside the allowlist", () => {
    const vars = {
      ...buildThemeVariableMap(resolveTheme(BUILTIN_VENICE, "dark")),
      "--evil-token": "#123456",
    };
    window.localStorage.setItem(
      "vf.theme.bootstrap",
      JSON.stringify(v2Cache(vars)),
    );

    runBootstrapScript();

    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(
      "#050a0f",
    );
  });

  it("rejects a partial resolved map (full allowlist is required)", () => {
    const full = buildThemeVariableMap(resolveTheme(BUILTIN_VENICE, "dark"));
    const partial = Object.fromEntries(Object.entries(full).slice(0, 10));
    window.localStorage.setItem(
      "vf.theme.bootstrap",
      JSON.stringify(v2Cache(partial)),
    );

    runBootstrapScript();

    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(
      "#050a0f",
    );
  });

  it("keeps the legacy v1 palette path working for old caches", () => {
    window.localStorage.setItem(
      "vf.theme.bootstrap",
      JSON.stringify({
        selectedThemeId: "builtin-dracula",
        appearanceMode: "dark",
        customTheme: null,
      }),
    );

    runBootstrapScript();

    expect(document.documentElement.style.getPropertyValue("--bg")).toBe(
      "#282a36",
    );
    expect(document.documentElement.dataset.themeMode).toBe("dark");
  });

  it("ignores malformed cache payloads without throwing", () => {
    for (const payload of ["null", "[1,2]", '"str"', "{", "42"]) {
      window.localStorage.setItem("vf.theme.bootstrap", payload);
      expect(() => runBootstrapScript()).not.toThrow();
    }
  });

  it("embeds exactly the keys buildThemeVariableMap produces (allowlist stays in sync)", () => {
    const source = readFileSync(BOOTSTRAP_SOURCE_PATH, "utf8");
    const expected = Object.keys(
      buildThemeVariableMap(resolveTheme(BUILTIN_VENICE, "dark")),
    ).sort();
    const match = source.match(/var ALLOWED_KEYS = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const embedded = Array.from(match![1].matchAll(/'(--[^']+)'/g), (m) => m[1]).sort();
    expect(embedded).toEqual(expected);
  });

  it("every built-in theme's variable map passes the bootstrap value validator", () => {
    for (const family of BUILTIN_THEME_FAMILIES) {
      for (const mode of ["light", "dark"] as const) {
        const vars = buildThemeVariableMap(resolveTheme(family, mode));
        for (const [key, value] of Object.entries(vars)) {
          expect(
            validVarValue(value),
            `${family.id}/${mode}${key}=${String(value)}`,
          ).toBe(true);
        }
      }
    }
  });
});
