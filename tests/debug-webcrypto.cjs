// Simple script to debug WebCrypto vs Node.js crypto compatibility

const crypto = require('crypto');

// Test data
const password = "test-password-123";
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const payload = "test payload data";

console.log("Original payload:", payload);
console.log("Salt:", salt.toString('hex'));
console.log("IV:", iv.toString('hex'));

// Derive key using PBKDF2 (same as our implementation)
function deriveKey(password, salt, iterations = 100000) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// Simulate WebCrypto encryption using Node.js
async function webCryptoEncrypt(payload, password, salt, iv) {
  const key = await deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let ciphertext = cipher.update(payload, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  // Combine ciphertext and auth tag (like WebCrypto does)
  const combinedBuffer = Buffer.concat([
    Buffer.from(ciphertext, 'hex'),
    authTag
  ]);
  
  console.log("Node.js Cipher Ciphertext:", ciphertext);
  console.log("Node.js Auth Tag:", authTag.toString('hex'));
  console.log("Combined Buffer Length:", combinedBuffer.length);
  console.log("Combined Buffer (first 20 bytes):", combinedBuffer.subarray(0, 20).toString('hex'));
  console.log("Combined Buffer (last 20 bytes):", combinedBuffer.subarray(-20).toString('hex'));
  
  return combinedBuffer.toString('base64');
}

// Try to decrypt using the approach in our Electron code
async function electronDecrypt(webCryptoCiphertext, salt, iv, password) {
  const key = await deriveKey(password, Buffer.from(salt, 'hex'));
  
  // Decode the WebCrypto ciphertext from base64
  const combinedBuffer = Buffer.from(webCryptoCiphertext, 'base64');
  console.log("Decoded Combined Buffer Length:", combinedBuffer.length);
  
  // Extract auth tag (last 16 bytes) and ciphertext (everything else)
  const authTag = combinedBuffer.subarray(combinedBuffer.length - 16);
  const ciphertextBuffer = combinedBuffer.subarray(0, combinedBuffer.length - 16);
  
  console.log("Extracted Auth Tag:", authTag.toString('hex'));
  console.log("Ciphertext Buffer Length:", ciphertextBuffer.length);
  
  // Try to decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertextBuffer);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf8');
}

// Run the test
(async () => {
  try {
    console.log("=== Simulating WebCrypto encryption with Node.js ===");
    const webCryptoCiphertext = await webCryptoEncrypt(payload, password, salt, iv);
    console.log("WebCrypto-like Ciphertext (base64):", webCryptoCiphertext);
    
    console.log("\n=== Trying to decrypt with Electron approach ===");
    const decrypted = await electronDecrypt(webCryptoCiphertext, salt.toString('hex'), iv.toString('hex'), password);
    console.log("Decrypted payload:", decrypted);
    
    console.log("Success: Payloads match?", decrypted === payload);
  } catch (error) {
    console.error("Error:", error.message);
  }
})();