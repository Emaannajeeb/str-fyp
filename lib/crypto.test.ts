/**
 * Unit tests for crypto helper
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the env module before importing crypto
vi.mock('./env', () => {
  const mockKey = Buffer.from('a'.repeat(32)).toString('base64');
  return {
    env: {
      ENCRYPTION_KEY_32B: mockKey,
    },
  };
});

import { encrypt, decrypt, hash, generateSecureToken } from './crypto';

describe('crypto', () => {

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const original = 'sensitive data';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(original);
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 format
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertext for same plaintext (IV randomness)', () => {
      const original = 'same data';
      const encrypted1 = encrypt(original);
      const encrypted2 = encrypt(original);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(original);
      expect(decrypt(encrypted2)).toBe(original);
    });

    it('should handle empty string', () => {
      const original = '';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should handle long strings', () => {
      const original = 'a'.repeat(10000);
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should handle special characters', () => {
      const original = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should handle unicode characters', () => {
      const original = 'Hello 世界 🌍';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should throw error on invalid encrypted data', () => {
      expect(() => {
        decrypt('invalid-base64!!!');
      }).toThrow();
    });

    it('should throw error on tampered encrypted data', () => {
      const original = 'sensitive data';
      const encrypted = encrypt(original);
      const tampered = encrypted.slice(0, -5) + 'XXXXX';

      expect(() => {
        decrypt(tampered);
      }).toThrow();
    });
  });

  describe('hash', () => {
    it('should produce consistent hash for same input', () => {
      const data = 'test data';
      const hash1 = hash(data);
      const hash2 = hash(data);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = hash('data1');
      const hash2 = hash('data2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const result = hash('');
      expect(result).toHaveLength(64);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate tokens of specified length', () => {
      const token = generateSecureToken(32);
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate different tokens each time', () => {
      const token1 = generateSecureToken(32);
      const token2 = generateSecureToken(32);

      expect(token1).not.toBe(token2);
    });

    it('should generate base64url-safe tokens', () => {
      const token = generateSecureToken(32);
      // Base64url uses A-Z, a-z, 0-9, -, _ (no +, /, =)
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });
});

