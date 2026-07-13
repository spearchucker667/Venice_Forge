// Simple script to debug key derivation differences

const crypto = require('crypto');

// Test data
const password = "test-password-123";
const saltHex = "c8e5c8e6765a4859ed62b74f7772d2b1";
const salt = Buffer.from(saltHex, 'hex');
const iterations = 100000;

console.log("Password:", password);
console.log("Salt (hex):", saltHex);
console.log("Salt (base64):", salt.toString('base64'));

// Derive key using PBKDF2 (same as our implementation)
function deriveKeyNode(password, salt, iterations = 100000) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// Derive key using WebCrypto-style approach
async function deriveKeyWeb(password, salt) {
  // This simulates what happens in the browser
  const textEncoder = new TextEncoder();
  const passwordBuffer = textEncoder.encode(password);
  
  // Import the password as a key
  // Note: In browser this would be:
  // const key = await crypto.subtle.importKey("raw", passwordBuffer, "PBKDF2", false, ["deriveBits", "deriveKey"]);
  
  // Derive the key using PBKDF2
  // Note: In browser this would be:
  // const derivedKey = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  
  // For Node.js simulation, we'll use the same approach as our other code
  return deriveKeyNode(password, salt);
}

// Run the test
(async () => {
  try {
    console.log("=== Node.js Key Derivation ===");
    const nodeKey = await deriveKeyNode(password, salt);
    console.log("Derived key (hex):", nodeKey.toString('hex'));
    console.log("Derived key (base64):", nodeKey.toString('base64'));
    
    console.log("\n=== WebCrypto-style Key Derivation ===");
    const webKey = await deriveKeyWeb(password, salt);
    console.log("Derived key (hex):", webKey.toString('hex'));
    console.log("Derived key (base64):", webKey.toString('base64'));
    
    console.log("\nKeys match?", nodeKey.toString('hex') === webKey.toString('hex'));
  } catch (error) {
    console.error("Error:", error.message);
  }
})();