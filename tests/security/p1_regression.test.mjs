import test from 'node:test';
import assert from 'node:assert';
import initSqlJs from '../../apps/mobile/node_modules/sql.js/dist/sql-wasm.js';
import fs from 'node:fs';

// ==============================================================================
//  P1 PROXY REGRESSION SUITE: SSRF, IP Range Defense & Redirect Allowlist
// ==============================================================================

import { validateDownloadTargetUrl } from '../../packages/worker/src/index.ts';

test('P1 PROXY 1: Allows verified official HTTPS OPDS download domains', () => {
  const allowed = [
    'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub',
    'https://www.gutenberg.org/ebooks/84.epub3.images',
    'https://aleph.gutenberg.org/1/2/3/book.epub',
  ];

  for (const url of allowed) {
    const res = validateDownloadTargetUrl(url);
    assert.strictEqual(res.valid, true, `URL should be valid: ${url}`);
  }
});

test('P1 PROXY 2: Blocks non-HTTPS, foreign domains, and malicious redirect targets', () => {
  const blocked = [
    'http://standardebooks.org/ebooks/book.epub', // HTTP rejected
    'https://attacker.com/malicious.epub', // Not allowlisted
    'https://standardebooks.org.evil.com/fake.epub', // Subdomain confusion
    'https://gutenberg.org:8443/book.epub', // Non-standard port
    'https://gutenberg.org@evil.com/book.epub', // Userinfo spoofing
  ];

  for (const url of blocked) {
    const res = validateDownloadTargetUrl(url);
    assert.strictEqual(res.valid, false, `URL should be rejected: ${url}`);
  }
});

test('P1 PROXY 3: Blocks SSRF targets (Cloud metadata, Loopback, Private RFC1918 IPs)', () => {
  const ssrfTargets = [
    'https://169.254.169.254/latest/meta-data/', // AWS/GCP instance metadata
    'https://127.0.0.1:443/admin', // Localhost
    'https://localhost/secret', // Localhost name
    'https://10.0.0.1/internal-api', // 10.0.0.0/8
    'https://172.16.0.1/db', // 172.16.0.0/12
    'https://192.168.1.1/router', // 192.168.0.0/16
    'https://[::1]/metrics', // IPv6 loopback
    'https://[fe80::1]/', // IPv6 link-local
  ];

  for (const url of ssrfTargets) {
    const res = validateDownloadTargetUrl(url);
    assert.strictEqual(res.valid, false, `SSRF target should be rejected: ${url}`);
  }
});

// ==============================================================================
//  P1 WEB SQLITE ENGINE REGRESSION SUITE: sql.js WASM Engine & Persistence
// ==============================================================================

test('P1 WEB DB 1: sql.js executes full Folium schema and performs typed queries', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const schemaContent = fs.readFileSync('apps/mobile/src/db/schema.ts', 'utf-8');
  const match = schemaContent.match(/export const INIT_SQL = \x60([\s\S]*?)\x60;/);
  assert.ok(match, 'INIT_SQL must exist in schema.ts');
  db.run(match[1]);

  // Insert a book
  const now = Date.now();
  db.run(
    `INSERT INTO books (id, title, author, file_type, file_size, shelf, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['book-test-1', 'Pride and Prejudice', 'Jane Austen', 'epub', 1048576, 'Classics', 0, now, now]
  );

  // Insert progress
  db.run(
    `INSERT INTO reading_progress (id, book_id, cfi, percentage, client_updated_at, is_deleted, sync_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['prog-test-1', 'book-test-1', 'epubcfi(/6/4!/4/2/1:0)', 42.5, now, 0, 1]
  );

  // Complex query: JOIN between books and progress
  const stmt = db.prepare(
    `SELECT b.id, b.title, b.author, b.shelf, p.percentage, p.cfi
     FROM books b
     LEFT JOIN reading_progress p ON b.id = p.book_id
     WHERE b.is_deleted = 0 AND b.id = ?`,
    ['book-test-1']
  );

  assert.strictEqual(stmt.step(), true, 'Must find joined record');
  const record = stmt.getAsObject();
  assert.strictEqual(record.title, 'Pride and Prejudice');
  assert.strictEqual(record.percentage, 42.5);
  assert.strictEqual(record.cfi, 'epubcfi(/6/4!/4/2/1:0)');
  stmt.free();

  // Test binary export & restore
  const binary = db.export();
  assert.ok(binary instanceof Uint8Array, 'Export must be Uint8Array');
  assert.ok(binary.length > 0, 'Exported database binary must not be empty');

  // Restore into a new database instance
  const restoredDb = new SQL.Database(binary);
  const restoreStmt = restoredDb.prepare('SELECT count(*) as cnt FROM books');
  assert.strictEqual(restoreStmt.step(), true);
  assert.strictEqual(restoreStmt.getAsObject().cnt, 1, 'Restored database must retain all records');
  restoreStmt.free();
});
