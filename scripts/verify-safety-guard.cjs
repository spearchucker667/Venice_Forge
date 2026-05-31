const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

const enforcementFiles = [
  'src/services/veniceClient.ts',
  'electron/ipc/handlers.ts',
  'server.ts'
];

let failed = false;

function checkGuardImportedAndCalled(file, minCalls = 2) {
  const filePath = path.join(repoRoot, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing enforcement file: ${file}`);
    failed = true;
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  // Count occurrences to ensure the guard is called in multiple handlers, not just one.
  const guardCalls = (content.match(/assessChildExploitationSafety\s*\(/g) || []).length;
  const recordCalls = (content.match(/recordDecision\s*\(/g) || []).length;
  if (guardCalls < minCalls) {
    console.error(`❌ File ${file} calls assessChildExploitationSafety only ${guardCalls} time(s); expected at least ${minCalls}`);
    failed = true;
  } else {
    console.log(`✅ File ${file} calls assessChildExploitationSafety (${guardCalls} times)`);
  }
  if (recordCalls < minCalls) {
    console.error(`❌ File ${file} calls recordDecision only ${recordCalls} time(s); expected at least ${minCalls}`);
    failed = true;
  } else {
    console.log(`✅ File ${file} calls recordDecision (${recordCalls} times)`);
  }
}

enforcementFiles.forEach((file) => {
  // server.ts has only one real call site (the middleware) plus the import,
  // so we use a lower threshold to avoid counting the import statement.
  const minCalls = file.includes('server.ts') ? 1 : 2;
  checkGuardImportedAndCalled(file, minCalls);
});

function checkNoRawPromptLogging(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!['node_modules', 'dist', 'dist-electron', 'release', '.git', 'scripts'].includes(file)) {
        checkNoRawPromptLogging(fullPath);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
      if (file.includes('childExploitationGuard') || file.includes('verify-safety-guard')) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (/console\.(log|warn|error)[^;]*\bprompt\b/.test(content) || /\b(blockedPrompt|rawPrompt|matchedTerm|unsafePrompt)\b/.test(content)) {
        console.error(`❌ File ${fullPath} contains a pattern that looks like raw prompt logging`);
        failed = true;
      }
      if (/disable.*safety|bypass.*guard|setContentGuardBypass|DEV_DISABLE|VENICE_FORGE_DEV_DISABLE_SAFETY_GUARD/.test(content)) {
        console.error(`❌ File ${fullPath} contains a pattern that looks like a safety bypass toggle`);
        failed = true;
      }
    }
  }
}

checkNoRawPromptLogging(repoRoot);

if (failed) {
  console.error('\n❌ Safety guard verification failed.');
  process.exit(1);
} else {
  console.log('\n✅ Safety guard verification passed.');
  process.exit(0);
}
