#!/usr/bin/env node
/**
 * verify-custom-protocol-privileges.cjs
 *
 * Static audit of `protocol.registerSchemesAsPrivileged` for the
 * render-facing custom schemes (`venice-character-cache`, `venice-tts`,
 * `venice-media`). Asserts:
 *
 *   1. Each renderer-consumed scheme is registered.
 *   2. Each scheme is registered with `corsEnabled: true` so cross-origin
 *      <img>/<video>/<audio>/fetch traffic from the renderer is honored by
 *      Chromium's custom-scheme CORS preflight. Electron defaults
 *      `corsEnabled` to `false`, which breaks <video> playback even when
 *      `stream: true` is set.
 *   3. Audio/video schemes also carry `stream: true` so Chromium will deliver
 *      multipart byte ranges.
 *   4. Image-only schemes (`venice-character-cache`) do NOT add `stream` —
 *      serving ranged/streaming responses for cached avatars would waste
 *      the cache.
 *
 * The audit is the static side of the VERIFY-155 regression coverage.
 * Companion runtime tests live under `electron/utils/customProtocolAccess.test.ts`
 * and `electron/services/generatedMediaStore.test.ts`.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const SCHEME_REQUIREMENTS = Object.freeze({
  "venice-character-cache": {
    description: "character avatar cache",
    expectsStream: false,
  },
  "venice-tts": {
    description: "cached TTS audio",
    expectsStream: true,
  },
  "venice-media": {
    description: "durable generated audio/video blobs",
    expectsStream: true,
  },
});

const REQUIRED_PRIVILEGES = ["secure", "standard", "supportFetchAPI"];

function parseSchemeEntries(blockBody, identifierMap = {}) {
  // Walk the registration block manually so quoted string literals and
  // top-level identifier references survive without a full TS parser. The
  // identifierMap is keyed by identifier (e.g. `GENERATED_MEDIA_SCHEME`) and
  // resolves to the string value extracted from generatedMediaStore.ts.
  const entries = [];
  const stringLiteralRegex =
    /\{\s*scheme:\s*(['"])([^'"]+)\1\s*,\s*privileges:\s*\{([^{}]*)\}\s*,?\s*\}/g;
  const identifierRegex =
    /\{\s*scheme:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*privileges:\s*\{([^{}]*)\}\s*,?\s*\}/g;
  const decodePrivileges = (privilegesBody) => {
    const privileges = {};
    const propertyRegex = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(true|false)/g;
    let propertyMatch;
    while ((propertyMatch = propertyRegex.exec(privilegesBody)) !== null) {
      privileges[propertyMatch[1]] = propertyMatch[2] === "true";
    }
    return privileges;
  };
  let raw;
  while ((raw = stringLiteralRegex.exec(blockBody)) !== null) {
    entries.push({ scheme: raw[2], privileges: decodePrivileges(raw[3]) });
  }
  while ((raw = identifierRegex.exec(blockBody)) !== null) {
    const identifier = raw[1];
    const schemeValue = identifierMap[identifier];
    if (!schemeValue) {
      throw new Error(
        `Audit cannot resolve privileged-scheme identifier "${identifier}". Add it to the identifier map in scripts/verify-custom-protocol-privileges.cjs.`,
      );
    }
    entries.push({ scheme: schemeValue, privileges: decodePrivileges(raw[2]) });
  }
  return entries;
}

function findGeneratedMediaImports(source) {
  const importRegexes = [
    /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*generatedMediaStore[^'"]*['"]\s*;?/g,
    /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*generatedMediaStore['"]\s*;?/g,
  ];
  const identifiers = new Set();
  for (const re of importRegexes) {
    let match;
    while ((match = re.exec(source)) !== null) {
      const inner = match[1];
      inner.split(",").forEach((name) => {
        const trimmed = name.trim();
        if (trimmed) identifiers.add(trimmed);
      });
    }
  }
  return identifiers;
}

function buildIdentifierMap(importIdentifiers, storeSource) {
  // Each imported identifier must resolve to a string literal in
  // generatedMediaStore.ts. Returns map { ImportName -> "scheme-value" }.
  const identifierValues = Object.create(null);
  for (const identifier of importIdentifiers) {
    const assignmentRegex = new RegExp(
      `(?:export\\s+)?(?:const|let|var)\\s+${identifier}\\s*[:=]\\s*['"]([^'"]+)['"]`,
    );
    const match = storeSource.match(assignmentRegex);
    if (match) identifierValues[identifier] = match[1];
  }
  return identifierValues;
}

function audit({ root = ROOT } = {}) {
  const mainPath = path.join(root, "electron", "main.ts");
  const storePath = path.join(root, "electron", "services", "generatedMediaStore.ts");
  const source = fs.readFileSync(mainPath, "utf8");
  const storeSource = fs.readFileSync(storePath, "utf8");
  const generatedSchemeMatch = storeSource.match(/GENERATED_MEDIA_SCHEME\s*[:=]\s*['"]([^'"]+)['"]/);
  const generatedScheme = generatedSchemeMatch
    ? generatedSchemeMatch[1]
    : (() => {
        throw new Error(
          "Unable to determine GENERATED_MEDIA_SCHEME constant from electron/services/generatedMediaStore.ts",
        );
      })();

  const importIdentifiers = findGeneratedMediaImports(source);
  const identifierMap = buildIdentifierMap(importIdentifiers, storeSource);

  const knownSchemes = new Set([...Object.keys(SCHEME_REQUIREMENTS), generatedScheme]);
  const expectedRows = [
    ["venice-character-cache", { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true, stream: false }],
    ["venice-tts", { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true }],
    [generatedScheme, { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true }],
  ];

  const registrationBlock = parseRegistrationBlock(source);
  const entries = parseSchemeEntries(registrationBlock, identifierMap);

  const violations = [];
  for (const [scheme, expected] of expectedRows) {
    const entry = entries.find((e) => e.scheme === scheme);
    if (!entry) {
      violations.push(
        `Missing privileged-scheme registration for ${scheme}. Expected privileges: ${JSON.stringify(expected)}`,
      );
      continue;
    }
    for (const privilege of REQUIRED_PRIVILEGES) {
      if (entry.privileges[privilege] !== true) {
        violations.push(
          `Scheme ${scheme} is missing required privilege ${privilege}=true. Got privileges: ${JSON.stringify(entry.privileges)}`,
        );
      }
    }
    if (entry.privileges.corsEnabled !== true) {
      violations.push(
        `Scheme ${scheme} is missing corsEnabled=true. Chromium will reject cross-origin <img>/<video>/<audio>/fetch requests without corsEnabled. Got privileges: ${JSON.stringify(entry.privileges)}`,
      );
    }
    const expectsStream = SCHEME_REQUIREMENTS[scheme]?.expectsStream;
    if (expectsStream === true && entry.privileges.stream !== true) {
      violations.push(
        `Scheme ${scheme} (audio/video) is missing stream=true. Got privileges: ${JSON.stringify(entry.privileges)}`,
      );
    }
    if (expectsStream === false && entry.privileges.stream === true) {
      violations.push(
        `Scheme ${scheme} is image-only but stream was enabled. Got privileges: ${JSON.stringify(entry.privileges)}`,
      );
    }
  }

  for (const entry of entries) {
    if (!knownSchemes.has(entry.scheme)) {
      violations.push(
        `Unknown scheme ${entry.scheme} is registered via protocol.registerSchemesAsPrivileged. Update verify-custom-protocol-privileges.cjs if this scheme is renderer-consumed.`,
      );
    }
  }

  if (violations.length > 0) {
    const message = [
      "[verify:custom-protocol-privileges] FAIL — privileged-scheme registration is missing required flags:",
      ...violations.map((v) => "  - " + v),
    ].join("\n");
    const error = new Error(message);
    (error).exitCode = 1;
    throw error;
  }
  return "OK — every renderer-consumed custom scheme is registered with secure/standard/supportFetchAPI/corsEnabled and the audio/video schemes carry stream=true.";
}

function parseRegistrationBlock(source) {
  const header = source.match(/protocol\.registerSchemesAsPrivileged\(\[\s*([\s\S]*?)\]\s*\)\s*;/);
  if (!header) {
    throw new Error("protocol.registerSchemesAsPrivileged(...) block not found in electron/main.ts");
  }
  return header[1];
}

if (require.main === module) {
  try {
    const result = audit();
    console.log("[verify:custom-protocol-privileges] " + result);
  } catch (err) {
    if (err && (err).exitCode) {
      console.error(err.message);
      process.exit((err).exitCode);
    }
    throw err;
  }
}

module.exports = { audit };
