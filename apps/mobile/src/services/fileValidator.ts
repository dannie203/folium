import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import type { BookFormat } from '@folium/shared';

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46];
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const PDF_EOF_MARKER = new TextEncoder().encode('%%EOF');

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function hasPdfTrailer(bytes: Uint8Array): boolean {
  const start = Math.max(0, bytes.length - 1024);
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

/** Validate the outer file signature before the file enters local storage. */
export function validateBookBytes(bytes: ArrayBufferLike, format: BookFormat): void {
  const data = new Uint8Array(bytes);
  if (data.length < 5) {
    throw new Error('File sách rỗng hoặc bị hỏng.');
  }

  if (format === 'pdf') {
    if (!hasPrefix(data, PDF_SIGNATURE) || !hasPdfTrailer(data)) {
      throw new Error('File không phải PDF hợp lệ hoặc đã bị hỏng.');
    }
    return;
  }

  if (!hasPrefix(data, ZIP_SIGNATURE)) {
    throw new Error('File không phải EPUB hợp lệ hoặc đã bị hỏng.');
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
