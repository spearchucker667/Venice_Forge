const fs = require('fs');
let content = fs.readFileSync('electron/ipc/handlers/apiKeyHandlers.ts', 'utf-8');

// Need to import setCredential, getCredential, deleteCredential
content = content.replace(
  /isApiKeyConfigured,\n  setApiKey,\n\} from "..\/..\/services\/secureStore";/,
  'isApiKeyConfigured,\n  setApiKey,\n  setCredential,\n  getCredential,\n  deleteCredential\n} from "../../services/secureStore";'
);

// Add registerIpcChannel handlers
const newHandlers = `
  registerIpcChannel("credential:set", (_event, payload: { key: string, value: string }) => {
    try {
      setCredential(payload.key, payload.value);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  registerIpcChannel("credential:get", (_event, key: string) => {
    try {
      const val = getCredential(key);
      return { ok: true, value: val };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  registerIpcChannel("credential:delete", (_event, key: string) => {
    try {
      deleteCredential(key);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
`;

content = content.replace(/export function registerApiKeyHandlers\(\): void \{/, 'export function registerApiKeyHandlers(): void {\n' + newHandlers);

fs.writeFileSync('electron/ipc/handlers/apiKeyHandlers.ts', content);
