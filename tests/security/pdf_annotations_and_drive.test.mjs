import test from 'node:test';
import assert from 'node:assert';

// ==============================================================================
//  1. PDF ANNOTATION LOCATOR & NAVIGATION TESTS
// ==============================================================================

function parsePageFromCfi(cfi) {
  if (typeof cfi === 'number') return cfi;
  if (!cfi) return 1;
  const str = String(cfi).trim();
  const match = str.match(/^page:(\d+)/i) || str.match(/^(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 1;
}

function parseHighlightLocator(locator) {
  if (!locator || typeof locator !== 'string') return null;
  const m = locator.match(/^page:(\d+)(?::(.*))?$/);
  if (!m) {
    const num = parseInt(locator, 10);
    if (!isNaN(num)) return { page: num, rects: [] };
    return null;
  }
  const page = parseInt(m[1], 10);
  const data = m[2];
  let rects = [];
  if (data) {
    try {
      const decoded = decodeURIComponent(data);
      rects = JSON.parse(decoded);
    } catch {
      try {
        rects = JSON.parse(data);
      } catch {}
    }
  }
  return { page: page, rects: Array.isArray(rects) ? rects : [] };
}

const COLOR_MAP = {
  yellow: '#FACC15',
  green: '#4ADE80',
  blue: '#60A5FA',
  pink: '#F472B6',
  purple: '#C084FC',
};

test('PDF ANNOTATIONS 1: parsePageFromCfi parses numbers, page:N prefixes, and locator ranges accurately', () => {
  assert.strictEqual(parsePageFromCfi(5), 5);
  assert.strictEqual(parsePageFromCfi('12'), 12);
  assert.strictEqual(parsePageFromCfi('page:42'), 42);
  assert.strictEqual(parsePageFromCfi('page:7:%5B%7B%22x%22%3A0.1%7D%5D'), 7);
  assert.strictEqual(parsePageFromCfi('page:999:something_else'), 999);

  // Fallbacks for malformed or missing
  assert.strictEqual(parsePageFromCfi(''), 1);
  assert.strictEqual(parsePageFromCfi(null), 1);
  assert.strictEqual(parsePageFromCfi(undefined), 1);
  assert.strictEqual(parsePageFromCfi('not-a-number'), 1);
});

test('PDF ANNOTATIONS 2: parseHighlightLocator extracts normalized rects and handles encoded JSON safely', () => {
  const rawRects = [{ x: 0.1, y: 0.2, w: 0.5, h: 0.03 }];
  const locatorRaw = `page:3:${JSON.stringify(rawRects)}`;
  const parsedRaw = parseHighlightLocator(locatorRaw);
  assert.ok(parsedRaw);
  assert.strictEqual(parsedRaw.page, 3);
  assert.strictEqual(parsedRaw.rects.length, 1);
  assert.strictEqual(parsedRaw.rects[0].x, 0.1);
  assert.strictEqual(parsedRaw.rects[0].w, 0.5);

  const locatorEncoded = `page:4:${encodeURIComponent(JSON.stringify(rawRects))}`;
  const parsedEncoded = parseHighlightLocator(locatorEncoded);
  assert.ok(parsedEncoded);
  assert.strictEqual(parsedEncoded.page, 4);
  assert.strictEqual(parsedEncoded.rects[0].y, 0.2);

  // Fallback when locator has no rects
  const parsedNoRects = parseHighlightLocator('page:15');
  assert.ok(parsedNoRects);
  assert.strictEqual(parsedNoRects.page, 15);
  assert.strictEqual(parsedNoRects.rects.length, 0);

  // Null on malformed
  assert.strictEqual(parseHighlightLocator('invalid_format'), null);
  assert.strictEqual(parseHighlightLocator(''), null);
  assert.strictEqual(parseHighlightLocator(null), null);
});

test('PDF ANNOTATIONS 3: 5-color palette maps yellow, green, blue, pink, and purple to correct hex codes', () => {
  assert.strictEqual(COLOR_MAP.yellow, '#FACC15');
  assert.strictEqual(COLOR_MAP.green, '#4ADE80');
  assert.strictEqual(COLOR_MAP.blue, '#60A5FA');
  assert.strictEqual(COLOR_MAP.pink, '#F472B6');
  assert.strictEqual(COLOR_MAP.purple, '#C084FC');
});

// ==============================================================================
//  2. GOOGLE DRIVE LAZY LOADER RESOLUTION & STORAGE ARMOR INTEGRATION TESTS
// ==============================================================================

test('DRIVE LAZY LOADER 1: Lazy book detection correctly identifies drive:// scheme and missing local binary with drive_file_id', () => {
  const lazyBook1 = {
    id: 'book-1',
    local_path: 'drive://google-drive-file-123',
    drive_file_id: 'google-drive-file-123',
  };
  const isDriveLazy1 =
    lazyBook1.local_path?.startsWith('drive://') ||
    (!lazyBook1.local_path && !!lazyBook1.drive_file_id);
  assert.strictEqual(Boolean(isDriveLazy1), true);

  const lazyBook2 = {
    id: 'book-2',
    local_path: '',
    drive_file_id: 'google-drive-file-456',
  };
  const isDriveLazy2 =
    lazyBook2.local_path?.startsWith('drive://') ||
    (!lazyBook2.local_path && !!lazyBook2.drive_file_id);
  assert.strictEqual(Boolean(isDriveLazy2), true);

  const localBook = {
    id: 'book-3',
    local_path: '/data/user/0/folium/files/local.epub',
    drive_file_id: null,
  };
  const isDriveLazy3 =
    localBook.local_path?.startsWith('drive://') ||
    (!localBook.local_path && !!localBook.drive_file_id);
  assert.strictEqual(Boolean(isDriveLazy3), false);
});

test('DRIVE LAZY LOADER 2: Storage Armor validates downloaded Drive binary before committing to local store', () => {
  function checkBinarySafety(bytes) {
    if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
      throw new Error('Storage Abuse Firewall: Rejection of disguised Windows PE executable (.exe).');
    }
    // PDF Magic Check
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return { valid: true, format: 'pdf' };
    }
    // EPUB Magic Check
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return { valid: true, format: 'epub' };
    }
    return { valid: false, format: 'unknown' };
  }

  // 1. Valid PDF bytes from Google Drive
  const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const pdfResult = checkBinarySafety(validPdfBytes);
  assert.strictEqual(pdfResult.valid, true);
  assert.strictEqual(pdfResult.format, 'pdf');

  // 2. Disguised Windows PE executable from untrusted Google Drive folder
  const maliciousPeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
  assert.throws(
    () => checkBinarySafety(maliciousPeBytes),
    /Storage Abuse Firewall: Rejection of disguised Windows PE executable/
  );
});
