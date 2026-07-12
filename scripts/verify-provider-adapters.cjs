/**
 * Verifies that all fallback providers defined in PROVIDER_REGISTRY have an adapter implemented.
 */
const { readFileSync } = require('fs');
const { join } = require('path');

function run() {
  const providerTs = readFileSync(join(__dirname, '../src/types/provider.ts'), 'utf-8');
  const adaptersTs = readFileSync(join(__dirname, '../electron/services/providerAdapters.ts'), 'utf-8');

  // Extract ProviderId union from provider.ts
  const providerIdMatch = providerTs.match(/export type ProviderId =([\s\S]*?)\n\n/);
  if (!providerIdMatch) {
    console.error('FAIL: Could not find ProviderId union in src/types/provider.ts');
    process.exit(1);
  }

  const providers = providerIdMatch[1]
    .split('|')
    .map(p => p.trim().replace(/['"]/g, ''))
    .filter(p => p && p !== 'venice');

  const missingAdapters = [];

  for (const provider of providers) {
    // Check if there's a key in providerAdapters object
    const regex = new RegExp(`${provider}:\\s*\\(model, apiKey, originalPath,`);
    if (!regex.test(adaptersTs)) {
      missingAdapters.push(provider);
    }
  }

  if (missingAdapters.length > 0) {
    console.error('FAIL: The following providers are missing adapters in electron/services/providerAdapters.ts:');
    console.error(missingAdapters.join(', '));
    process.exit(1);
  }

  console.log('PASS: All fallback providers have adapters implemented.');
}

run();
