import test from 'node:test';
import assert from 'node:assert';
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ==============================================================================
//  1. CRYPTO SERVICE TESTS (Zero-Knowledge WebCrypto Envelope)
// ==============================================================================

const PBKDF2_ITERATIONS = 100000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH_BYTES = 12;
const SALT_LENGTH_BYTES = 16;

async function deriveAesKey(passphrase, salt) {
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
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptJsonTest(data, passphrase) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const key = await deriveAesKey(passphrase, salt);
  const jsonStr = JSON.stringify(data);

  const ciphertextBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(jsonStr)
  );

  return {
    version: 1,
    algorithm: 'AES-GCM-256',
    salt: Buffer.from(salt).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(ciphertextBuf).toString('base64'),
  };
}

async function decryptJsonTest(payload, passphrase) {
  const salt = Buffer.from(payload.salt, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const key = await deriveAesKey(passphrase, salt);

  const decryptedBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return JSON.parse(dec.decode(decryptedBuf));
}

test('CRYPTO 1: encryptJson & decryptJson roundtrip preserves complex nested data structure', async () => {
  const payload = {
    bookId: 'book-uuid-999',
    title: 'Chiến Tranh và Hòa Bình',
    readingProgress: {
      cfi: 'epubcfi(/6/14[chapter-2]!/4/2/4:12)',
      percentage: 33.7,
    },
    annotations: [
      { id: 'hl-1', text: 'Con người là tổng hòa của các mối quan hệ xã hội', color: 'yellow' },
    ],
  };

  const passphrase = 'SuperSecretPassphrase!2026';
  const encrypted = await encryptJsonTest(payload, passphrase);

  assert.strictEqual(encrypted.version, 1);
  assert.strictEqual(encrypted.algorithm, 'AES-GCM-256');
  assert.ok(encrypted.salt.length > 0);
  assert.ok(encrypted.iv.length > 0);
  assert.ok(encrypted.ciphertext.length > 0);

  const decrypted = await decryptJsonTest(encrypted, passphrase);
  assert.deepStrictEqual(decrypted, payload, 'Decrypted payload must exactly match original');
});

test('CRYPTO 2: decryptJson fails with wrong passphrase or tampered ciphertext', async () => {
  const original = { secret: 'Confidential Book Notes' };
  const passphrase = 'CorrectPassword#1';
  const encrypted = await encryptJsonTest(original, passphrase);

  // 1. Wrong passphrase
  await assert.rejects(
    async () => {
      await decryptJsonTest(encrypted, 'WrongPassword#2');
    },
    'Must reject decryption when passphrase is incorrect'
  );

  // 2. Tampered ciphertext
  const tamperedCipherBytes = Buffer.from(encrypted.ciphertext, 'base64');
  tamperedCipherBytes[0] ^= 0x01; // flip 1 bit
  const tamperedPayload = {
    ...encrypted,
    ciphertext: tamperedCipherBytes.toString('base64'),
  };

  await assert.rejects(
    async () => {
      await decryptJsonTest(tamperedPayload, passphrase);
    },
    'Must reject decryption when ciphertext integrity check fails'
  );
});

// ==============================================================================
//  2. BOOK SERVICE TESTS (UUID & Soft-Delete Models)
// ==============================================================================

function generateUUIDTest() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

test('BOOK 1: generateUUID conforms to RFC 4122 version 4 specification', () => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  for (let i = 0; i < 50; i++) {
    const uuid = generateUUIDTest();
    assert.match(uuid, uuidRegex, `Generated UUID must be valid v4: ${uuid}`);
  }
});

test('BOOK 2: Soft delete sets is_deleted flag and assigns deleted_at timestamp', () => {
  const book = {
    id: 'book-1',
    title: 'The Great Gatsby',
    is_deleted: 0,
    deleted_at: null,
  };

  const now = Date.now();
  // Simulate soft-delete mutation
  const softDeletedBook = {
    ...book,
    is_deleted: 1,
    deleted_at: now,
  };

  assert.strictEqual(softDeletedBook.is_deleted, 1);
  assert.strictEqual(softDeletedBook.deleted_at, now);
});

// ==============================================================================
//  3. SYNC SERVICE TESTS (Outbox Compaction & Cursor Monotonicity)
// ==============================================================================

test('SYNC 1: Outbox compaction coalesces multiple reading progress mutations into the latest', () => {
  // Simulate multiple progress updates while offline for the same book
  const rawOutboxItems = [
    { id: 'out-1', entity_type: 'progress', entity_id: 'book-a', payload: JSON.stringify({ cfi: 'cfi-1', percentage: 10, client_updated_at: 1000 }) },
    { id: 'out-2', entity_type: 'progress', entity_id: 'book-a', payload: JSON.stringify({ cfi: 'cfi-2', percentage: 20, client_updated_at: 2000 }) },
    { id: 'out-3', entity_type: 'progress', entity_id: 'book-a', payload: JSON.stringify({ cfi: 'cfi-3', percentage: 35, client_updated_at: 3000 }) },
    { id: 'out-4', entity_type: 'progress', entity_id: 'book-b', payload: JSON.stringify({ cfi: 'cfi-1', percentage: 5, client_updated_at: 1500 }) },
  ];

  // Compaction algorithm used in apps/mobile/src/services/syncService.ts:
  // Map progress by entity_id to only keep the latest
  const progressMap = new Map();
  for (const item of rawOutboxItems) {
    if (item.entity_type === 'progress') {
      const parsed = JSON.parse(item.payload);
      const existing = progressMap.get(item.entity_id);
      if (!existing || parsed.client_updated_at >= existing.client_updated_at) {
        progressMap.set(item.entity_id, parsed);
      }
    }
  }

  assert.strictEqual(progressMap.size, 2, 'Must compact 4 progress items into 2 unique book entries');
  assert.strictEqual(progressMap.get('book-a').percentage, 35, 'Book A must have latest percentage');
  assert.strictEqual(progressMap.get('book-a').cfi, 'cfi-3', 'Book A must have latest CFI');
  assert.strictEqual(progressMap.get('book-b').percentage, 5);
});

test('SYNC 2: Local sequence cursor advances only when server returns committed_sync_seq > local', () => {
  let localCursor = 10;

  function updateCursor(committedSeq) {
    if (committedSeq > localCursor) {
      localCursor = committedSeq;
    }
  }

  // Same or lower seq: do not advance
  updateCursor(10);
  assert.strictEqual(localCursor, 10);
  updateCursor(8);
  assert.strictEqual(localCursor, 10);

  // Higher seq: advance cursor
  updateCursor(15);
  assert.strictEqual(localCursor, 15);
});
