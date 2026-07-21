/** @fileoverview Unit tests for the agent-doc parity verifier. */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
// @ts-expect-error - CJS import in TS file
import { verifyAgentDocs, DOCS, THIN_POINTERS } from "./verify-agent-docs.cjs";

describe("verify-agent-docs", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vfg-agent-docs-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDoc(relPath: string, content: string) {
    const fullPath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  function minimalAgentsMd(): string {
    return [
      "## Mandatory Session Handoff: `docs/summary_of_work.md`",
      "",
      "Required updates:",
      "",
      "1. Read `docs/summary_of_work.md` before starting substantive work.",
      "",
      "```bash",
      "npm run lint:eslint",
      "npm run typecheck",
      "npm test",
      "npm run verify:safety-guard",
      "npm run verify:markdown-links",
      "npm run build",
      "```",
    ].join("\n");
  }

  function minimalCopilotMd(extra = ""): string {
    return [
      "## Mandatory Session Handoff: `docs/summary_of_work.md`",
      "",
      "Required updates: read `docs/summary_of_work.md`.",
      "",
      "```bash",
      "npm run lint:eslint",
      "npm run typecheck",
      "npm test",
      "npm run verify:safety-guard",
      "npm run verify:markdown-links",
      "npm run build",
      "```",
      "",
      "## Data Storage Locations",
      "| Data | Location |",
      "|------|----------|",
      "| Renderer IndexedDB stores | `src/constants/venice.ts` (`STORE_NAMES`) via `src/services/storageService.ts` and `src/services/dbMigrations.ts`; encryption scope is `ENCRYPTED_STORES` in `src/services/storageService.ts` — `diagnostics` is unencrypted, all other stores are AES-GCM |",
      "Renderer transport: `src/services/desktopBridge.ts`.",
      "Main handlers: `electron/ipc/handlers/`.",
      "GET  /image/styles",
      "GET  /characters",
      "The canonical registry has 20 top-level tabs including Character Chats.",
      extra,
    ].join("\n");
  }

  function writeSupportingFiles() {
    writeDoc("docs/summary_of_work.md", "# Summary of Work\n");
    writeDoc(
      "docs/FILE_TREE.md",
      [
        "`src/config/tabs.ts`",
        "`src/services/desktopBridge.ts`",
        "`electron/ipc/handlers/`",
        "`electron/services/providerSettingsStore.ts`",
        "do not copy a numeric tab count",
      ].join("\n"),
    );
  }

  it("passes when AGENTS.md and copilot-instructions.md are consistent", () => {
    writeSupportingFiles();
    writeDoc("AGENTS.md", minimalAgentsMd());
    writeDoc(".github/copilot-instructions.md", minimalCopilotMd());
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(errors).toEqual([]);
    expect(passed).toBe(true);
  });

  it("fails when copilot-instructions.md references stale generated-image Library", () => {
    writeSupportingFiles();
    writeDoc("AGENTS.md", minimalAgentsMd());
    writeDoc(
      ".github/copilot-instructions.md",
      minimalCopilotMd("It provides a generated-image Library.")
    );
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("generated-image Library"))).toBe(true);
  });

  it("fails when copilot-instructions.md references stale batch prompting", () => {
    writeSupportingFiles();
    writeDoc("AGENTS.md", minimalAgentsMd());
    writeDoc(
      ".github/copilot-instructions.md",
      minimalCopilotMd("It provides batch prompting.")
    );
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("batch prompting"))).toBe(true);
  });

  it("fails when copilot-instructions.md hardcodes a numeric store count", () => {
    writeSupportingFiles();
    writeDoc("AGENTS.md", minimalAgentsMd());
    writeDoc(
      ".github/copilot-instructions.md",
      minimalCopilotMd().replace("Renderer IndexedDB stores", "Renderer IndexedDB (5 stores)")
    );
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("hardcodes a numeric IndexedDB store count"))).toBe(true);
  });

  it("fails when copilot-instructions.md storage section omits a ground-truth source file", () => {
    writeSupportingFiles();
    writeDoc("AGENTS.md", minimalAgentsMd());
    writeDoc(
      ".github/copilot-instructions.md",
      minimalCopilotMd().replace("`src/services/dbMigrations.ts`", "`src/services/other.ts`")
    );
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("ground truth"))).toBe(true);
  });

  // VERIFY-122: Copilot guidance must retain current architecture and tab markers.
  it("fails when copilot-instructions.md drops a current architecture marker", () => {
    writeSupportingFiles();
    writeDoc("AGENTS.md", minimalAgentsMd());
    writeDoc(
      ".github/copilot-instructions.md",
      minimalCopilotMd().replace("20 top-level tabs", "top-level tabs"),
    );
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("20 top-level tabs"))).toBe(true);
  });

  it("fails when the repository map drops a current architecture marker", () => {
    writeSupportingFiles();
    writeDoc("AGENTS.md", minimalAgentsMd());
    writeDoc(".github/copilot-instructions.md", minimalCopilotMd());
    writeDoc("docs/FILE_TREE.md", "do not copy a numeric tab count\n");
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("src/config/tabs.ts"))).toBe(true);
  });

  it("fails when AGENTS.md and copilot-instructions.md validation lists diverge", () => {
    writeSupportingFiles();
    writeDoc("AGENTS.md", minimalAgentsMd());
    const bad = minimalCopilotMd().replace(
      "npm run verify:safety-guard\nnpm run verify:markdown-links",
      "npm run verify:markdown-links\nnpm run verify:safety-guard"
    );
    writeDoc(".github/copilot-instructions.md", bad);
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("diverging validation"))).toBe(true);
  });

  it("fails when guidance tells agents not to use the canonical root", () => {
    writeSupportingFiles();
    writeDoc(
      "AGENTS.md",
      `${minimalAgentsMd()}\nCanonical: /Users/super_user/Projects/Venice_Forge\nDo not use /Users/super_user/Projects/Venice_Forge.`,
    );
    writeDoc(".github/copilot-instructions.md", minimalCopilotMd());
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("contradicts the canonical repository root"))).toBe(true);
  });

  it("fails when guidance claims CodeQL uses default setup", () => {
    writeSupportingFiles();
    writeDoc("AGENTS.md", `${minimalAgentsMd()}\nCodeQL is configured through GitHub's default setup.`);
    writeDoc(".github/copilot-instructions.md", minimalCopilotMd());
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("stale CodeQL default setup"))).toBe(true);
  });

  // AUDIT-013 / AUDIT-014 regression guards: Cursor / Windsurf pointer parity.
  function validPointer(): string {
    return "Read [AGENTS.md](AGENTS.md) first. Follow [docs/summary_of_work.md](docs/summary_of_work.md).\n";
  }

  function writeFullFixture(cursorRules?: string, windSurfRules?: string) {
    writeSupportingFiles();
    writeDoc("AGENTS.md", minimalAgentsMd());
    writeDoc(".github/copilot-instructions.md", minimalCopilotMd());
    writeDoc("CLAUDE.md", validPointer());
    writeDoc("GEMINI.md", validPointer());
    writeDoc(".cursorrules", cursorRules ?? validPointer());
    writeDoc(".windsurfrules", windSurfRules ?? validPointer());
  }

  it("includes .cursorrules and .windsurfrules in the checked document set", () => {
    expect(DOCS).toContain(".cursorrules");
    expect(DOCS).toContain(".windsurfrules");
    expect(THIN_POINTERS).toContain(".cursorrules");
    expect(THIN_POINTERS).toContain(".windsurfrules");
  });

  it("passes when .cursorrules and .windsurfrules are valid thin pointers", () => {
    writeFullFixture();
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(errors).toEqual([]);
    expect(passed).toBe(true);
  });

  it("fails when .cursorrules is missing the AGENTS.md pointer", () => {
    writeFullFixture("Use TypeScript strict.\nFollow [docs/summary_of_work.md](docs/summary_of_work.md).");
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes(".cursorrules must be a thin pointer"))).toBe(true);
  });

  it("fails when .cursorrules exceeds the thin-pointer length cap", () => {
    writeFullFixture("AGENTS.md\n" + "x".repeat(3000), validPointer());
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes(".cursorrules must be a thin pointer"))).toBe(true);
  });

  it("fails when .cursorrules references a missing local markdown file", () => {
    writeFullFixture(
      "Read [AGENTS.md](AGENTS.md). Follow [docs/summary_of_work.md](docs/summary_of_work.md). Also [missing](docs/nope.md)."
    );
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes("docs/nope.md"))).toBe(true);
  });

  it("fails when .windsurfrules omits the mandatory summary_of_work.md reference", () => {
    writeFullFixture(validPointer(), "Read [AGENTS.md](AGENTS.md).\n");
    const { passed, errors } = verifyAgentDocs(tmpDir);
    expect(passed).toBe(false);
    expect(errors.some((e: string) => e.includes(".windsurfrules does not contain"))).toBe(true);
  });

  it("passes against the actual repository", () => {
    const { passed, errors } = verifyAgentDocs(path.resolve(__dirname, ".."));
    expect(errors).toEqual([]);
    expect(passed).toBe(true);
  });
});
