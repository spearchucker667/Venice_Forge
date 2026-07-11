// @vitest-environment node
/** @fileoverview Unit + CLI coverage for verify-document-ingestion
 *  (VERIFY-058).
 *
 *  The test exercises:
 *    - The CLI exits 0 in the current repo.
 *    - Ingestion service tests and UI component tests run in separate
 *      Vitest invocations.
 *    - The ingestion invocation uses `--no-file-parallelism`; the component
 *      invocation does not force serial execution.
 *    - The CLI exits non-zero with a clear diagnostic when a required file is
 *      missing.
 */

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const scriptPath = join(__dirname, "verify-document-ingestion.cjs");

const {
  requiredFiles,
  ingestionTests,
  componentTests,
  buildVitestCommand,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("./verify-document-ingestion.cjs") as {
  requiredFiles: string[];
  ingestionTests: string[];
  componentTests: string[];
  buildVitestCommand: (tests: string[], extraArgs: string[]) => string[];
};

function allUnique(arr: string[]) {
  return new Set(arr).size === arr.length;
}

describe("verify-document-ingestion (VERIFY-058)", () => {
  it(
    "CLI exits 0 on the real repo",
    { timeout: 60000 },
    () => {
      const out = spawnSync("node", [scriptPath], {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          VERIFY_DOCUMENT_INGESTION_SKIP_VITEST: "1",
        },
      });
      expect(out.status, (out.stderr || "") + (out.stdout || "")).toBe(0);
      expect(out.stdout).toMatch(/VERIFY-058: Document ingestion validation passed/);
    },
  );

  it("partitions regression tests into ingestion services and UI components", () => {
    expect(allUnique(ingestionTests)).toBe(true);
    expect(allUnique(componentTests)).toBe(true);

    const overlap = ingestionTests.filter((t) => componentTests.includes(t));
    expect(overlap).toEqual([]);

    const combined = [...ingestionTests, ...componentTests].sort();
    const expected = [
      "src/services/ingestion/attachmentAssembler.test.ts",
      "src/services/ingestion/codeIngestion.test.ts",
      "src/services/ingestion/docxIngestion.test.ts",
      "src/services/ingestion/fileClassifier.test.ts",
      "src/services/ingestion/imageIngestion.test.ts",
      "src/services/ingestion/pdfIngestion.test.ts",
      "src/services/ingestion/textIngestion.test.ts",
      "src/components/chat/chat-input.test.tsx",
      "src/components/chat/chat-view.test.tsx",
      "src/components/chat/message-bubble.test.tsx",
      "src/components/research/ResearchWorkspaceView.test.tsx",
    ].sort();
    expect(combined).toEqual(expected);
  });

  it("builds ingestion command with --no-file-parallelism", () => {
    const cmd = buildVitestCommand(ingestionTests, ["--no-file-parallelism"]);
    expect(cmd).toContain("--no-file-parallelism");
    for (const test of ingestionTests) {
      expect(cmd).toContain(test);
    }
  });

  it("builds component command without serial flag", () => {
    const cmd = buildVitestCommand(componentTests, []);
    expect(cmd).not.toContain("--fileParallelism=false");
    expect(cmd).not.toContain("--fileParallelism=true");
    expect(cmd).not.toContain("--no-file-parallelism");
    for (const test of componentTests) {
      expect(cmd).toContain(test);
    }
  });

  it("CLI exits non-zero when a required file is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-doc-ingest-bad-"));
    try {
      mkdirSync(join(root, "scripts"), { recursive: true });

      const realScript = readFileSync(scriptPath, "utf8");
      writeFileSync(join(root, "scripts/verify-document-ingestion.cjs"), realScript);

      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "fake",
          scripts: {
            "verify:document-ingestion": "node scripts/verify-document-ingestion.cjs",
            "verify:contracts": "npm run verify:document-ingestion",
          },
          dependencies: {
            mammoth: "1.0.0",
            "pdfjs-dist": "1.0.0",
            "remark-math": "1.0.0",
            "rehype-katex": "1.0.0",
            "rehype-sanitize": "1.0.0",
          },
        }),
      );

      writeFileSync(
        join(root, "AGENTS.md"),
        "# Fake\nVERIFY-058\nverify:document-ingestion\n",
      );

      const out = spawnSync("node", [join(root, "scripts/verify-document-ingestion.cjs")], {
        cwd: root,
        encoding: "utf8",
      });

      expect(out.status).not.toBe(0);
      const combined = (out.stderr || "") + (out.stdout || "");
      expect(combined).toMatch(/Missing required file/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts document ingestion wired through a partitioned feature contract", () => {
    const root = mkdtempSync(join(tmpdir(), "venice-doc-ingest-partition-"));
    try {
      mkdirSync(join(root, "scripts"), { recursive: true });
      for (const file of requiredFiles) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        writeFileSync(join(root, file), [
          "DOCUMENT_EXTS TEXT_EXTS MARKDOWN_EXTS IMAGE_EXTS CODE_EXTS \".dockerfile\"",
          "processFileAttachment SUPPORTED_ATTACHMENT_ACCEPT AI is not vision capable setAttachments((prev) => [...prev, attachment])",
          "modelRequirements.requiresVision disableImageAttach={!visionSupported}",
          "remarkMath rehypeKatex rehypeSanitize safeUrlTransform",
          "kind: 'manual_note' localFile: true extractionRoute",
        ].join("\n"));
      }

      const realScript = readFileSync(scriptPath, "utf8");
      writeFileSync(join(root, "scripts/verify-document-ingestion.cjs"), realScript);
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({
          name: "fake",
          scripts: {
            "verify:document-ingestion": "node scripts/verify-document-ingestion.cjs",
            "verify:contracts": "npm run verify:contracts:features",
            "verify:contracts:features": "npm run verify:contracts:features:chat",
            "verify:contracts:features:chat": "npm run verify:document-ingestion",
          },
          dependencies: {
            mammoth: "1.0.0",
            "pdfjs-dist": "1.0.0",
            "remark-math": "1.0.0",
            "rehype-katex": "1.0.0",
            "rehype-sanitize": "1.0.0",
          },
        }),
      );
      writeFileSync(join(root, "AGENTS.md"), "# Fake\nVERIFY-058\nverify:document-ingestion\n");

      const out = spawnSync("node", [join(root, "scripts/verify-document-ingestion.cjs")], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          VERIFY_DOCUMENT_INGESTION_SKIP_VITEST: "1",
        },
      });

      expect(out.status, (out.stderr || "") + (out.stdout || "")).toBe(0);
      expect(out.stdout).toMatch(/VERIFY-058: Document ingestion validation passed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requiredFiles includes every test in the ingestion and component groups", () => {
    for (const test of [...ingestionTests, ...componentTests]) {
      expect(requiredFiles).toContain(test);
    }
  });
});
