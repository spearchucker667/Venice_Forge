const fs = require('fs');
let content = fs.readFileSync('src/services/desktopBridge.ts', 'utf-8');

const GET_ACTIVE_PROFILE_ID_FN = `
function getActiveProfileId(): string {
  return typeof window !== "undefined" ? window.localStorage?.getItem('venice-active-profile-id') || 'default' : 'default';
}
`;
if (!content.includes('getActiveProfileId')) {
  content = content.replace(/export function isElectron\(\): boolean \{/g, GET_ACTIVE_PROFILE_ID_FN + '\nexport function isElectron(): boolean {');
}

content = content.replace(
  /signalId,\n      \}\);/g,
  'signalId,\n        profileId: getActiveProfileId(),\n      });'
);

content = content.replace(
  /signalId,\n      \}, onDelta\);/g,
  'signalId,\n        profileId: getActiveProfileId(),\n      }, onDelta);'
);

content = content.replace(
  /if \(isElectron\(\)\) return window\.veniceForge!\.apiKey\.isConfigured\(\);/g,
  'if (isElectron()) return window.veniceForge!.apiKey.isConfigured(getActiveProfileId());'
);
content = content.replace(
  /if \(isElectron\(\)\) return window\.veniceForge!\.apiKey\.set\(key\);/g,
  'if (isElectron()) return window.veniceForge!.apiKey.set(key, getActiveProfileId());'
);
content = content.replace(
  /if \(isElectron\(\)\) return window\.veniceForge!\.apiKey\.delete\(\);/g,
  'if (isElectron()) return window.veniceForge!.apiKey.delete(getActiveProfileId());'
);
content = content.replace(
  /if \(isElectron\(\)\) return window\.veniceForge!\.apiKey\.test\(\);/g,
  'if (isElectron()) return window.veniceForge!.apiKey.test(getActiveProfileId());'
);

content = content.replace(
  /if \(isElectron\(\)\) return window\.veniceForge!\.jinaApiKey\.isConfigured\(\);/g,
  'if (isElectron()) return window.veniceForge!.jinaApiKey.isConfigured(getActiveProfileId());'
);
content = content.replace(
  /if \(isElectron\(\)\) return window\.veniceForge!\.jinaApiKey\.set\(key\);/g,
  'if (isElectron()) return window.veniceForge!.jinaApiKey.set(key, getActiveProfileId());'
);
content = content.replace(
  /if \(isElectron\(\)\) return window\.veniceForge!\.jinaApiKey\.delete\(\);/g,
  'if (isElectron()) return window.veniceForge!.jinaApiKey.delete(getActiveProfileId());'
);
content = content.replace(
  /if \(isElectron\(\)\) return window\.veniceForge!\.jinaApiKey\.test\(\);/g,
  'if (isElectron()) return window.veniceForge!.jinaApiKey.test(getActiveProfileId());'
);

fs.writeFileSync('src/services/desktopBridge.ts', content);
