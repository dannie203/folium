import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

const BOOKS_DIR = `${FileSystem.documentDirectory || ''}books/`;

const DB_NAME = 'folium_library';
const STORE_NAME = 'books';

function getWebDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveWebBook(id: string, fileData: ArrayBuffer): Promise<void> {
  const db = await getWebDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ id, data: fileData, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getWebBook(id: string): Promise<ArrayBuffer | null> {
  if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') return null;
  try {
    const db = await getWebDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result;
        if (item && item.data) {
          resolve(item.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to read from IndexedDB:', err);
    return null;
  }
}

export async function deleteWebBook(id: string): Promise<void> {
  if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') return;
  try {
    const db = await getWebDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to delete web book from IndexedDB:', err);
  }
}

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
    try {
      const resp = await fetch(sourceUri);
      const buffer = await resp.arrayBuffer();
      await saveWebBook(bookId, buffer);
      return `indexeddb://${bookId}`;
    } catch (err) {
      console.warn('Failed to cache book in IndexedDB, fallback to sourceUri:', err);
      return sourceUri;
    }
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
 * Delete a local book file from disk or IndexedDB.
 */
export async function deleteBookFile(fileUri?: string | null, bookId?: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (bookId) {
      await deleteWebBook(bookId);
    }
    return;
  }

  if (!fileUri) return;

  try {
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
  } catch (err) {
    console.warn('Failed to delete local book file:', err);
  }
}
