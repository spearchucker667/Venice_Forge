const fs = require('fs');
let content = fs.readFileSync('electron/services/secureStore.ts', 'utf-8');
content = content.replace(/export function setApiKey\(key: string\): void \{/g, 'export function setApiKey(key: string, profileId: string = "default"): void {');
content = content.replace(/const store = readStore\("apiKey"\);\n  if \(safeStorage.isEncryptionAvailable\(\)\) \{\n    store\["apiKey"\]/g, 'const store = readStore("apiKey");\n  const k = profileId === "default" ? "apiKey" : `apiKey_${profileId}`;\n  const ke = profileId === "default" ? "apiKeyEncrypted" : `apiKeyEncrypted_${profileId}`;\n  if (safeStorage.isEncryptionAvailable()) {\n    store[k]');
content = content.replace(/store\["apiKeyEncrypted"\] = "true";/g, 'store[ke] = "true";');
content = content.replace(/store\["apiKey"\] = key;/g, 'store[k] = key;');
content = content.replace(/store\["apiKeyEncrypted"\] = "false";/g, 'store[ke] = "false";');

content = content.replace(/export function getApiKey\(\): string \| null \{/g, 'export function getApiKey(profileId: string = "default"): string | null {');
content = content.replace(/const raw = store\["apiKey"\];/g, 'const k = profileId === "default" ? "apiKey" : `apiKey_${profileId}`;\n  const ke = profileId === "default" ? "apiKeyEncrypted" : `apiKeyEncrypted_${profileId}`;\n  const raw = store[k];');
content = content.replace(/const encryptedFlag = store\["apiKeyEncrypted"\]/g, 'const encryptedFlag = store[ke]');

content = content.replace(/export function deleteApiKey\(\): void \{/g, 'export function deleteApiKey(profileId: string = "default"): void {');
content = content.replace(/delete store\["apiKey"\];/g, 'const k = profileId === "default" ? "apiKey" : `apiKey_${profileId}`;\n  const ke = profileId === "default" ? "apiKeyEncrypted" : `apiKeyEncrypted_${profileId}`;\n  delete store[k];');
content = content.replace(/delete store\["apiKeyEncrypted"\];/g, 'delete store[ke];');

content = content.replace(/export function setJinaApiKey\(key: string\): void \{/g, 'export function setJinaApiKey(key: string, profileId: string = "default"): void {');
content = content.replace(/const store = readStore\("jinaApiKey"\);\n  if \(safeStorage.isEncryptionAvailable\(\)\) \{\n    store\["jinaApiKey"\]/g, 'const store = readStore("jinaApiKey");\n  const k = profileId === "default" ? "jinaApiKey" : `jinaApiKey_${profileId}`;\n  const ke = profileId === "default" ? "jinaApiKeyEncrypted" : `jinaApiKeyEncrypted_${profileId}`;\n  if (safeStorage.isEncryptionAvailable()) {\n    store[k]');
content = content.replace(/store\["jinaApiKeyEncrypted"\] = "true";/g, 'store[ke] = "true";');
content = content.replace(/store\["jinaApiKey"\] = key;/g, 'store[k] = key;');
content = content.replace(/store\["jinaApiKeyEncrypted"\] = "false";/g, 'store[ke] = "false";');

content = content.replace(/export function getJinaApiKey\(\): string \| null \{/g, 'export function getJinaApiKey(profileId: string = "default"): string | null {');
content = content.replace(/const raw = store\["jinaApiKey"\];/g, 'const k = profileId === "default" ? "jinaApiKey" : `jinaApiKey_${profileId}`;\n  const ke = profileId === "default" ? "jinaApiKeyEncrypted" : `jinaApiKeyEncrypted_${profileId}`;\n  const raw = store[k];');
content = content.replace(/const encryptedFlag = store\["jinaApiKeyEncrypted"\]/g, 'const encryptedFlag = store[ke]');

content = content.replace(/export function deleteJinaApiKey\(\): void \{/g, 'export function deleteJinaApiKey(profileId: string = "default"): void {');
content = content.replace(/delete store\["jinaApiKey"\];/g, 'const k = profileId === "default" ? "jinaApiKey" : `jinaApiKey_${profileId}`;\n  const ke = profileId === "default" ? "jinaApiKeyEncrypted" : `jinaApiKeyEncrypted_${profileId}`;\n  delete store[k];');
content = content.replace(/delete store\["jinaApiKeyEncrypted"\];/g, 'delete store[ke];');

content = content.replace(/export function isApiKeyConfigured\(\): boolean \{/g, 'export function isApiKeyConfigured(profileId: string = "default"): boolean {');
content = content.replace(/return getApiKey\(\) !== null;/g, 'return getApiKey(profileId) !== null;');

content = content.replace(/export function isJinaApiKeyConfigured\(\): boolean \{/g, 'export function isJinaApiKeyConfigured(profileId: string = "default"): boolean {');
content = content.replace(/return getJinaApiKey\(\) !== null;/g, 'return getJinaApiKey(profileId) !== null;');

fs.writeFileSync('electron/services/secureStore.ts', content);
