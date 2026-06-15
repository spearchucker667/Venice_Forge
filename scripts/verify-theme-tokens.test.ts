// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const {
  collectScanFiles,
  isSourceFile,
  verifyThemeTokens,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./verify-theme-tokens.cjs") as {
  collectScanFiles: (root: string, scanRoots: string[]) => Set<string>;
  isSourceFile: (entry: string) => boolean;
  verifyThemeTokens: (
    root: string,
    options?: {
      scanRoots?: string[];
      forbidden?: Array<{ pattern: RegExp; name: string }>;
      allowComment?: string;
      knownExceptions?: string[];
    },
  ) => { ok: boolean; filesScanned: number; violations: string[]; staleExceptions: string[] };
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

  it("reports forbidden hardcoded colors in non-exception files", () => {
    const root = fixture({
      "src/components/clean/clean-view.tsx": "export function CleanView() { return <div className='text-white' />; }\n",
    });

    const result = verifyThemeTokens(root, { scanRoots: ["src/components"], knownExceptions: [] });
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBe(1);
    expect(result.violations[0]).toContain("clean-view.tsx");
    expect(result.violations[0]).toContain("text-white");
  });

  it("ignores violations in known-exception files but still scans them", () => {
    const root = fixture({
      "src/components/media/media-view.tsx": "export function MediaView() { return <div className='text-white' />; }\n",
    });

    const result = verifyThemeTokens(root, {
      scanRoots: ["src/components"],
      knownExceptions: ["src/components/media/media-view.tsx"],
    });
    expect(result.ok).toBe(true);
    expect(result.filesScanned).toBe(1);
    expect(result.violations).toEqual([]);
  });

  it("reports stale exception entries that no longer contain forbidden patterns", () => {
    const root = fixture({
      "src/components/media/media-view.tsx": "export function MediaView() { return <div className='bg-surface text-text' />; }\n",
    });

    const result = verifyThemeTokens(root, {
      scanRoots: ["src/components"],
      knownExceptions: ["src/components/media/media-view.tsx"],
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([]);
    expect(result.staleExceptions).toEqual(["src/components/media/media-view.tsx"]);
  });

  it("honours per-line allow comments", () => {
    const root = fixture({
      "src/components/clean/clean-view.tsx":
        "export function CleanView() { return <div className='text-white' // THEME_TOKEN_ALLOW_INTENTIONAL_FIXED_COLOR\n />; }\n",
    });

    const result = verifyThemeTokens(root, { scanRoots: ["src/components"], knownExceptions: [] });
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

    const result = verifyThemeTokens(root, { scanRoots: ["src/components"], knownExceptions: [] });
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(9);
  });
});
