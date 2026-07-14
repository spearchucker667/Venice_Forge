// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import YAML from "yaml";

const require = createRequire(import.meta.url);
const {
  API_BASE_URL,
  LLM_SOURCE,
  SWAGGER_SOURCE,
  verifyVeniceApiDocs,
} = require("./verify-venice-api-docs.cjs") as {
  API_BASE_URL: string;
  LLM_SOURCE: string;
  SWAGGER_SOURCE: string;
  verifyVeniceApiDocs: (rootDir: string, options?: { today?: string }) => string[];
};

// VERIFY-106: Venice API reference provenance and semantic schema checks are parsed, not raw-string markers.
describe("VERIFY-106 parsed Venice API reference provenance", () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-api-docs-"));
    fs.mkdirSync(path.join(rootDir, "docs/reference"), { recursive: true });
  });

  afterEach(() => fs.rmSync(rootDir, { recursive: true, force: true }));

  function validSwagger(): Record<string, unknown> {
    return {
      "x-venice-forge-provenance": {
        source: SWAGGER_SOURCE,
        retrieved: "2026-07-11",
        content_version: "20260709.204640",
      },
      openapi: "3.0.0",
      info: { title: "Venice.ai API", version: "20260709.204640" },
      servers: [{ url: API_BASE_URL }],
      components: {
        schemas: {
          ChatCompletionRequest: {
            properties: {
              prompt_cache_key: {},
              venice_parameters: {
                properties: {
                  enable_web_scraping: {},
                  enable_x_search: {},
                  include_venice_system_prompt: {},
                },
              },
            },
          },
          EditImageRequest: { properties: { modelId: {} } },
        },
      },
      paths: {
        "/characters": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        data: { items: { properties: { webEnabled: {} } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/characters/{slug}": { get: {} },
      },
    };
  }

  function writeFixture(swagger = validSwagger(), llmMetadata: Record<string, unknown> = {}) {
    const metadata = {
      source: LLM_SOURCE,
      retrieved: "2026-06-17",
      content_type: "text/markdown",
      ...llmMetadata,
    };
    fs.writeFileSync(
      path.join(rootDir, "docs/reference/Venice_api_LLM_info.md"),
      `---\n${YAML.stringify(metadata)}---\n# Venice API\n\`${API_BASE_URL}\`\n\n### Characters\n[Characters](/endpoint/characters/list)\n`,
    );
    fs.writeFileSync(
      path.join(rootDir, "docs/reference/Venice_swagger_api.yaml"),
      YAML.stringify(swagger),
    );
  }

  it("accepts structured provenance tied to the parsed schema version", () => {
    writeFixture();
    expect(verifyVeniceApiDocs(rootDir, { today: "2026-07-14" })).toEqual([]);
  });

  it("does not accept legacy provenance comments as structured metadata", () => {
    writeFixture();
    fs.writeFileSync(
      path.join(rootDir, "docs/reference/Venice_swagger_api.yaml"),
      `# Source: ${SWAGGER_SOURCE}\n# Retrieved: 2026-06-17\nopenapi: 3.0.0\n`,
    );

    const failures = verifyVeniceApiDocs(rootDir, { today: "2026-07-14" });
    expect(failures).toContain("Swagger provenance must be a mapping.");
    expect(failures).toContain("Swagger provenance content_version must exactly match info.version.");
  });

  it("rejects provenance that predates or disagrees with the parsed schema version", () => {
    const swagger = validSwagger();
    const provenance = swagger["x-venice-forge-provenance"] as Record<string, unknown>;
    provenance.retrieved = "2026-07-08";
    provenance.content_version = "stale-version";
    writeFixture(swagger);

    const failures = verifyVeniceApiDocs(rootDir, { today: "2026-07-14" });
    expect(failures).toContain("Swagger provenance content_version must exactly match info.version.");
    expect(failures).toContain("Swagger provenance retrieved date cannot predate the declared schema version.");
  });

  it("rejects future retrieval dates and missing parsed schema locations", () => {
    const swagger = validSwagger();
    const provenance = swagger["x-venice-forge-provenance"] as Record<string, unknown>;
    provenance.retrieved = "2026-07-15";
    const components = swagger.components as { schemas: Record<string, unknown> };
    delete components.schemas.EditImageRequest;
    writeFixture(swagger, { retrieved: "2026-07-15" });

    const failures = verifyVeniceApiDocs(rootDir, { today: "2026-07-14" });
    expect(failures.filter((failure) => failure.includes("cannot be in the future"))).toHaveLength(2);
    expect(failures).toContain(
      "Swagger document lacks required parsed location: components.schemas.EditImageRequest.properties.modelId.",
    );
  });

  it("reports malformed Markdown front matter and malformed OpenAPI YAML", () => {
    writeFixture();
    fs.writeFileSync(
      path.join(rootDir, "docs/reference/Venice_api_LLM_info.md"),
      "<!-- Source: https://docs.venice.ai/llms.txt -->\n# Venice API\n",
    );
    fs.writeFileSync(
      path.join(rootDir, "docs/reference/Venice_swagger_api.yaml"),
      "openapi: [unterminated\n",
    );

    const failures = verifyVeniceApiDocs(rootDir, { today: "2026-07-14" });
    expect(failures.some((failure) => failure.includes("missing YAML front matter"))).toBe(true);
    expect(failures.some((failure) => failure.includes("Swagger document could not be parsed"))).toBe(true);
  });
});
