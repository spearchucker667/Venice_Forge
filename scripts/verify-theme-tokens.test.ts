// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const {
  collectScanFiles,
  isSourceFile,
  loadDefinedTokens,
  loadThemeNamespaceTokens,
  verifyArbitraryVarRefs,
  verifyBuiltinFamilies,
  verifySyntaxColorTokens,
  verifyThemeTokens,
  verifyUtilityResolvability,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./verify-theme-tokens.cjs") as {
  collectScanFiles: (root: string, scanRoots: string[]) => Set<string>;
  isSourceFile: (entry: string) => boolean;
  loadDefinedTokens: (root: string) => Set<string>;
  loadThemeNamespaceTokens: (root: string) => {
    color: Set<string>;
    container: Set<string>;
  };
  verifyArbitraryVarRefs: (
    root: string,
    definedTokens: Set<string>,
    scanRoots?: string[],
  ) => { filesScanned: number; violations: string[] };
  verifyBuiltinFamilies: (root: string) => string[];
  verifySyntaxColorTokens: (
    root: string,
    options?: {
      syntaxColorScanRoots?: string[];
      syntaxColorPatterns?: Array<{ pattern: RegExp; name: string }>;
      allowComment?: string;
    },
  ) => string[];
  verifyThemeTokens: (
    root: string,
    options?: {
      scanRoots?: string[];
      forbidden?: Array<{ pattern: RegExp; name: string }>;
      allowComment?: string;
    },
  ) => { ok: boolean; filesScanned: number; violations: string[] };
  verifyUtilityResolvability: (
    root: string,
    namespace: { color: Set<string>; container: Set<string> },
    scanRoots?: string[],
  ) => { filesScanned: number; violations: string[] };
};

const tempDirs: string[] = [];

function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "venice-theme-tokens-"));
  tempDirs.push(root);
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  return root;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("verifyThemeTokens", () => {
  // T-235 regression guard: the verifier must scan the full themeable UI tree,
  // not a hardcoded narrow subset of directories.
  it("scans all themeable UI roots, including previously omitted directories", () => {
    const root = fixture({
      "src/App.tsx": "export function App() { return <div className='bg-surface' />; }\n",
      "src/components/chat/chat-view.tsx": "export function ChatView() { return <div className='text-white' />; }\n",
      "src/components/audio/audio-view.tsx": "export function AudioView() { return <div className='text-white' />; }\n",
      "src/components/gallery/gallery-view.tsx": "export function GalleryView() { return <div className='text-white' />; }\n",
    });

    const files = collectScanFiles(root, ["src/App.tsx", "src/components"]);
    expect([...files].sort()).toEqual([
      "src/App.tsx",
      "src/components/audio/audio-view.tsx",
      "src/components/chat/chat-view.tsx",
      "src/components/gallery/gallery-view.tsx",
    ]);
  });

  it("reports forbidden hardcoded colors", () => {
    const root = fixture({
      "src/components/clean/clean-view.tsx": "export function CleanView() { return <div className='text-white' />; }\n",
    });

    const result = verifyThemeTokens(root, { scanRoots: ["src/components"] });
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]).toContain("clean-view.tsx");
    expect(result.violations[0]).toContain("text-white");
  });

  it("does not support file-level exceptions", () => {
    const root = fixture({
      "src/components/media/media-view.tsx": "export function MediaView() { return <div className='text-white' />; }\n",
    });

    const result = verifyThemeTokens(root, { scanRoots: ["src/components"] });
    expect(result.ok).toBe(false);
    expect(result.filesScanned).toBe(1);
    expect(result.violations).toHaveLength(1);
  });

  it("honours per-line allow comments", () => {
    const root = fixture({
      "src/components/clean/clean-view.tsx":
        "export function CleanView() { return <div className='text-white' // THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR\n />; }\n",
    });

    const result = verifyThemeTokens(root, { scanRoots: ["src/components"] });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("skips test files and non-source files", () => {
    const root = fixture({
      "src/components/clean/clean-view.tsx": "export function CleanView() { return <div />; }\n",
      "src/components/clean/clean-view.test.tsx": "export function CleanViewTest() { return <div className='text-white' />; }\n",
      "src/components/clean/readme.md": "text-white\n",
    });

    const files = collectScanFiles(root, ["src/components"]);
    expect([...files]).toEqual(["src/components/clean/clean-view.tsx"]);
    expect(isSourceFile("clean-view.test.tsx")).toBe(false);
    expect(isSourceFile("clean-view.tsx")).toBe(true);
  });

  it("detects all configured forbidden patterns", () => {
    const root = fixture({
      "src/components/bad/bad-view.tsx":
        "export function BadView() { return <div className='text-white bg-black border-white/10 placeholder:text-white ring-white shadow-black bg-[#000] bg-neutral-950 bg-bg-base' />; }\n",
    });

    const result = verifyThemeTokens(root, { scanRoots: ["src/components"] });
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(9);
  });
});

describe("verifySyntaxColorTokens", () => {
  it("flags hardcoded hex, rgb, hsl, and named colors in chat/styles", () => {
    const root = fixture({
      "src/components/chat/ChatMarkdown.tsx":
        "const style = { color: '#ff0000', background: 'rgb(0, 0, 0)', borderColor: 'hsl(0, 0%, 0%)', fill: 'red' };\n",
      "src/styles/theme.css": ".token.keyword { color: var(--syntax-keyword); }\n",
    });

    const violations = verifySyntaxColorTokens(root);
    expect(violations.length).toBe(4);
    expect(violations.some((v) => v.includes("hex color"))).toBe(true);
    expect(violations.some((v) => v.includes("rgb color"))).toBe(true);
    expect(violations.some((v) => v.includes("hsl color"))).toBe(true);
    expect(violations.some((v) => v.includes("named color"))).toBe(true);
  });

  it("allows intentional fixed colors with the allow comment", () => {
    const root = fixture({
      "src/styles/theme.css":
        ".foo { color: #0a0a0c; } /* THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR */\n",
    });

    const violations = verifySyntaxColorTokens(root);
    expect(violations).toEqual([]);
  });

  it("does not flag theme variables", () => {
    const root = fixture({
      "src/components/chat/codeHighlighting.tsx":
        "const style = { color: 'var(--syntax-keyword)', background: 'var(--code-bg)' };\n",
    });

    const violations = verifySyntaxColorTokens(root);
    expect(violations).toEqual([]);
  });
});

describe("verifyBuiltinFamilies", () => {
  it("reports missing schemaVersion or variants", () => {
    const root = fixture({
      "src/theme/builtins/bad.ts": "export const BAD = { id: 'bad', name: 'Bad' };\n",
      "src/theme/builtins/good.ts":
        "export const GOOD = { schemaVersion: 2, variants: { light: { tokens: {} }, dark: { tokens: {} } } };\n",
    });

    const violations = verifyBuiltinFamilies(root);
    expect(violations.some((v) => v.includes("bad.ts") && v.includes("schemaVersion"))).toBe(true);
    expect(violations.some((v) => v.includes("bad.ts") && v.includes("variants"))).toBe(true);
    expect(violations.some((v) => v.includes("good.ts"))).toBe(false);
  });
});

// THEME-P2-015: the resolvability audit must fail the build when a utility or
// arbitrary var() reference points at a theme token that is never defined.
describe("theme token resolvability (THEME-P2-015)", () => {
  const FIXTURE_THEME_CSS = [
    '@import "tailwindcss";',
    "@theme {",
    "  --color-bg: var(--bg);",
    "  --color-accent: var(--accent);",
    "  --color-vf-panel-bg: var(--color-surface);",
    "  --container-vf-wide: 60rem;",
    "}",
    "",
  ].join("\n");

  function resolvabilityFixture(files: Record<string, string>) {
    return fixture({
      "src/styles/theme.css": FIXTURE_THEME_CSS,
      "src/theme/applyTheme.ts":
        "export function applyTheme() { const map: Record<string, string> = { '--bg': '#000' }; return map; }\n",
      ...files,
    });
  }

  it("flags bg-/text-/border-<name> utilities with no matching @theme token", () => {
    const root = resolvabilityFixture({
      "src/components/Dead.tsx":
        "export function Dead() { return <div className='bg-ghost-token text-wisp border-missing' />; }\n",
    });
    const { violations } = verifyUtilityResolvability(root, loadThemeNamespaceTokens(root));
    expect(violations.some((v) => v.includes("--color-ghost-token"))).toBe(true);
    expect(violations.some((v) => v.includes("--color-wisp"))).toBe(true);
    expect(violations.some((v) => v.includes("--color-missing"))).toBe(true);
  });

  it("flags max-w-<name> utilities with no matching --container-* token", () => {
    const root = resolvabilityFixture({
      "src/components/Dead.tsx":
        "export function Dead() { return <div className='max-w-nowhere' />; }\n",
    });
    const { violations } = verifyUtilityResolvability(root, loadThemeNamespaceTokens(root));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("--container-nowhere");
  });

  it("flags arbitrary var() references to undefined tokens", () => {
    const root = resolvabilityFixture({
      "src/components/Dead.tsx":
        "export function Dead() { return <div className='bg-[var(--color-nope)] text-[var(--undefined-thing)]' />; }\n",
    });
    const { violations } = verifyArbitraryVarRefs(root, loadDefinedTokens(root));
    expect(violations.some((v) => v.includes("--color-nope"))).toBe(true);
    expect(violations.some((v) => v.includes("--undefined-thing"))).toBe(true);
  });

  it("does not flag border-side width utilities or default palette hues", () => {
    const root = resolvabilityFixture({
      "src/components/Ok.tsx":
        "export function Ok() { return <div className='border-b-0 border-l-4 border-t border-solid bg-red-500 text-amber-300' />; }\n",
    });
    const { violations } = verifyUtilityResolvability(root, loadThemeNamespaceTokens(root));
    expect(violations).toEqual([]);
  });

  it("does not flag utilities that resolve from @theme or runtime setProperty writers", () => {
    const root = resolvabilityFixture({
      "src/components/Ok.tsx":
        "export function Ok() { return <div className='bg-vf-panel-bg text-accent max-w-vf-wide' />; }\n",
      // --swatch-bg is written at runtime, so var(--swatch-bg) resolves.
      "src/components/Swatch.tsx":
        "export function Swatch({ el }: { el: HTMLElement }) { el.style.setProperty('--swatch-bg', '#123456'); return <div className='bg-[var(--swatch-bg)]' />; }\n",
    });
    const { violations: utilViolations } = verifyUtilityResolvability(root, loadThemeNamespaceTokens(root));
    expect(utilViolations).toEqual([]);
    const { violations: arbViolations } = verifyArbitraryVarRefs(root, loadDefinedTokens(root));
    expect(arbViolations).toEqual([]);
  });

  it("flags bg/border/max-w utilities even in const maps without a className line", () => {
    // Regression: ToastItem SEVERITY_STYLES defined these in an object literal
    // where no line contains className/cn( — the heuristic must still catch them.
    const root = resolvabilityFixture({
      "src/components/Dead.tsx":
        'const STYLES: Record<string, string> = {\n  ok: "bg-vf-panel-bg",\n  bad: "bg-border-success/30",\n};\nexport function Dead() { return <div className={STYLES.bad} />; }\n',
    });
    const { violations } = verifyUtilityResolvability(root, loadThemeNamespaceTokens(root));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("--color-border-success");
  });

  it("scopes the container check to the --container-* namespace", () => {
    const root = resolvabilityFixture({
      "src/components/Ok.tsx":
        "export function Ok() { return <div className='max-w-vf-wide' />; }\n",
    });
    const namespace = loadThemeNamespaceTokens(root);
    expect(namespace.container.has("--container-vf-wide")).toBe(true);
    const { violations } = verifyUtilityResolvability(root, namespace);
    expect(violations).toEqual([]);
  });
});
