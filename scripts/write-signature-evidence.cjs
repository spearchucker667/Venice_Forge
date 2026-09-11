#!/usr/bin/env node
/**
 * write-signature-evidence.cjs — write a per-platform signature evidence JSON
 * file for the release workflow. Called by each platform build job after
 * signature verification.
 *
 * Usage:
 *   node scripts/write-signature-evidence.cjs --platform macos --tag v1.2.3 \
 *     --codesign-output codesign.txt --stapler-output stapler.txt
 *   node scripts/write-signature-evidence.cjs --platform windows --tag v1.2.3 \
 *     --authenticode-status Valid --authenticode-output authenticode.txt
 *   node scripts/write-signature-evidence.cjs --platform linux --tag v1.2.3
 *   node scripts/write-signature-evidence.cjs --platform macos --tag v1.2.3 --unsigned
 *
 * Evidence never records secrets. Captured verifier text is truncated.
 */
const fs = require("node:fs");
const path = require("node:path");

const ALLOWED_PLATFORMS = new Set(["macos", "windows", "linux"]);
const MAX_SUMMARY_CHARS = 2000;

function readArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function parseArgs(args) {
  const platform = readArg(args, "--platform");
  const tag = readArg(args, "--tag");
  const unsigned = args.includes("--unsigned");
  return {
    platform,
    tag,
    unsigned,
    codesignOutput: readArg(args, "--codesign-output"),
    staplerOutput: readArg(args, "--stapler-output"),
    authenticodeStatus: readArg(args, "--authenticode-status"),
    authenticodeOutput: readArg(args, "--authenticode-output"),
  };
}

function readBounded(filePath) {
  if (!filePath) return "";
  const text = fs.readFileSync(filePath, "utf8");
  return text.slice(0, MAX_SUMMARY_CHARS).trim();
}

function codesignVerified(summary) {
  return /valid on disk/i.test(summary) || /satisfies its designated requirement/i.test(summary);
}

function staplerValidated(summary) {
  return /the validate action worked/i.test(summary) || /ticket is valid/i.test(summary);
}

function buildEvidence(platform, tag, unsigned, verification = {}) {
  if (!ALLOWED_PLATFORMS.has(platform)) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const timestamp = new Date().toISOString();

  if (platform === "macos") {
    if (unsigned) {
      return {
        platform: "macos",
        status: "unsigned-exception",
        signed: false,
        notarized: false,
        note: "RELEASE_ALLOW_UNSIGNED=true; deliberately unsigned draft",
        tag,
        timestamp,
      };
    }
    const codesignSummary = String(verification.codesignSummary ?? "");
    const staplerSummary = String(verification.staplerSummary ?? "");
    if (!codesignVerified(codesignSummary) || !staplerValidated(staplerSummary)) {
      throw new Error("macOS evidence requires captured codesign --verify and stapler validate output.");
    }
    return {
      platform: "macos",
      status: "signed-and-notarized",
      signed: true,
      notarized: true,
      codesign: { verified: true, summary: codesignSummary },
      stapler: { validated: true, summary: staplerSummary },
      tag,
      timestamp,
    };
  }

  if (platform === "windows") {
    if (unsigned) {
      return {
        platform: "windows",
        status: "unsigned-exception",
        signed: false,
        signatureStatus: "N/A",
        note: "RELEASE_ALLOW_UNSIGNED=true; deliberately unsigned draft",
        tag,
        timestamp,
      };
    }
    const signatureStatus = String(verification.authenticodeStatus ?? "");
    if (signatureStatus !== "Valid") {
      throw new Error("Windows evidence requires Authenticode Status=Valid from Get-AuthenticodeSignature.");
    }
    return {
      platform: "windows",
      status: "signed",
      signed: true,
      signatureStatus: "Valid",
      ...(verification.authenticodeSummary
        ? { authenticode: { summary: String(verification.authenticodeSummary).slice(0, MAX_SUMMARY_CHARS) } }
        : {}),
      tag,
      timestamp,
    };
  }

  return {
    platform: "linux",
    status: "no-code-signing",
    signed: false,
    note: "Linux packages are not code-signed",
    tag,
    timestamp,
  };
}

function main() {
  const parsed = parseArgs(process.argv);
  if (!parsed.platform || !parsed.tag) {
    console.error(
      "Usage: node write-signature-evidence.cjs --platform <macos|windows|linux> --tag <tag> [--unsigned] [--codesign-output file] [--stapler-output file] [--authenticode-status Valid] [--authenticode-output file]",
    );
    process.exit(1);
  }

  const verification = {};
  if (parsed.codesignOutput) verification.codesignSummary = readBounded(parsed.codesignOutput);
  if (parsed.staplerOutput) verification.staplerSummary = readBounded(parsed.staplerOutput);
  if (parsed.authenticodeStatus) verification.authenticodeStatus = parsed.authenticodeStatus;
  if (parsed.authenticodeOutput) verification.authenticodeSummary = readBounded(parsed.authenticodeOutput);

  const evidence = buildEvidence(parsed.platform, parsed.tag, parsed.unsigned, verification);
  fs.mkdirSync("release-evidence", { recursive: true });
  const outPath = path.join("release-evidence", `signatures-${parsed.platform}.json`);
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(`[write-signature-evidence] Wrote ${outPath}`);
}

module.exports = {
  ALLOWED_PLATFORMS,
  parseArgs,
  buildEvidence,
  codesignVerified,
  staplerValidated,
};

if (require.main === module) main();
