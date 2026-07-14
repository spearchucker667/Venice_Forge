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
  'verify:roadmap-current',
  'verify:safety-guard',
  'verify:markdown-links',
  'verify:repo-handoff-hygiene',
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
const staticScript = pkg.scripts['verify:contracts:static'] || '';
const featuresScript = pkg.scripts['verify:contracts:features'] || '';
const releaseScript = pkg.scripts['verify:contracts:release'] || '';
const baseContractsScript = pkg.scripts['verify:contracts'] || '';
// Also include all partitioned sub-scripts so that gates referenced via a
// nested `npm run verify:contracts:features:*` call are found in the corpus.
// This lets Fix 8 (partitioned feature contracts) co-exist with the CI gate
// check without requiring the top-level scripts to inline every gate name.
const allScriptValues = Object.values(pkg.scripts || {}).join(' && ');
const verifyContractsScript = [staticScript, featuresScript, releaseScript, baseContractsScript, allScriptValues].join(' && ');

if (!pkg.scripts['verify:contracts']) {
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

// 6. Verify that every Vitest script that names explicit file or directory
// arguments points to an existing path. This prevents silent narrowing of
// coverage when a test file is renamed or removed.
const vitestRunRegex = /vitest\s+run\b/;
const shellMetaRegex = /^(&&|\|\||;|>|\|)/;

function tokenize(script) {
  const tokens = [];
  const regex = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let match;
  while ((match = regex.exec(script)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

const missingPaths = [];
for (const [name, script] of Object.entries(pkg.scripts || {})) {
  if (!vitestRunRegex.test(script)) continue;

  const parts = script.split(vitestRunRegex);
  const afterRun = parts.slice(2).join("");
  const tokens = tokenize(afterRun);

  for (let i = 0; i < tokens.length; i += 1) {
    const arg = tokens[i];
    if (shellMetaRegex.test(arg)) break;
    if (arg.startsWith("-")) {
      // Skip flag and its value when the flag expects one.
      if (arg === "--exclude" || arg === "--reporter" || arg === "--config" || arg === "--project") {
        i += 1;
      }
      continue;
    }
    // Ignore glob/wildcard patterns; they are intentional path expressions.
    if (/[*?]/.test(arg)) continue;

    const resolved = path.resolve(root, arg);
    if (!fs.existsSync(resolved)) {
      missingPaths.push({ script: name, arg, resolved });
    }
  }
}

if (missingPaths.length > 0) {
  console.error("❌ Some Vitest scripts reference missing paths:");
  for (const { script, arg, resolved } of missingPaths) {
    console.error(`  - ${script}: ${arg} (${resolved})`);
  }
  process.exit(1);
}
console.log("✓ All explicit Vitest paths exist");

// Keep every non-smoke test surface outside the ordinary source segments in an
// explicit contract segment. These directories previously fell through the
// segmented test:ci union even though they contain release and security guards.
const requiredContractTestPaths = [
  'package-scripts.test.ts',
  'tests/backup',
  'tests/csp',
  'tests/electron',
  'tests/rp',
  'tests/safety',
  'tests/storage',
  'tests/theme',
  'scripts/verify-document-ingestion.test.ts',
];
const contractTestScript = pkg.scripts['test:contracts'] || '';
const ciTestScript = pkg.scripts['test:ci'] || '';

if (!ciTestScript.includes('npm run test:contracts')) {
  console.error("❌ package.json test:ci must invoke test:contracts");
  process.exit(1);
}

const omittedContractPaths = requiredContractTestPaths.filter(
  (requiredPath) => !tokenize(contractTestScript).includes(requiredPath),
);
if (omittedContractPaths.length > 0) {
  console.error("❌ package.json test:contracts omits required non-smoke test paths:");
  omittedContractPaths.forEach((requiredPath) => console.error(`  - ${requiredPath}`));
  process.exit(1);
}
console.log("✓ test:ci covers every required non-smoke contract test path");

console.log("CI contract check: PASS");
process.exit(0);
