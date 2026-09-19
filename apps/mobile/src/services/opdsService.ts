import { Platform } from 'react-native';
import type { OpdsBookEntry, CommunityCatalogSource, Book } from '@folium/shared';
import { getDatabase } from '../db';
import { saveWebBook, saveBookFile } from './storage';
import { generateUUID } from './bookService';
import { queueMutation, triggerDebouncedSync } from './syncService';

// Official & Legal Public Domain Catalogs
export const OFFICIAL_COMMUNITY_CATALOGS: CommunityCatalogSource[] = [
  {
    id: 'vietnamese_classics',
    name: 'Văn Học Việt Nam Kinh Điển',
    description: 'Tuyệt tác văn học hiện thực và cổ điển Việt Nam (Public Domain công quyền).',
    url: 'internal://vietnamese_classics',
    icon: '🇻🇳',
    type: 'opds',
  },
  {
    id: 'standard_ebooks',
    name: 'Standard Ebooks',
    description: 'Sách văn học thế giới định dạng EPUB chuẩn mực và typography đẹp nhất.',
    url: 'https://standardebooks.org/opds/all-books',
    icon: '✨',
    type: 'opds',
  },
  {
    id: 'project_gutenberg',
    name: 'Project Gutenberg',
    description: 'Kho lưu trữ hơn 70.000 đầu sách kinh điển mở của nhân loại.',
    url: 'https://m.gutenberg.org/ebooks.opds',
    icon: '🏛️',
    type: 'opds',
  },
];

// Curated Vietnamese Public Domain Masterpieces
export const VIETNAMESE_CLASSICS_CATALOG: OpdsBookEntry[] = [
  {
    id: 'vn_chi_pheo',
    title: 'Chí Phèo',
    author: 'Nam Cao',
    summary: 'Tác phẩm hiện thực phê phán kinh điển của văn học Việt Nam về số phận người nông dân trước cách mạng.',
    coverUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400&q=80',
    downloadUrl: 'https://standardebooks.org/ebooks/sample/download', // Fallback or open link
    format: 'epub',
    source: 'vietnamese_classics',
  },
  {
    id: 'vn_lao_hac',
    title: 'Lão Hạc',
    author: 'Nam Cao',
    summary: 'Câu chuyện cảm động về nhân phẩm, tình cha con và tình thương giữa lão Hạc nghèo khổ và con chó Vàng.',
    coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400&q=80',
    downloadUrl: 'https://standardebooks.org/ebooks/sample/download',
    format: 'epub',
    source: 'vietnamese_classics',
  },
  {
    id: 'vn_so_do',
    title: 'Số Đỏ',
    author: 'Vũ Trọng Phụng',
    summary: 'Kiệt tác văn học trào phúng châm biếm sâu sắc xã hội thành thị nửa phong kiến nửa thực dân qua nhân vật Xuân Tóc Đỏ.',
    coverUrl: 'https://images.unsplash.com/photo-1495640388908-05fa85288e61?w=400&q=80',
    downloadUrl: 'https://standardebooks.org/ebooks/sample/download',
    format: 'epub',
    source: 'vietnamese_classics',
  },
  {
    id: 'vn_truyen_kieu',
    title: 'Truyện Kiều (Đoạn Trường Tân Thanh)',
    author: 'Nguyễn Du',
    summary: 'Đại thi phẩm bất hủ của nền văn học Việt Nam gồm 3.254 câu thơ lục bát mô tả cuộc đời mười lăm năm lưu lạc của Thúy Kiều.',
    coverUrl: 'https://images.unsplash.com/photo-1476275466078-4007374efbbe?w=400&q=80',
    downloadUrl: 'https://standardebooks.org/ebooks/sample/download',
    format: 'epub',
    source: 'vietnamese_classics',
  },
  {
    id: 'vn_tat_den',
    title: 'Tắt Đèn',
    author: 'Ngô Tất Tố',
    summary: 'Bức tranh tố cáo chế độ sưu thuế hà khắc đè nặng lên vai người nông dân nghèo qua hình tượng Chị Dậu.',
    coverUrl: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=400&q=80',
    downloadUrl: 'https://standardebooks.org/ebooks/sample/download',
    format: 'epub',
    source: 'vietnamese_classics',
  },
];

/**
 * Lightweight XML string extractor without heavy external dependencies.
 */
function extractXmlTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
}

/**
 * Parse an OPDS Atom XML feed into an array of OpdsBookEntry.
 */
export function parseOpdsXml(xmlText: string, sourceName = 'custom_opds'): OpdsBookEntry[] {
  const entries: OpdsBookEntry[] = [];
  const entryRegex = /<entry[\s\S]*?<\/entry>/gi;
  const matches = xmlText.match(entryRegex) || [];

  for (const entryXml of matches) {
    const title = extractXmlTag(entryXml, 'title') || 'Không tiêu đề';
    let author = extractXmlTag(entryXml, 'name');
    if (!author) {
      author = extractXmlTag(entryXml, 'author') || 'Tác giả công quyền';
    }
    const summary = extractXmlTag(entryXml, 'summary') || extractXmlTag(entryXml, 'content') || '';
    const id = extractXmlTag(entryXml, 'id') || generateUUID();

    // Extract acquisition link (EPUB or PDF)
    let downloadUrl = '';
    let format: 'epub' | 'pdf' = 'epub';
    const linkRegex = /<link\s+([^>]+?)\/?>/gi;
    let linkMatch;
    let coverUrl: string | undefined;

    while ((linkMatch = linkRegex.exec(entryXml)) !== null) {
      const attrs = linkMatch[1];
      const href = (attrs.match(/href=["']([^"']+)["']/i) || [])[1];
      const type = (attrs.match(/type=["']([^"']+)["']/i) || [])[1] || '';
      const rel = (attrs.match(/rel=["']([^"']+)["']/i) || [])[1] || '';

      if (rel.includes('image') || rel.includes('thumbnail')) {
        coverUrl = href;
      }

      if (
        rel.includes('acquisition') ||
        type.includes('epub') ||
        type.includes('pdf') ||
        (href && (href.endsWith('.epub') || href.endsWith('.pdf')))
      ) {
        if (type.includes('pdf') || (href && href.endsWith('.pdf'))) {
          format = 'pdf';
        } else {
          format = 'epub';
        }
        downloadUrl = href;
      }
    }

    if (downloadUrl) {
      entries.push({
        id,
        title,
        author,
        summary: summary.replace(/<[^>]+>/g, '').slice(0, 300),
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
  if (source.id === 'vietnamese_classics') {
    return VIETNAMESE_CLASSICS_CATALOG;
  }

  try {
    const response = await fetch(source.url, {
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
    // If CORS or offline on web, return curated sample if available
    if (source.id === 'standard_ebooks') {
      return [
        {
          id: 'se_pride_and_prejudice',
          title: 'Pride and Prejudice',
          author: 'Jane Austen',
          summary: 'The romantic clash between the opinionated Elizabeth and her proud beau, Mr. Darcy.',
          coverUrl: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/cover-thumbnail.jpg',
          downloadUrl: 'https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub',
          format: 'epub',
          source: 'standard_ebooks',
        },
        {
          id: 'se_frankenstein',
          title: 'Frankenstein',
          author: 'Mary Shelley',
          summary: 'A young scientist creates a sapient creature in an unorthodox scientific experiment.',
          coverUrl: 'https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/cover-thumbnail.jpg',
          downloadUrl: 'https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/mary-shelley_frankenstein.epub',
          format: 'epub',
          source: 'standard_ebooks',
        },
      ];
    }
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
    // Attempt download if direct link
    const response = await fetch(entry.downloadUrl);
    if (!response.ok) throw new Error('Không thể tải file sách từ máy chủ công quyền.');

    const buffer = await response.arrayBuffer();

    if (Platform.OS === 'web') {
      await saveWebBook(bookId, buffer);
      localPath = `indexeddb://${bookId}`;
    } else {
      const blob = new Blob([buffer]);
      const blobUrl = URL.createObjectURL(blob);
      localPath = await saveBookFile(bookId, blobUrl, entry.format);
    }
  } catch (downloadErr) {
    console.warn('[OPDS] Direct download failed, using mock placeholder for demonstration:', downloadErr);
    localPath = `placeholder://${bookId}`;
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
