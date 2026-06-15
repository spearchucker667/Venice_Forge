const fs = require('fs');
const path = require('path');

const docs = [
  'CLAUDE.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  'AGENTS.md'
];

let failed = false;

for (const doc of docs) {
  const fullPath = path.resolve(__dirname, '..', doc);
  if (!fs.existsSync(fullPath)) {
    console.error(`ERROR: ${doc} does not exist.`);
    failed = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  if (!content.includes('docs/summary_of_work.md')) {
    console.error(`ERROR: ${doc} does not contain the required string 'docs/summary_of_work.md'.`);
    failed = true;
  }
}

if (failed) {
  console.error('Agent doc verification failed.');
  process.exit(1);
} else {
  console.log('Agent doc verification passed.');
}
