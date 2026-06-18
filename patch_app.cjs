const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Replace the LazyWorkflowTemplatesView with LazyWorkflowsView
code = code.replace(
  "const LazyWorkflowTemplatesView = lazy(() => import('./components/workflows/WorkflowTemplatesView').then((m) => ({ default: m.WorkflowTemplatesView })))",
  "const LazyWorkflowsView = lazy(() => import('./components/workflows/workflows-view').then((m) => ({ default: m.WorkflowsView })))"
);

code = code.replace(
  "function WorkflowTemplatesViewLazy() {\n  return <Suspense fallback={<div className=\"flex items-center justify-center h-full text-[12px] text-text-muted/50\">Loading workflows…</div>}><LazyWorkflowTemplatesView /></Suspense>\n}",
  "function WorkflowsViewLazy() {\n  return <Suspense fallback={<div className=\"flex items-center justify-center h-full text-[12px] text-text-muted/50\">Loading workflows…</div>}><LazyWorkflowsView /></Suspense>\n}"
);

code = code.replace(
  "workflows: WorkflowTemplatesViewLazy,",
  "workflows: WorkflowsViewLazy,"
);

fs.writeFileSync('src/App.tsx', code);
console.log('App.tsx patched');
