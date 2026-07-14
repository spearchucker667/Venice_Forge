#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const ROADMAP_PATH = "docs/ROADMAP.md";
const AUDIT_PATH = "docs/audits/exhaustive_repository_file_audit_2026-07-14.yaml";

function verifyCurrentRoadmap(rootDir) {
  const failures = [];
  const roadmapPath = path.join(rootDir, ROADMAP_PATH);
  const auditPath = path.join(rootDir, AUDIT_PATH);

  if (!fs.existsSync(roadmapPath)) {
    return [`Missing canonical current roadmap: ${ROADMAP_PATH}`];
  }
  if (!fs.existsSync(auditPath)) {
    return [`Missing authoritative audit status source: ${AUDIT_PATH}`];
  }

  const roadmap = fs.readFileSync(roadmapPath, "utf8");
  if (!roadmap.includes("current unfinished work only")) {
    failures.push("Roadmap must declare that it contains current unfinished work only.");
  }
  if (!roadmap.includes(AUDIT_PATH)) {
    failures.push(`Roadmap must identify ${AUDIT_PATH} as the follow-on status authority.`);
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

  const withoutTrancheIds = roadmap.replace(/VF-AUDIT-[A-Za-z0-9-]+/g, "");
  const mirroredFindingIds = Array.from(withoutTrancheIds.matchAll(/\bAUDIT-\d{3}\b/g), (match) => match[0]);
  if (mirroredFindingIds.length > 0) {
    failures.push(`Roadmap must not mirror per-finding audit statuses: ${[...new Set(mirroredFindingIds)].join(", ")}.`);
  }

  let parsedAudit;
  try {
    parsedAudit = YAML.parse(fs.readFileSync(auditPath, "utf8"));
  } catch (error) {
    failures.push(`Authoritative audit YAML could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    return failures;
  }

  const findings = parsedAudit?.audit?.findings;
  if (!Array.isArray(findings) || findings.length === 0) {
    failures.push("Authoritative audit YAML must contain a non-empty audit.findings array.");
    return failures;
  }

  const seen = new Set();
  for (const finding of findings) {
    if (!finding || typeof finding !== "object" || !/^AUDIT-\d{3}$/.test(finding.id ?? "")) {
      failures.push("Every authoritative audit finding must have an AUDIT-NNN id.");
      continue;
    }
    if (seen.has(finding.id)) failures.push(`Duplicate authoritative audit finding id: ${finding.id}.`);
    seen.add(finding.id);
    if (finding.status !== "open" && finding.status !== "closed") {
      failures.push(`Authoritative audit finding ${finding.id} has unsupported status: ${String(finding.status)}.`);
    }
    if (finding.status === "closed" && (!Array.isArray(finding.closure_evidence) || finding.closure_evidence.length === 0)) {
      failures.push(`Closed authoritative audit finding ${finding.id} must include closure_evidence.`);
    }
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
  console.log("[verify:roadmap-current] OK — live roadmap contains current work only; audit statuses remain YAML-authoritative.");
}

module.exports = { AUDIT_PATH, ROADMAP_PATH, verifyCurrentRoadmap };

if (require.main === module) main();
