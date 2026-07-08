const fs = require('fs');
let content = fs.readFileSync('electron/ipc/handlers/jinaHandlers.ts', 'utf-8');

content = content.replace(
  /registerIpcChannel\("jinaApiKey:isConfigured", \(\) => isJinaApiKeyConfigured\(\)\);/g,
  'registerIpcChannel("jinaApiKey:isConfigured", (_event, profileId?: string) => isJinaApiKeyConfigured(profileId));'
);
content = content.replace(
  /registerIpcChannel\("jinaApiKey:set", \(_event, key: unknown\) => \{/g,
  'registerIpcChannel("jinaApiKey:set", (_event, payload: unknown) => {\n    const { key, profileId } = typeof payload === "object" && payload !== null && "key" in payload ? payload as { key: unknown, profileId?: string } : { key: payload, profileId: undefined };'
);
content = content.replace(
  /setJinaApiKey\(trimmed\);/g,
  'setJinaApiKey(trimmed, profileId);'
);
content = content.replace(
  /registerIpcChannel\("jinaApiKey:delete", \(\) => \{/g,
  'registerIpcChannel("jinaApiKey:delete", (_event, profileId?: string) => {'
);
content = content.replace(
  /deleteJinaApiKey\(\);/g,
  'deleteJinaApiKey(profileId);'
);
content = content.replace(
  /registerIpcChannel\("jinaApiKey:test", \(\) => testJinaConnection\(\)\);/g,
  'registerIpcChannel("jinaApiKey:test", (_event, profileId?: string) => testJinaConnection(profileId));'
);
content = content.replace(
  /async function testJinaConnection\(\): Promise<\{ ok: boolean; status\?: number; message: string \}> \{/g,
  'async function testJinaConnection(profileId?: string): Promise<{ ok: boolean; status?: number; message: string }> {'
);
content = content.replace(
  /if \(!isJinaApiKeyConfigured\(\)\) \{/g,
  'if (!isJinaApiKeyConfigured(profileId)) {'
);

fs.writeFileSync('electron/ipc/handlers/jinaHandlers.ts', content);
