const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Running VERIFY-050: Storage / Privacy Dashboard Hardening...');

const root = path.resolve(__dirname, '..');

// 1. Check for core files
const files = [
  'src/types/storage-privacy.ts',
  'src/services/storagePrivacyService.ts',
  'src/services/storageMaintenance.ts',
  'src/stores/storage-privacy-store.ts',
  'src/components/privacy/StoragePrivacyDashboard.tsx'
];

console.log('\n1. Checking core files...');
for (const f of files) {
  if (fs.existsSync(path.join(root, f))) {
    console.log(`✅ ${f} exists`);
  } else {
    console.error(`❌ ${f} missing`);
    process.exit(1);
  }
}

// 2. Run unit tests
console.log('\n2. Running unit tests...');
try {
  execSync('npm test -- src/types/storage-privacy.test.ts src/services/storagePrivacyService.test.ts src/services/storageMaintenance.test.ts src/stores/storage-privacy-store.test.ts src/components/privacy/StoragePrivacyDashboard.test.ts', { stdio: 'inherit' });
  console.log('✅ All unit tests passed');
} catch {
  console.error('❌ Unit tests failed');
  process.exit(1);
}

// 3. Verify AGENTS.md entry
console.log('\n3. Checking AGENTS.md for VERIFY-050...');
const agentsMd = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
if (agentsMd.includes('VERIFY-050')) {
  console.log('✅ AGENTS.md updated with VERIFY-050');
} else {
  console.warn('⚠️ AGENTS.md missing VERIFY-050 entry');
}

// 4. Check for secret leak protections
console.log('\n4. Verifying secret leak protections...');
const privacyService = fs.readFileSync(path.join(root, 'src/services/storagePrivacyService.ts'), 'utf8');
if (privacyService.includes('containsSecrets') && privacyService.includes('exportableInSafeSummary: !containsSecrets')) {
  console.log('✅ Privacy service has secret-leak protections');
} else {
  console.error('❌ Privacy service missing secret-leak protections');
  process.exit(1);
}

console.log('\n✅ VERIFY-050: Storage / Privacy Dashboard validation passed.');
