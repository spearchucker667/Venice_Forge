const fs = require('fs');
let content = fs.readFileSync('src/types/desktop.ts', 'utf-8');

const newTypes = `
export interface VeniceForgeCredentials {
  set(key: string, value: string): Promise<{ ok: boolean; error?: string }>;
  get(key: string): Promise<{ ok: boolean; value: string | null; error?: string }>;
  delete(key: string): Promise<{ ok: boolean; error?: string }>;
}
`;
if (!content.includes('VeniceForgeCredentials')) {
  content = content.replace(/export interface VeniceForge \{/, newTypes + '\nexport interface VeniceForge {\n  credentials: VeniceForgeCredentials;');
  fs.writeFileSync('src/types/desktop.ts', content);
}
