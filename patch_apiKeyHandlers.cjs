const fs = require('fs');
let content = fs.readFileSync('electron/ipc/handlers/apiKeyHandlers.ts', 'utf-8');

content = content.replace(
  /registerIpcChannel\("apiKey:isConfigured", \(\) => isApiKeyConfigured\(\)\);/g,
  'registerIpcChannel("apiKey:isConfigured", (_event, profileId?: string) => isApiKeyConfigured(profileId));'
);
content = content.replace(
  /registerIpcChannel\("apiKey:set", \(_event, key: unknown\) => \{/g,
  'registerIpcChannel("apiKey:set", (_event, payload: unknown) => {\n    const { key, profileId } = typeof payload === "object" && payload !== null && "key" in payload ? payload as { key: unknown, profileId?: string } : { key: payload, profileId: undefined };'
);
content = content.replace(
  /setApiKey\(trimmed\);/g,
  'setApiKey(trimmed, profileId);'
);
content = content.replace(
  /registerIpcChannel\("apiKey:delete", \(\) => \{/g,
  'registerIpcChannel("apiKey:delete", (_event, profileId?: string) => {'
);
content = content.replace(
  /deleteApiKey\(\);/g,
  'deleteApiKey(profileId);'
);
content = content.replace(
  /registerIpcChannel\("apiKey:test", \(\) => testVeniceConnection\(\)\);/g,
  'registerIpcChannel("apiKey:test", (_event, profileId?: string) => testVeniceConnection(profileId));'
);

// We must also update `testVeniceConnection` to take profileId and pass it down.
// Wait, testVeniceConnection uses isApiKeyConfigured(). We need to update its signature.
content = content.replace(
  /async function testVeniceConnection\(\): Promise<\{ ok: boolean; status\?: number; message: string; connectivity: ApiConnectivityStatus \}> \{/g,
  'async function testVeniceConnection(profileId?: string): Promise<{ ok: boolean; status?: number; message: string; connectivity: ApiConnectivityStatus }> {'
);
content = content.replace(
  /if \(!isApiKeyConfigured\(\)\) \{/g,
  'if (!isApiKeyConfigured(profileId)) {'
);

fs.writeFileSync('electron/ipc/handlers/apiKeyHandlers.ts', content);
