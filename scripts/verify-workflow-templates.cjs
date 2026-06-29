const { execSync } = require("child_process");

console.log("Running VERIFY-049: Phase 2G Workflow Templates...\n");

try {
  // 1. Run core tests for workflow templates
  console.log("1. Running core tests for Workflow Templates...");
  execSync("npm run test:workflow:core", { stdio: "inherit" });

  // 2. Run ui tests for workflow templates
  console.log("\n2. Running ui tests for Workflow Templates...");
  execSync("npm run test:workflow:ui", { stdio: "inherit" });

  console.log("\n✅ VERIFY-049: Workflow Templates validation passed.");
  process.exit(0);
} catch {
  console.error("\n❌ VERIFY-049: Workflow Templates validation failed.");
  process.exit(1);
}
