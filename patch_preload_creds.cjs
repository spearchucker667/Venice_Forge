const fs = require('fs');
let content = fs.readFileSync('electron/preload.ts', 'utf-8');

const newPreload = `
  credentials: {
    set(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("credential:set", { key, value });
    },
    get(key: string): Promise<{ ok: boolean; value: string | null; error?: string }> {
      return ipcRenderer.invoke("credential:get", key);
    },
    delete(key: string): Promise<{ ok: boolean; error?: string }> {
      return ipcRenderer.invoke("credential:delete", key);
    },
  },
`;

content = content.replace(/apiKey: \{/, newPreload + '\n  apiKey: {');
fs.writeFileSync('electron/preload.ts', content);
