#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const LLM_RELATIVE_PATH = "docs/reference/Venice_api_LLM_info.md";
const SWAGGER_RELATIVE_PATH = "docs/reference/Venice_swagger_api.yaml";
const LLM_SOURCE = "https://docs.venice.ai/llms.txt";
const SWAGGER_SOURCE = "https://api.venice.ai/doc/api/swagger.yaml";
const API_BASE_URL = "https://api.venice.ai/api/v1";

const BANNED_REFERENCE_PATHS = [
  "docs/venice_llm_info.md",
  "docs/Venice_swagger_api.yaml",
  "docs/llm_info.md",
  "docs/api_swagger.yaml",
];

const REQUIRED_SWAGGER_LOCATIONS = [
  ["components", "schemas", "ChatCompletionRequest", "properties", "prompt_cache_key"],
  ["components", "schemas", "ChatCompletionRequest", "properties", "venice_parameters", "properties", "enable_web_scraping"],
  ["components", "schemas", "ChatCompletionRequest", "properties", "venice_parameters", "properties", "enable_x_search"],
  ["components", "schemas", "ChatCompletionRequest", "properties", "venice_parameters", "properties", "include_venice_system_prompt"],
  ["components", "schemas", "EditImageRequest", "properties", "modelId"],
  ["paths", "/characters", "get"],
  ["paths", "/characters/{slug}", "get"],
  ["paths", "/characters", "get", "responses", "200", "content", "application/json", "schema", "properties", "data", "items", "properties", "webEnabled"],
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valueAtPath(root, segments) {
  let current = root;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return parsed;
}

function parseMarkdownFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error("missing YAML front matter");
  const parsed = YAML.parse(match[1]);
  if (!isRecord(parsed)) throw new Error("front matter must be a mapping");
  return { metadata: parsed, body: text.slice(match[0].length) };
}

function validateProvenance(metadata, expectedSource, label, today, failures) {
  if (!isRecord(metadata)) {
    failures.push(`${label} provenance must be a mapping.`);
    return null;
  }

  if (metadata.source !== expectedSource) {
    failures.push(`${label} provenance source must be ${expectedSource}.`);
  }

  const retrieved = parseDateOnly(metadata.retrieved);
  if (!retrieved) {
    failures.push(`${label} provenance retrieved date must be a real ISO YYYY-MM-DD string.`);
    return null;
  }

  if (retrieved.getTime() > today.getTime()) {
    failures.push(`${label} provenance retrieved date cannot be in the future.`);
  }
  return retrieved;
}

function schemaVersionDate(version) {
  if (typeof version !== "string") return null;
  const match = version.match(/^(\d{4})(\d{2})(\d{2})(?:\.|$)/);
  if (!match) return null;
  return parseDateOnly(`${match[1]}-${match[2]}-${match[3]}`);
}

function verifyVeniceApiDocs(rootDir, options = {}) {
  const failures = [];
  const today = parseDateOnly(options.today ?? new Date().toISOString().slice(0, 10));
  if (!today) throw new Error("verifyVeniceApiDocs today option must be an ISO YYYY-MM-DD date");

  const llmPath = path.join(rootDir, LLM_RELATIVE_PATH);
  const swaggerPath = path.join(rootDir, SWAGGER_RELATIVE_PATH);

  for (const relativePath of [LLM_RELATIVE_PATH, SWAGGER_RELATIVE_PATH]) {
    if (!fs.existsSync(path.join(rootDir, relativePath))) {
      failures.push(`Missing canonical Venice reference file: ${relativePath}`);
    }
  }

  for (const relativePath of BANNED_REFERENCE_PATHS) {
    if (fs.existsSync(path.join(rootDir, relativePath))) {
      failures.push(`Duplicate stale Venice reference file exists: ${relativePath}`);
    }
  }

  if (fs.existsSync(llmPath)) {
    try {
      const text = fs.readFileSync(llmPath, "utf8");
      const { metadata, body } = parseMarkdownFrontMatter(text);
      validateProvenance(metadata, LLM_SOURCE, "LLM info", today, failures);
      if (metadata.content_type !== "text/markdown") {
        failures.push("LLM info provenance content_type must be text/markdown.");
      }
      if (!body.includes(API_BASE_URL)) {
        failures.push("LLM info doc lacks the canonical API base URL.");
      }
      if (!/^### Characters$/m.test(body) || !body.includes("/endpoint/characters/list")) {
        failures.push("LLM info doc lacks the structured Characters API reference section.");
      }
    } catch (error) {
      failures.push(`LLM info provenance could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (fs.existsSync(swaggerPath)) {
    try {
      const swagger = YAML.parse(fs.readFileSync(swaggerPath, "utf8"), { maxAliasCount: 100 });
      if (!isRecord(swagger)) throw new Error("OpenAPI document root must be a mapping");

      const provenance = swagger["x-venice-forge-provenance"];
      const retrieved = validateProvenance(provenance, SWAGGER_SOURCE, "Swagger", today, failures);
      const infoVersion = valueAtPath(swagger, ["info", "version"]);

      if (!isRecord(provenance) || provenance.content_version !== infoVersion) {
        failures.push("Swagger provenance content_version must exactly match info.version.");
      }
      const versionDate = schemaVersionDate(infoVersion);
      if (!versionDate) {
        failures.push("Swagger info.version must begin with a real YYYYMMDD date.");
      } else if (retrieved && retrieved.getTime() < versionDate.getTime()) {
        failures.push("Swagger provenance retrieved date cannot predate the declared schema version.");
      }

      if (typeof swagger.openapi !== "string" || !/^3\.\d+\.\d+$/.test(swagger.openapi)) {
        failures.push("Swagger document must declare an OpenAPI 3.x semantic version.");
      }
      const serverUrls = Array.isArray(swagger.servers)
        ? swagger.servers.map((server) => isRecord(server) ? server.url : undefined)
        : [];
      if (!serverUrls.includes(API_BASE_URL)) {
        failures.push(`Swagger servers must include the canonical API base URL: ${API_BASE_URL}.`);
      }

      for (const segments of REQUIRED_SWAGGER_LOCATIONS) {
        if (valueAtPath(swagger, segments) === undefined) {
          failures.push(`Swagger document lacks required parsed location: ${segments.join(".")}.`);
        }
      }
    } catch (error) {
      failures.push(`Swagger document could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return failures;
}

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const failures = verifyVeniceApiDocs(repoRoot);
  if (failures.length > 0) {
    console.error("Venice API docs verification failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Venice API docs verification passed with parsed provenance and schema contracts.");
}

module.exports = {
  API_BASE_URL,
  LLM_SOURCE,
  REQUIRED_SWAGGER_LOCATIONS,
  SWAGGER_SOURCE,
  parseMarkdownFrontMatter,
  verifyVeniceApiDocs,
};

if (require.main === module) main();
