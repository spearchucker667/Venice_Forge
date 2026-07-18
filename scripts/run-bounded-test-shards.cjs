#!/usr/bin/env node
/** Runs npm test shards serially with a hard process timeout and clear diagnostics. */
const { spawn } = require('node:child_process');

const timeoutMs = Number(process.env.VENICE_TEST_SHARD_TIMEOUT_MS || 300_000);
const shards = process.argv.slice(2);
if (shards.length === 0) {
  process.stderr.write('Usage: node scripts/run-bounded-test-shards.cjs <npm-script> [...]\n');
  process.exit(2);
}

function runShard(name) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`\n[bounded-test] starting ${name} (timeout ${timeoutMs}ms)\n`);
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], {
      stdio: 'inherit',
      env: process.env,
    });
    const timer = setTimeout(() => {
      process.stderr.write(`[bounded-test] ${name} exceeded ${timeoutMs}ms; terminating process for open-handle diagnosis\n`);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
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
