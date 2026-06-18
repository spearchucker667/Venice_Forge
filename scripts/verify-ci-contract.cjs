#!/usr/bin/env node

/**
 * @fileoverview Verifies that the CI workflow (.github/workflows/ci.yml)
 * and the package.json scripts cover all required contract verification gates.
 */

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const ciYamlPath = path.join(root, '.github/workflows/ci.yml');
const codeqlYamlPath = path.join(root, '.github/workflows/codeql.yml');
const dependencyReviewYamlPath = path.join(root, '.github/workflows/dependency-review.yml');

if (!fs.existsSync(pkgPath) || !fs.existsSync(ciYamlPath)) {
  console.error("Error: Missing package.json or ci.yml");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const ciYaml = fs.readFileSync(ciYamlPath, 'utf8');
const codeqlYaml = fs.existsSync(codeqlYamlPath) ? fs.readFileSync(codeqlYamlPath, 'utf8') : '';
const dependencyReviewYaml = fs.existsSync(dependencyReviewYamlPath) ? fs.readFileSync(dependencyReviewYamlPath, 'utf8') : '';

// The required verification gates that must be run in CI
const requiredGates = [
  'verify:bundle-budget',
  'verify:safety-guard',
  'verify:markdown-links',
  'verify:theme-tokens',
  'verify:model-aware-recipes',
  'verify:media-studio-power-tools',
  'verify:status-diagnostics',
  'verify:prompt-library',
  'verify:scene-composer',
  'verify:rp-studio-polish',
  'verify:workflow-templates',
  'verify:storage-privacy',
  'verify:storage-policy',
  'verify:document-ingestion',
  'verify:research-workspace',
  'verify:research-browser',
  'verify:network-boundaries',
  'verify:venice-api-docs',
  'verify:release-packaging-hardening',
  'verify:ci-contract',
  'verify:agent-docs',
  'verify:image-policy',
  'verify:work-orders',
  'verify:no-native-dialogs',
  'verify:web-contents-view'
];

console.log("Checking CI contract...");

// 1. Verify that package.json's verify:contracts contains all required gates
const verifyContractsScript = pkg.scripts['verify:contracts'];
if (!verifyContractsScript) {
  console.error("❌ package.json is missing 'verify:contracts' script");
  process.exit(1);
}

const missingInScript = [];
for (const gate of requiredGates) {
  if (!verifyContractsScript.includes(`npm run ${gate}`)) {
    missingInScript.push(gate);
  }
}

if (missingInScript.length > 0) {
  console.error("❌ package.json verify:contracts script is missing required gates:");
  missingInScript.forEach(g => console.error(`  - ${g}`));
  process.exit(1);
}
console.log("✓ package.json verify:contracts script contains all required gates");

// 2. Verify that ci.yml runs the aggregate verify:contracts script or the ci script
const runsVerifyContracts = /run:\s*npm\s+run\s+verify:contracts\b/i.test(ciYaml);
const runsCi = /run:\s*npm\s+run\s+ci\b/i.test(ciYaml);

let runsAggregate = false;
if (runsVerifyContracts) {
  runsAggregate = true;
  console.log("✓ ci.yml runs aggregate verify:contracts");
} else if (runsCi) {
  const ciScript = pkg.scripts['ci'] || '';
  if (ciScript.includes('npm run verify:contracts')) {
    runsAggregate = true;
    console.log("✓ ci.yml runs aggregate 'ci' script which invokes verify:contracts");
  }
}

if (runsAggregate) {
  // Aggregate is satisfied, no need to check individual gates
} else {
  // Fallback: check if it runs all individual gates
  const missingInCi = [];
  for (const gate of requiredGates) {
    const regex = new RegExp(`run:\\s*npm\\s+run\\s+${gate}`, 'i');
    if (!regex.test(ciYaml)) {
      missingInCi.push(gate);
    }
  }

  if (missingInCi.length > 0) {
    console.error("❌ CI workflow does not cover all required contract gates!");
    console.error("Missing in ci.yml:");
    missingInCi.forEach(g => console.error(`  - ${g}`));
    console.error("Please add 'npm run verify:contracts' to .github/workflows/ci.yml");
    process.exit(1);
  }
  console.log("✓ ci.yml covers all individual gates");
}

// 3. Verify Vitest coverage configuration
const vitestConfigPath = path.join(root, 'vitest.config.ts');
if (fs.existsSync(vitestConfigPath)) {
  const vitestConfig = fs.readFileSync(vitestConfigPath, 'utf8');
  if (vitestConfig.includes('global:') && vitestConfig.includes('thresholds:')) {
    const coverageBlock = vitestConfig.match(/coverage:\s*\{[\s\S]*?thresholds:\s*\{([\s\S]*?)\}/);
    if (coverageBlock && coverageBlock[1].includes('global:')) {
      console.error("❌ vitest.config.ts: Coverage thresholds must not be nested under 'global' for Vitest 4 compatibility.");
      process.exit(1);
    }
  }
  console.log("✓ vitest.config.ts coverage schema is valid");
}

// 4. Verify tracked security automation exists. SECURITY.md documents CodeQL
// as a repository control; keep a tracked workflow present so the control is
// reviewable with the source tree.
if (!codeqlYaml) {
  console.error("❌ Missing .github/workflows/codeql.yml");
  process.exit(1);
}
if (!/github\/codeql-action\/init@[0-9a-f]{40}/.test(codeqlYaml) || !/github\/codeql-action\/analyze@[0-9a-f]{40}/.test(codeqlYaml)) {
  console.error("❌ codeql.yml must run pinned github/codeql-action init/analyze actions");
  process.exit(1);
}
console.log("✓ tracked CodeQL workflow exists");

if (!dependencyReviewYaml) {
  console.error("❌ Missing .github/workflows/dependency-review.yml");
  process.exit(1);
}
if (!/actions\/dependency-review-action@[0-9a-f]{40}/.test(dependencyReviewYaml) || !/fail-on-severity:\s*moderate/.test(dependencyReviewYaml)) {
  console.error("❌ dependency-review.yml must run a pinned dependency-review-action at moderate severity");
  process.exit(1);
}
console.log("✓ tracked dependency-review workflow exists");

// 5. Verify Windows smoke job
if (!ciYaml.includes('electron-smoke-windows:')) {
  console.error("❌ ci.yml is missing 'electron-smoke-windows' job");
  process.exit(1);
}
if (!ciYaml.includes('npm run dist:portable')) {
  console.error("❌ ci.yml 'electron-smoke-windows' must package using dist:portable");
  process.exit(1);
}
if (!ciYaml.includes('RUN_ELECTRON_SMOKE: \'true\'')) {
  console.error("❌ ci.yml 'electron-smoke-windows' must run with RUN_ELECTRON_SMOKE: 'true'");
  process.exit(1);
}
console.log("✓ Windows packaged smoke job exists");

console.log("CI contract check: PASS");
process.exit(0);
