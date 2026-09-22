import { Platform } from 'react-native';
import type { OpdsBookEntry, CommunityCatalogSource, Book } from '@folium/shared';
import { getDatabase } from '../db';
import { saveWebBook, saveBookFile } from './storage';
import { validateBookBytes } from './fileValidator';
import { generateUUID } from './bookService';
import { queueMutation, triggerDebouncedSync } from './syncService';
import { getSyncServerUrl } from './syncService';

// Official & Legal Public Domain Catalogs
export const OFFICIAL_COMMUNITY_CATALOGS: CommunityCatalogSource[] = [
  {
    id: 'project_gutenberg',
    name: 'Project Gutenberg',
    description: 'Kho lưu trữ hơn 70.000 đầu sách kinh điển mở của nhân loại.',
    url: 'https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads',
    icon: '🏛️',
    type: 'opds',
  },
  {
    id: 'standard_ebooks',
    name: 'Standard Ebooks',
    description: 'Sách văn học thế giới định dạng EPUB chuẩn mực và typography đẹp nhất.',
    url: 'https://standardebooks.org/feeds/atom/new-releases',
    icon: '✨',
    type: 'opds',
  },
];

import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
});

function getTextValue(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && '#text' in node) {
    return String(node['#text']).trim();
  }
  return '';
}

/**
 * Parse an OPDS Atom XML feed into an array of OpdsBookEntry using fast-xml-parser.
 */
export function parseOpdsXml(xmlText: string, sourceName = 'custom_opds'): OpdsBookEntry[] {
  const entries: OpdsBookEntry[] = [];
  let parsed: any;
  try {
    parsed = xmlParser.parse(xmlText);
  } catch (err) {
    console.warn('[OPDS] Failed to parse XML:', err);
    return [];
  }

  const feed = parsed?.feed || parsed;
  if (!feed) return [];

  const rawEntries = Array.isArray(feed.entry)
    ? feed.entry
    : feed.entry
    ? [feed.entry]
    : [];

  for (const entry of rawEntries) {
    if (!entry) continue;

    const title = getTextValue(entry.title) || 'Không tiêu đề';
    let author = '';
    if (entry.author) {
      if (typeof entry.author === 'object') {
        author = getTextValue(entry.author.name) || getTextValue(entry.author);
      } else {
        author = getTextValue(entry.author);
      }
    }
    if (!author) author = 'Tác giả công quyền';

    const rawSummary = getTextValue(entry.summary) || getTextValue(entry.content) || '';
    const summary = rawSummary.replace(/<[^>]+>/g, '').slice(0, 300);
    const id = getTextValue(entry.id) || generateUUID();

    // Extract acquisition link and cover
    let downloadUrl = '';
    let format: 'epub' | 'pdf' = 'epub';
    let coverUrl: string | undefined;

    const rawLinks = Array.isArray(entry.link)
      ? entry.link
      : entry.link
      ? [entry.link]
      : [];

    for (const link of rawLinks) {
      if (!link) continue;
      const href = String(link['@_href'] || '').trim();
      const type = String(link['@_type'] || '').toLowerCase();
      const rel = String(link['@_rel'] || '').toLowerCase();

      if (rel.includes('image') || rel.includes('thumbnail')) {
        coverUrl = href;
      }

      if (
        rel.includes('acquisition') ||
        type.includes('epub') ||
        type.includes('pdf') ||
        href.endsWith('.epub') ||
        href.endsWith('.pdf')
      ) {
        if (type.includes('pdf') || href.endsWith('.pdf')) {
          format = 'pdf';
        } else {
          format = 'epub';
        }
        downloadUrl = href;
      }
    }

    // Project Gutenberg sub-catalog fallback: synthesize direct EPUB and high-res cover links
    const gutenbergIdMatch = id.match(/ebooks\/(\d+)/);
    if (!downloadUrl && gutenbergIdMatch) {
      const gId = gutenbergIdMatch[1];
      downloadUrl = `https://www.gutenberg.org/ebooks/${gId}.epub3.images`;
      format = 'epub';
      if (!coverUrl) {
        coverUrl = `https://www.gutenberg.org/cache/epub/${gId}/pg${gId}.cover.medium.jpg`;
      }
    }

    if (downloadUrl) {
      entries.push({
        id,
        title,
        author,
        summary,
        coverUrl,
        downloadUrl,
        format,
        source: sourceName as any,
      });
    }
  }

  return entries;
}

/**
 * Fetch catalog entries from an OPDS URL or curated feed.
 */
export async function fetchOpdsCatalog(source: CommunityCatalogSource): Promise<OpdsBookEntry[]> {
  try {
    const catalogUrl =
      Platform.OS === 'web'
        ? `${await getSyncServerUrl()}/api/community/opds?source=${encodeURIComponent(source.id)}`
        : source.url;
    const response = await fetch(catalogUrl, {
      headers: {
        Accept: 'application/atom+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`Lỗi tải catalog OPDS (${response.status}): ${response.statusText}`);
    }

    const xmlText = await response.text();
    return parseOpdsXml(xmlText, source.id);
  } catch (err: any) {
    console.warn(`[OPDS] Failed to fetch feed from ${source.url}:`, err);
    throw err;
  }
}

/**
 * Download and import an OPDS public domain book directly into Folium bookshelf.
 */
export async function importOpdsBook(entry: OpdsBookEntry): Promise<Book> {
  const bookId = generateUUID();
  const now = Date.now();
  const shelf = entry.source === 'vietnamese_classics' ? 'Văn Học Việt Nam' : 'Sách Công Quyền';

  let localPath: string;

  try {
    const targetUrl =
      Platform.OS === 'web' && entry.downloadUrl.includes('gutenberg.org')
        ? `${await getSyncServerUrl()}/api/community/download?url=${encodeURIComponent(entry.downloadUrl)}`
        : entry.downloadUrl;
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error('Không thể tải file sách từ máy chủ công quyền.');

    const buffer = await response.arrayBuffer();
    validateBookBytes(buffer, entry.format);

    if (Platform.OS === 'web') {
      await saveWebBook(bookId, buffer);
      localPath = `indexeddb://${bookId}`;
    } else {
      const blob = new Blob([buffer]);
      const blobUrl = URL.createObjectURL(blob);
      localPath = await saveBookFile(bookId, blobUrl, entry.format);
    }
  } catch (downloadErr) {
    console.warn('[OPDS] Direct download failed:', downloadErr);
    throw downloadErr;
  }

  const newBook: Book = {
    id: bookId,
    title: entry.title,
    author: entry.author,
    cover_url: entry.coverUrl || null,
    file_type: entry.format,
    file_size: entry.fileSize || 512000,
    local_path: localPath,
    drive_file_id: null,
    locations_cache: null,
    shelf,
    tags: ['Public Domain', entry.source],
    created_at: now,
    updated_at: now,
  };

  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO books (id, title, author, cover_url, file_type, file_size, local_path, drive_file_id, locations_cache, created_at, updated_at, shelf, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newBook.id,
      newBook.title,
      newBook.author,
      newBook.cover_url ?? null,
      newBook.file_type,
      newBook.file_size,
      newBook.local_path ?? null,
      newBook.drive_file_id ?? null,
      newBook.locations_cache ?? null,
      newBook.created_at,
      newBook.updated_at,
      newBook.shelf ?? 'Inbox',
      'Public Domain,' + entry.source,
    ]
  );

  await queueMutation('book', newBook.id, newBook);
  triggerDebouncedSync(5000);

  return newBook;
}
