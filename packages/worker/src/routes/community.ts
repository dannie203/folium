import { Hono } from 'hono';
import type { Bindings } from '../bindings.ts';
import { getClientIp, checkRateLimit } from '../middleware/rateLimit.ts';
import { validateDownloadTargetUrl } from '../security/downloadTarget.ts';

export const communityRoutes = new Hono<{ Bindings: Bindings }>();

export const OFFICIAL_OPDS_FEEDS: Record<string, string> = {
  standard_ebooks: 'https://standardebooks.org/feeds/atom/new-releases',
  project_gutenberg: 'https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads',
};

export const STANDARD_EBOOKS_FALLBACK_FEED = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Standard Ebooks - Curated Masterpieces</title>
  <updated>2026-09-20T00:00:00Z</updated>
  <entry>
    <id>https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice</id>
    <title>Pride and Prejudice</title>
    <author><name>Jane Austen</name></author>
    <summary>The romantic clash between the opinionated Elizabeth and her proud beau, Mr. Darcy.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub"/>
  </entry>
  <entry>
    <id>https://standardebooks.org/ebooks/mary-shelley/frankenstein</id>
    <title>Frankenstein</title>
    <author><name>Mary Shelley</name></author>
    <summary>A young scientist creates a sapient creature in an unorthodox scientific experiment.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/mary-shelley_frankenstein.epub"/>
  </entry>
  <entry>
    <id>https://standardebooks.org/ebooks/f-scott-fitzgerald/the-great-gatsby</id>
    <title>The Great Gatsby</title>
    <author><name>F. Scott Fitzgerald</name></author>
    <summary>The tragic story of Jay Gatsby and his unrequited passion for Daisy Buchanan.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/f-scott-fitzgerald/the-great-gatsby/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/f-scott-fitzgerald/the-great-gatsby/downloads/f-scott-fitzgerald_the-great-gatsby.epub"/>
  </entry>
  <entry>
    <id>https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland</id>
    <title>Alice's Adventures in Wonderland</title>
    <author><name>Lewis Carroll</name></author>
    <summary>Alice falls down a rabbit hole into a fantasy realm of nonsensical creatures.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/downloads/lewis-carroll_alices-adventures-in-wonderland.epub"/>
  </entry>
  <entry>
    <id>https://standardebooks.org/ebooks/charlotte-bronte/jane-eyre</id>
    <title>Jane Eyre</title>
    <author><name>Charlotte Brontë</name></author>
    <summary>An orphaned governess discovers dark secrets at Thornfield Hall and falls for Mr. Rochester.</summary>
    <link rel="http://opds-spec.org/image/thumbnail" href="https://standardebooks.org/ebooks/charlotte-bronte/jane-eyre/downloads/cover-thumbnail.jpg"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="https://standardebooks.org/ebooks/charlotte-bronte/jane-eyre/downloads/charlotte-bronte_jane-eyre.epub"/>
  </entry>
</feed>`;

// Proxy only the allowlisted official OPDS feeds so web clients are not blocked by CORS.
communityRoutes.get('/api/community/opds', async (c) => {
  const source = c.req.query('source');
  const query = c.req.query('q')?.trim() || '';
  const configuredFeedUrl = source ? OFFICIAL_OPDS_FEEDS[source] : undefined;
  if (!configuredFeedUrl) return c.json({ error: 'Unknown OPDS source' }, 400);
  const feedUrl = new URL(configuredFeedUrl);
  if (source === 'project_gutenberg' && query) {
    feedUrl.searchParams.set('query', query);
  }

  try {
    const response = await fetch(feedUrl.toString(), {
      redirect: 'follow',
      headers: {
        Accept: 'application/atom+xml, application/xml, text/xml, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      if (source === 'standard_ebooks') {
        c.header('Cache-Control', 'public, max-age=600');
        c.header('Content-Type', 'application/atom+xml; charset=utf-8');
        return c.body(STANDARD_EBOOKS_FALLBACK_FEED);
      }
      const errText = await response.text().catch(() => '');
      return c.json({ error: `OPDS source returned ${response.status}`, details: errText.slice(0, 300) }, response.status as any);
    }

    const body = await response.text();
    c.header('Cache-Control', 'public, max-age=300');
    c.header('Content-Type', 'application/atom+xml; charset=utf-8');
    return c.body(body);
  } catch (err) {
    console.error('[Community OPDS] Proxy error:', err);
    if (source === 'standard_ebooks') {
      c.header('Cache-Control', 'public, max-age=600');
      c.header('Content-Type', 'application/atom+xml; charset=utf-8');
      return c.body(STANDARD_EBOOKS_FALLBACK_FEED);
    }
    return c.json({ error: 'Unable to fetch official OPDS source' }, 502);
  }
});

// Proxy book download with SSRF defense & manual redirect validation
communityRoutes.get('/api/community/download', async (c) => {
  const ip = getClientIp(c.req);
  const rateCheck = await checkRateLimit(
    c.env?.DOWNLOAD_RATE_LIMITER,
    `download:ip:${ip}`,
    10,
    60
  );
  if (!rateCheck.allowed) {
    return c.json(
      { error: 'Too Many Requests', code: 'RATE_LIMITED' },
      429,
      { 'Retry-After': String(rateCheck.retryAfter) }
    );
  }

  const fileUrl = c.req.query('url');
  if (!fileUrl) return c.json({ error: 'Missing url parameter' }, 400);

  const initialValidation = validateDownloadTargetUrl(fileUrl);
  if (!initialValidation.valid || !initialValidation.url) {
    return c.json({ error: initialValidation.error }, 403);
  }

  let currentUrl = initialValidation.url.toString();
  let response: Response | null = null;
  const MAX_REDIRECTS = 5;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Validate every hop against strict HTTPS, domain allowlist, and IP restrictions
      const validation = validateDownloadTargetUrl(currentUrl);
      if (!validation.valid || !validation.url) {
        return c.json({ error: `Redirect rejected: ${validation.error}` }, 403);
      }

      response = await fetch(currentUrl, {
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        signal: AbortSignal.timeout(15000),
      });

      // Handle redirects manually
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return c.json({ error: 'Redirect location header missing' }, 502);
        }
        // Resolve relative or absolute redirect URL
        currentUrl = new URL(location, currentUrl).toString();
        if (hop === MAX_REDIRECTS) {
          return c.json({ error: 'Too many redirects' }, 508);
        }
        continue;
      }

      break;
    }

    if (!response) {
      return c.json({ error: 'No response from upstream server' }, 502);
    }

    if (!response.ok) {
      return c.json({ error: `Upstream error ${response.status}` }, response.status as any);
    }

    // Defense against large payload exhaustion (> 50 MB)
    const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_BYTES) {
      return c.json({ error: 'Payload exceeds 50MB maximum size limit', code: 'PAYLOAD_TOO_LARGE' }, 413);
    }

    const contentType = response.headers.get('content-type') || 'application/epub+zip';
    c.header('Content-Type', contentType);
    c.header('Cache-Control', 'public, max-age=86400');
    return c.body(response.body as any);
  } catch (err: any) {
    if (err?.name === 'TimeoutError') {
      return c.json({ error: 'Download request timed out (15s limit)' }, 504);
    }
    console.error('[Community Download] Proxy error:', err);
    return c.json({ error: 'Download proxy failed' }, 502);
  }
});
