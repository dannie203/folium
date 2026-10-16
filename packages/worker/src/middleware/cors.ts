import type { MiddlewareHandler } from 'hono';
import type { Bindings } from '../bindings.ts';

/**
 * Validate origin against strict allowlist.
 * In production: ONLY https://aki.is-a.dev is permitted.
 * In development: localhost origins (http://localhost:* or http://127.0.0.1:*) are permitted.
 */
export function isAllowedOrigin(origin: string | undefined, env?: Bindings): string | null {
  if (!origin) return null;
  const trimmed = origin.trim();
  if (trimmed === 'https://aki.is-a.dev') {
    return 'https://aki.is-a.dev';
  }
  const isDev = env?.ENVIRONMENT === 'development';
  if (isDev) {
    if (/^http:\/\/localhost(:\d+)?$/.test(trimmed) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

// Strict CORS Allowlist & Preflight Middleware
export const corsMiddleware: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const origin = c.req.header('origin');
  const allowedOrigin = isAllowedOrigin(origin, c.env);

  if (c.req.method === 'OPTIONS') {
    if (!origin || !allowedOrigin) {
      // Disallowed origin or missing origin on preflight: return 204 without CORS headers
      return new Response(null, { status: 204 });
    }
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, If-None-Match, X-App-Version',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    });
  }

  await next();

  if (allowedOrigin) {
    c.header('Access-Control-Allow-Origin', allowedOrigin);
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-None-Match, X-App-Version');
    c.header('Vary', 'Origin');
  }
};
