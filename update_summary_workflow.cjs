const fs = require('fs');
const content = fs.readFileSync('docs/summary_of_work.md', 'utf8');

const sessionEntry = `- **2026-06-18 visual workflow editor restoration (current session):**
  - Investigated user report: "workflow tab only allows for add step... when using playground and selecting open in workflow, workflow is not transferred over".
  - Identified that a recent commit accidentally remapped the \`workflows\` tab in \`App.tsx\` to the new \`WorkflowTemplatesViewLazy\` (a linear prompt chain editor) instead of the intended \`WorkflowsViewLazy\` (the ReactFlow visual nodes editor used by the Playground).
  - Restored the \`workflows\` tab mapping to \`WorkflowsView\` in \`App.tsx\`, resolving the missing visual editor and restoring the Playground "Open in Workflow" handoff.
  - Verified stability via the test matrix.

`;

const parts = content.split('### Latest Session Summary\n');
if (parts.length > 1) {
  const newContent = parts[0] + '### Latest Session Summary\n' + sessionEntry + parts[1];
  fs.writeFileSync('docs/summary_of_work.md', newContent);
  console.log('Summary updated successfully.');
} else {
  console.error('Could not find Latest Session Summary section.');
}
