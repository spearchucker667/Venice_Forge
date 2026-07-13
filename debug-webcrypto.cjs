// Simple script to test WebCrypto vs Node.js encryption formats
const crypto = require('crypto');

// Simulate WebCrypto format
function simulateWebCryptoEncrypt(plaintext) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync("password", salt, 210000, 32, "sha256");
  
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  // WebCrypto-style: combined ciphertext + authTag
  const webCryptoStyle = Buffer.concat([encrypted, authTag]);
  
  // Electron-style: ciphertext:authTag
  const electronStyle = encrypted.toString('base64') + ':' + authTag.toString('base64');
  
  console.log('WebCrypto format length:', webCryptoStyle.length);
  console.log('Electron format length:', electronStyle.length);
  console.log('WebCrypto format sample:', webCryptoStyle.toString('base64').substring(0, 50));
  console.log('Electron format sample:', electronStyle.substring(0, 50));
  
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    webCryptoCiphertext: webCryptoStyle.toString('base64'),
    electronCiphertext: electronStyle
  };
}

// Test decryption of both formats
function testDecrypt(webCryptoCiphertext, salt, iv, password) {
  const saltBuffer = Buffer.from(salt, 'base64');
  const ivBuffer = Buffer.from(iv, 'base64');
  const key = crypto.pbkdf2Sync(password, saltBuffer, 210000, 32, "sha256");
  
  try {
    // Try to decrypt WebCrypto format
    const combinedBuffer = Buffer.from(webCryptoCiphertext, 'base64');
    const authTag = combinedBuffer.subarray(combinedBuffer.length - 16);
    const ciphertextBuffer = combinedBuffer.subarray(0, combinedBuffer.length - 16);
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, ivBuffer);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertextBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    console.log('WebCrypto format decrypt success:', decrypted.toString());
    return true;
  } catch (e) {
    console.log('WebCrypto format decrypt failed:', e.message);
    return false;
  }
}

const result = simulateWebCryptoEncrypt("test data");
testDecrypt(result.webCryptoCiphertext, result.salt, result.iv, "password");