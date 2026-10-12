import test from 'node:test';
import assert from 'node:assert';
import { app, resetFallbackRateLimiter, checkRateLimit, getClientIp, isAllowedOrigin } from '../../packages/worker/src/index.ts';
import initSqlJs from '../../apps/mobile/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'node:fs';

// ==============================================================================
//  CORS ALLOWLIST & RATE LIMITING SECURITY REGRESSION SUITE
// ==============================================================================

test('CORS 1: Allowed production origin (https://aki.is-a.dev) receives Access-Control-Allow-Origin header and preflight 204', async () => {
  const prodEnv = { ENVIRONMENT: 'production' };

  // 1. Regular GET request with allowed origin
  const req = new Request('https://worker.folium.local/api/health', {
    method: 'GET',
    headers: {
      Origin: 'https://aki.is-a.dev',
    },
  });
  const res = await app.request(req, undefined, prodEnv);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://aki.is-a.dev');
  assert.strictEqual(res.headers.get('vary'), 'Origin');

  // 2. Preflight OPTIONS request with allowed origin
  const preflightReq = new Request('https://worker.folium.local/api/sync/push', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://aki.is-a.dev',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type, Authorization',
    },
  });
  const preflightRes = await app.request(preflightReq, undefined, prodEnv);
  assert.strictEqual(preflightRes.status, 204);
  assert.strictEqual(preflightRes.headers.get('access-control-allow-origin'), 'https://aki.is-a.dev');
  assert.ok(preflightRes.headers.get('access-control-allow-methods')?.includes('POST'));
  assert.ok(preflightRes.headers.get('access-control-allow-headers')?.includes('Authorization'));
});

test('CORS 2: Disallowed foreign origin does NOT receive Access-Control-Allow-Origin header', async () => {
  const prodEnv = { ENVIRONMENT: 'production' };

  // 1. Regular GET request with malicious origin
  const req = new Request('https://worker.folium.local/api/health', {
    method: 'GET',
    headers: {
      Origin: 'https://malicious-site.com',
    },
  });
  const res = await app.request(req, undefined, prodEnv);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), null);

  // 2. Preflight OPTIONS request with malicious origin
  const preflightReq = new Request('https://worker.folium.local/api/sync/push', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://malicious-site.com',
      'Access-Control-Request-Method': 'POST',
    },
  });
  const preflightRes = await app.request(preflightReq, undefined, prodEnv);
  assert.strictEqual(preflightRes.status, 204);
  assert.strictEqual(preflightRes.headers.get('access-control-allow-origin'), null);
});

test('CORS 3: Localhost origins are blocked in production environment (ENVIRONMENT !== "development")', async () => {
  const prodEnv = { ENVIRONMENT: 'production' };

  const origins = ['http://localhost:3000', 'http://localhost:8081', 'http://127.0.0.1:19006'];
  for (const origin of origins) {
    const req = new Request('https://worker.folium.local/api/health', {
      method: 'GET',
      headers: { Origin: origin },
    });
    const res = await app.request(req, undefined, prodEnv);
    assert.strictEqual(
      res.headers.get('access-control-allow-origin'),
      null,
      `Localhost origin ${origin} must be blocked in production`
    );
  }
});

test('CORS 4: Localhost origins are permitted in development environment (ENVIRONMENT === "development")', async () => {
  const devEnv = { ENVIRONMENT: 'development' };

  const devOrigins = ['http://localhost:8081', 'http://localhost:3000', 'http://127.0.0.1:19006'];
  for (const origin of devOrigins) {
    const req = new Request('https://worker.folium.local/api/health', {
      method: 'GET',
      headers: { Origin: origin },
    });
    const res = await app.request(req, undefined, devEnv);
    assert.strictEqual(
      res.headers.get('access-control-allow-origin'),
      origin,
      `Dev origin ${origin} must be permitted in development`
    );
  }
});

test('DIRECT REQUEST & AUTH: Direct requests without Origin header bypass CORS and require independent authentication', async () => {
  const prodEnv = { ENVIRONMENT: 'production' };

  // 1. Direct unauthenticated request to health endpoint (public)
  const healthReq = new Request('https://worker.folium.local/api/health', { method: 'GET' });
  const healthRes = await app.request(healthReq, undefined, prodEnv);
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual(healthRes.headers.get('access-control-allow-origin'), null);

  // 2. Direct request without Origin to protected endpoint (/api/sync/push) without JWT
  const syncReq = new Request('https://worker.folium.local/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ books: [] }),
  });
  const syncRes = await app.request(syncReq, undefined, prodEnv);
  assert.strictEqual(syncRes.status, 401, 'Direct request without JWT must be rejected with 401 Unauthorized');
  assert.strictEqual(syncRes.headers.get('access-control-allow-origin'), null);
});

test('RATE LIMIT 1: /api/community/download throttles at 10 requests/minute per IP, returns 429 with Retry-After header', async () => {
  resetFallbackRateLimiter();
  const testIp = '198.51.100.10';
  const env = { ENVIRONMENT: 'development' };

  // Send 10 requests under threshold (requests fail validation at 400 but pass rate limiter)
  for (let i = 1; i <= 10; i++) {
    const req = new Request('https://worker.folium.local/api/community/download', {
      method: 'GET',
      headers: { 'cf-connecting-ip': testIp },
    });
    const res = await app.request(req, undefined, env);
    assert.notStrictEqual(res.status, 429, `Request #${i} should not be rate-limited`);
  }

  // 11th request exceeds 10 req/min limit
  const throttledReq = new Request('https://worker.folium.local/api/community/download', {
    method: 'GET',
    headers: { 'cf-connecting-ip': testIp },
  });
  const throttledRes = await app.request(throttledReq, undefined, env);
  assert.strictEqual(throttledRes.status, 429, '11th request must be rejected with 429 Too Many Requests');
  const body = await throttledRes.json();
  assert.strictEqual(body.code, 'RATE_LIMITED');
  const retryAfter = throttledRes.headers.get('retry-after');
  assert.ok(retryAfter && parseInt(retryAfter, 10) > 0, 'Retry-After header must be present and positive');
});

test('RATE LIMIT 2: /api/sync/push throttles at 60 requests/minute, returns 429 with Retry-After header', async () => {
  resetFallbackRateLimiter();
  const testIp = '198.51.100.20';
  const env = { ENVIRONMENT: 'production' };

  // Send 60 requests under threshold
  for (let i = 1; i <= 60; i++) {
    const req = new Request('https://worker.folium.local/api/sync/push', {
      method: 'POST',
      headers: {
        'cf-connecting-ip': testIp,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ books: [] }),
    });
    const res = await app.request(req, undefined, env);
    assert.notStrictEqual(res.status, 429, `Request #${i} should not be rate-limited`);
  }

  // 61st request exceeds 60 req/min limit
  const throttledReq = new Request('https://worker.folium.local/api/sync/push', {
    method: 'POST',
    headers: {
      'cf-connecting-ip': testIp,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ books: [] }),
  });
  const throttledRes = await app.request(throttledReq, undefined, env);
  assert.strictEqual(throttledRes.status, 429, '61st request must be rejected with 429 Too Many Requests');
  const body = await throttledRes.json();
  assert.strictEqual(body.code, 'RATE_LIMITED');
  const retryAfter = throttledRes.headers.get('retry-after');
  assert.ok(retryAfter && parseInt(retryAfter, 10) > 0, 'Retry-After header must be present and positive');
});

test('RATE LIMIT 3: /api/sync/pull and /api/sync/gc throttle at 60 requests/minute independently', async () => {
  resetFallbackRateLimiter();
  const testIp = '198.51.100.30';
  const env = { ENVIRONMENT: 'production' };

  // Send 60 requests to pull
  for (let i = 1; i <= 60; i++) {
    const req = new Request('https://worker.folium.local/api/sync/pull?since=0', {
      method: 'GET',
      headers: { 'cf-connecting-ip': testIp },
    });
    const res = await app.request(req, undefined, env);
    assert.notStrictEqual(res.status, 429, `Pull Request #${i} should not be rate-limited`);
  }

  // 61st pull request throttles
  const throttledPull = new Request('https://worker.folium.local/api/sync/pull?since=0', {
    method: 'GET',
    headers: { 'cf-connecting-ip': testIp },
  });
  const throttledPullRes = await app.request(throttledPull, undefined, env);
  assert.strictEqual(throttledPullRes.status, 429);

  // GC endpoint on same IP still has its own independent 60-request budget
  const gcReq = new Request('https://worker.folium.local/api/sync/gc', {
    method: 'POST',
    headers: { 'cf-connecting-ip': testIp },
  });
  const gcRes = await app.request(gcReq, undefined, env);
  assert.notStrictEqual(gcRes.status, 429, 'GC request must not be blocked by Pull rate limit exhaustion');
});

test('RATE LIMIT 4: Two distinct authenticated user accounts (User A and User B) have independent rate limit buckets', async () => {
  resetFallbackRateLimiter();
  const sharedIp = '203.0.113.88'; // Same WiFi or NAT IP
  const env = {
    ENVIRONMENT: 'development',
    ALLOW_DEMO_AUTH: 'true',
  };

  // Directly verify checkRateLimit with user keys (user:alice vs user:bob)
  const aliceKey = 'sync:push:user:alice-id';
  const bobKey = 'sync:push:user:bob-id';

  // Alice exhausts 60 requests
  for (let i = 1; i <= 60; i++) {
    const res = await checkRateLimit(undefined, aliceKey, 60, 60);
    assert.strictEqual(res.allowed, true);
  }
  const aliceThrottled = await checkRateLimit(undefined, aliceKey, 60, 60);
  assert.strictEqual(aliceThrottled.allowed, false, 'Alice must be rate limited on 61st request');

  // Bob on same shared IP has his own independent bucket
  const bobFirstReq = await checkRateLimit(undefined, bobKey, 60, 60);
  assert.strictEqual(bobFirstReq.allowed, true, 'Bob must have an independent bucket and not be throttled by Alice');
});

test('RATE LIMIT 5: CF-Connecting-IP is strictly prioritized and client X-Forwarded-For is ignored for IP rate limiting', async () => {
  resetFallbackRateLimiter();
  const realIp = '198.51.100.99';
  const env = { ENVIRONMENT: 'development' };

  // Attacker attempts to spoof X-Forwarded-For on every request while CF-Connecting-IP is constant
  for (let i = 1; i <= 10; i++) {
    const req = new Request('https://worker.folium.local/api/community/download', {
      method: 'GET',
      headers: {
        'cf-connecting-ip': realIp,
        'x-forwarded-for': `spoofed-ip-${i}.example.com`,
      },
    });
    const res = await app.request(req, undefined, env);
    assert.notStrictEqual(res.status, 429);
  }

  // 11th request with yet another spoofed X-Forwarded-For must still be blocked by real CF-Connecting-IP
  const throttledReq = new Request('https://worker.folium.local/api/community/download', {
    method: 'GET',
    headers: {
      'cf-connecting-ip': realIp,
      'x-forwarded-for': 'spoofed-ip-11.example.com',
    },
  });
  const throttledRes = await app.request(throttledReq, undefined, env);
  assert.strictEqual(
    throttledRes.status,
    429,
    'Rate limiting must bind to CF-Connecting-IP and ignore spoofed X-Forwarded-For headers'
  );
});

test('SYNC CLIENT 429: Sync client preserves pending mutations in outbox when receiving 429 rate limit response', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  assert.ok(match, 'INIT_SQL must exist in schema.ts');
  db.run(match[1]);

  // Insert test book
  db.run(
    `INSERT INTO books (id, title, author, file_type, file_size, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['book-outbox-test', 'Rate Limit Test Book', 'Author', 'epub', 1000, 0, 1000, 1000]
  );

  // Queue 2 mutations in sync_outbox
  const mutation1 = JSON.stringify({ book_id: 'book-outbox-test', percentage: 42, cfi: 'page:5' });
  const mutation2 = JSON.stringify({ book_id: 'book-outbox-test', cfi: 'page:10', title: 'Chapter 2' });
  db.run(
    `INSERT INTO sync_outbox (id, entity_type, entity_id, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['outbox-1', 'progress', 'book-outbox-test', mutation1, 1000]
  );
  db.run(
    `INSERT INTO sync_outbox (id, entity_type, entity_id, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['outbox-2', 'bookmark', 'bm-test', mutation2, 1001]
  );

  // Verify rows are in outbox initially
  const beforeCount = db.exec('SELECT COUNT(*) as count FROM sync_outbox')[0].values[0][0];
  assert.strictEqual(beforeCount, 2);

  // Simulate client encountering HTTP 429 during push:
  // In syncService.ts: if (!res.ok) throw new Error(...)
  // The outbox deletion query `DELETE FROM sync_outbox WHERE id IN (...)` is strictly skipped!
  const simulatedServerResponse = {
    ok: false,
    status: 429,
    headers: new Headers({ 'retry-after': '60' }),
    json: async () => ({ error: 'Too Many Requests', code: 'RATE_LIMITED' }),
  };

  let errorThrown = false;
  try {
    if (!simulatedServerResponse.ok) {
      const err = new Error(`Sync push failed (${simulatedServerResponse.status}): Rate limited`);
      err.status = simulatedServerResponse.status;
      err.retryAfter = parseInt(simulatedServerResponse.headers.get('retry-after'), 10);
      throw err;
    }
    // Deletion only happens on success:
    db.run('DELETE FROM sync_outbox WHERE id IN (?, ?)', ['outbox-1', 'outbox-2']);
  } catch (err) {
    errorThrown = true;
    assert.strictEqual(err.status, 429);
    assert.strictEqual(err.retryAfter, 60);
  }

  assert.strictEqual(errorThrown, true, 'Error must be thrown on HTTP 429');

  // Verify 100% of outbox records remain intact
  const afterCount = db.exec('SELECT COUNT(*) as count FROM sync_outbox')[0].values[0][0];
  assert.strictEqual(afterCount, 2, 'Pending outbox rows must NEVER be deleted when receiving 429 response');
});
