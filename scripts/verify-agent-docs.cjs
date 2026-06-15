const fs = require('fs');
const path = require('path');

const docs = [
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  'AGENTS.md'
];

let failed = false;

// 1. CLAUDE.md and GEMINI.md thin pointer check
for (const thinDoc of ['CLAUDE.md', 'GEMINI.md']) {
  const fullPath = path.resolve(__dirname, '..', thinDoc);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    if (content.length > 2000 || !content.includes('AGENTS.md')) {
      console.error(`ERROR: ${thinDoc} must be a thin pointer to AGENTS.md (too long or missing reference).`);
      failed = true;
    }
  }
}

// Validation extraction regex
const validationRegex = /npm run lint:eslint[\s\S]*?npm run build/m;
let agentsValidation = null;
let copilotValidation = null;

for (const doc of docs) {
  const fullPath = path.resolve(__dirname, '..', doc);
  if (!fs.existsSync(fullPath)) {
    if (doc === 'CLAUDE.md' || doc === 'GEMINI.md') continue; // Allowed to be missing
    console.error(`ERROR: ${doc} does not exist.`);
    failed = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  
  if (doc === 'AGENTS.md') {
    const match = content.match(validationRegex);
    if (match) agentsValidation = match[0];
  } else if (doc === '.github/copilot-instructions.md') {
    const match = content.match(validationRegex);
    if (match) copilotValidation = match[0];
  }

  if (!content.includes('docs/summary_of_work.md')) {
    console.error(`ERROR: ${doc} does not contain the required string 'docs/summary_of_work.md'.`);
    failed = true;
  }

  // No references to absent docs/TODO.md or root CHANGELOG.md
  if (content.includes('docs/TODO.md')) {
    console.error(`ERROR: ${doc} references absent docs/TODO.md.`);
    failed = true;
  }
  // Check for root CHANGELOG.md (e.g. `CHANGELOG.md` not preceded by `docs/audits/`)
  if (/(?<!docs\/audits\/)CHANGELOG\.md/.test(content)) {
    console.error(`ERROR: ${doc} references root CHANGELOG.md.`);
    failed = true;
  }

  // Extract all apparent local markdown paths
  const mdPaths = [...content.matchAll(/(?:`|\]\()([^`)]+\.md)(?:`|\))/g)].map(m => m[1]);
  for (let mdPath of mdPaths) {
    if (mdPath.startsWith('http')) continue;
    // Strip anchors
    mdPath = mdPath.split('#')[0];
    const targetPath = path.resolve(__dirname, '..', mdPath);
    if (!fs.existsSync(targetPath)) {
      console.error(`ERROR: ${doc} references missing file ${mdPath}.`);
      failed = true;
    }
  }
}

// 4. Validation order parity
if (agentsValidation && copilotValidation && agentsValidation !== copilotValidation) {
  // Try to clean up spaces for comparison
  const clean1 = agentsValidation.replace(/\s+/g, ' ').trim();
  const clean2 = copilotValidation.replace(/\s+/g, ' ').trim();
  if (clean1 !== clean2) {
    console.error(`ERROR: AGENTS.md and .github/copilot-instructions.md have diverging validation command lists.`);
    failed = true;
  }
}

if (failed) {
  console.error('Agent doc verification failed.');
  process.exit(1);
} else {
  console.log('Agent doc verification passed.');
}
