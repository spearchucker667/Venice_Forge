// Simple script to debug WebCrypto vs Node.js crypto compatibility with actual test values

const crypto = require('crypto');

// Actual test values from the failing test
const password = "test-password-123";
const saltBase64 = "yOXI5nZaSFntYrdPd3LSsQ==";
const ivBase64 = "yQpOgTkVcKgh3p5Q";
const webCiphertextBase64 = "Kubsb7Z5yQpymq2aJCrMWEMd0TyzOVE4fEsMLkIfMpfPfNmqj9JkYNkeY7d93IJDVoCebqT2wD+d05jgE5B/vQZSlJbRpfMoi3zxhGVviyUfl69xJHIpFCm7whYurRcwUpfKW5bTX5ppc0/M8cI260707/9+cTO4brf9XSt8d07RRaAYFtV3lms8BByEzNKmqDKu7G+2eckKcpqtmiQqzFhDHdE8szlROHxLDC5CHzKXz3zZqo/SZGDZHmO3fdyCQ1aAnm6k9sA/ndOY4BOQf70GUpSW0aXzKIt88YRlb4slH5evcSRyKRQpu8IW";

console.log("Original password:", password);
console.log("Salt (base64):", saltBase64);
console.log("IV (base64):", ivBase64);
console.log("Web Ciphertext (base64):", webCiphertextBase64);

// Convert from base64
const salt = Buffer.from(saltBase64, 'base64');
const iv = Buffer.from(ivBase64, 'base64');
const webCiphertextBuffer = Buffer.from(webCiphertextBase64, 'base64');

console.log("\nConverted values:");
console.log("Salt (hex):", salt.toString('hex'));
console.log("IV (hex):", iv.toString('hex'));
console.log("Web ciphertext buffer length:", webCiphertextBuffer.length);

// Derive key using PBKDF2 (same as our implementation)
function deriveKey(password, salt, iterations = 210000) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

// Try to decrypt using the approach in our Electron code
async function electronDecrypt(webCryptoCiphertextBuffer, salt, iv, password) {
  const key = await deriveKey(password, salt);
  console.log("Derived key (hex):", key.toString('hex'));
  
  // Extract auth tag (last 16 bytes) and ciphertext (everything else)
  const authTag = webCryptoCiphertextBuffer.subarray(webCryptoCiphertextBuffer.length - 16);
  const ciphertextBuffer = webCryptoCiphertextBuffer.subarray(0, webCryptoCiphertextBuffer.length - 16);
  
  console.log("Extracted Auth Tag (hex):", authTag.toString('hex'));
  console.log("Ciphertext Buffer Length:", ciphertextBuffer.length);
  console.log("Ciphertext Buffer (first 20 bytes):", ciphertextBuffer.subarray(0, 20).toString('hex'));
  
  // Try to decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  console.log("About to call decipher.update");
  let decrypted = decipher.update(ciphertextBuffer);
  console.log("After decipher.update, decrypted length:", decrypted.length);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  console.log("After decipher.final, decrypted length:", decrypted.length);
  
  return decrypted.toString('utf8');
}

// Run the test
(async () => {
  try {
    console.log("\n=== Trying to decrypt with Electron approach ===");
    const decrypted = await electronDecrypt(webCiphertextBuffer, salt, iv, password);
    console.log("Decrypted payload:", decrypted);
  } catch (error) {
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
  }
})();