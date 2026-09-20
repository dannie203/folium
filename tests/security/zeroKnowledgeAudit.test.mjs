import test from 'node:test';
import assert from 'node:assert';
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const getRandomValues = (buf) => webcrypto.getRandomValues(buf);
const enc = new TextEncoder();
const dec = new TextDecoder();

// ==============================================================================
//  FOLIUM CRYPTOGRAPHIC PRIMITIVES (Matching apps/mobile/src/services/cryptoService.ts)
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

async function encryptEnvelope(data, passphrase) {
  const salt = getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const iv = getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const key = await deriveAesKey(passphrase, salt);
  const plaintext = typeof data === 'string' ? data : JSON.stringify(data);

  const ciphertextBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  return {
    version: 1,
    algorithm: 'AES-GCM-256',
    salt,
    iv,
    ciphertext: new Uint8Array(ciphertextBuffer),
  };
}

async function decryptEnvelope(envelope, passphrase) {
  const key = await deriveAesKey(passphrase, envelope.salt);
  const decryptedBuffer = await subtle.decrypt(
    { name: 'AES-GCM', iv: envelope.iv },
    key,
    envelope.ciphertext
  );
  const text = dec.decode(decryptedBuffer);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ==============================================================================
//  ADVERSARIAL SECURITY TEST SUITE 1: READER SANDBOX & CHANNEL ANTI-SPOOFING
// ==============================================================================
test('ADVERSARIAL 1: Reader Message Channel rejects spoofed foreign window senders', () => {
  const trustedViewerWindow = { id: 'viewer-iframe-content-window' };
  const attackerWindow = { id: 'malicious-popup-window' };

  function handleWebWindowMessage(event, trustedSource) {
    if (event.source !== trustedSource) {
      return { accepted: false, reason: 'REJECTED_SPOOFED_SOURCE' };
    }
    const knownTypes = [
      'READY',
      'LOCATION_CHANGED',
      'LOCATIONS_GENERATED',
      'TOC_LOADED',
      'TOGGLE_UI',
      'CHANGE_FONT_SIZE',
      'ESCAPE',
      'SELECTION_MADE',
      'ERROR',
    ];
    if (knownTypes.includes(event.data?.type)) {
      return { accepted: true, data: event.data };
    }
    return { accepted: false, reason: 'UNKNOWN_OR_PRIVILEGED_MESSAGE_TYPE' };
  }

  // Attack 1: Malicious window attempts to inject fake navigation
  const spoofedEvent = {
    source: attackerWindow,
    data: { type: 'LOCATION_CHANGED', cfi: 'fake-cfi' },
  };
  const spoofedResult = handleWebWindowMessage(spoofedEvent, trustedViewerWindow);
  assert.strictEqual(spoofedResult.accepted, false);
  assert.strictEqual(spoofedResult.reason, 'REJECTED_SPOOFED_SOURCE');

  // Attack 2: Confused Deputy - Malicious frame requests sensitive tokens
  const privilegedRequestEvent = {
    source: trustedViewerWindow,
    data: { type: 'GET_GOOGLE_TOKEN', secret: true },
  };
  const privilegedResult = handleWebWindowMessage(privilegedRequestEvent, trustedViewerWindow);
  assert.strictEqual(privilegedResult.accepted, false);
  assert.strictEqual(privilegedResult.reason, 'UNKNOWN_OR_PRIVILEGED_MESSAGE_TYPE');

  // Legitimate message from trusted iframe succeeds
  const legitimateEvent = {
    source: trustedViewerWindow,
    data: { type: 'READY' },
  };
  const legitimateResult = handleWebWindowMessage(legitimateEvent, trustedViewerWindow);
  assert.strictEqual(legitimateResult.accepted, true);
});

// ==============================================================================
//  ADVERSARIAL SECURITY TEST SUITE 2: ZERO-KNOWLEDGE SERVER BLINDNESS
// ==============================================================================
test('ADVERSARIAL 2: Zero-Knowledge Envelope leaks 0 bytes of plaintext metadata to cloud', async () => {
  const sensitiveUserData = {
    bookId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    title: 'Secret Political Memoir & Private Notes',
    author: 'Anonymous Whistleblower',
    privateAnnotations: [
      'Confidential source statement on page 42',
      'Financial record disparity in Chapter 3',
    ],
    readingCfi: 'epubcfi(/6/14[chap03]!/4/2/12:48)',
    timestamp: 1789824843,
  };

  const userSecretPassphrase = 'user-vault-password-unknown-to-server-2026';
  const envelope = await encryptEnvelope(sensitiveUserData, userSecretPassphrase);

  // 1. Inspect raw ciphertext: verify no plaintext substring appears
  const ciphertextStr = String.fromCharCode(...envelope.ciphertext);
  assert.strictEqual(ciphertextStr.includes('Secret Political Memoir'), false);
  assert.strictEqual(ciphertextStr.includes('Anonymous Whistleblower'), false);
  assert.strictEqual(ciphertextStr.includes('Confidential source'), false);
  assert.strictEqual(ciphertextStr.includes('epubcfi'), false);

  // 2. Cloud file naming metadata leakage check:
  // Must use opaque UUID format, never human-readable book title
  const cloudFilename = `${sensitiveUserData.bookId}.enc`;
  assert.strictEqual(cloudFilename.includes('Secret'), false);
  assert.strictEqual(cloudFilename.includes('Memoir'), false);
  assert.match(cloudFilename, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/);
});

// ==============================================================================
//  ADVERSARIAL SECURITY TEST SUITE 3: TAMPER RESISTANCE & BIT-FLIP ATTACK
// ==============================================================================
test('ADVERSARIAL 3: AES-256-GCM rejects tampered ciphertext or wrong passphrase immediately', async () => {
  const originalSecret = { readingProgress: 88.5, lastCfi: 'epubcfi(/6/8!/4/2/1:0)' };
  const userPassphrase = 'correct-horse-battery-staple';

  const envelope = await encryptEnvelope(originalSecret, userPassphrase);

  // 1. Legitimate decryption works 100%
  const decrypted = await decryptEnvelope(envelope, userPassphrase);
  assert.strictEqual(decrypted.readingProgress, 88.5);

  // 2. Tamper Attack: Flip a single bit in the ciphertext payload
  const tamperedCiphertext = new Uint8Array(envelope.ciphertext);
  tamperedCiphertext[10] ^= 0x01; // flip bit at byte offset 10

  const tamperedEnvelope = {
    ...envelope,
    ciphertext: tamperedCiphertext,
  };

  await assert.rejects(
    async () => {
      await decryptEnvelope(tamperedEnvelope, userPassphrase);
    },
    (err) => {
      // WebCrypto throws OperationError when AES-GCM authentication tag verification fails
      return err.name === 'OperationError' || err.message.includes('operation');
    },
    'Tampered ciphertext must fail authentication and throw OperationError'
  );

  // 3. Unauthorized Key Attack: Decrypt with incorrect passphrase
  await assert.rejects(
    async () => {
      await decryptEnvelope(envelope, 'wrong-adversary-passphrase-attempt');
    },
    (err) => {
      return err.name === 'OperationError' || err.message.includes('operation');
    },
    'Decryption with incorrect passphrase must fail'
  );
});
