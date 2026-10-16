import type { RateLimiterBinding } from '../bindings.ts';

// ------------------------------------------------------------------------------
// Client IP Extraction & Rate Limiting Primitives
// ------------------------------------------------------------------------------

/**
 * Extract trusted client IP from Cloudflare connecting IP header.
 * Disregards user-controlled X-Forwarded-For headers to prevent spoofing.
 */
export function getClientIp(req: { header: (name: string) => string | undefined }): string {
  const cfIp = req.header('cf-connecting-ip');
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }
  return 'unknown-ip';
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const fallbackRateLimitMap = new Map<string, RateLimitBucket>();

export function resetFallbackRateLimiter(): void {
  fallbackRateLimitMap.clear();
}

/**
 * Check rate limit using Cloudflare native binding, with fallback to in-memory window
 * for test environments and local dev where native bindings are not injected.
 */
export async function checkRateLimit(
  limiter: RateLimiterBinding | undefined,
  key: string,
  limit: number,
  periodSeconds: number,
  nowMs = Date.now()
): Promise<{ allowed: boolean; retryAfter: number }> {
  if (limiter && typeof limiter.limit === 'function') {
    const res = await limiter.limit({ key });
    return {
      allowed: res.success,
      retryAfter: res.success ? 0 : periodSeconds,
    };
  }

  // Fallback in-memory rate limiter for test / dev suites
  let bucket = fallbackRateLimitMap.get(key);
  if (!bucket || nowMs >= bucket.resetAt) {
    bucket = { count: 0, resetAt: nowMs + periodSeconds * 1000 };
    fallbackRateLimitMap.set(key, bucket);
  }

  bucket.count++;
  if (bucket.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000));
    return { allowed: false, retryAfter };
  }

  return { allowed: true, retryAfter: 0 };
}
