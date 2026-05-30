const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

const enforcementFiles = [
  'src/services/veniceClient.ts',
  'electron/ipc/handlers.ts',
  'server.ts'
];

let failed = false;

function checkGuardImportedAndCalled(file) {
  const filePath = path.join(repoRoot, file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Missing enforcement file: ${file}`);
    failed = true;
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.includes('assessChildExploitationSafety')) {
    console.error(`❌ File ${file} does not call assessChildExploitationSafety`);
    failed = true;
  } else {
    console.log(`✅ File ${file} calls assessChildExploitationSafety`);
  }
  if (!content.includes('recordDecision')) {
    console.error(`❌ File ${file} does not call recordDecision`);
    failed = true;
  } else {
    console.log(`✅ File ${file} calls recordDecision`);
  }
}

enforcementFiles.forEach(checkGuardImportedAndCalled);

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
