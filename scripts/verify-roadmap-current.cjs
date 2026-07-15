#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const ROADMAP_PATH = "docs/ROADMAP.md";
const EVIDENCE_PATH = "docs/audits/VENICE_FORGE_SCAN_EVIDENCE_2026-07-14/VENICE_FORGE_EXTENSIVE_SCAN_2026-07-14.md";

function verifyCurrentRoadmap(rootDir) {
  const failures = [];
  const roadmapPath = path.join(rootDir, ROADMAP_PATH);
  const evidencePath = path.join(rootDir, EVIDENCE_PATH);

  if (!fs.existsSync(roadmapPath)) {
    return [`Missing canonical current roadmap: ${ROADMAP_PATH}`];
  }
  if (!fs.existsSync(evidencePath)) {
    return [`Missing retained scan evidence: ${EVIDENCE_PATH}`];
  }

  const roadmap = fs.readFileSync(roadmapPath, "utf8");
  if (!roadmap.includes("current unfinished work only")) {
    failures.push("Roadmap must declare that it contains current unfinished work only.");
  }
  if (!roadmap.includes(EVIDENCE_PATH)) {
    failures.push(`Roadmap must cite ${EVIDENCE_PATH} as audit input.`);
  }
  if (/^## Recently Closed\s*$/m.test(roadmap)) {
    failures.push("Roadmap must not contain a Recently Closed history section.");
  }
  if (/^### \[x\]/im.test(roadmap)) {
    failures.push("Roadmap must not retain closed top-level task sections.");
  }
  if (/^- \*\*Status:\*\*\s*Closed\b/im.test(roadmap)) {
    failures.push("Roadmap must not retain historical closed status fields.");
  }

  const withoutTrancheIds = roadmap.replace(/VF-(?:AUDIT|SCAN)-[A-Za-z0-9-]+/g, "");
  const mirroredFindingIds = Array.from(withoutTrancheIds.matchAll(/\bAUDIT-\d{3}\b/g), (match) => match[0]);
  if (mirroredFindingIds.length > 0) {
    failures.push(`Roadmap must not mirror per-finding audit statuses: ${[...new Set(mirroredFindingIds)].join(", ")}.`);
  }

  return failures;
}

function main() {
  const failures = verifyCurrentRoadmap(process.cwd());
  if (failures.length > 0) {
    console.error("[verify:roadmap-current] FAIL");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("[verify:roadmap-current] OK — the roadmap contains current work only and retained scan evidence remains input, not status authority.");
}

module.exports = { EVIDENCE_PATH, ROADMAP_PATH, verifyCurrentRoadmap };

if (require.main === module) main();
