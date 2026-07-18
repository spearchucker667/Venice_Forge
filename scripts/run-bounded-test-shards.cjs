#!/usr/bin/env node
/** Runs npm test shards serially with a hard process timeout and clear diagnostics. */
const { spawn } = require('node:child_process');

const timeoutMs = Number(process.env.VENICE_TEST_SHARD_TIMEOUT_MS || 300_000);
const shards = process.argv.slice(2);
if (shards.length === 0) {
  process.stderr.write('Usage: node scripts/run-bounded-test-shards.cjs <npm-script> [...]\n');
  process.exit(2);
}

const isWindows = process.platform === 'win32';

function killProcessTree(child) {
  if (!child || child.killed) return;
  if (isWindows) {
    // taskkill /T walks the tree, /F is force — required because vitest forks
    // workers that do not share a console group, so plain SIGTERM cannot reach them.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => {});
    return;
  }
  // POSIX: kill the process group. detached:true put the child in its own group
  // (setpgid is implicit on POSIX), so a negative pid targets every descendant.
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // The group may have already exited; fall back to a direct kill.
    try { child.kill('SIGTERM'); } catch { /* nothing to do */ }
  }
  setTimeout(() => {
    if (!child.killed) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
  }, 5_000).unref();
}

function runShard(name) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[bounded-test] starting ${name} (timeout ${timeoutMs}ms)\n`);
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], {
      stdio: 'inherit',
      env: process.env,
      // detached:true lets waitpid-style group kills work on POSIX and lets us
      // taskkill the tree on Windows. We do NOT reuse its stdio for IPC.
      detached: !isWindows,
    });
    const timer = setTimeout(() => {
      process.stderr.write(`[bounded-test] ${name} exceeded ${timeoutMs}ms; terminating process tree for open-handle diagnosis\n`);
      killProcessTree(child);
      reject(new Error(`${name} timed out`));
    }, timeoutMs);
    timer.unref();
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with ${code ?? signal}`));
    });
  });
}

(async () => {
  for (const shard of shards) await runShard(shard);
})().catch((error) => {
  process.stderr.write(`[bounded-test] ${error.message}\n`);
  process.exitCode = 1;
});
