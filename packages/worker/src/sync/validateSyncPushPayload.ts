// Runtime schema validator for incoming sync push payload
export function validateSyncPushPayload(body: any): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Push payload must be a JSON object' };
  }

  if (body.books !== undefined) {
    if (!Array.isArray(body.books)) return { valid: false, error: 'books must be an array' };
    for (const b of body.books) {
      if (!b || typeof b !== 'object') return { valid: false, error: 'Invalid book entry' };
      if (typeof b.id !== 'string' || b.id.length < 1 || b.id.length > 64) {
        return { valid: false, error: 'Book id must be a string (1-64 chars)' };
      }
      if (b.title !== undefined && (typeof b.title !== 'string' || b.title.length > 500)) {
        return { valid: false, error: 'Book title must be <= 500 chars' };
      }
      if (b.author !== undefined && (typeof b.author !== 'string' || b.author.length > 300)) {
        return { valid: false, error: 'Book author must be <= 300 chars' };
      }
      if (b.file_type !== undefined && b.file_type !== 'epub' && b.file_type !== 'pdf') {
        return { valid: false, error: 'Book file_type must be epub or pdf' };
      }
      if (b.file_size !== undefined && (typeof b.file_size !== 'number' || b.file_size < 0 || b.file_size > 500000000)) {
        return { valid: false, error: 'Book file_size must be a number between 0 and 500MB' };
      }
    }
  }

  if (body.progress !== undefined) {
    if (!Array.isArray(body.progress)) return { valid: false, error: 'progress must be an array' };
    for (const p of body.progress) {
      if (!p || typeof p !== 'object') return { valid: false, error: 'Invalid progress entry' };
      if (typeof p.id !== 'string' || p.id.length < 1 || p.id.length > 64) {
        return { valid: false, error: 'Progress id must be a string (1-64 chars)' };
      }
      if (typeof p.book_id !== 'string' || p.book_id.length < 1 || p.book_id.length > 64) {
        return { valid: false, error: 'Progress book_id must be a string (1-64 chars)' };
      }
      if (p.percentage !== undefined && (typeof p.percentage !== 'number' || p.percentage < 0 || p.percentage > 100)) {
        return { valid: false, error: 'Progress percentage must be between 0 and 100' };
      }
      if (p.cfi !== undefined && (typeof p.cfi !== 'string' || p.cfi.length > 2000)) {
        return { valid: false, error: 'Progress cfi must be <= 2000 chars' };
      }
    }
  }

  if (body.bookmarks !== undefined) {
    if (!Array.isArray(body.bookmarks)) return { valid: false, error: 'bookmarks must be an array' };
    for (const bm of body.bookmarks) {
      if (!bm || typeof bm !== 'object') return { valid: false, error: 'Invalid bookmark entry' };
      if (typeof bm.id !== 'string' || bm.id.length < 1 || bm.id.length > 64) {
        return { valid: false, error: 'Bookmark id must be a string (1-64 chars)' };
      }
      if (typeof bm.book_id !== 'string' || bm.book_id.length < 1 || bm.book_id.length > 64) {
        return { valid: false, error: 'Bookmark book_id must be a string (1-64 chars)' };
      }
      if (bm.title !== undefined && (typeof bm.title !== 'string' || bm.title.length > 500)) {
        return { valid: false, error: 'Bookmark title must be <= 500 chars' };
      }
    }
  }

  if (body.highlights !== undefined) {
    if (!Array.isArray(body.highlights)) return { valid: false, error: 'highlights must be an array' };
    for (const h of body.highlights) {
      if (!h || typeof h !== 'object') return { valid: false, error: 'Invalid highlight entry' };
      if (typeof h.id !== 'string' || h.id.length < 1 || h.id.length > 64) {
        return { valid: false, error: 'Highlight id must be a string (1-64 chars)' };
      }
      if (typeof h.book_id !== 'string' || h.book_id.length < 1 || h.book_id.length > 64) {
        return { valid: false, error: 'Highlight book_id must be a string (1-64 chars)' };
      }
      if (h.text !== undefined && (typeof h.text !== 'string' || h.text.length > 10000)) {
        return { valid: false, error: 'Highlight text must be <= 10000 chars' };
      }
    }
  }

  if (body.notes !== undefined) {
    if (!Array.isArray(body.notes)) return { valid: false, error: 'notes must be an array' };
    for (const n of body.notes) {
      if (!n || typeof n !== 'object') return { valid: false, error: 'Invalid note entry' };
      if (typeof n.id !== 'string' || n.id.length < 1 || n.id.length > 64) {
        return { valid: false, error: 'Note id must be a string (1-64 chars)' };
      }
      if (typeof n.book_id !== 'string' || n.book_id.length < 1 || n.book_id.length > 64) {
        return { valid: false, error: 'Note book_id must be a string (1-64 chars)' };
      }
      if (n.content !== undefined && (typeof n.content !== 'string' || n.content.length > 10000)) {
        return { valid: false, error: 'Note content must be <= 10000 chars' };
      }
    }
  }

  return { valid: true };
}
