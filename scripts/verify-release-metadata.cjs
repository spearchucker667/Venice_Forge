#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function verifyReleaseMetadata(rootDir) {
  const failures = [];
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const version = String(pkg.version ?? "");
  const agents = fs.readFileSync(path.join(rootDir, "AGENTS.md"), "utf8");
  const readme = fs.readFileSync(path.join(rootDir, "README.md"), "utf8");
  const about = fs.readFileSync(path.join(rootDir, "docs/ABOUT.md"), "utf8");
  const legal = fs.readFileSync(path.join(rootDir, "LEGAL.md"), "utf8");
  const aboutPanel = fs.readFileSync(path.join(rootDir, "src/components/settings/AboutPanel.tsx"), "utf8");

  if (!version) failures.push("package.json must declare a product version.");
  if (!agents.includes(`**Version:** ${version}`)) failures.push("AGENTS.md version must match package.json.");
  const badgeVersion = version.replace(/-/g, "--");
  if (!readme.includes(`release-v${badgeVersion}-`)) failures.push("README release badge must match package.json.");
  if (version.includes("-") && !/currently a .*beta/i.test(about)) failures.push("Prerelease ABOUT.md must identify the beta status.");
  if (/fully stabilized/i.test(about)) failures.push("ABOUT.md must not claim the beta is fully stabilized.");
  if (/currently v\d+\.\d+/i.test(legal)) failures.push("LEGAL.md must source release version from package.json, not a stale literal.");
  if (!aboutPanel.includes('from "../../../package.json"')) failures.push("In-app About must consume package.json version metadata.");
  return failures;
}

function main() {
  const failures = verifyReleaseMetadata(process.cwd());
  if (failures.length) {
    console.error("[verify:release-metadata] FAIL");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
  console.log("[verify:release-metadata] OK");
}

module.exports = { verifyReleaseMetadata };
if (require.main === module) main();
