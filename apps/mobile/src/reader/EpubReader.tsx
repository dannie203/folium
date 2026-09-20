import React, { useRef, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import type { ReaderSettings } from '@folium/shared';
import { EPUB_VIEWER_HTML } from './epubViewerHtml';

let NativeWebView: any = null;
if (Platform.OS !== 'web') {
  try {
    NativeWebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('react-native-webview not loaded:', e);
  }
}

export interface EpubReaderRef {
  nextPage: () => void;
  prevPage: () => void;
  goTo: (cfi: string) => void;
  applySettings: (settings: Partial<ReaderSettings>) => void;
  addHighlight: (id: string, cfiRange: string, color: string) => void;
  removeHighlight: (cfiRange: string) => void;
}

interface EpubReaderProps {
  bookDataBase64?: string;
  bookDataArrayBuffer?: ArrayBuffer;
  bookDataUrl?: string;
  initialCfi?: string | null;
  locationsCache?: string | null;
  highlights?: Array<{ id: string; cfi_range: string; color: string }>;
  settings: ReaderSettings;
  onLocationChange?: (location: { cfi: string; percentage: number; page?: number; totalPages?: number }) => void;
  onLocationsGenerated?: (locations: string) => void;
  onTocLoaded?: (toc: Array<{ label: string; href: string }>) => void;
  onToggleUI?: () => void;
  onChangeFontSize?: (delta: number) => void;
  onEscape?: () => void;
  onSelection?: (selection: { cfiRange: string; text: string }) => void;
  onHighlightClick?: (highlight: { id: string; cfiRange: string }) => void;
  onError?: (errorMessage: string) => void;
}

export const EpubReader = forwardRef<EpubReaderRef, EpubReaderProps>((props, ref) => {
  const nativeWebViewRef = useRef<any>(null);
  const webIframeRef = useRef<HTMLIFrameElement | null>(null);
  const isViewerReadyRef = useRef(false);
  const lastLoadedKeyRef = useRef<any>(null);

  const postMessageToViewer = useCallback((message: any) => {
    if (Platform.OS === 'web') {
      const iframe = webIframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(message, '*');
      }
    } else {
      nativeWebViewRef.current?.postMessage(JSON.stringify(message));
    }
  }, []);

  const sendLoadBook = useCallback(() => {
    if (!props.bookDataArrayBuffer && !props.bookDataBase64 && !props.bookDataUrl) {
      return;
    }
    const currentKey =
      props.bookDataUrl ||
      props.bookDataBase64?.slice(0, 32) ||
      (props.bookDataArrayBuffer ? props.bookDataArrayBuffer.byteLength : null);
    if (lastLoadedKeyRef.current === currentKey) {
      return;
    }
    lastLoadedKeyRef.current = currentKey;

    console.log('[EpubReader] sendLoadBook called. Available payloads:', {
      hasArrayBuffer: !!props.bookDataArrayBuffer,
      arrayBufferSize: props.bookDataArrayBuffer?.byteLength,
      hasBase64: !!props.bookDataBase64,
      hasUrl: !!props.bookDataUrl,
      initialCfi: props.initialCfi,
    });
    postMessageToViewer({
      type: 'LOAD_BOOK',
      dataArrayBuffer: props.bookDataArrayBuffer,
      dataBase64: props.bookDataBase64,
      dataUrl: props.bookDataUrl,
      initialCfi: props.initialCfi || undefined,
      locationsCache: props.locationsCache || undefined,
      highlights: props.highlights || [],
    });
    postMessageToViewer({ type: 'APPLY_SETTINGS', settings: props.settings });
  }, [
    props.bookDataArrayBuffer,
    props.bookDataBase64,
    props.bookDataUrl,
    props.initialCfi,
    props.locationsCache,
    props.highlights,
    props.settings,
    postMessageToViewer,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      nextPage: () => postMessageToViewer({ type: 'NEXT_PAGE' }),
      prevPage: () => postMessageToViewer({ type: 'PREV_PAGE' }),
      goTo: (cfi: string) => postMessageToViewer({ type: 'GO_TO', cfi }),
      applySettings: (settings: Partial<ReaderSettings>) =>
        postMessageToViewer({ type: 'APPLY_SETTINGS', settings }),
      addHighlight: (id: string, cfiRange: string, color: string) =>
        postMessageToViewer({ type: 'ADD_HIGHLIGHT', id, cfiRange, color }),
      removeHighlight: (cfiRange: string) =>
        postMessageToViewer({ type: 'REMOVE_HIGHLIGHT', cfiRange }),
    }),
    [postMessageToViewer]
  );

  // When settings change, push updates to reader
  useEffect(() => {
    if (isViewerReadyRef.current) {
      postMessageToViewer({ type: 'APPLY_SETTINGS', settings: props.settings });
    }
  }, [props.settings, postMessageToViewer]);

  // If viewer is ready and book data arrives later
  useEffect(() => {
    if (
      isViewerReadyRef.current &&
      (props.bookDataArrayBuffer || props.bookDataBase64 || props.bookDataUrl)
    ) {
      sendLoadBook();
    }
  }, [props.bookDataArrayBuffer, props.bookDataBase64, props.bookDataUrl, sendLoadBook]);

  const handleMessage = useCallback(
    (eventOrData: any) => {
      try {
        const dataStr = eventOrData?.nativeEvent
          ? eventOrData.nativeEvent.data
          : eventOrData?.data !== undefined
          ? eventOrData.data
          : eventOrData;
        const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
        if (!data || !data.type) return;

        switch (data.type) {
          case 'READY':
            isViewerReadyRef.current = true;
            sendLoadBook();
            break;

          case 'LOCATION_CHANGED':
            props.onLocationChange?.(data);
            break;

          case 'LOCATIONS_GENERATED':
            props.onLocationsGenerated?.(data.locations);
            break;

          case 'TOC_LOADED':
            props.onTocLoaded?.(data.toc);
            break;

          case 'TOGGLE_UI':
            props.onToggleUI?.();
            break;

          case 'CHANGE_FONT_SIZE':
            props.onChangeFontSize?.(data.delta);
            break;

          case 'ESCAPE':
            props.onEscape?.();
            break;

          case 'SELECTION_MADE':
            props.onSelection?.(data);
            break;

          case 'HIGHLIGHT_CLICKED':
            props.onHighlightClick?.(data);
            break;

          case 'ERROR':
            props.onError?.(data.message);
            break;
        }
      } catch (e) {
        console.error('Failed to parse message from epub viewer:', e);
      }
    },
    [sendLoadBook, props]
  );

  // Web window message listener
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleWebWindowMessage = (event: MessageEvent) => {
      // Security: Authenticate sender to prevent spoofing from other frames/windows
      if (webIframeRef.current && event.source !== webIframeRef.current.contentWindow) {
        return;
      }

      try {
        let data = event.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            return;
          }
        }
        if (data && data.type) {
          const knownTypes = [
            'READY',
            'LOCATION_CHANGED',
            'LOCATIONS_GENERATED',
            'TOC_LOADED',
            'TOGGLE_UI',
            'CHANGE_FONT_SIZE',
            'ESCAPE',
            'SELECTION_MADE',
            'ERROR',
          ];
          if (knownTypes.includes(data.type)) {
            handleMessage(data);
          }
        }
      } catch (err) {
        console.error('Failed to parse web window message:', err);
      }
    };

    window.addEventListener('message', handleWebWindowMessage);
    return () => {
      window.removeEventListener('message', handleWebWindowMessage);
    };
  }, [handleMessage]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {React.createElement('iframe', {
          ref: webIframeRef,
          srcDoc: EPUB_VIEWER_HTML,
          sandbox: 'allow-scripts allow-same-origin',
          onLoad: () => {
            console.log('[EpubReader] iframe onLoad fired');
            isViewerReadyRef.current = true;
            sendLoadBook();
          },
          style: {
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            backgroundColor: '#121214',
          },
          title: 'EPUB Viewer',
        })}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {NativeWebView &&
        React.createElement(NativeWebView, {
          ref: nativeWebViewRef,
          originWhitelist: ['*'],
          source: { html: EPUB_VIEWER_HTML, baseUrl: 'https://localhost' },
          style: styles.webview,
          javaScriptEnabled: true,
          domStorageEnabled: true,
          allowFileAccess: false,
          allowUniversalAccessFromFileURLs: false,
          mixedContentMode: 'never',
          scrollEnabled: false,
          bounces: false,
          onMessage: handleMessage,
        })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
  },
  webview: {
    flex: 1,
    backgroundColor: '#121214',
  },
});
