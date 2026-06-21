const { execSync } = require("child_process");

console.log("Running VERIFY-049: Phase 2G Workflow Templates...\n");

try {
  // 1. Run typecheck
  console.log("1. Running typecheck...");
  execSync("npm run typecheck", { stdio: "inherit" });

  // 2. Run unit tests for workflow templates
  console.log("\n2. Running unit tests for Workflow Templates...");
  execSync(
    "npx vitest run src/types/workflow.test.ts src/services/workflowCompiler.test.ts src/services/workflowRunner.test.ts src/lib/workflow-engine.test.ts src/lib/workflow-validator.test.ts src/lib/workflow-schema.test.ts src/lib/workflow-mutations.test.ts src/stores/workflow-template-store.test.ts src/components/workflows/workflow-node.test.tsx src/components/workflows/WorkflowTemplatesView.test.tsx --fileParallelism=false",
    { stdio: "inherit" }
  );

  console.log("\n✅ VERIFY-049: Workflow Templates validation passed.");
  process.exit(0);
} catch {
  console.error("\n❌ VERIFY-049: Workflow Templates validation failed.");
  process.exit(1);
}
