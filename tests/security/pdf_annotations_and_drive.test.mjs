import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { PDF_VIEWER_HTML } from '../../apps/mobile/src/reader/pdfViewerHtml.ts';

// Helper to instantiate the actual script inside PDF_VIEWER_HTML in a mock DOM sandbox
function createRealViewerContext() {
  const lastScriptIdx = PDF_VIEWER_HTML.lastIndexOf('<script>');
  const scriptContent = PDF_VIEWER_HTML.slice(lastScriptIdx + 8, PDF_VIEWER_HTML.lastIndexOf('</script>'));
  const viewerLogicIdx = scriptContent.indexOf('let pdfDoc = null;');
  assert.ok(viewerLogicIdx !== -1, 'Viewer logic must exist in PDF_VIEWER_HTML');
  const viewerCode = scriptContent.slice(viewerLogicIdx);

  const postedMessages = [];
  const elements = {
    'pdf-canvas': { style: {}, getContext: () => ({ setTransform: () => {} }) },
    'page-wrapper': {
      style: {},
      getBoundingClientRect: () => ({ width: 800, height: 1000, left: 0, top: 0 }),
    },
    'text-layer': { style: {}, innerHTML: '', setProperty: () => {} },
    'highlight-layer': {
      children: [],
      appendChild(el) {
        this.children.push(el);
      },
      get innerHTML() {
        return '';
      },
      set innerHTML(val) {
        if (val === '') this.children = [];
      },
    },
    'viewer-container': {
      style: {},
      addEventListener: () => {},
      clientWidth: 800,
      clientHeight: 1000,
    },
    loading: { style: {} },
  };

  const listeners = {};
  const sandbox = {
    console,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    window: {
      ReactNativeWebView: {
        postMessage: (msg) => postedMessages.push(JSON.parse(msg)),
      },
      innerWidth: 800,
      innerHeight: 1000,
      addEventListener: (evt, fn) => {
        listeners['win_' + evt] = fn;
      },
    },
    document: {
      body: { className: '', style: {} },
      getElementById: (id) => elements[id],
      createElement: (tag) => {
        const el = { tag, className: '', style: {}, title: '', listeners: {} };
        el.addEventListener = (evt, fn) => {
          el.listeners[evt] = fn;
        };
        return el;
      },
      addEventListener: (evt, fn) => {
        listeners['doc_' + evt] = fn;
      },
    },
    pdfjsLib: {
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 10,
          getOutline: () => Promise.resolve([]),
          getPage: () =>
            Promise.resolve({
              getViewport: () => ({ width: 800, height: 1000, scale: 1 }),
              render: () => ({ promise: Promise.resolve() }),
              getTextContent: () => Promise.resolve({ items: [{ str: 'Hello Folium' }] }),
            }),
        }),
      }),
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(viewerCode, sandbox);

  return { sandbox, elements, postedMessages };
}

// ==============================================================================
//  1. ACTUAL PDF_VIEWER_HTML CONTRACT & RUNTIME SCRIPT TESTS
// ==============================================================================

test('PDF VIEWER 1: Real PDF_VIEWER_HTML contains requisite DOM layering, CSS rules, and 5-color palette', () => {
  assert.ok(typeof PDF_VIEWER_HTML === 'string');
  assert.ok(PDF_VIEWER_HTML.length > 500000, 'Must contain full bundled PDF reader');

  // 1. Layering DOM elements
  assert.ok(PDF_VIEWER_HTML.includes('id="page-wrapper"'), 'Must contain page-wrapper div');
  assert.ok(PDF_VIEWER_HTML.includes('id="text-layer"'), 'Must contain text-layer div');
  assert.ok(PDF_VIEWER_HTML.includes('id="highlight-layer"'), 'Must contain highlight-layer div');
  assert.ok(PDF_VIEWER_HTML.includes('.pdf-highlight-rect'), 'Must contain highlight rect CSS class');

  // 2. 5-color palette mapping
  assert.ok(PDF_VIEWER_HTML.includes('"#FACC15"'), 'Must include Yellow hex');
  assert.ok(PDF_VIEWER_HTML.includes('"#4ADE80"'), 'Must include Green hex');
  assert.ok(PDF_VIEWER_HTML.includes('"#60A5FA"'), 'Must include Blue hex');
  assert.ok(PDF_VIEWER_HTML.includes('"#F472B6"'), 'Must include Pink hex');
  assert.ok(PDF_VIEWER_HTML.includes('"#C084FC"'), 'Must include Purple hex');

  // 3. Text layer rendering & Bridge message handlers
  assert.ok(PDF_VIEWER_HTML.includes('pdfjsLib.renderTextLayer'), 'Must invoke pdfjsLib.renderTextLayer');
  assert.ok(PDF_VIEWER_HTML.includes('SET_HIGHLIGHTS'), 'Must handle SET_HIGHLIGHTS bridge action');
  assert.ok(PDF_VIEWER_HTML.includes('ADD_HIGHLIGHT'), 'Must handle ADD_HIGHLIGHT bridge action');
  assert.ok(PDF_VIEWER_HTML.includes('REMOVE_HIGHLIGHT'), 'Must handle REMOVE_HIGHLIGHT bridge action');
  assert.ok(PDF_VIEWER_HTML.includes('SELECTION_MADE'), 'Must emit SELECTION_MADE bridge action');
  assert.ok(PDF_VIEWER_HTML.includes('HIGHLIGHT_CLICKED'), 'Must emit HIGHLIGHT_CLICKED bridge action');
});

test('PDF VIEWER 2: Real Viewer Script Execution — SET_HIGHLIGHTS renders normalized overlays and colors', () => {
  const env = createRealViewerContext();

  const testHighlights = [
    {
      id: 'hl-test-1',
      cfi_range: 'page:1:%5B%7B%22x%22%3A0.1%2C%22y%22%3A0.2%2C%22w%22%3A0.3%2C%22h%22%3A0.04%7D%5D',
      color: 'purple',
    },
  ];

  env.sandbox.handleMessage({ type: 'SET_HIGHLIGHTS', highlights: testHighlights });

  const layer = env.elements['highlight-layer'];
  assert.strictEqual(layer.children.length, 1, 'Should have rendered 1 highlight element');

  const hlEl = layer.children[0];
  assert.strictEqual(hlEl.className, 'pdf-highlight-rect');
  assert.strictEqual(hlEl.style.left, '10%');
  assert.strictEqual(hlEl.style.top, '20%');
  assert.strictEqual(hlEl.style.width, '30%');
  assert.strictEqual(hlEl.style.height, '4%');
  assert.strictEqual(hlEl.style.backgroundColor, '#C084FC', 'Purple color mapping must be respected');
});

test('PDF VIEWER 3: Real Viewer Script Execution — Clicking a rendered highlight emits HIGHLIGHT_CLICKED', () => {
  const env = createRealViewerContext();

  const testHighlights = [
    {
      id: 'hl-click-test',
      cfi_range: 'page:1:%5B%7B%22x%22%3A0.15%2C%22y%22%3A0.25%2C%22w%22%3A0.4%2C%22h%22%3A0.03%7D%5D',
      color: 'blue',
    },
  ];

  env.sandbox.handleMessage({ type: 'SET_HIGHLIGHTS', highlights: testHighlights });
  const hlEl = env.elements['highlight-layer'].children[0];
  assert.ok(hlEl, 'Highlight element must exist');

  // Trigger real click handler registered on the DOM element
  hlEl.listeners['click']({ stopPropagation: () => {} });

  const lastMsg = env.postedMessages[env.postedMessages.length - 1];
  assert.deepStrictEqual(lastMsg, {
    type: 'HIGHLIGHT_CLICKED',
    id: 'hl-click-test',
    cfiRange: 'page:1:%5B%7B%22x%22%3A0.15%2C%22y%22%3A0.25%2C%22w%22%3A0.4%2C%22h%22%3A0.03%7D%5D',
  });
});

test('PDF VIEWER 4: Real Viewer Script Execution — Dynamic ADD_HIGHLIGHT & REMOVE_HIGHLIGHT lifecycle', () => {
  const env = createRealViewerContext();

  // 1. Initial highlight
  env.sandbox.handleMessage({
    type: 'SET_HIGHLIGHTS',
    highlights: [
      {
        id: 'hl-1',
        cfi_range: 'page:1:%5B%7B%22x%22%3A0.1%2C%22y%22%3A0.1%2C%22w%22%3A0.2%2C%22h%22%3A0.02%7D%5D',
        color: 'yellow',
      },
    ],
  });
  assert.strictEqual(env.elements['highlight-layer'].children.length, 1);

  // 2. Add second highlight dynamically
  env.sandbox.handleMessage({
    type: 'ADD_HIGHLIGHT',
    id: 'hl-2',
    cfiRange: 'page:1:%5B%7B%22x%22%3A0.4%2C%22y%22%3A0.5%2C%22w%22%3A0.2%2C%22h%22%3A0.02%7D%5D',
    color: 'green',
  });
  assert.strictEqual(env.elements['highlight-layer'].children.length, 2);
  assert.strictEqual(env.elements['highlight-layer'].children[1].style.backgroundColor, '#4ADE80');

  // 3. Remove second highlight dynamically
  env.sandbox.handleMessage({
    type: 'REMOVE_HIGHLIGHT',
    cfiRange: 'page:1:%5B%7B%22x%22%3A0.4%2C%22y%22%3A0.5%2C%22w%22%3A0.2%2C%22h%22%3A0.02%7D%5D',
  });
  assert.strictEqual(env.elements['highlight-layer'].children.length, 1);
  assert.strictEqual(env.elements['highlight-layer'].children[0].style.backgroundColor, '#FACC15');
});

test('PDF VIEWER 5: Real Viewer Script Execution — GO_TO jumps to page parsed from cfi / locator', () => {
  const env = createRealViewerContext();

  vm.runInContext('totalPages = 20;', env.sandbox);

  // Navigate using locator string
  env.sandbox.handleMessage({ type: 'GO_TO', cfi: 'page:5:%5B...%5D' });
  const currentPage1 = vm.runInContext('pageNum', env.sandbox);
  assert.strictEqual(currentPage1, 5);

  // Navigate using plain page number string
  env.sandbox.handleMessage({ type: 'GO_TO', cfi: '12' });
  const currentPage2 = vm.runInContext('pageNum', env.sandbox);
  assert.strictEqual(currentPage2, 12);
});

// ==============================================================================
//  2. READER BRIDGE SOURCE CODE CONTRACT AUDIT
// ==============================================================================

test('READER BRIDGES 1: PdfReader & EpubReader contract consistency & event allowlists', () => {
  const pdfReaderSource = fs.readFileSync(
    path.resolve('apps/mobile/src/reader/PdfReader.tsx'),
    'utf-8'
  );
  const epubReaderSource = fs.readFileSync(
    path.resolve('apps/mobile/src/reader/EpubReader.tsx'),
    'utf-8'
  );

  // Check PdfReaderRef interface
  assert.ok(pdfReaderSource.includes('addHighlight: (id: string, cfiRange: string, color: string) => void;'));
  assert.ok(pdfReaderSource.includes('removeHighlight: (cfiRange: string) => void;'));
  assert.ok(pdfReaderSource.includes('goTo: (page: string | number) => void;'));
  assert.ok(pdfReaderSource.includes('getCurrentText: () => void;'));

  // Check PdfReaderProps interface
  assert.ok(pdfReaderSource.includes('highlights?: Array<{ id: string; cfi_range: string; color: string }>;'));
  assert.ok(pdfReaderSource.includes('onSelection?: (selection: { cfiRange: string; text: string }) => void;'));
  assert.ok(pdfReaderSource.includes('onHighlightClick?: (highlight: { id: string; cfiRange: string }) => void;'));

  // Both readers must include HIGHLIGHT_CLICKED and TEXT_EXTRACTED in message allowlists
  assert.ok(pdfReaderSource.includes("'HIGHLIGHT_CLICKED'"));
  assert.ok(pdfReaderSource.includes("'TEXT_EXTRACTED'"));
  assert.ok(epubReaderSource.includes("'HIGHLIGHT_CLICKED'"));
  assert.ok(epubReaderSource.includes("'TEXT_EXTRACTED'"));
});

// ==============================================================================
//  3. GOOGLE DRIVE LAZY LOADER CONTRACT AUDIT
// ==============================================================================

test('DRIVE LAZY LOADER 1: Lazy book detection correctly identifies drive:// scheme and missing local binary with drive_file_id', () => {
  const lazyBook1 = {
    id: 'book-1',
    local_path: 'drive://google-drive-file-123',
    drive_file_id: 'google-drive-file-123',
  };
  const isDriveLazy1 =
    lazyBook1.local_path?.startsWith('drive://') ||
    (!lazyBook1.local_path && !!lazyBook1.drive_file_id);
  assert.strictEqual(Boolean(isDriveLazy1), true);

  const lazyBook2 = {
    id: 'book-2',
    local_path: '',
    drive_file_id: 'google-drive-file-456',
  };
  const isDriveLazy2 =
    lazyBook2.local_path?.startsWith('drive://') ||
    (!lazyBook2.local_path && !!lazyBook2.drive_file_id);
  assert.strictEqual(Boolean(isDriveLazy2), true);

  const localBook = {
    id: 'book-3',
    local_path: '/data/user/0/folium/files/local.epub',
    drive_file_id: null,
  };
  const isDriveLazy3 =
    localBook.local_path?.startsWith('drive://') ||
    (!localBook.local_path && !!localBook.drive_file_id);
  assert.strictEqual(Boolean(isDriveLazy3), false);
});

test('DRIVE LAZY LOADER 2: Native safe buffer saving without blob: URI & local-path update without bumping cloud updated_at', () => {
  const storageSource = fs.readFileSync(
    path.resolve('apps/mobile/src/services/storage.ts'),
    'utf-8'
  );
  const driveSource = fs.readFileSync(
    path.resolve('apps/mobile/src/services/publicDriveService.ts'),
    'utf-8'
  );

  // storage.ts must implement saveBookBuffer writing directly via Base64 on native (avoiding blob: URI)
  assert.ok(storageSource.includes('export async function saveBookBuffer'));
  assert.ok(storageSource.includes('FileSystem.writeAsStringAsync'));
  assert.ok(!storageSource.includes('URL.createObjectURL(blob)'));

  // publicDriveService.ts must use saveBookBuffer
  assert.ok(driveSource.includes('saveBookBuffer('));

  // publicDriveService.ts must NOT bump updated_at when caching local_path
  assert.ok(driveSource.includes("UPDATE books SET local_path = ? WHERE id = ?"));
  assert.ok(!driveSource.includes("UPDATE books SET local_path = ?, updated_at = ? WHERE id = ?"));
});
