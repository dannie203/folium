import { useState, useEffect } from 'react';
import type { Book, Bookmark, Highlight, Note } from '@folium/shared';
import {
  addBookmark,
  getBookmarks,
  deleteBookmark,
  addHighlight,
  getHighlights,
  deleteHighlight,
  addNote,
  getNotes,
  deleteNote,
  searchAnnotations,
  SearchResultItem,
} from '../services/annotationService';

export interface UseReaderAnnotationsParams {
  book: Book | null;
  currentCfi: string;
  pageInfo: { page?: number; totalPages?: number };
  currentProgress: number;
  readerRef: React.RefObject<any>;
  showToast: (msg: string) => void;
}

export function useReaderAnnotations({
  book,
  currentCfi,
  pageInfo,
  currentProgress,
  readerRef,
  showToast,
}: UseReaderAnnotationsParams) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectionData, setSelectionData] = useState<{ cfiRange: string; text: string } | null>(null);
  const [highlightColor, setHighlightColor] = useState<Highlight['color']>('yellow');
  const [noteInput, setNoteInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  useEffect(() => {
    if (!book?.id) return;
    async function loadAnnotations() {
      try {
        const [bms, hls, nts] = await Promise.all([
          getBookmarks(book!.id),
          getHighlights(book!.id),
          getNotes(book!.id),
        ]);
        setBookmarks(bms);
        setHighlights(hls);
        setNotes(nts);
      } catch (err) {
        console.error('Failed to load annotations:', err);
      }
    }
    loadAnnotations();
  }, [book?.id]);

  const isCurrentBookmarked = bookmarks.some(
    (b) => b.cfi === currentCfi || (pageInfo.page && b.cfi === String(pageInfo.page))
  );

  const toggleBookmark = async () => {
    if (!book) return;
    try {
      const existing = bookmarks.find(
        (b) => b.cfi === currentCfi || (pageInfo.page && b.cfi === String(pageInfo.page))
      );
      if (existing) {
        await deleteBookmark(existing.id);
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
        showToast('Đã xóa dấu trang');
      } else {
        const targetCfi = currentCfi || String(pageInfo.page || 1);
        const pageLabel = pageInfo.page ? `Trang ${pageInfo.page}` : `${currentProgress.toFixed(1)}%`;
        const newBm = await addBookmark(book.id, targetCfi, `${book.title} (${pageLabel})`);
        setBookmarks((prev) => [newBm, ...prev]);
        showToast('Đã thêm dấu trang 🔖');
      }
    } catch (e) {
      console.error('Failed to toggle bookmark:', e);
    }
  };

  const handleSaveHighlight = async () => {
    if (!book || !selectionData) return;
    try {
      const newHl = await addHighlight(
        book.id,
        selectionData.cfiRange,
        selectionData.text,
        highlightColor,
        noteInput.trim() || undefined
      );

      if (noteInput.trim()) {
        const newNote = await addNote(book.id, noteInput.trim(), newHl.id);
        setNotes((prev) => [newNote, ...prev]);
      }

      readerRef.current?.addHighlight(newHl.id, selectionData.cfiRange, highlightColor);
      setHighlights((prev) => [newHl, ...prev]);
      setSelectionData(null);
      setNoteInput('');
      showToast('Đã lưu tô sáng ✨');
    } catch (e) {
      console.error('Failed to save highlight:', e);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    try {
      await deleteBookmark(bookmarkId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
      showToast('Đã xóa dấu trang');
    } catch (e) {
      console.error('Failed to delete bookmark:', e);
    }
  };

  const handleDeleteHighlight = async (highlightId: string, cfiRange: string) => {
    try {
      await deleteHighlight(highlightId);
      readerRef.current?.removeHighlight(cfiRange);
      setHighlights((prev) => prev.filter((h) => h.id !== highlightId));
      setNotes((prev) => prev.filter((n) => n.highlight_id !== highlightId));
      showToast('Đã xóa tô sáng');
    } catch (e) {
      console.error('Failed to delete highlight:', e);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      showToast('Đã xóa ghi chú');
    } catch (e) {
      console.error('Failed to delete note:', e);
    }
  };

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    if (!book) return;
    try {
      const res = await searchAnnotations(text, book.id);
      setSearchResults(res);
    } catch (e) {
      console.error('Failed to search annotations:', e);
    }
  };

  return {
    bookmarks,
    setBookmarks,
    highlights,
    setHighlights,
    notes,
    setNotes,
    selectionData,
    setSelectionData,
    highlightColor,
    setHighlightColor,
    noteInput,
    setNoteInput,
    searchQuery,
    setSearchQuery,
    searchResults,
    isCurrentBookmarked,
    toggleBookmark,
    handleSaveHighlight,
    handleDeleteBookmark,
    handleDeleteHighlight,
    handleDeleteNote,
    handleSearch,
  };
}
