#!/usr/bin/env node
"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const requiredFiles = [
  "src/types/ingestion.ts",
  "src/services/ingestion/fileClassifier.ts",
  "src/services/ingestion/fileClassifier.test.ts",
  "src/services/ingestion/textIngestion.ts",
  "src/services/ingestion/textIngestion.test.ts",
  "src/services/ingestion/codeIngestion.ts",
  "src/services/ingestion/codeIngestion.test.ts",
  "src/services/ingestion/pdfIngestion.ts",
  "src/services/ingestion/pdfIngestion.test.ts",
  "src/services/ingestion/docxIngestion.ts",
  "src/services/ingestion/docxIngestion.test.ts",
  "src/services/ingestion/imageIngestion.ts",
  "src/services/ingestion/imageIngestion.test.ts",
  "src/services/ingestion/attachmentAssembler.ts",
  "src/services/ingestion/attachmentAssembler.test.ts",
  "src/services/ingestion/veniceTextParserIngestion.ts",
  "src/components/chat/chat-input.tsx",
  "src/components/chat/chat-input.test.tsx",
  "src/components/chat/chat-view.tsx",
  "src/components/chat/chat-view.test.tsx",
  "src/components/chat/message-bubble.tsx",
  "src/components/chat/message-bubble.test.tsx",
  "src/components/research/ResearchWorkspaceView.tsx",
  "src/components/research/ResearchWorkspaceView.test.tsx",
];

function fail(message) {
  console.error(`[verify:document-ingestion] ${message}`);
  process.exit(1);
}

function mustContain(file, fragments, label) {
  const text = readFileSync(file, "utf8");
  for (const fragment of fragments) {
    if (!text.includes(fragment)) {
      fail(`${file} is missing ${label}: ${JSON.stringify(fragment)}`);
    }
  }
}

console.log("Checking document ingestion files...");
const missing = requiredFiles.filter((file) => !existsSync(file));
if (missing.length > 0) {
  fail(`Missing required files:\n${missing.map((file) => ` - ${file}`).join("\n")}`);
}
console.log("✅ All required files present.");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
if (pkg.scripts?.["verify:document-ingestion"] !== "node scripts/verify-document-ingestion.cjs") {
  fail("package.json script is missing or incorrect.");
}
if (!pkg.scripts?.["verify:contracts"]?.includes("npm run verify:document-ingestion")) {
  fail("verify:contracts does not include verify:document-ingestion.");
}
for (const dep of ["mammoth", "pdfjs-dist", "remark-math", "rehype-katex", "rehype-sanitize"]) {
  if (!pkg.dependencies?.[dep]) {
    fail(`package.json is missing dependency ${dep}.`);
  }
}
console.log("✅ package.json scripts and dependencies verified.");

const agents = readFileSync("AGENTS.md", "utf8");
if (!agents.includes("VERIFY-058") || !agents.includes("verify:document-ingestion")) {
  fail("AGENTS.md is missing VERIFY-058 / verify:document-ingestion.");
}
console.log("✅ AGENTS.md updated with VERIFY-058.");

mustContain(
  "src/services/ingestion/fileClassifier.ts",
  [
    "DOCUMENT_EXTS",
    "TEXT_EXTS",
    "MARKDOWN_EXTS",
    "IMAGE_EXTS",
    "CODE_EXTS",
    "\".dockerfile\"",
  ],
  "classifier coverage token",
);

mustContain(
  "src/components/chat/chat-input.tsx",
  [
    "processFileAttachment",
    "SUPPORTED_ATTACHMENT_ACCEPT",
    "AI is not vision capable",
    "setAttachments((prev) => [...prev, attachment])",
  ],
  "chat attachment integration",
);

mustContain(
  "src/components/chat/chat-view.tsx",
  [
    "modelRequirements.requiresVision",
    "AI is not vision capable",
    "disableImageAttach={!visionSupported}",
  ],
  "send-side vision gate",
);

mustContain(
  "src/components/chat/message-bubble.tsx",
  [
    "remarkMath",
    "rehypeKatex",
    "rehypeSanitize",
    "safeUrlTransform",
  ],
  "safe markdown/math renderer",
);

mustContain(
  "src/components/research/ResearchWorkspaceView.tsx",
  [
    "processFileAttachment",
    "kind: 'manual_note'",
    "localFile: true",
    "extractionRoute",
  ],
  "research upload integration",
);
console.log("✅ Source integration tokens verified.");

const tests = [
  "src/services/ingestion/fileClassifier.test.ts",
  "src/services/ingestion/textIngestion.test.ts",
  "src/services/ingestion/codeIngestion.test.ts",
  "src/services/ingestion/pdfIngestion.test.ts",
  "src/services/ingestion/docxIngestion.test.ts",
  "src/services/ingestion/imageIngestion.test.ts",
  "src/services/ingestion/attachmentAssembler.test.ts",
  "src/components/chat/message-bubble.test.tsx",
  "src/components/chat/chat-input.test.tsx",
  "src/components/chat/chat-view.test.tsx",
  "src/components/research/ResearchWorkspaceView.test.tsx",
];

console.log("Running document ingestion regression tests...");
const result = spawnSync("npx", ["vitest", "run", ...tests, "--fileParallelism=false"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  fail("Unit tests failed.");
}

console.log("\n✅ VERIFY-058: Document ingestion validation passed.");
process.exit(0);
