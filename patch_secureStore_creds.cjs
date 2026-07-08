const fs = require('fs');
let content = fs.readFileSync('electron/services/secureStore.ts', 'utf-8');

const newMethods = `
// ── Generic Credential Storage (Master Password, Profile Secrets) ──

/** Encrypts and stores a generic credential. */
export function setCredential(key: string, value: string): void {
  const store = readStore("apiKey"); // We use apiKey's error slot for generic creds for now, or don't report
  const k = \`cred_\${key}\`;
  const ke = \`credEncrypted_\${key}\`;
  
  if (safeStorage.isEncryptionAvailable()) {
    store[k] = safeStorage.encryptString(value).toString("base64");
    store[ke] = "true";
  } else {
    if (process.platform === "win32" || process.platform === "darwin") {
      throw new Error("Native credential storage unavailable.");
    }
    store[k] = value;
    store[ke] = "false";
  }
  writeStore(store);
}

/** Retrieves and decrypts a generic credential. */
export function getCredential(key: string): string | null {
  const store = readStore("apiKey");
  const k = \`cred_\${key}\`;
  const ke = \`credEncrypted_\${key}\`;
  const raw = store[k];
  if (typeof raw !== "string" || raw.length === 0) return null;

  const encryptedFlag = store[ke] as unknown;
  const isEncrypted = encryptedFlag === "true" || encryptedFlag === true;

  if (isEncrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    } catch {
      return null;
    }
  }

  if (process.platform === "win32" || process.platform === "darwin") {
    return null;
  }
  return raw;
}

/** Deletes a generic credential. */
export function deleteCredential(key: string): void {
  const store = readStore("apiKey");
  const k = \`cred_\${key}\`;
  const ke = \`credEncrypted_\${key}\`;
  delete store[k];
  delete store[ke];
  writeStore(store);
}
`;

content = content + '\n' + newMethods;
fs.writeFileSync('electron/services/secureStore.ts', content);
