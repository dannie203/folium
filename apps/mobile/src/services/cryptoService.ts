/**
 * ==============================================================================
 *  FOLIUM ZERO-KNOWLEDGE CRYPTO VAULT SERVICE (WebCrypto PBKDF2 + AES-GCM-256)
 * ==============================================================================
 * 
 * ARCHITECTURAL SCOPE & BOUNDARY:
 * - This service implements client-side Zero-Knowledge encryption primitives
 *   (PBKDF2 with 100,000 iterations + AES-GCM-256) for local vault proof-of-concept
 *   and security verification benchmarks (see app/security.tsx).
 * - Multi-device synchronization over Cloudflare D1 (Phase 8) currently operates with
 *   TLS-in-transit security and structured plaintext columns for indexing and LWW resolution.
 * - End-to-End Encrypted (E2EE) envelope synchronization on Cloudflare D1 is designated
 *   for Phase 9, requiring user master passphrase synchronization across paired devices.
 */

import * as ExpoCrypto from 'expo-crypto';
import type { EncryptedVaultPayload } from '@folium/shared';

// Constants for Zero-Knowledge WebCrypto Vault
const PBKDF2_ITERATIONS = 100000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH_BYTES = 12;
const SALT_LENGTH_BYTES = 16;
const DEFAULT_SYSTEM_SALT = 'folium_zk_client_salt_v1';

// Base64 helpers for ArrayBuffer
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary);
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let res = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    res += chars[b1 >> 2];
    res += chars[((b1 & 3) << 4) | (b2 >> 4)];
    res += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    res += i + 2 < bytes.length ? chars[b3 & 63] : '=';
  }
  return res;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (typeof atob !== 'undefined') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/=/g, '');
  let bin = '';
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = chars.indexOf(clean[i]);
    const e2 = chars.indexOf(clean[i + 1]);
    const e3 = i + 2 < clean.length ? chars.indexOf(clean[i + 2]) : 64;
    const e4 = i + 3 < clean.length ? chars.indexOf(clean[i + 3]) : 64;
    const c1 = (e1 << 2) | (e2 >> 4);
    bin += String.fromCharCode(c1);
    if (e3 !== 64) {
      const c2 = ((e2 & 15) << 4) | (e3 >> 2);
      bin += String.fromCharCode(c2);
    }
    if (e4 !== 64) {
      const c3 = ((e3 & 3) << 6) | e4;
      bin += String.fromCharCode(c3);
    }
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Get the WebCrypto SubtleCrypto interface safely on Web and Native.
 */
function getSubtleCrypto(): SubtleCrypto {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto.subtle;
  }
  if (typeof window !== 'undefined' && (window as any).crypto?.subtle) {
    return (window as any).crypto.subtle;
  }
  throw new Error('WebCrypto SubtleCrypto API is not available in the current runtime environment.');
}

/**
 * Generate cryptographically secure random bytes.
 */
export function getRandomBytes(length: number): Uint8Array {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
  return ExpoCrypto.getRandomBytes(length);
}

/**
 * Derive an AES-GCM-256 CryptoKey using PBKDF2 from a passphrase and salt.
 */
async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt arbitrary JSON or text data with AES-256-GCM.
 * The resulting payload contains IV, salt, and ciphertext in Base64.
 */
export async function encryptJson(
  data: unknown,
  passphrase = DEFAULT_SYSTEM_SALT
): Promise<EncryptedVaultPayload> {
  const subtle = getSubtleCrypto();
  const salt = getRandomBytes(SALT_LENGTH_BYTES);
  const iv = getRandomBytes(IV_LENGTH_BYTES);

  const key = await deriveAesKey(passphrase, salt);
  const plainText = typeof data === 'string' ? data : JSON.stringify(data);
  const enc = new TextEncoder();

  const ciphertextBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    enc.encode(plainText)
  );

  return {
    version: 1,
    algorithm: 'AES-GCM-256',
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    createdAt: Date.now(),
  };
}

/**
 * Decrypt an EncryptedVaultPayload back to original data.
 */
export async function decryptJson<T = unknown>(
  payload: EncryptedVaultPayload,
  passphrase = DEFAULT_SYSTEM_SALT
): Promise<T> {
  const subtle = getSubtleCrypto();
  const salt = new Uint8Array(base64ToArrayBuffer(payload.salt));
  const iv = new Uint8Array(base64ToArrayBuffer(payload.iv));
  const ciphertext = base64ToArrayBuffer(payload.ciphertext);

  const key = await deriveAesKey(passphrase, salt);

  const decryptedBuffer = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  const plainText = dec.decode(decryptedBuffer);

  try {
    return JSON.parse(plainText) as T;
  } catch {
    return plainText as unknown as T;
  }
}

/**
 * Self-verification test verifying roundtrip encryption correctness.
 */
export async function verifyCryptoVault(): Promise<{ success: boolean; durationMs: number; samplePayload: EncryptedVaultPayload }> {
  const start = performance.now();
  const testData = {
    test: 'Folium Zero-Knowledge Verification',
    secretNotes: 'Kerckhoffs principle proof audit',
    timestamp: Date.now(),
  };

  const encrypted = await encryptJson(testData, 'test-secret-passphrase-2026');
  const decrypted = await decryptJson<typeof testData>(encrypted, 'test-secret-passphrase-2026');

  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  const isMatch = decrypted.secretNotes === testData.secretNotes;

  if (!isMatch) {
    throw new Error('Crypto vault roundtrip verification failed.');
  }

  return {
    success: true,
    durationMs,
    samplePayload: encrypted,
  };
}
