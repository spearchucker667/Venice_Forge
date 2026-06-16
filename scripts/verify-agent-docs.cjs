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

function compileGitignorePattern(rawPattern) {
  const pattern = rawPattern.trim();
  if (!pattern || pattern.startsWith('#')) return null;

  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const anchored = body.startsWith('/');
  const cleanBody = anchored ? body.slice(1) : body;
  const dirOnly = cleanBody.endsWith('/');
  const glob = dirOnly ? cleanBody.slice(0, -1) : cleanBody;

  if (!glob) return null;

  const regexBody = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLESTAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLESTAR::/g, '.*')
    .replace(/\?/g, '[^/]')
    .replace(/\{([^}]+)\}/g, (_, group) => `(${group.split(',').join('|')})`);

  const regex = new RegExp(`^${anchored ? '' : '(?:.*/)??'}${regexBody}${dirOnly ? '(?:/|$)' : '$'}`);

  return { regex, negated, dirOnly };
}

function loadGitignoreMatcher(rootDir) {
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return () => false;
  const patterns = fs
    .readFileSync(gitignorePath, 'utf8')
    .split(/\r?\n/)
    .map(compileGitignorePattern)
    .filter(Boolean);

  return absolutePath => {
    const relative = path.relative(rootDir, absolutePath).split(path.sep).join('/');
    if (!relative || relative.startsWith('..')) return false;
    let ignored = false;
    for (const { regex, negated } of patterns) {
      if (regex.test(relative)) ignored = !negated;
    }
    return ignored;
  };
}

function verifyAgentDocs(repoRoot) {
  const errorSet = new Set();
  const isIgnored = loadGitignoreMatcher(repoRoot);
  let agentsValidation = null;
  let copilotValidation = null;

  for (const doc of DOCS) {
    const fullPath = path.resolve(repoRoot, doc);
    if (!fs.existsSync(fullPath)) {
      if (THIN_POINTERS.includes(doc)) continue;
      errorSet.add(`ERROR: ${doc} does not exist.`);
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
      errorSet.add(`ERROR: ${doc} does not contain the required string 'docs/summary_of_work.md'.`);
    }

    // No references to absent docs/TODO.md or root CHANGELOG.md
    if (content.includes('docs/TODO.md')) {
      errorSet.add(`ERROR: ${doc} references absent docs/TODO.md.`);
    }
    // Check for root CHANGELOG.md (e.g. `CHANGELOG.md` not preceded by `docs/audits/`)
    if (/(?<!docs\/audits\/)CHANGELOG\.md/.test(content)) {
      errorSet.add(`ERROR: ${doc} references root CHANGELOG.md.`);
    }

    // Extract all apparent local markdown paths
    const mdPaths = [...content.matchAll(/(?:`|\]\()([^`)]+\.md)(?:`|\))/g)].map(m => m[1]);
    for (let mdPath of mdPaths) {
      if (mdPath.startsWith('http')) continue;
      // Strip anchors
      mdPath = mdPath.split('#')[0];
      const targetPath = path.resolve(repoRoot, mdPath);
      if (isIgnored(targetPath)) continue;
      if (!fs.existsSync(targetPath)) {
        errorSet.add(`ERROR: ${doc} references missing file ${mdPath}.`);
      }
    }
  }

  // Thin pointer checks
  for (const thinDoc of THIN_POINTERS) {
    const fullPath = path.resolve(repoRoot, thinDoc);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.length > 2000 || !content.includes('AGENTS.md')) {
        errorSet.add(`ERROR: ${thinDoc} must be a thin pointer to AGENTS.md (too long or missing reference).`);
      }
    }
  }

  // Validation order parity
  if (agentsValidation && copilotValidation && agentsValidation !== copilotValidation) {
    // Try to clean up spaces for comparison
    const clean1 = agentsValidation.replace(/\s+/g, ' ').trim();
    const clean2 = copilotValidation.replace(/\s+/g, ' ').trim();
    if (clean1 !== clean2) {
      errorSet.add('ERROR: AGENTS.md and .github/copilot-instructions.md have diverging validation command lists.');
    }
  }

  // COPILOT_INSTRUCTIONS-specific checks (AUDIT-008 / AUDIT-009)
  const copilotPath = path.resolve(repoRoot, '.github/copilot-instructions.md');
  if (fs.existsSync(copilotPath)) {
    const copilot = fs.readFileSync(copilotPath, 'utf8');
    if (/generated-image\s+Library/i.test(copilot)) {
      errorSet.add('ERROR: .github/copilot-instructions.md references stale "generated-image Library"; use "Media Studio".');
    }
    if (/\bbatch\s+prompting\b/i.test(copilot)) {
      errorSet.add('ERROR: .github/copilot-instructions.md references stale "batch prompting"; use current workflow/media capabilities.');
    }
    if (/\(\d+\s+stores\b/i.test(copilot)) {
      errorSet.add('ERROR: .github/copilot-instructions.md hardcodes a numeric IndexedDB store count; reference STORE_NAMES/ENCRYPTED_STORES instead.');
    }
    const hasAllGroundTruth = STORAGE_GROUND_TRUTH.every(p => copilot.includes(p));
    if (!hasAllGroundTruth) {
      errorSet.add('ERROR: .github/copilot-instructions.md storage section must reference src/constants/venice.ts, src/services/storageService.ts, and src/services/dbMigrations.ts as ground truth.');
    }
  }

  const errors = Array.from(errorSet);
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
