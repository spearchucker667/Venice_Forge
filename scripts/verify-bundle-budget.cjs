const fs = require('fs');
const path = require('path');

const DIST_ASSETS = path.join(__dirname, '..', 'dist', 'assets');

if (!fs.existsSync(DIST_ASSETS)) {
  console.log('[bundle-budget] dist/assets not found; skipping web bundle budget check (no web build output present in this job).');
  process.exit(0);
}

const files = fs.readdirSync(DIST_ASSETS);

const budgets = [
  { pattern: /^index-.*\.js$/, limitKB: 600, name: 'Main App Bundle' },
  { pattern: /^vendor-.*\.js$/, limitKB: 900, name: 'Vendor Chunks' },
  { pattern: /^pdf\.worker\.min-.*\.m?js$/, limitKB: 1500, name: 'PDF Worker' },
  { pattern: /^.*\.css$/, limitKB: 200, name: 'CSS Styles' },
];

let failed = false;

for (const file of files) {
  const filePath = path.join(DIST_ASSETS, file);
  const stats = fs.statSync(filePath);
  const sizeKB = stats.size / 1024;

  let matched = false;
  for (const budget of budgets) {
    if (budget.pattern.test(file)) {
      matched = true;
      if (sizeKB > budget.limitKB) {
        console.error(`❌ [BUDGET EXCEEDED] ${budget.name}: ${file} is ${sizeKB.toFixed(2)} KB (Limit: ${budget.limitKB} KB)`);
        failed = true;
      } else {
        console.log(`✅ [BUDGET OK] ${budget.name}: ${file} is ${sizeKB.toFixed(2)} KB (Limit: ${budget.limitKB} KB)`);
      }
    }
  }

  // Generic fallback check for unexpected large chunks
  if (!matched && file.endsWith('.js') && sizeKB > 300) {
    console.error(`❌ [BUDGET EXCEEDED] Unknown chunk: ${file} is ${sizeKB.toFixed(2)} KB (Limit: 300 KB)`);
    failed = true;
  }
}

if (failed) {
  console.error('\nBundle budget verification failed.');
  process.exit(1);
} else {
  console.log('\nAll chunks are within budget.');
}
