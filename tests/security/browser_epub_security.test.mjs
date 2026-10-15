import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Helper to find Chromium binary
function findChromiumBinary() {
  const candidates = ['chromium', 'google-chrome', 'google-chrome-stable', 'chromium-browser'];
  for (const bin of candidates) {
    try {
      const out = execSync(`which ${bin} 2>/dev/null`).toString().trim();
      if (out && fs.existsSync(out)) return out;
    } catch {
      // ignore
    }
  }
  return null;
}

// Minimal zip builder for valid RFC-compliant EPUB without external npm dependencies
function buildEpubBuffer({ title, chapters, maliciousScript = '' }) {
  const tempScriptPath = path.resolve(`/tmp/_make_epub_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  const tempOutPath = path.resolve(`/tmp/_epub_${Date.now()}_${Math.random().toString(36).slice(2)}.epub`);

  const pyCode = `
import zipfile

with zipfile.ZipFile('${tempOutPath}', 'w') as zf:
    zf.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    zf.writestr('META-INF/container.xml', '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>''')
    
    manifest_items = []
    spine_items = []
    for i, ch in enumerate(${JSON.stringify(chapters)}):
        ch_id = f"chap{i+1}"
        manifest_items.append(f'<item id="{ch_id}" href="{ch_id}.xhtml" media-type="application/xhtml+xml"/>')
        spine_items.append(f'<itemref idref="{ch_id}"/>')

    zf.writestr('OEBPS/content.opf', f'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookID" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:identifier id="BookID">urn:uuid:audit-book</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    {"\\n    ".join(manifest_items)}
  </manifest>
  <spine toc="ncx">
    {"\\n    ".join(spine_items)}
  </spine>
</package>''')

    nav_points = []
    for i, ch in enumerate(${JSON.stringify(chapters)}):
        nav_points.append(f'<navPoint id="np-{i+1}" playOrder="{i+1}"><navLabel><text>{ch["title"]}</text></navLabel><content src="chap{i+1}.xhtml"/></navPoint>')

    zf.writestr('OEBPS/toc.ncx', f'''<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:audit-book"/></head>
  <docTitle><text>${title}</text></docTitle>
  <navMap>{"\\n    ".join(nav_points)}</navMap>
</ncx>''')

    for i, ch in enumerate(${JSON.stringify(chapters)}):
        body_content = ch["body"] + ${JSON.stringify(maliciousScript)}
        zf.writestr(f'OEBPS/chap{i+1}.xhtml', f'''<!DOCTYPE html>
<html>
<head><title>{ch["title"]}</title></head>
<body><h1>{ch["title"]}</h1>{body_content}</body>
</html>''')
`;

  fs.writeFileSync(tempScriptPath, pyCode);
  execSync(`python3 ${tempScriptPath}`);
  fs.unlinkSync(tempScriptPath);

  const buf = fs.readFileSync(tempOutPath);
  fs.unlinkSync(tempOutPath);
  return buf;
}

test('BROWSER REAL CHROMIUM: Origin Isolation, Pre-Sanitization, & Real EPUB Regression Audit', async (t) => {
  const chromiumBin = findChromiumBinary();
  if (!chromiumBin) {
    t.skip('Chromium binary not found on environment. Skipping live browser test.');
    return;
  }

  const chromeVersion = execSync(`${chromiumBin} --version`).toString().trim();
  console.log(`   [Browser Test] Environment browser: ${chromeVersion}`);

  // Load production viewer HTML from apps/mobile/src/reader/epubViewerHtml.ts
  const epubViewerPath = path.resolve('apps/mobile/src/reader/epubViewerHtml.ts');
  const viewerFileContent = fs.readFileSync(epubViewerPath, 'utf8');
  const match = viewerFileContent.match(/export const EPUB_VIEWER_HTML = (.*);/s);
  assert.ok(match, 'EPUB_VIEWER_HTML must exist in epubViewerHtml.ts');
  const rawViewerHtml = JSON.parse(match[1]);

  // Build clean 3-chapter sample EPUB for regression verification
  const sampleEpubBuf = buildEpubBuffer({
    title: 'Clean Multi-Chapter Book',
    chapters: [
      { title: 'Chapter 1: Genesis', body: '<p>Folium reader engine chapter one content with rich DOM text.</p>' },
      { title: 'Chapter 2: Navigation and Highlights', body: '<p>Folium reader engine chapter two content. Annotations and navigation zone.</p>' },
      { title: 'Chapter 3: Epilogue', body: '<p>Final chapter verifying sequential chapter navigation and locations.</p>' }
    ]
  });

  // Build adversarial exploit EPUB targeting host localStorage, sessionStorage, indexedDB, and DOM
  const exploitScript = `
    <script>
      try {
        var token = window.top.localStorage.getItem('FOLIUM_AUTH_TOKEN');
        if (token) window.top.localStorage.setItem('STOLEN_TOKEN', token);
      } catch(e) {}
      try {
        var sec = window.parent.sessionStorage.getItem('FOLIUM_SESSION_SECRET');
        if (sec) window.parent.sessionStorage.setItem('STOLEN_SESSION', sec);
      } catch(e) {}
      try {
        window.parent.document.getElementById('host-title').innerText = 'HACKED';
      } catch(e) {}
      try {
        var r = window.top.indexedDB.open('FoliumSecureVaultDB');
        r.onsuccess = function() { window.top.localStorage.setItem('STOLEN_IDB', 'true'); };
      } catch(e) {}
    </script>
    <div onload="try{window.top.localStorage.setItem('STOLEN_ONLOAD','true')}catch(e){}"></div>
    <img src="invalid-url.png" onerror="try{window.top.localStorage.setItem('STOLEN_ONERROR','true')}catch(e){}" />
    <svg><script>try{window.top.localStorage.setItem('STOLEN_SVG','true')}catch(e){}</script></svg>
    <object data="javascript:window.top.localStorage.setItem('STOLEN_OBJ','true')"></object>
    <embed src="javascript:window.top.localStorage.setItem('STOLEN_EMBED','true')" />
    <a href="javascript:window.top.localStorage.setItem('STOLEN_JS_URL','true')">Link</a>
  `;

  const exploitEpubBuf = buildEpubBuffer({
    title: 'Adversarial Exploit Book',
    chapters: [
      { title: 'Exploit Chapter', body: '<p>Testing active script neutralization and SOP opaque origin isolation.</p>' }
    ],
    maliciousScript: exploitScript
  });

  const sampleBase64 = sampleEpubBuf.toString('base64');
  const exploitBase64 = exploitEpubBuf.toString('base64');

  const eventsLog = [];
  let hostAuditResult = null;
  let domAuditResult = null;

  const server = http.createServer((req, res) => {
    console.log('   [HTTP REQ]', req.method, req.url);
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(rawViewerHtml);
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Folium Host App</title></head>
        <body>
        <h1 id="host-title">Folium Authenticated App</h1>
        <script>
          // Seed sensitive authentication state
          localStorage.setItem('FOLIUM_AUTH_TOKEN', 'vault-token-live-audit-xyz');
          sessionStorage.setItem('FOLIUM_SESSION_SECRET', 'session-secret-live-audit-456');

          // Seed sensitive IndexedDB state
          var idbReq = indexedDB.open('FoliumSecureVaultDB', 1);
          idbReq.onupgradeneeded = function(e) {
            var db = e.target.result;
            var store = db.createObjectStore('credentials', { keyPath: 'id' });
            store.put({ id: 'vault_key', secret: 'super-sensitive-signing-key-999' });
          };

          let sampleDone = false;
          let sampleLocations = false;
          let exploitDone = false;

          window.addEventListener('message', function(e) {
            let msg = e.data;
            if (typeof msg === 'string' && msg.trim().startsWith('{')) {
              try { msg = JSON.parse(msg); } catch(err) {}
            }
            if (!msg || !msg.type) return;

            fetch('/event?data=' + encodeURIComponent(JSON.stringify(msg)));

            const ifr = document.getElementById('reader-frame');

            // 1. When viewer is READY, load sample book
            if (msg.type === 'READY' && !sampleDone) {
              sampleDone = true;
              ifr.contentWindow.postMessage(JSON.stringify({
                type: 'LOAD_BOOK',
                dataBase64: '${sampleBase64}'
              }), '*');
            }

            // 2. When sample book finishes loading and generating locations, test NEXT_PAGE then load exploit book
            if (msg.type === 'LOCATIONS_GENERATED' && !sampleLocations) {
              sampleLocations = true;
              setTimeout(() => {
                ifr.contentWindow.postMessage(JSON.stringify({ type: 'NEXT_PAGE' }), '*');
              }, 200);

              setTimeout(() => {
                exploitDone = true;
                ifr.contentWindow.postMessage(JSON.stringify({
                  type: 'LOAD_BOOK',
                  dataBase64: '${exploitBase64}'
                }), '*');
              }, 500);
            }

            // 3. When exploit book is loaded and locations generated, request DOM audit
            if (msg.type === 'LOCATIONS_GENERATED' && exploitDone) {
              setTimeout(() => {
                ifr.contentWindow.postMessage(JSON.stringify({ type: 'AUDIT_CHAPTER_DOM' }), '*');
              }, 300);
            }

            // Phase 2c: Receive DOM audit and verify host security
            if (msg.type === 'CHAPTER_DOM_AUDITED') {
              fetch('/dom-audit?data=' + encodeURIComponent(JSON.stringify(msg)));

              setTimeout(() => {
                const currentToken = localStorage.getItem('FOLIUM_AUTH_TOKEN');
                const currentSecret = sessionStorage.getItem('FOLIUM_SESSION_SECRET');
                const stolenToken = localStorage.getItem('STOLEN_TOKEN');
                const stolenSession = localStorage.getItem('STOLEN_SESSION');
                const stolenIdb = localStorage.getItem('STOLEN_IDB');
                const stolenOnload = localStorage.getItem('STOLEN_ONLOAD');
                const stolenOnerror = localStorage.getItem('STOLEN_ONERROR');
                const stolenSvg = localStorage.getItem('STOLEN_SVG');
                const stolenObj = localStorage.getItem('STOLEN_OBJ');
                const stolenEmbed = localStorage.getItem('STOLEN_EMBED');
                const stolenJsUrl = localStorage.getItem('STOLEN_JS_URL');
                const hostTitle = document.getElementById('host-title').innerText;

                let readerOrigin = null;
                let crossOriginSopBlocked = false;
                try {
                  readerOrigin = ifr.contentWindow.origin;
                  if (readerOrigin !== location.origin) {
                    crossOriginSopBlocked = true;
                  }
                } catch(err) {
                  crossOriginSopBlocked = true;
                  readerOrigin = 'BLOCKED_BY_SOP';
                }

                // Verify IndexedDB remains untampered
                var checkDbReq = indexedDB.open('FoliumSecureVaultDB', 1);
                checkDbReq.onsuccess = function(ev) {
                  var db = ev.target.result;
                  var tx = db.transaction('credentials', 'readonly');
                  var store = tx.objectStore('credentials');
                  var getReq = store.get('vault_key');
                  getReq.onsuccess = function() {
                    const idbKeyVal = getReq.result ? getReq.result.secret : null;

                    fetch('/audit?data=' + encodeURIComponent(JSON.stringify({
                      tokenPreserved: (currentToken === 'vault-token-live-audit-xyz'),
                      secretPreserved: (currentSecret === 'session-secret-live-audit-456'),
                      idbPreserved: (idbKeyVal === 'super-sensitive-signing-key-999'),
                      hostTitleIntact: (hostTitle === 'Folium Authenticated App'),
                      stolenTokenAbsent: (stolenToken === null),
                      stolenSessionAbsent: (stolenSession === null),
                      stolenIdbAbsent: (stolenIdb === null),
                      stolenOnloadAbsent: (stolenOnload === null),
                      stolenOnerrorAbsent: (stolenOnerror === null),
                      stolenSvgAbsent: (stolenSvg === null),
                      stolenObjAbsent: (stolenObj === null),
                      stolenEmbedAbsent: (stolenEmbed === null),
                      stolenJsUrlAbsent: (stolenJsUrl === null),
                      crossOriginSopBlocked: crossOriginSopBlocked,
                      readerOrigin: readerOrigin
                    })));
                  };
                };
              }, 400);
            }
          });
        </script>
        <iframe
          id="reader-frame"
          sandbox="allow-scripts allow-same-origin"
          src="${dataUrl}"
          style="width: 800px; height: 600px; border: none;"
        ></iframe>
        </body>
        </html>
      `);
    } else if (url.pathname === '/event') {
      const data = JSON.parse(url.searchParams.get('data'));
      eventsLog.push(data);
      console.log('   [Live Event]', data.type);
      res.writeHead(200);
      res.end('ok');
    } else if (url.pathname === '/dom-audit') {
      domAuditResult = JSON.parse(url.searchParams.get('data'));
      res.writeHead(200);
      res.end('ok');
    } else if (url.pathname === '/audit') {
      hostAuditResult = JSON.parse(url.searchParams.get('data'));
      res.writeHead(200);
      res.end('ok');
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const chromeArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-proxy-server',
    '--disable-background-networking',
    '--disable-software-rasterizer',
    '--no-first-run',
    '--no-default-browser-check',
    `http://127.0.0.1:${port}/`
  ];
  const chromeProc = spawn(chromiumBin, chromeArgs, {
    env: {
      ...process.env,
      NO_PROXY: '127.0.0.1,localhost',
      no_proxy: '127.0.0.1,localhost',
      DBUS_SESSION_BUS_ADDRESS: 'disabled:'
    }
  });
  let chromeStderr = '';
  chromeProc.stderr?.on('data', d => {
    const s = d.toString();
    chromeStderr += s;
    process.stderr.write(s);
  });

  try {
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (hostAuditResult && domAuditResult) break;
    }
  } finally {
    chromeProc.kill();
    server.close();
  }

  if (!hostAuditResult || !domAuditResult) {
    console.error('Chromium stderr output:', chromeStderr);
  }

  // ============================================================================
  // VERIFICATION SECTION 1: Real Multi-Chapter EPUB Regression & Reader Engine
  // ============================================================================
  const tocs = eventsLog.filter(e => e.type === 'TOC_LOADED');
  assert.ok(tocs.length >= 2, 'Both sample and exploit EPUBs must successfully load and render TOC');
  assert.strictEqual(tocs[0].toc.length, 3, 'Sample book must report exactly 3 navigation chapters');
  assert.strictEqual(tocs[0].toc[0].label, 'Chapter 1: Genesis');
  assert.strictEqual(tocs[0].toc[1].label, 'Chapter 2: Navigation and Highlights');
  assert.strictEqual(tocs[0].toc[2].label, 'Chapter 3: Epilogue');

  const locs = eventsLog.filter(e => e.type === 'LOCATION_CHANGED');
  assert.ok(locs.length >= 2, 'Reader must emit LOCATION_CHANGED on initial render and upon NEXT_PAGE navigation');

  const errors = eventsLog.filter(e => e.type === 'ERROR');
  assert.strictEqual(errors.length, 0, 'Reader must emit 0 runtime render errors during full book lifecycle');

  // ============================================================================
  // VERIFICATION SECTION 2: In-Memory Pre-Sanitization & Chapter DOM Quarantine
  // ============================================================================
  assert.ok(domAuditResult, 'Chromium must complete and return Chapter DOM Audit');
  assert.strictEqual(domAuditResult.scriptCount, 0, 'Pre-sanitization must eradicate all <script> tags from chapter DOM');
  assert.strictEqual(domAuditResult.objectCount, 0, 'Pre-sanitization must eradicate all <object> and <embed> elements');
  assert.strictEqual(domAuditResult.inlineHandlerCount, 0, 'Pre-sanitization must strip all inline on* event handlers');

  // ============================================================================
  // VERIFICATION SECTION 3: Host Origin Isolation & Storage Security Invariants
  // ============================================================================
  assert.ok(hostAuditResult, 'Chromium must complete full host security audit');
  assert.strictEqual(hostAuditResult.tokenPreserved, true, 'Host localStorage auth token must remain intact');
  assert.strictEqual(hostAuditResult.secretPreserved, true, 'Host sessionStorage secret must remain intact');
  assert.strictEqual(hostAuditResult.idbPreserved, true, 'Host IndexedDB credential record must remain untampered');
  assert.strictEqual(hostAuditResult.hostTitleIntact, true, 'Host DOM must remain protected from defacement');

  // Audit that zero exfiltration tokens were written by the exploit EPUB
  assert.strictEqual(hostAuditResult.stolenTokenAbsent, true, 'Exploit script must not access host localStorage');
  assert.strictEqual(hostAuditResult.stolenSessionAbsent, true, 'Exploit script must not access host sessionStorage');
  assert.strictEqual(hostAuditResult.stolenIdbAbsent, true, 'Exploit script must not access host IndexedDB');
  assert.strictEqual(hostAuditResult.stolenOnloadAbsent, true, 'Exploit onload handler must not execute');
  assert.strictEqual(hostAuditResult.stolenOnerrorAbsent, true, 'Exploit onerror handler must not execute');
  assert.strictEqual(hostAuditResult.stolenSvgAbsent, true, 'Exploit SVG script tag must not execute');
  assert.strictEqual(hostAuditResult.stolenObjAbsent, true, 'Exploit object element must not execute');
  assert.strictEqual(hostAuditResult.stolenEmbedAbsent, true, 'Exploit embed element must not execute');
  assert.strictEqual(hostAuditResult.stolenJsUrlAbsent, true, 'Exploit javascript: URL must not execute');

  // Confirm browser SOP boundary is enforced
  assert.strictEqual(hostAuditResult.crossOriginSopBlocked, true, 'Browser SOP must block cross-origin access between opaque reader and host');
});
