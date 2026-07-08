const fs = require('fs');
let content = fs.readFileSync('electron/services/veniceClient.ts', 'utf-8');

// Update FetchOptions
content = content.replace(
  /export interface FetchOptions \{/g,
  'export interface FetchOptions {\n  profileId?: string;'
);
// Update veniceFetch signature
content = content.replace(
  /const apiKey = getApiKey\(\);/g,
  'const apiKey = getApiKey(options.profileId);'
);

fs.writeFileSync('electron/services/veniceClient.ts', content);
