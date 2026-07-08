const fs = require('fs');
let content = fs.readFileSync('src/types/desktop.ts', 'utf-8');

const newTypes = `
  credentials: {
    set(key: string, value: string): Promise<{ ok: boolean; error?: string }>;
    get(key: string): Promise<{ ok: boolean; value: string | null; error?: string }>;
    delete(key: string): Promise<{ ok: boolean; error?: string }>;
  };
`;
content = content.replace(/apiKey: \{/, newTypes + '\n  apiKey: {');
fs.writeFileSync('src/types/desktop.ts', content);

let dbContent = fs.readFileSync('src/services/desktopBridge.ts', 'utf-8');
const newBridge = `
export const desktopCredentials = {
  async set(key: string, value: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.credentials.set(key, value);
  },
  async get(key: string): Promise<{ ok: boolean; value: string | null; error?: string }> {
    if (!isElectron()) return { ok: false, value: null, error: "Not available in web" };
    return window.veniceForge!.credentials.get(key);
  },
  async delete(key: string): Promise<{ ok: boolean; error?: string }> {
    if (!isElectron()) return { ok: false, error: "Not available in web" };
    return window.veniceForge!.credentials.delete(key);
  }
};
`;
dbContent = dbContent + '\n' + newBridge;
fs.writeFileSync('src/services/desktopBridge.ts', dbContent);
