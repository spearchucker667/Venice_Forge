/** @fileoverview Improved safety guard verification script.
 *  Checks that all prompt-sending paths in the renderer, IPC, and server
 *  are routed through the conditional local Family Safe Mode pipeline.
 *  Also ensures that no raw prompt text is logged to console or diagnostics.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

// Map of critical enforcement points and the functions/handlers that MUST be guarded.
const enforcementMap = [
  {
    file: 'src/services/veniceClient.ts',
    name: 'Renderer Transport',
    check: (content) => {
      // veniceFetch and veniceStreamChat must both call the guard
      const guardCalls = (content.match(/maybeRunLocalFamilyGuard\s*\(/g) || []).length;
      return guardCalls >= 2;
    },
    message: 'Renderer transport functions must call safety guard'
  },
  {
    file: 'electron/ipc/handlers.ts',
    name: 'Electron IPC Handlers',
    check: (content) => {
      // VERIFY-004 fix: use regex scan instead of brittle string-split so formatting
      // changes in handlers.ts don't silently pass this check.
      // Both "venice:request" and "venice:streamChat" handlers must call the guard.
      const hasVeniceRequest = /["']venice:request["']/.test(content);
      const hasVeniceStream = /["']venice:streamChat["']/.test(content);
      const guardCallCount = (content.match(/maybeRunLocalFamilyGuard\s*\(/g) || []).length;
      // At minimum two guard calls required (one per handler)
      return hasVeniceRequest && hasVeniceStream && guardCallCount >= 2;
    },
    message: 'IPC handlers "venice:request" and "venice:streamChat" must be guarded'
  },
  {
    file: 'server.ts',
    name: 'Web Proxy Server',
    check: (content) => {
      return content.includes('maybeRunLocalFamilyGuard') && content.includes('isLocalFamilySafeModeEnabled');
    },
    message: 'Express proxy middleware must call safety guard'
  }
];

/**
 * Runs enforcement checks against the mapped files.
 * @param root The repository root path.
 * @returns An array of failure messages; empty if all passed.
 */
function runEnforcementChecks(root) {
  const failures = [];
  for (const entry of enforcementMap) {
    const filePath = path.join(root, entry.file);
    if (!fs.existsSync(filePath)) {
      failures.push(`[${entry.name}] Missing file: ${entry.file}`);
      continue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!entry.check(content)) {
      failures.push(`[${entry.name}] ${entry.file} FAILED: ${entry.message}`);
    }
    }
  return failures;
}

/**
 * Scans source files for raw prompt logging and safety bypass patterns.
 * @param root The repository root path.
 * @returns An array of violation messages; empty if none found.
 */
function scanForViolations(root) {
  const failures = [];

  function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (!['node_modules', 'dist', 'dist-electron', 'release', '.git', 'scripts'].includes(file)) {
          walk(fullPath);
        }
      } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
        if (
          file.includes('childExploitationGuard') ||
          file.includes('matchTables') ||
          file.includes('normalization') ||
          file.includes('verify-safety-guard')
        ) continue;
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Look for console logging of prompt-like variables
        // VERIFIED fix: stop at newline/semicolon to avoid huge multi-line false positives.
        const RAW_LOG_RE = /console\.(log|warn|error)[^\n;]*\b(prompt|userPrompt|input|payload)\b/g;
        const logMatches = content.match(RAW_LOG_RE);
        if (logMatches) {
          const unsafeMatches = logMatches.filter(match => {
            // Allow matches that are clearly about audit/hash metadata, not raw content
            if (/promptHash|promptTouched|promptId|auditSnap/.test(match)) return false;
            // Allow structural/log metadata like prompt length without logging raw content
            if (/\.length/.test(match)) return false;
            return true;
          });
          if (unsafeMatches.length > 0) {
            failures.push(`File ${fullPath} contains a pattern that looks like raw prompt logging`);
          }
        }

        // Look for explicit safety bypasses
        if (/disable.*safety|bypass.*guard|setContentGuardBypass|DEV_DISABLE|VENICE_FORGE_DEV_DISABLE_SAFETY_GUARD/.test(content)) {
          failures.push(`File ${fullPath} contains a pattern that looks like a safety bypass toggle`);
        }
      }
    }
  }

  walk(root);
  return failures;
}

/**
 * Runs the full safety guard verification suite.
 * @param root The repository root path.
 * @returns An object with enforcement and violation results.
 */
function verifySafetyGuard(root) {
  const enforcementFailures = runEnforcementChecks(root);
  const violations = scanForViolations(root);
  return {
    ok: enforcementFailures.length === 0 && violations.length === 0,
    enforcementFailures,
    violations,
  };
}

module.exports = { runEnforcementChecks, scanForViolations, verifySafetyGuard };

if (require.main === module) {
  const result = verifySafetyGuard(repoRoot);

  console.log('--- Safety Guard Enforcement Check ---');
  if (result.enforcementFailures.length === 0) {
    for (const entry of enforcementMap) {
      console.log(`✅ [${entry.name}] ${entry.file} passed enforcement check`);
    }
  } else {
    for (const msg of result.enforcementFailures) {
      console.error(`❌ ${msg}`);
    }
  }

  console.log('\n--- No-Raw-Log Policy Check ---');
  if (result.violations.length === 0) {
    console.log('✅ No raw prompt logging or safety bypass patterns detected.');
  } else {
    for (const msg of result.violations) {
      console.error(`❌ ${msg}`);
    }
  }

  if (result.ok) {
    console.log('\n✅ Safety guard verification passed.');
    process.exit(0);
  } else {
    console.error('\n❌ Safety guard verification failed.');
    process.exit(1);
  }
}
