// Test Node.js WebCrypto compatibility

const crypto = require('crypto');

async function testWebCrypto() {
  const algorithm = { name: "AES-GCM", length: 256 };
  const keyUsages = ["encrypt", "decrypt"];
  
  // Generate a key
  const key = await crypto.subtle.generateKey(algorithm, true, keyUsages);
  
  // Data to encrypt
  const data = new TextEncoder().encode("Hello, world!");
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM
  
  console.log("Original data:", new TextDecoder().decode(data));
  console.log("IV:", Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''));
  
  // Encrypt
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  console.log("Encrypted data length:", encrypted.byteLength);
  console.log("Encrypted data (first 20 bytes):", 
    Array.from(new Uint8Array(encrypted)).slice(0, 20).map(b => b.toString(16).padStart(2, '0')).join(''));
  
  // Decrypt using WebCrypto
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  console.log("Decrypted data (WebCrypto):", new TextDecoder().decode(decrypted));
  
  // Show what the encrypted data looks like
  const encryptedArray = new Uint8Array(encrypted);
  console.log("Full encrypted array length:", encryptedArray.length);
  console.log("Full encrypted array last 20 bytes:", 
    Array.from(encryptedArray).slice(-20).map(b => b.toString(16).padStart(2, '0')).join(''));
  
  // Now try to decrypt using Electron approach
  console.log("\n=== Trying Electron decryption approach ===");
  
  // Convert to base64 (like the WebCrypto backup does)
  const encryptedBase64 = Buffer.from(encryptedArray).toString('base64');
  console.log("Encrypted base64:", encryptedBase64);
  
  // Convert back from base64
  const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
  
  // Extract auth tag (last 16 bytes) and ciphertext
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
  const ciphertextBuffer = encryptedBuffer.subarray(0, encryptedBuffer.length - 16);
  
  console.log("Auth tag (hex):", authTag.toString('hex'));
  console.log("Ciphertext buffer length:", ciphertextBuffer.length);
  
  // Try to decrypt using Node.js crypto (simulating Electron approach)
  // We need to export the key to use with Node.js crypto
  const exportedKey = await crypto.subtle.exportKey("raw", key);
  const keyBuffer = Buffer.from(exportedKey);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, Buffer.from(iv));
  decipher.setAuthTag(authTag);
  
  try {
    let decryptedBuffer = decipher.update(ciphertextBuffer);
    decryptedBuffer = Buffer.concat([decryptedBuffer, decipher.final()]);
    console.log("Decrypted data (Electron approach):", decryptedBuffer.toString('utf8'));
  } catch (error) {
    console.error("Electron decryption error:", error.message);
  }
}

testWebCrypto().catch(console.error);