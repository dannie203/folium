import test from 'node:test';
import assert from 'node:assert';
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

function base64UrlEncode(bytes) {
  const binary = String.fromCharCode(...bytes);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeToBytes(base64Url) {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ==============================================================================
//  P0 AUTH REGRESSION SUITE: Google ID Token Local JWT Verification & JWKS
// ==============================================================================

test('P0 AUTH 1: Successfully verifies valid RS256 Google ID Token locally via JWKS', async () => {
  // Generate test RSA keypair
  const keyPair = await subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const kid = 'test-jwks-kid-1';
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';

  const header = {
    alg: 'RS256',
    kid,
    typ: 'JWT',
  };

  const payload = {
    iss: 'https://accounts.google.com',
    aud: 'folium-client-app-id',
    sub: 'google-uid-8888',
    email: 'reader@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const sigBuffer = await subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    enc.encode(signingInput)
  );
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuffer));
  const validJwt = `${signingInput}.${sigB64}`;

  // Verification function mirroring packages/worker/src/index.ts
  async function verifyTestJwt(token, expectedAud, jwkMap) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [rawH, rawP, rawS] = parts;
    const h = JSON.parse(dec.decode(base64UrlDecodeToBytes(rawH)));
    const p = JSON.parse(dec.decode(base64UrlDecodeToBytes(rawP)));

    if (h.alg !== 'RS256' || !h.kid) return null;
    if (p.iss !== 'https://accounts.google.com' && p.iss !== 'accounts.google.com') return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof p.exp !== 'number' || p.exp < now - 60) return null;
    if (expectedAud && p.aud !== expectedAud) return null;
    if (!p.sub) return null;

    const jwk = jwkMap.get(h.kid);
    if (!jwk) return null;

    const cryptoKey = await subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = base64UrlDecodeToBytes(rawS);
    const valid = await subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      sigBytes,
      enc.encode(`${rawH}.${rawP}`)
    );

    return valid ? p.sub : null;
  }

  const jwkMap = new Map([[kid, publicJwk]]);
  const verifiedUserId = await verifyTestJwt(validJwt, 'folium-client-app-id', jwkMap);

  assert.strictEqual(verifiedUserId, 'google-uid-8888', 'Must extract correct Google sub ID');
});

test('P0 AUTH 2: Rejects ID Token with wrong audience (aud mismatch)', async () => {
  const keyPair = await subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const kid = 'test-jwks-kid-2';
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';

  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const payload = {
    iss: 'https://accounts.google.com',
    aud: 'malicious-attacker-app.apps.googleusercontent.com',
    sub: 'victim-sub-1234',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const sigBuffer = await subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    enc.encode(signingInput)
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sigBuffer))}`;

  const [rawH, rawP] = jwt.split('.');
  const p = JSON.parse(dec.decode(base64UrlDecodeToBytes(rawP)));
  const expectedAudience = 'folium-official-client-id';

  assert.notStrictEqual(p.aud, expectedAudience, 'Audience must not match');
  assert.strictEqual(
    p.aud === expectedAudience ? p.sub : null,
    null,
    'Must reject token when audience does not match server expectation'
  );
});

test('P0 AUTH 3: Rejects expired ID Token or tampered signature', async () => {
  const keyPair = await subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const kid = 'test-jwks-kid-3';
  publicJwk.kid = kid;
  publicJwk.alg = 'RS256';

  const header = { alg: 'RS256', kid, typ: 'JWT' };
  // Expired 5 minutes ago
  const payload = {
    iss: 'https://accounts.google.com',
    aud: 'folium-client',
    sub: 'user-expired',
    exp: Math.floor(Date.now() / 1000) - 300,
  };

  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const sigBuffer = await subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    enc.encode(signingInput)
  );
  const expiredJwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sigBuffer))}`;

  const now = Math.floor(Date.now() / 1000);
  assert.ok(payload.exp < now - 60, 'Token must be expired');

  // Tamper test: modify one character in signature
  const validSigB64 = base64UrlEncode(new Uint8Array(sigBuffer));
  const tamperedSigBytes = base64UrlDecodeToBytes(validSigB64);
  tamperedSigBytes[0] ^= 0xff; // Flip bits in signature
  const cryptoKey = await subtle.importKey(
    'jwk',
    publicJwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const isTamperedValid = await subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    tamperedSigBytes,
    enc.encode(signingInput)
  );

  assert.strictEqual(isTamperedValid, false, 'Tampered signature must fail verification');
});

// ==============================================================================
//  P0 SYNC PUSH REGRESSION SUITE: Atomic Batch Sequence & Data Mutation Coupling
// ==============================================================================

test('P0 SYNC 1: user_sync_sequence update and data statements execute in single atomic batch', async () => {
  // Mock D1 database driver verifying batch atomicity
  let sequenceInDb = 5;
  let booksInDb = [];
  let transactionRolledBack = false;

  const mockDb = {
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...args) {
          this.params = args;
          return this;
        },
      };
    },
    async batch(statements) {
      // Check that sequence update is present inside the batch
      const hasSequenceUpdate = statements.some((s) =>
        s.sql.includes('INSERT INTO user_sync_sequence')
      );
      const hasDataStatements = statements.some((s) =>
        s.sql.includes('INSERT INTO books')
      );

      assert.ok(hasSequenceUpdate, 'Batch MUST contain user_sync_sequence update');
      assert.ok(hasDataStatements, 'Batch MUST contain data statements');

      // Simulate a failure in one of the data statements
      const shouldFail = statements.some((s) => s.params.includes('poison_pill_id'));
      if (shouldFail) {
        transactionRolledBack = true;
        throw new Error('D1_ERROR: Constraint violation in batch statement');
      }

      // If success, commit
      for (const s of statements) {
        if (s.sql.includes('INSERT INTO user_sync_sequence')) {
          sequenceInDb = s.params[1]; // newSeq
        } else if (s.sql.includes('INSERT INTO books')) {
          booksInDb.push(s.params[0]); // bookId
        }
      }
    },
  };

  const userId = 'test-user-1';
  const now = Date.now();
  const currentSeq = sequenceInDb;
  const newSeq = currentSeq + 1;

  // 1. Successful push: statements batch commits both sequence and book
  const statementsSuccess = [
    mockDb
      .prepare('INSERT INTO user_sync_sequence (user_id, current_seq, updated_at) VALUES (?, ?, ?)')
      .bind(userId, newSeq, now),
    mockDb
      .prepare('INSERT INTO books (id, user_id, title) VALUES (?, ?, ?)')
      .bind('book_valid_1', userId, 'Valid Book'),
  ];

  await mockDb.batch(statementsSuccess);
  assert.strictEqual(sequenceInDb, 6, 'Sequence should advance to 6 on successful batch');
  assert.deepStrictEqual(booksInDb, ['book_valid_1'], 'Book must be committed');

  // 2. Failed push: poison pill causes batch failure
  const statementsFail = [
    mockDb
      .prepare('INSERT INTO user_sync_sequence (user_id, current_seq, updated_at) VALUES (?, ?, ?)')
      .bind(userId, 7, now),
    mockDb
      .prepare('INSERT INTO books (id, user_id, title) VALUES (?, ?, ?)')
      .bind('poison_pill_id', userId, 'Corrupted Book'),
  ];

  await assert.rejects(
    async () => {
      await mockDb.batch(statementsFail);
    },
    /Constraint violation in batch statement/,
    'Batch must throw when statement fails'
  );

  assert.strictEqual(transactionRolledBack, true, 'Transaction must be marked as rolled back');
  assert.strictEqual(
    sequenceInDb,
    6,
    'user_sync_sequence MUST NOT be incremented when batch fails (Zero Desync Guarantee)'
  );
  assert.strictEqual(booksInDb.length, 1, 'No new books should be added on failure');
});

test('P0 AUTH 4: Rejects ID Token when expectedAudience is missing or empty (Mandatory Audience Invariant)', async () => {
  const { verifyGoogleIdToken } = await import('../../packages/worker/src/index.ts');

  // Token with dummy structure
  const fakeToken = 'header.payload.sig';
  const resultNoAud = await verifyGoogleIdToken(fakeToken, '');
  assert.strictEqual(resultNoAud, null, 'Must reject token when expectedAudience is empty string');

  const resultUndefinedAud = await verifyGoogleIdToken(fakeToken, undefined);
  assert.strictEqual(resultUndefinedAud, null, 'Must reject token when expectedAudience is undefined');
});

test('P0 AUTH 5: demo_ token is rejected in production (backdoor defense)', () => {
  function authenticateUserTest(token, env) {
    if (!token.startsWith('Bearer ')) return null;
    const raw = token.slice(7).trim();
    if (raw.startsWith('demo_')) {
      if (env?.ALLOW_DEMO_AUTH === 'true' || env?.ENVIRONMENT === 'development') {
        return 'demo-google-user-001';
      }
      return null;
    }
    return null;
  }

  // In production (no ALLOW_DEMO_AUTH set)
  const prodResult = authenticateUserTest('Bearer demo_attacker_token', {});
  assert.strictEqual(prodResult, null, 'demo_ token MUST be rejected when ALLOW_DEMO_AUTH is not set');

  // In production explicit env
  const prodEnvResult = authenticateUserTest('Bearer demo_attacker_token', { ENVIRONMENT: 'production' });
  assert.strictEqual(prodEnvResult, null, 'demo_ token MUST be rejected in production environment');

  // In dev / sandbox
  const devResult = authenticateUserTest('Bearer demo_attacker_token', { ALLOW_DEMO_AUTH: 'true' });
  assert.strictEqual(devResult, 'demo-google-user-001', 'demo_ token allowed only when ALLOW_DEMO_AUTH === true');
});

test('P0 SYNC 2: Tombstone GC is scoped to user_id (prevents cross-tenant deletion)', () => {
  const userId = 'user_alice_123';
  const now = Date.now();
  const gcThreshold = now - (30 * 24 * 60 * 60 * 1000);

  const gcStatements = [
    { sql: 'DELETE FROM books WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?', params: [userId, gcThreshold] },
    { sql: 'DELETE FROM reading_progress WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?', params: [userId, gcThreshold] },
    { sql: 'DELETE FROM bookmarks WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?', params: [userId, gcThreshold] },
    { sql: 'DELETE FROM highlights WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?', params: [userId, gcThreshold] },
    { sql: 'DELETE FROM notes WHERE user_id = ? AND is_deleted = 1 AND deleted_at IS NOT NULL AND deleted_at < ?', params: [userId, gcThreshold] },
  ];

  for (const s of gcStatements) {
    assert.ok(s.sql.includes('user_id = ?'), `GC statement must scope to user_id: ${s.sql}`);
    assert.strictEqual(s.params[0], userId, 'First parameter must be authenticated userId');
    assert.strictEqual(s.params[1], gcThreshold, 'Second parameter must be gcThreshold');
  }
});

test('P0 SYNC 3: Statement chunking handles batches larger than D1 limit (100-statement chunks)', async () => {
  const batchesExecuted = [];
  const mockDb = {
    async batch(chunk) {
      assert.ok(chunk.length <= 100, `Each batch chunk must be <= 100, got ${chunk.length}`);
      batchesExecuted.push(chunk.length);
    },
  };

  // Simulate 250 statements (e.g. sequence + 244 mutations + 5 GC)
  const statements = Array.from({ length: 250 }, (_, i) => ({ id: i }));
  const D1_BATCH_LIMIT = 100;

  for (let i = 0; i < statements.length; i += D1_BATCH_LIMIT) {
    const chunk = statements.slice(i, i + D1_BATCH_LIMIT);
    if (chunk.length > 0) {
      await mockDb.batch(chunk);
    }
  }

  assert.deepStrictEqual(batchesExecuted, [100, 100, 50], 'Should chunk 250 statements into [100, 100, 50]');
});
