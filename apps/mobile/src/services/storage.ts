import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

const BOOKS_DIR = `${FileSystem.documentDirectory || ''}books/`;

/**
 * Ensure the local books directory exists on native platforms.
 */
async function ensureBooksDirectoryExists(): Promise<void> {
  if (Platform.OS === 'web') return;

  const dirInfo = await FileSystem.getInfoAsync(BOOKS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(BOOKS_DIR, { intermediates: true });
  }
}

/**
 * Save an imported file into the app's persistent storage.
 */
export async function saveBookFile(
  bookId: string,
  sourceUri: string,
  extension: 'epub' | 'pdf'
): Promise<string> {
  if (Platform.OS === 'web') {
    // On web, sourceUri is often a blob: or data: URL from the file picker
    return sourceUri;
  }

  await ensureBooksDirectoryExists();
  const destinationUri = `${BOOKS_DIR}${bookId}.${extension}`;

  await FileSystem.copyAsync({
    from: sourceUri,
    to: destinationUri,
  });

  return destinationUri;
}

/**
 * Delete a local book file from disk.
 */
export async function deleteBookFile(fileUri?: string | null): Promise<void> {
  if (!fileUri || Platform.OS === 'web') return;

  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
  } catch (err) {
    console.warn('Failed to delete local book file:', err);
  }
}
