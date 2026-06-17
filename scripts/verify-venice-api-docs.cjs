#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const llmPath = path.join(root, "docs/reference/Venice_api_LLM_info.md");
const swaggerPath = path.join(root, "docs/reference/Venice_swagger_api.yaml");

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

for (const file of [llmPath, swaggerPath]) {
  check(fs.existsSync(file), `Missing canonical Venice reference file: ${path.relative(root, file)}`);
}

const banned = [
  "docs/venice_llm_info.md",
  "docs/Venice_swagger_api.yaml",
  "docs/llm_info.md",
  "docs/api_swagger.yaml",
];
for (const rel of banned) {
  check(!fs.existsSync(path.join(root, rel)), `Duplicate stale Venice reference file exists: ${rel}`);
}

if (fs.existsSync(llmPath)) {
  const text = fs.readFileSync(llmPath, "utf8");
  check(text.includes("Source: https://docs.venice.ai/llms.txt"), "LLM info doc lacks source URL metadata.");
  check(text.includes("Retrieved: 2026-06-17"), "LLM info doc lacks current retrieval date.");
  check(text.includes("https://api.venice.ai/api/v1"), "LLM info doc lacks current API base URL.");
  check(text.includes("List Characters"), "LLM info doc lacks Characters API reference section.");
}

if (fs.existsSync(swaggerPath)) {
  const text = fs.readFileSync(swaggerPath, "utf8");
  check(text.includes("Source: https://api.venice.ai/doc/api/swagger.yaml"), "Swagger doc lacks source URL metadata.");
  check(text.includes("Retrieved: 2026-06-17"), "Swagger doc lacks current retrieval date.");
  for (const needle of [
    "prompt_cache_key:",
    "enable_web_scraping:",
    "enable_x_search:",
    "include_venice_system_prompt:",
    "/characters:",
    "/characters/{slug}:",
    "webEnabled:",
    "modelId:",
  ]) {
    check(text.includes(needle), `Swagger doc lacks expected current field/path: ${needle}`);
  }
}

if (failures.length > 0) {
  console.error("Venice API docs verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Venice API docs verification passed.");
