const fs = require('fs');
let content = fs.readFileSync('src/lib/safe-storage.ts', 'utf-8');

const profileKeyFn = `
function getProfileKey(name: string): string {
  // Global stores not scoped to profiles
  if (name === 'venice-profiles' || name === 'venice-auth' || name === 'theme-storage' || name === 'venice-master-settings') {
    return name;
  }
  const profileId = typeof window !== 'undefined' ? window.localStorage?.getItem('venice-active-profile-id') || 'default' : 'default';
  
  if (profileId === 'default') {
    return name; // Keep legacy name for default profile migration
  }
  return \`\${name}_\${profileId}\`;
}
`;

content = content.replace(/export function createSafeStorage\(\): StateStorage \{/g, profileKeyFn + '\nexport function createSafeStorage(): StateStorage {');

content = content.replace(/window\.localStorage\.getItem\(name\)/g, 'window.localStorage.getItem(getProfileKey(name))');
content = content.replace(/window\.localStorage\.setItem\(name, value\)/g, 'window.localStorage.setItem(getProfileKey(name), value)');
content = content.replace(/window\.localStorage\.setItem\(name, pruned\)/g, 'window.localStorage.setItem(getProfileKey(name), pruned)');
content = content.replace(/window\.localStorage\.removeItem\(name\)/g, 'window.localStorage.removeItem(getProfileKey(name))');

fs.writeFileSync('src/lib/safe-storage.ts', content);
