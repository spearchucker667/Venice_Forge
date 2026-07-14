#!/usr/bin/env node
/**
 * verify-work-orders.cjs
 *
 * Phase 2J Work Order Schema guard (VERIFY-054).
 * Validates that current work-order closure YAMLs in docs/audits/ follow the
 * strict schema:
 * { report: { date, agent, summary }, items: [{ id, status, evidence, residual_risk, required_followup }] }
 *
 * Historical reports under docs/reports/historical/ are retained as inert
 * evidence snapshots and are intentionally not parsed as current work orders.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const YAML = require("yaml");

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["docs/audits"];
const SKIP_FILES = new Set([
  "Venice_swagger_api.yaml",
  "current-audit-cross-check-status.yaml",
  "agent-repair-status-2026-06-16.yaml",
  "kimi-batch-evidence-2026-06-16.yaml",
  "roadmap-verification-2026-06-16.yaml",
  "exhaustive_repository_file_audit_2026-07-14.yaml",
]);
const violations = [];

function validateWorkOrder(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  let data;
  try {
    data = YAML.parse(content);
  } catch (err) {
    violations.push(`${filePath}: YAML parse error: ${err.message}`);
    return;
  }

  if (!data || typeof data !== "object") {
    violations.push(`${filePath}: root must be an object`);
    return;
  }

  if (!data.report || typeof data.report !== "object") {
    violations.push(`${filePath}: missing 'report' object`);
  } else {
    const { date, agent, summary } = data.report;
    if (!date) violations.push(`${filePath}: 'report.date' is required`);
    if (!agent) violations.push(`${filePath}: 'report.agent' is required`);
    if (!summary) violations.push(`${filePath}: 'report.summary' is required`);
  }

  if (!Array.isArray(data.items)) {
    violations.push(`${filePath}: 'items' must be an array`);
  } else {
    data.items.forEach((item, index) => {
      const { id, status, evidence, residual_risk, required_followup } = item;
      if (!id) violations.push(`${filePath}: items[${index}].id is required`);
      if (!status) violations.push(`${filePath}: items[${index}].status is required`);
      if (!evidence) violations.push(`${filePath}: items[${index}].evidence is required`);
      if (!residual_risk) violations.push(`${filePath}: items[${index}].residual_risk is required`);
      if (!required_followup) violations.push(`${filePath}: items[${index}].required_followup is required`);
    });
  }
}

function main() {
  for (const dir of SCAN_DIRS) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir);
    for (const file of files) {
      if (file.endsWith(".yaml") || file.endsWith(".yml")) {
        // Skip known non-work-order YAMLs (OpenAPI spec, audit backlog artifact).
        if (SKIP_FILES.has(file)) continue;
        validateWorkOrder(path.join(fullDir, file));
      }
    }
  }

  if (violations.length > 0) {
    console.error("[verify:work-orders] FAIL — Schema violations detected:");
    for (const v of violations) {
      console.error("  " + v);
    }
    process.exit(1);
  }

  console.log("[verify:work-orders] OK — All work-order closure records follow strict schema.");
  process.exit(0);
}

main();
