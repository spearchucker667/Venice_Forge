#!/usr/bin/env node

/**
 * @fileoverview Venice Forge Contract Drift Verifier.
 * Enforces alignment between canonical upstream Swagger specification,
 * shared endpoints allowlist, media contract payload builders, background
 * task serialization rules, and capability-driven model detection.
 */

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const SWAGGER_PATH = path.join(REPO_ROOT, "docs", "reference", "Venice_swagger_api.yaml");
const VALIDATION_PATH = path.join(REPO_ROOT, "src", "shared", "validation.ts");
const OPERATIONS_PATH = path.join(REPO_ROOT, "src", "shared", "venice-media-contract", "operations.ts");
const BUILDERS_PATH = path.join(REPO_ROOT, "src", "shared", "venice-media-contract", "payload-builders.ts");
const CONSTANTS_PATH = path.join(REPO_ROOT, "src", "constants", "venice.ts");
const BACKGROUND_TASK_PATH = path.join(REPO_ROOT, "src", "types", "background-task.ts");

let failureCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`[DRIFT-FAIL] ${message}`);
    failureCount += 1;
  } else {
    console.log(`[DRIFT-OK] ${message}`);
  }
}

function verifySwagger() {
  assert(fs.existsSync(SWAGGER_PATH), "Swagger specification file exists");
  const content = fs.readFileSync(SWAGGER_PATH, "utf8");

  assert(content.includes("/video/quote:"), "Swagger contains /video/quote endpoint");
  assert(content.includes("/video/queue:"), "Swagger contains /video/queue endpoint");
  assert(content.includes("/video/retrieve:"), "Swagger contains /video/retrieve endpoint");
  assert(content.includes("/audio/quote:"), "Swagger contains /audio/quote endpoint");
  assert(content.includes("/audio/queue:"), "Swagger contains /audio/queue endpoint");
  assert(content.includes("/audio/retrieve:"), "Swagger contains /audio/retrieve endpoint");
  assert(content.includes("/images/generations:"), "Swagger contains /images/generations endpoint");
  assert(content.includes("data:") && content.includes("b64_json:"), "Swagger documents OpenAI-compatible image response data and b64_json fields");
  assert(content.includes("url: data:image/png;base64"), "Swagger documents data-URL image response values");
  assert(content.includes("/models/traits:"), "Swagger contains /models/traits endpoint");
  assert(content.includes("/models/compatibility_mapping:"), "Swagger contains /models/compatibility_mapping endpoint");
}

function verifyValidationEndpoints() {
  assert(fs.existsSync(VALIDATION_PATH), "src/shared/validation.ts exists");
  const content = fs.readFileSync(VALIDATION_PATH, "utf8");

  const requiredEndpoints = [
    "/models",
    "/models/traits",
    "/models/compatibility_mapping",
    "/image/generate",
    "/images/generations",
    "/image/edit",
    "/image/multi-edit",
    "/image/upscale",
    "/image/background-remove",
    "/video/quote",
    "/video/queue",
    "/video/retrieve",
    "/audio/quote",
    "/audio/queue",
    "/audio/retrieve",
    "/audio/speech",
    "/audio/voices",
  ];

  for (const ep of requiredEndpoints) {
    assert(content.includes(`"${ep}"`), `ALLOWED_VENICE_ENDPOINTS includes ${ep}`);
  }
}

function verifyOperations() {
  assert(fs.existsSync(OPERATIONS_PATH), "venice-media-contract/operations.ts exists");
  const content = fs.readFileSync(OPERATIONS_PATH, "utf8");

  const requiredOps = [
    "image.generate",
    "image.edit",
    "image.multi_edit",
    "image.upscale",
    "image.background_remove",
    "video.quote",
    "video.queue",
    "video.retrieve",
    "audio.quote",
    "audio.queue",
    "audio.retrieve",
    "audio.tts",
  ];

  for (const op of requiredOps) {
    assert(content.includes(`'${op}'`), `VENICE_MEDIA_OPERATIONS includes '${op}'`);
  }
}

function verifyPayloadBuilders() {
  assert(fs.existsSync(BUILDERS_PATH), "venice-media-contract/payload-builders.ts exists");
  const content = fs.readFileSync(BUILDERS_PATH, "utf8");

  // Verify EditImageRequest uses canonical model, not modelId
  assert(
    content.includes("buildCanonicalImageEditPayload") &&
    content.includes("model,") &&
    !content.includes("modelId: req.modelId"),
    "buildCanonicalImageEditPayload uses canonical 'model' parameter",
  );

  // Verify MultiEditImageRequest uses modelId
  assert(
    content.includes("buildCanonicalImageMultiEditPayload") &&
    content.includes("modelId,"),
    "buildCanonicalImageMultiEditPayload uses 'modelId' per upstream schema",
  );

  // Verify Upscale does not accept model
  assert(
    content.includes("buildCanonicalImageUpscalePayload") &&
    !content.includes("model:"),
    "buildCanonicalImageUpscalePayload does not emit unsupported 'model'",
  );

  // Verify Background Remove does not accept model
  assert(
    content.includes("buildCanonicalBackgroundRemovePayload") &&
    !content.includes("model:"),
    "buildCanonicalBackgroundRemovePayload does not emit unsupported 'model'",
  );
}

function verifyBackgroundTaskHygiene() {
  assert(fs.existsSync(BACKGROUND_TASK_PATH), "src/types/background-task.ts exists");
  const content = fs.readFileSync(BACKGROUND_TASK_PATH, "utf8");

  // Verify updatedAt is preserved and not overwritten with Date.now()
  assert(
    content.includes("updatedAt: task.updatedAt"),
    "sanitizeBackgroundTask preserves task.updatedAt and does not mutate timestamps",
  );

  // Verify pending_finalize status is present
  assert(
    content.includes("'pending_finalize'"),
    "BackgroundTaskStatus includes 'pending_finalize' for crash recovery",
  );

  // Verify queueDownloadUrl is not in PERSISTED_METADATA_STRING_LIMITS
  assert(
    !content.includes("queueDownloadUrl: 4096"),
    "PERSISTED_METADATA_STRING_LIMITS does not store raw reusable signed URLs",
  );
}

function verifyCapabilityHeuristics() {
  assert(fs.existsSync(CONSTANTS_PATH), "src/constants/venice.ts exists");
  const content = fs.readFileSync(CONSTANTS_PATH, "utf8");

  // Verify EDIT_CAPABLE_PATTERNS does not contain broad heuristics like \bflux\b or \bsdxl\b
  assert(
    !content.includes("/\\bflux\\b/i") && !content.includes("/\\bsdxl\\b/i"),
    "EDIT_CAPABLE_PATTERNS does not use broad flux/sdxl keywords for inpaint detection",
  );
}

// P3-001: runtime model metadata typing must track the refreshed Swagger.
// `ModelResponse.discount_to_user` and the style-reference capability fields
// (`model_spec.supportsStyleReferences`, `constraints.maxStyleReferences`,
// `constraints.supportsStyleReferenceStrength`) are optional, additive, and
// fail closed when absent. This drift check keeps the TypeScript surface and
// the capability gate honest without hard-coding model IDs.
function verifyModelMetadataContract() {
  const TYPES_PATH = path.join(REPO_ROOT, "src", "types", "venice.ts");
  const CAPABILITIES_PATH = path.join(REPO_ROOT, "src", "shared", "modelCapabilities.ts");
  const swagger = fs.readFileSync(SWAGGER_PATH, "utf8");
  const types = fs.readFileSync(TYPES_PATH, "utf8");

  for (const field of [
    "discount_to_user:",
    "supportsStyleReferences:",
    "maxStyleReferences:",
    "supportsStyleReferenceStrength:",
  ]) {
    assert(swagger.includes(field), `Swagger declares ${field.replace(":", "")}`);
  }
  assert(types.includes("discount_to_user?: number"), "VeniceModel declares optional discount_to_user (P3-001)");
  assert(types.includes("supportsStyleReferences?: boolean"), "VeniceModel.model_spec declares optional supportsStyleReferences");
  assert(types.includes("maxStyleReferences?: number"), "ImageConstraints declares optional maxStyleReferences");
  assert(types.includes("supportsStyleReferenceStrength?: boolean"), "ImageConstraints declares optional supportsStyleReferenceStrength");
  assert(
    fs.existsSync(CAPABILITIES_PATH) &&
      /supportsFunctionCalling/ .test(fs.readFileSync(CAPABILITIES_PATH, "utf8")),
    "shared modelCapabilities gate references supportsFunctionCalling (P1-005)",
  );
}

function main() {
  console.log("--- Starting Venice Forge Contract Drift Verification ---");
  verifySwagger();
  verifyValidationEndpoints();
  verifyOperations();
  verifyPayloadBuilders();
  verifyBackgroundTaskHygiene();
  verifyCapabilityHeuristics();
  verifyModelMetadataContract();

  if (failureCount > 0) {
    console.error(`\n[DRIFT-SUMMARY] FAILED with ${failureCount} drift assertion(s).`);
    process.exit(1);
  } else {
    console.log("\n[DRIFT-SUMMARY] PASSED: All contract drift verifications succeeded.");
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
