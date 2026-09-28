import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { BookFormat } from '@folium/shared';

// Safety ceiling thresholds for Zip Bomb & DoS defense
export const MAX_TOTAL_UNCOMPRESSED_SIZE = 300 * 1024 * 1024; // 300 MB
export const MAX_DECOMPRESSION_RATIO = 100; // 100:1 ratio
export const MAX_ENTRY_COUNT = 2000; // 2,000 files in archive
export const MAX_PDF_TRAILER_SCAN = 1024; // 1KB from end of file

// Magic bytes signatures
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // %PDF-
const PDF_EOF_MARKER = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const ZIP_CENTRAL_HEADER = [0x50, 0x4b, 0x01, 0x02]; // PK\x01\x02
const ZIP_EOCD_SIGNATURE = [0x50, 0x4b, 0x05, 0x06]; // PK\x05\x06

// Disallowed binary signatures (Storage Abuse Firewall)
const PE_SIGNATURE = [0x4d, 0x5a]; // Windows PE executable (MZ)
const ELF_SIGNATURE = [0x7f, 0x45, 0x4c, 0x46]; // Linux ELF (\x7fELF)
const SHELL_SIGNATURE = [0x23, 0x21]; // Unix shell script (#!)
const MACHO_32 = [0xfe, 0xed, 0xfa, 0xce];
const MACHO_64 = [0xfe, 0xed, 0xfa, 0xcf];
const MACHO_FAT = [0xca, 0xfe, 0xba, 0xbe];

const EPUB_MIMETYPE_NAME = 'mimetype';
const EPUB_MIMETYPE_PREFIX = 'application/epub+zip';

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function bytesToAscii(bytes: Uint8Array, start: number, length: number): string {
  let str = '';
  const end = Math.min(bytes.length, start + length);
  for (let i = start; i < end; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return str;
}

function checkDisallowedBinaries(bytes: Uint8Array): void {
  if (hasPrefix(bytes, PE_SIGNATURE)) {
    throw new Error('Storage Abuse Firewall: Rejection of disguised Windows PE executable (.exe).');
  }
  if (hasPrefix(bytes, ELF_SIGNATURE)) {
    throw new Error('Storage Abuse Firewall: Rejection of disguised ELF binary.');
  }
  if (hasPrefix(bytes, SHELL_SIGNATURE)) {
    throw new Error('Storage Abuse Firewall: Rejection of disguised shell script.');
  }
  if (hasPrefix(bytes, MACHO_32) || hasPrefix(bytes, MACHO_64) || hasPrefix(bytes, MACHO_FAT)) {
    throw new Error('Storage Abuse Firewall: Rejection of disguised Mach-O binary.');
  }
}

function hasPdfTrailer(bytes: Uint8Array): boolean {
  const start = Math.max(0, bytes.length - MAX_PDF_TRAILER_SCAN);
  for (let index = start; index <= bytes.length - PDF_EOF_MARKER.length; index++) {
    let matches = true;
    for (let markerIndex = 0; markerIndex < PDF_EOF_MARKER.length; markerIndex++) {
      if (bytes[index + markerIndex] !== PDF_EOF_MARKER[markerIndex]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

export function validatePdfBytes(bytes: Uint8Array): void {
  checkDisallowedBinaries(bytes);

  if (bytes.length < 16) {
    throw new Error('File PDF rỗng hoặc bị hỏng.');
  }

  if (!hasPrefix(bytes, PDF_SIGNATURE)) {
    throw new Error('File không phải PDF hợp lệ: thiếu header %PDF-.');
  }

  if (!hasPdfTrailer(bytes)) {
    throw new Error('File không phải PDF hợp lệ: thiếu trailer %%EOF.');
  }
}

export function validateEpubBytes(bytes: Uint8Array): void {
  checkDisallowedBinaries(bytes);

  if (bytes.length < 58) {
    throw new Error('File EPUB rỗng hoặc bị hỏng.');
  }

  // 1. Verify ZIP Local File Header magic bytes: PK\x03\x04
  if (!hasPrefix(bytes, ZIP_LOCAL_HEADER)) {
    throw new Error('File không phải EPUB hợp lệ: thiếu ZIP signature PK\\x03\\x04.');
  }

  // 2. IDPF/W3C OCF specification: first file MUST be uncompressed 'mimetype'
  // Local File Header offsets:
  // 8: compression method (2 bytes, 0 = stored)
  // 26: filename length (2 bytes)
  // 28: extra field length (2 bytes)
  // 30: filename
  const compressionMethod = readUint16LE(bytes, 8);
  if (compressionMethod !== 0) {
    throw new Error('File không phải EPUB hợp lệ: mimetype phải được lưu không nén (STORED).');
  }

  const filenameLen = readUint16LE(bytes, 26);
  const extraLen = readUint16LE(bytes, 28);

  if (filenameLen !== EPUB_MIMETYPE_NAME.length) {
    throw new Error('File không phải EPUB hợp lệ: entry đầu tiên phải là "mimetype".');
  }

  const filename = bytesToAscii(bytes, 30, filenameLen);
  if (filename !== EPUB_MIMETYPE_NAME) {
    throw new Error(`File không phải EPUB hợp lệ: entry đầu tiên là "${filename}", kỳ vọng "mimetype".`);
  }

  const contentOffset = 30 + filenameLen + extraLen;
  if (contentOffset + EPUB_MIMETYPE_PREFIX.length > bytes.length) {
    throw new Error('File EPUB bị cắt cụt, không đủ dữ liệu mimetype.');
  }

  const mimeContent = bytesToAscii(bytes, contentOffset, EPUB_MIMETYPE_PREFIX.length);
  if (mimeContent !== EPUB_MIMETYPE_PREFIX) {
    throw new Error(`File không phải EPUB hợp lệ: nội dung mimetype không đúng (${mimeContent}).`);
  }

  // 3. Central Directory Pre-Flight Scan (Zip Bomb & DoS Shield)
  // Find End of Central Directory (EOCD: PK\x05\x06) from end of file
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
    throw new Error(
      `Zip bomb detected: số lượng file con (${totalEntries}) vượt quá ngưỡng an toàn (${MAX_ENTRY_COUNT}).`
    );
  }

  if (cdOffset + cdSize > bytes.length) {
    throw new Error('File ZIP bị hỏng: Central Directory vượt quá kích thước file.');
  }

  // Traverse Central Directory entries
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

    // Single entry ratio check
    if (compressedSize > 0 && uncompressedSize > 10 * 1024 * 1024) {
      const entryRatio = uncompressedSize / compressedSize;
      if (entryRatio > MAX_DECOMPRESSION_RATIO) {
        throw new Error(
          `Zip bomb detected: tỉ lệ nén file đơn (${Math.round(entryRatio)}:1) vượt quá giới hạn an toàn.`
        );
      }
    }

    totalUncompressedSize += uncompressedSize;

    if (totalUncompressedSize > MAX_TOTAL_UNCOMPRESSED_SIZE) {
      const sizeMb = Math.round(totalUncompressedSize / (1024 * 1024));
      throw new Error(
        `Zip bomb detected: tổng dung lượng sau giải nén (~${sizeMb} MB) vượt quá giới hạn an toàn (300 MB).`
      );
    }

    currentOffset += 46 + fnLen + extraFieldLen + commentLen;
  }

  // Check cumulative decompression ratio
  if (bytes.length > 1024) {
    const cumulativeRatio = totalUncompressedSize / bytes.length;
    if (cumulativeRatio > MAX_DECOMPRESSION_RATIO) {
      throw new Error(
        `Zip bomb detected: tỉ lệ nén toàn bộ archive (${Math.round(cumulativeRatio)}:1) vượt quá ngưỡng an toàn 100:1.`
      );
    }
  }
}

/** Validate the outer file signature before the file enters local storage. */
export function validateBookBytes(bytes: ArrayBufferLike, format: BookFormat): void {
  const data = new Uint8Array(bytes);
  if (format === 'pdf') {
    validatePdfBytes(data);
  } else {
    validateEpubBytes(data);
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Read and validate a picker URI on native or web before copying it. */
export async function validateBookUri(uri: string, format: BookFormat): Promise<void> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Không thể đọc file sách (${response.status}).`);
    }
    validateBookBytes(await response.arrayBuffer(), format);
    return;
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  validateBookBytes(base64ToBytes(base64).buffer, format);
}
