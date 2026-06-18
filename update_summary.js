const fs = require('fs');
const content = fs.readFileSync('docs/summary_of_work.md', 'utf8');

const sessionEntry = `- **2026-06-18 performance stress test repair (current session):**
  - Investigated user report: "app froze when selecting different menues for a speed stress test".
  - Identified massive DOM reconciliation overhead in \`src/components/layout/sidebar.tsx\` during rapid tab switches, caused by rendering all conversation history nodes when the search input was empty.
  - Sliced the default (empty query) conversation mapping to \`MAX_CONVERSATION_SEARCH_RESULTS\` (200) instead of the full unbounded array, bringing rendering latency within UI budget and preventing the UI thread freeze.
  - Verified stability via the full test matrix and lint checks.

`;

const parts = content.split('### Latest Session Summary\n');
if (parts.length > 1) {
  const newContent = parts[0] + '### Latest Session Summary\n' + sessionEntry + parts[1];
  fs.writeFileSync('docs/summary_of_work.md', newContent);
  console.log('Summary updated successfully.');
} else {
  console.error('Could not find Latest Session Summary section.');
}
