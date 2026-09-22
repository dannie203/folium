import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

export interface UseReaderKeyboardParams {
  readerRef: React.RefObject<any>;
  setShowUI: React.Dispatch<React.SetStateAction<boolean>>;
  changeFontSize: (delta: number) => void;
  selectionData: any;
  setSelectionData: (val: any) => void;
  showSettingsModal: boolean;
  setShowSettingsModal: (val: boolean) => void;
  showDrawerModal: boolean;
  setShowDrawerModal: (val: boolean) => void;
}

export function useReaderKeyboard({
  readerRef,
  setShowUI,
  changeFontSize,
  selectionData,
  setSelectionData,
  showSettingsModal,
  setShowSettingsModal,
  showDrawerModal,
  setShowDrawerModal,
}: UseReaderKeyboardParams) {
  const handleEscape = useCallback(() => {
    if (selectionData) {
      setSelectionData(null);
    } else if (showSettingsModal) {
      setShowSettingsModal(false);
    } else if (showDrawerModal) {
      setShowDrawerModal(false);
    } else {
      setShowUI((prev) => !prev);
    }
  }, [selectionData, showSettingsModal, showDrawerModal, setSelectionData, setShowSettingsModal, setShowDrawerModal, setShowUI]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (
        e.key === 'ArrowRight' ||
        e.key === 'PageDown' ||
        (e.key === ' ' && !e.shiftKey) ||
        e.key === 'j'
      ) {
        e.preventDefault();
        readerRef.current?.nextPage();
      } else if (
        e.key === 'ArrowLeft' ||
        e.key === 'PageUp' ||
        (e.key === ' ' && e.shiftKey) ||
        e.key === 'k'
      ) {
        e.preventDefault();
        readerRef.current?.prevPage();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setShowUI((prev) => !prev);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        changeFontSize(10);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        changeFontSize(-10);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleEscape();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [handleEscape, changeFontSize, readerRef, setShowUI]);

  return { handleEscape };
}
