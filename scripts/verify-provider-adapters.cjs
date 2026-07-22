const { spawnSync } = require('node:child_process');
const { dirname, resolve } = require('node:path');

function run() {
  const vitestPackage = require.resolve('vitest/package.json');
  const vitestPackageJson = require(vitestPackage);
  const vitestBinary = resolve(dirname(vitestPackage), vitestPackageJson.bin.vitest);
  const tests = [
    'scripts/verify-provider-adapters.test.ts',
    'electron/ipc/validation.test.ts',
    'electron/services/providerAdapters.test.ts',
    'electron/services/providerSettingsStore.test.ts',
    'electron/services/veniceClient.adapters.test.ts',
  ];

  console.log('Running provider credential, routing, payload, and transport contract tests...');
  const result = spawnSync(
    process.execPath,
    [vitestBinary, 'run', '--root', resolve(__dirname, '..'), ...tests, '--fileParallelism=false'],
    { stdio: 'inherit', cwd: resolve(__dirname, '..') },
  );

  if (result.error || result.status !== 0) {
    console.error('FAIL: Provider adapter contract tests failed.');
    process.exit(1);
  }

  console.log('PASS: Provider adapter behavioral contracts passed.');
}

run();
