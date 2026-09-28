import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
//  STORAGE ARMOR, INGESTION GATEKEEPER & ZERO-EXFILTRATION SANDBOX TEST SUITE
// ==============================================================================

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // %PDF-
const PDF_EOF_MARKER = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];
const ZIP_CENTRAL_HEADER = [0x50, 0x4b, 0x01, 0x02];
const ZIP_EOCD_SIGNATURE = [0x50, 0x4b, 0x05, 0x06];

const PE_SIGNATURE = [0x4d, 0x5a];
const ELF_SIGNATURE = [0x7f, 0x45, 0x4c, 0x46];
const SHELL_SIGNATURE = [0x23, 0x21];
const MACHO_32 = [0xfe, 0xed, 0xfa, 0xce];

const MAX_TOTAL_UNCOMPRESSED_SIZE = 300 * 1024 * 1024;
const MAX_DECOMPRESSION_RATIO = 100;
const MAX_ENTRY_COUNT = 2000;
const MAX_PDF_TRAILER_SCAN = 1024;

function hasPrefix(bytes, prefix) {
  if (bytes.length < prefix.length) return false;
  return prefix.every((val, idx) => bytes[idx] === val);
}

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes, offset) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function bytesToAscii(bytes, start, length) {
  let str = '';
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return str;
}

function checkDisallowedBinaries(bytes) {
  if (hasPrefix(bytes, PE_SIGNATURE)) {
    throw new Error('Storage Abuse Firewall: Rejection of disguised Windows PE executable (.exe).');
  }
  if (hasPrefix(bytes, ELF_SIGNATURE)) {
    throw new Error('Storage Abuse Firewall: Rejection of disguised ELF binary.');
  }
  if (hasPrefix(bytes, SHELL_SIGNATURE)) {
    throw new Error('Storage Abuse Firewall: Rejection of disguised shell script.');
  }
  if (hasPrefix(bytes, MACHO_32)) {
    throw new Error('Storage Abuse Firewall: Rejection of disguised Mach-O binary.');
  }
}

function hasPdfTrailer(bytes) {
  const start = Math.max(0, bytes.length - MAX_PDF_TRAILER_SCAN);
  for (let index = start; index <= bytes.length - PDF_EOF_MARKER.length; index++) {
    let matches = true;
    for (let m = 0; m < PDF_EOF_MARKER.length; m++) {
      if (bytes[index + m] !== PDF_EOF_MARKER[m]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function validatePdf(bytes) {
  checkDisallowedBinaries(bytes);
  if (bytes.length < 16) throw new Error('File PDF rỗng hoặc bị hỏng.');
  if (!hasPrefix(bytes, PDF_SIGNATURE)) {
    throw new Error('File không phải PDF hợp lệ: thiếu header %PDF-.');
  }
  if (!hasPdfTrailer(bytes)) {
    throw new Error('File không phải PDF hợp lệ: thiếu trailer %%EOF.');
  }
}

function validateEpub(bytes) {
  checkDisallowedBinaries(bytes);
  if (bytes.length < 58) throw new Error('File EPUB rỗng hoặc bị hỏng.');
  if (!hasPrefix(bytes, ZIP_LOCAL_HEADER)) {
    throw new Error('File không phải EPUB hợp lệ: thiếu ZIP signature PK\\x03\\x04.');
  }

  const compressionMethod = readUint16LE(bytes, 8);
  if (compressionMethod !== 0) {
    throw new Error('File không phải EPUB hợp lệ: mimetype phải được lưu không nén (STORED).');
  }

  const filenameLen = readUint16LE(bytes, 26);
  const extraLen = readUint16LE(bytes, 28);
  if (filenameLen !== 8) {
    throw new Error('File không phải EPUB hợp lệ: entry đầu tiên phải là "mimetype".');
  }

  const filename = bytesToAscii(bytes, 30, filenameLen);
  if (filename !== 'mimetype') {
    throw new Error(`File không phải EPUB hợp lệ: entry đầu tiên là "${filename}", kỳ vọng "mimetype".`);
  }

  const contentOffset = 30 + filenameLen + extraLen;
  const mimePrefix = 'application/epub+zip';
  if (contentOffset + mimePrefix.length > bytes.length) {
    throw new Error('File EPUB bị cắt cụt, không đủ dữ liệu mimetype.');
  }

  const mimeContent = bytesToAscii(bytes, contentOffset, mimePrefix.length);
  if (mimeContent !== mimePrefix) {
    throw new Error(`File không phải EPUB hợp lệ: nội dung mimetype không đúng (${mimeContent}).`);
  }

  const minEocdOffset = Math.max(0, bytes.length - 65557);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minEocdOffset; i--) {
    if (
      bytes[i] === ZIP_EOCD_SIGNATURE[0] &&
      bytes[i + 1] === ZIP_EOCD_SIGNATURE[1] &&
      bytes[i + 2] === ZIP_EOCD_SIGNATURE[2] &&
      bytes[i + 3] === ZIP_EOCD_SIGNATURE[3]
    ) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('File ZIP bị hỏng: không tìm thấy End of Central Directory.');
  }

  const totalEntries = readUint16LE(bytes, eocdOffset + 10);
  const cdSize = readUint32LE(bytes, eocdOffset + 12);
  const cdOffset = readUint32LE(bytes, eocdOffset + 16);

  if (totalEntries > MAX_ENTRY_COUNT) {
    throw new Error(`Zip bomb detected: số lượng file con (${totalEntries}) vượt quá ngưỡng an toàn (${MAX_ENTRY_COUNT}).`);
  }

  if (cdOffset + cdSize > bytes.length) {
    throw new Error('File ZIP bị hỏng: Central Directory vượt quá kích thước file.');
  }

  let currentOffset = cdOffset;
  let totalUncompressedSize = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (currentOffset + 46 > bytes.length) {
      throw new Error('File ZIP bị hỏng: Central Directory header bị cắt cụt.');
    }

    if (
      bytes[currentOffset] !== ZIP_CENTRAL_HEADER[0] ||
      bytes[currentOffset + 1] !== ZIP_CENTRAL_HEADER[1] ||
      bytes[currentOffset + 2] !== ZIP_CENTRAL_HEADER[2] ||
      bytes[currentOffset + 3] !== ZIP_CENTRAL_HEADER[3]
    ) {
      throw new Error('File ZIP bị hỏng: Central Directory entry signature không khớp.');
    }

    const compressedSize = readUint32LE(bytes, currentOffset + 20);
    const uncompressedSize = readUint32LE(bytes, currentOffset + 24);
    const fnLen = readUint16LE(bytes, currentOffset + 28);
    const extraFieldLen = readUint16LE(bytes, currentOffset + 30);
    const commentLen = readUint16LE(bytes, currentOffset + 32);

    if (compressedSize > 0 && uncompressedSize > 10 * 1024 * 1024) {
      const entryRatio = uncompressedSize / compressedSize;
      if (entryRatio > MAX_DECOMPRESSION_RATIO) {
        throw new Error(`Zip bomb detected: tỉ lệ nén file đơn (${Math.round(entryRatio)}:1) vượt quá giới hạn an toàn.`);
      }
    }

    totalUncompressedSize += uncompressedSize;
    if (totalUncompressedSize > MAX_TOTAL_UNCOMPRESSED_SIZE) {
      const sizeMb = Math.round(totalUncompressedSize / (1024 * 1024));
      throw new Error(`Zip bomb detected: tổng dung lượng sau giải nén (~${sizeMb} MB) vượt quá giới hạn an toàn (300 MB).`);
    }

    currentOffset += 46 + fnLen + extraFieldLen + commentLen;
  }

  if (bytes.length > 1024) {
    const cumulativeRatio = totalUncompressedSize / bytes.length;
    if (cumulativeRatio > MAX_DECOMPRESSION_RATIO) {
      throw new Error(`Zip bomb detected: tỉ lệ nén toàn bộ archive (${Math.round(cumulativeRatio)}:1) vượt quá ngưỡng an toàn 100:1.`);
    }
  }
}

function buildValidEpub(extraEntries = [], customMimeCompression = 0, customMimeContent = 'application/epub+zip', customMimeName = 'mimetype') {
  const mimeContentBuf = Buffer.from(customMimeContent, 'ascii');
  const mimeNameBuf = Buffer.from(customMimeName, 'ascii');

  const localHeader = Buffer.from([
    0x50, 0x4b, 0x03, 0x04,
    0x14, 0x00,
    0x00, 0x00,
    customMimeCompression & 0xff, (customMimeCompression >> 8) & 0xff,
    0x00, 0x00, 0x00, 0x00,
    0x26, 0x8a, 0x6e, 0x2e,
    mimeContentBuf.length & 0xff, (mimeContentBuf.length >> 8) & 0xff, 0, 0,
    mimeContentBuf.length & 0xff, (mimeContentBuf.length >> 8) & 0xff, 0, 0,
    mimeNameBuf.length & 0xff, (mimeNameBuf.length >> 8) & 0xff,
    0x00, 0x00
  ]);
  const localPart = Buffer.concat([localHeader, mimeNameBuf, mimeContentBuf]);

  const centralHeader = Buffer.from([
    0x50, 0x4b, 0x01, 0x02,
    0x14, 0x00,
    0x14, 0x00,
    0x00, 0x00,
    customMimeCompression & 0xff, (customMimeCompression >> 8) & 0xff,
    0x00, 0x00, 0x00, 0x00,
    0x26, 0x8a, 0x6e, 0x2e,
    mimeContentBuf.length & 0xff, (mimeContentBuf.length >> 8) & 0xff, 0, 0,
    mimeContentBuf.length & 0xff, (mimeContentBuf.length >> 8) & 0xff, 0, 0,
    mimeNameBuf.length & 0xff, (mimeNameBuf.length >> 8) & 0xff,
    0x00, 0x00,
    0x00, 0x00,
    0x00, 0x00,
    0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00
  ]);
  const centralPartChunks = [Buffer.concat([centralHeader, mimeNameBuf])];

  let totalEntries = 1;
  for (const entry of extraEntries) {
    totalEntries++;
    const nameBuf = Buffer.from(entry.name, 'ascii');
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); // flags
    ch.writeUInt16LE(entry.compression || 0, 10);
    ch.writeUInt32LE(entry.compressedSize || 10, 20);
    ch.writeUInt32LE(entry.uncompressedSize || 10, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    centralPartChunks.push(Buffer.concat([ch, nameBuf]));
  }

  const centralPart = Buffer.concat(centralPartChunks);
  const cdLen = centralPart.length;
  const cdOff = localPart.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(totalEntries, 8);
  eocd.writeUInt16LE(totalEntries, 10);
  eocd.writeUInt32LE(cdLen, 12);
  eocd.writeUInt32LE(cdOff, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localPart, centralPart, eocd]);
}

// ==============================================================================
//  TESTS
// ==============================================================================

test('STORAGE ARMOR 1: Valid PDF with %PDF- prefix and %%EOF trailer passes validation', () => {
  const validPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n123\n%%EOF\n');
  assert.doesNotThrow(() => validatePdf(new Uint8Array(validPdf)));
});

test('STORAGE ARMOR 2: PDF missing %%EOF trailer is rejected', () => {
  const invalidPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ncorrupted trailing data');
  assert.throws(
    () => validatePdf(new Uint8Array(invalidPdf)),
    /thiếu trailer %%EOF/
  );
});

test('STORAGE ARMOR 3: Disguised Windows PE executable (.exe) is rejected by Storage Abuse Firewall', () => {
  const fakeExePdf = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from('This program cannot be run in DOS mode.')]);
  assert.throws(
    () => validatePdf(new Uint8Array(fakeExePdf)),
    /Storage Abuse Firewall: Rejection of disguised Windows PE executable/
  );
});

test('STORAGE ARMOR 4: Disguised ELF binary is rejected by Storage Abuse Firewall', () => {
  const fakeElf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from('ELF binary content')]);
  assert.throws(
    () => validatePdf(new Uint8Array(fakeElf)),
    /Storage Abuse Firewall: Rejection of disguised ELF binary/
  );
});

test('STORAGE ARMOR 5: Disguised shell script (#!) is rejected by Storage Abuse Firewall', () => {
  const fakeShell = Buffer.from('#!/bin/bash\nrm -rf /tmp/data\n');
  assert.throws(
    () => validateEpub(new Uint8Array(fakeShell)),
    /Storage Abuse Firewall: Rejection of disguised shell script/
  );
});

test('STORAGE ARMOR 6: Valid EPUB conforming to IDPF/W3C OCF specification passes validation', () => {
  const validEpub = buildValidEpub([
    { name: 'META-INF/container.xml', compressedSize: 50, uncompressedSize: 100 },
    { name: 'content.opf', compressedSize: 100, uncompressedSize: 200 },
  ]);
  assert.doesNotThrow(() => validateEpub(new Uint8Array(validEpub)));
});

test('STORAGE ARMOR 7: ZIP archive with compressed mimetype is rejected as EPUB', () => {
  const compressedMimeEpub = buildValidEpub([], 8); // compression method 8 (Deflate)
  assert.throws(
    () => validateEpub(new Uint8Array(compressedMimeEpub)),
    /mimetype phải được lưu không nén/
  );
});

test('STORAGE ARMOR 8: ZIP archive without mimetype as first entry is rejected as EPUB', () => {
  const wrongFirstEntry = buildValidEpub([], 0, 'application/epub+zip', 'file.txt');
  assert.throws(
    () => validateEpub(new Uint8Array(wrongFirstEntry)),
    /entry đầu tiên là "file.txt", kỳ vọng "mimetype"/
  );
});

test('STORAGE ARMOR 9: ZIP archive with invalid mimetype content is rejected as EPUB', () => {
  const wrongContent = buildValidEpub([], 0, 'application/x-zip-evil');
  assert.throws(
    () => validateEpub(new Uint8Array(wrongContent)),
    /nội dung mimetype không đúng/
  );
});

test('STORAGE ARMOR 10: Zip bomb with excessive entry count (>2,000 files) is rejected', () => {
  const extra = [];
  for (let i = 0; i < 2005; i++) {
    extra.push({ name: `file_${i}.txt`, compressedSize: 10, uncompressedSize: 10 });
  }
  const zipBomb = buildValidEpub(extra);
  assert.throws(
    () => validateEpub(new Uint8Array(zipBomb)),
    /Zip bomb detected: số lượng file con .* vượt quá ngưỡng an toàn/
  );
});

test('STORAGE ARMOR 11: Zip bomb with excessive uncompressed size (>300 MB) is rejected', () => {
  const extra = [
    { name: 'big1.bin', compressedSize: 50 * 1024 * 1024, uncompressedSize: 160 * 1024 * 1024 },
    { name: 'big2.bin', compressedSize: 50 * 1024 * 1024, uncompressedSize: 160 * 1024 * 1024 },
  ];
  const zipBomb = buildValidEpub(extra);
  assert.throws(
    () => validateEpub(new Uint8Array(zipBomb)),
    /Zip bomb detected: tổng dung lượng sau giải nén .* vượt quá giới hạn an toàn \(300 MB\)/
  );
});

test('STORAGE ARMOR 11b: Zip bomb with excessive single-entry decompression ratio (>100:1) is rejected', () => {
  const extra = [
    { name: 'bomb.bin', compressedSize: 1000, uncompressedSize: 50 * 1024 * 1024 },
  ];
  const zipBomb = buildValidEpub(extra);
  assert.throws(
    () => validateEpub(new Uint8Array(zipBomb)),
    /Zip bomb detected: tỉ lệ nén file đơn .* vượt quá giới hạn an toàn/
  );
});

test('STORAGE ARMOR 12: Zero-Exfiltration CSP audit on EPUB and PDF reader viewers', () => {
  const epubPath = path.resolve('apps/mobile/src/reader/epubViewerHtml.ts');
  const pdfPath = path.resolve('apps/mobile/src/reader/pdfViewerHtml.ts');

  const epubHtml = fs.readFileSync(epubPath, 'utf8');
  const pdfHtml = fs.readFileSync(pdfPath, 'utf8');

  // Verify DOCTYPE fix in EPUB viewer
  assert.match(epubHtml, /<!DOCTYPE html>/, 'EPUB viewer must start with valid <!DOCTYPE html>');

  // Verify Super CSP enforcement
  assert.match(epubHtml, /content-security-policy/i, 'EPUB viewer must declare Content-Security-Policy');
  assert.match(epubHtml, /connect-src 'none'/, 'EPUB viewer CSP must neutralize connect-src');
  assert.match(epubHtml, /default-src 'none'/, 'EPUB viewer CSP must set default-src to none');

  assert.match(pdfHtml, /content-security-policy/i, 'PDF viewer must declare Content-Security-Policy');
  assert.match(pdfHtml, /connect-src 'none'/, 'PDF viewer CSP must neutralize connect-src');
});

test('STORAGE ARMOR 13: Web iframe sandbox and SVG script quarantine audit', () => {
  const epubReaderPath = path.resolve('apps/mobile/src/reader/EpubReader.tsx');
  const pdfReaderPath = path.resolve('apps/mobile/src/reader/PdfReader.tsx');
  const epubHtmlPath = path.resolve('apps/mobile/src/reader/epubViewerHtml.ts');

  const epubReader = fs.readFileSync(epubReaderPath, 'utf8');
  const pdfReader = fs.readFileSync(pdfReaderPath, 'utf8');
  const epubHtml = fs.readFileSync(epubHtmlPath, 'utf8');

  // Verify sandbox attribute on both iframe components
  assert.match(epubReader, /sandbox:\s*['"]allow-scripts allow-same-origin['"]/, 'EpubReader must sandbox iframe');
  assert.match(pdfReader, /sandbox:\s*['"]allow-scripts allow-same-origin['"]/, 'PdfReader must sandbox iframe');

  // Verify SVG script quarantine in reader engine
  assert.match(epubHtml, /svg\s*script/i, 'EPUB viewer must actively quarantine SVG scripts');
  assert.match(epubHtml, /removeAttribute\(attrs\[j\]\.name\)/, 'EPUB viewer must strip inline event handlers');
});
