import React, { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ReaderSettings } from '@folium/shared';
import { EPUB_VIEWER_HTML } from './epubViewerHtml';

export interface EpubReaderRef {
  nextPage: () => void;
  prevPage: () => void;
  goTo: (cfi: string) => void;
  applySettings: (settings: Partial<ReaderSettings>) => void;
}

interface EpubReaderProps {
  bookDataBase64?: string;
  bookDataUrl?: string;
  initialCfi?: string | null;
  locationsCache?: string | null;
  settings: ReaderSettings;
  onLocationChange?: (location: { cfi: string; percentage: number; page?: number; totalPages?: number }) => void;
  onLocationsGenerated?: (locations: string) => void;
  onTocLoaded?: (toc: Array<{ label: string; href: string }>) => void;
  onToggleUI?: () => void;
  onSelection?: (selection: { cfiRange: string; text: string }) => void;
  onError?: (errorMessage: string) => void;
}

export const EpubReader = forwardRef<EpubReaderRef, EpubReaderProps>((props, ref) => {
  const webViewRef = useRef<any>(null);
  const isViewerReadyRef = useRef(false);

  const postMessageToViewer = (message: any) => {
    const jsonStr = JSON.stringify(message);
    if (Platform.OS === 'web') {
      // On web, react-native-webview renders an iframe
      const iframe = (webViewRef.current as any)?.contentWindow || (webViewRef.current as any);
      if (iframe?.postMessage) {
        iframe.postMessage(jsonStr, '*');
      }
    } else {
      webViewRef.current?.postMessage(jsonStr);
    }
  };

  useImperativeHandle(ref, () => ({
    nextPage: () => postMessageToViewer({ type: 'NEXT_PAGE' }),
    prevPage: () => postMessageToViewer({ type: 'PREV_PAGE' }),
    goTo: (cfi: string) => postMessageToViewer({ type: 'GO_TO', cfi }),
    applySettings: (settings: Partial<ReaderSettings>) =>
      postMessageToViewer({ type: 'APPLY_SETTINGS', settings }),
  }));

  // When settings change, push updates to reader
  useEffect(() => {
    if (isViewerReadyRef.current) {
      postMessageToViewer({ type: 'APPLY_SETTINGS', settings: props.settings });
    }
  }, [props.settings]);

  const handleMessage = (event: any) => {
    try {
      const dataStr = event.nativeEvent ? event.nativeEvent.data : event.data;
      const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'READY':
          isViewerReadyRef.current = true;
          // Viewer is ready, load book data
          postMessageToViewer({
            type: 'LOAD_BOOK',
            dataBase64: props.bookDataBase64,
            dataUrl: props.bookDataUrl,
            initialCfi: props.initialCfi || undefined,
            locationsCache: props.locationsCache || undefined,
          });
          postMessageToViewer({ type: 'APPLY_SETTINGS', settings: props.settings });
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

        case 'SELECTION_MADE':
          props.onSelection?.(data);
          break;

        case 'ERROR':
          props.onError?.(data.message);
          break;
      }
    } catch (e) {
      console.error('Failed to parse message from epub viewer:', e);
    }
  };

  return (
    <View style={styles.container}>
      {React.createElement(WebView as any, {
        ref: webViewRef,
        originWhitelist: ['*'],
        source: { html: EPUB_VIEWER_HTML, baseUrl: 'https://localhost' },
        style: styles.webview,
        javaScriptEnabled: true,
        domStorageEnabled: true,
        allowFileAccess: true,
        allowUniversalAccessFromFileURLs: true,
        mixedContentMode: 'always',
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
