const fs = require('fs');
const path = require('path');

const DOCS = [
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  'AGENTS.md',
  '.cursorrules',
  '.windsurfrules'
];

const THIN_POINTERS = ['CLAUDE.md', 'GEMINI.md', '.cursorrules', '.windsurfrules'];

const VALIDATION_REGEX = /npm run lint:eslint[\s\S]*?npm run build/m;

const STORAGE_GROUND_TRUTH = [
  'src/constants/venice.ts',
  'src/services/storageService.ts',
  'src/services/dbMigrations.ts',
];

function verifyAgentDocs(repoRoot) {
  const errors = [];
  let agentsValidation = null;
  let copilotValidation = null;

  for (const doc of DOCS) {
    const fullPath = path.resolve(repoRoot, doc);
    if (!fs.existsSync(fullPath)) {
      if (THIN_POINTERS.includes(doc)) continue;
      errors.push(`ERROR: ${doc} does not exist.`);
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    if (doc === 'AGENTS.md') {
      const match = content.match(VALIDATION_REGEX);
      if (match) agentsValidation = match[0];
    } else if (doc === '.github/copilot-instructions.md') {
      const match = content.match(VALIDATION_REGEX);
      if (match) copilotValidation = match[0];
    }

    if (!content.includes('docs/summary_of_work.md')) {
      errors.push(`ERROR: ${doc} does not contain the required string 'docs/summary_of_work.md'.`);
    }

    // No references to absent docs/TODO.md or root CHANGELOG.md
    if (content.includes('docs/TODO.md')) {
      errors.push(`ERROR: ${doc} references absent docs/TODO.md.`);
    }
    // Check for root CHANGELOG.md (e.g. `CHANGELOG.md` not preceded by `docs/audits/`)
    if (/(?<!docs\/audits\/)CHANGELOG\.md/.test(content)) {
      errors.push(`ERROR: ${doc} references root CHANGELOG.md.`);
    }

    // Extract all apparent local markdown paths
    const mdPaths = [...content.matchAll(/(?:`|\]\()([^`)]+\.md)(?:`|\))/g)].map(m => m[1]);
    for (let mdPath of mdPaths) {
      if (mdPath.startsWith('http')) continue;
      // Strip anchors
      mdPath = mdPath.split('#')[0];
      const targetPath = path.resolve(repoRoot, mdPath);
      if (!fs.existsSync(targetPath)) {
        errors.push(`ERROR: ${doc} references missing file ${mdPath}.`);
      }
    }
  }

  // Thin pointer checks
  for (const thinDoc of THIN_POINTERS) {
    const fullPath = path.resolve(repoRoot, thinDoc);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.length > 2000 || !content.includes('AGENTS.md')) {
        errors.push(`ERROR: ${thinDoc} must be a thin pointer to AGENTS.md (too long or missing reference).`);
      }
    }
  }

  // Validation order parity
  if (agentsValidation && copilotValidation && agentsValidation !== copilotValidation) {
    // Try to clean up spaces for comparison
    const clean1 = agentsValidation.replace(/\s+/g, ' ').trim();
    const clean2 = copilotValidation.replace(/\s+/g, ' ').trim();
    if (clean1 !== clean2) {
      errors.push('ERROR: AGENTS.md and .github/copilot-instructions.md have diverging validation command lists.');
    }
  }

  // COPILOT_INSTRUCTIONS-specific checks (AUDIT-008 / AUDIT-009)
  const copilotPath = path.resolve(repoRoot, '.github/copilot-instructions.md');
  if (fs.existsSync(copilotPath)) {
    const copilot = fs.readFileSync(copilotPath, 'utf8');
    if (/generated-image\s+Library/i.test(copilot)) {
      errors.push('ERROR: .github/copilot-instructions.md references stale "generated-image Library"; use "Media Studio".');
    }
    if (/\bbatch\s+prompting\b/i.test(copilot)) {
      errors.push('ERROR: .github/copilot-instructions.md references stale "batch prompting"; use current workflow/media capabilities.');
    }
    if (/\(\d+\s+stores\b/i.test(copilot)) {
      errors.push('ERROR: .github/copilot-instructions.md hardcodes a numeric IndexedDB store count; reference STORE_NAMES/ENCRYPTED_STORES instead.');
    }
    const hasAllGroundTruth = STORAGE_GROUND_TRUTH.every(p => copilot.includes(p));
    if (!hasAllGroundTruth) {
      errors.push('ERROR: .github/copilot-instructions.md storage section must reference src/constants/venice.ts, src/services/storageService.ts, and src/services/dbMigrations.ts as ground truth.');
    }
  }

  return { passed: errors.length === 0, errors };
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const { passed, errors } = verifyAgentDocs(repoRoot);
  for (const err of errors) {
    console.error(err);
  }
  if (!passed) {
    console.error('Agent doc verification failed.');
    process.exit(1);
  }
  console.log('Agent doc verification passed.');
}

module.exports = { verifyAgentDocs, DOCS, THIN_POINTERS };

if (require.main === module) {
  main();
}
