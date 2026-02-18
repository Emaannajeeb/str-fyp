/**
 * Encryption utilities using AES-256-GCM
 * Uses Node.js built-in crypto module for encryption/decryption
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { env } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits for authentication tag
const SALT_LENGTH = 32;

/**
 * Derive encryption key from ENCRYPTION_KEY_32B
 * The key should be base64 encoded 32-byte key
 */
function getEncryptionKey(): Buffer {
  try {
    // Decode base64 key
    const keyBuffer = Buffer.from(env.ENCRYPTION_KEY_32B, 'base64');
    
    if (keyBuffer.length !== 32) {
      throw new Error('ENCRYPTION_KEY_32B must be exactly 32 bytes when base64 decoded');
    }
    
    return keyBuffer;
  } catch (error) {
    throw new Error(
      `Invalid ENCRYPTION_KEY_32B: ${error instanceof Error ? error.message : 'Invalid format'}. ` +
      `Expected base64-encoded 32-byte key. Generate with: openssl rand -base64 32`
    );
  }
}

/**
 * Encrypt sensitive data
 * Returns base64-encoded string: iv:tag:encryptedData
 */
export function encrypt(data: string): string {
  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    
    const cipher = createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(data, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const tag = cipher.getAuthTag();
    
    // Combine IV, tag, and encrypted data
    const combined = Buffer.concat([iv, tag, encrypted]);
    
    return combined.toString('base64');
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt sensitive data
 * Expects base64-encoded string: iv:tag:encryptedData
 */
export function decrypt(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract IV, tag, and encrypted data
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Hash data using SHA-256
 * Useful for one-way hashing (e.g., for verification)
 */
export function hash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a random secure token
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}


