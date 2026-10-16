import type { Bindings } from '../bindings.ts';

// ------------------------------------------------------------------------------
// Google ID Token & JWKS Verification (Zero-Latency Local Verification)
// ------------------------------------------------------------------------------

interface GoogleJwk {
  kty: string;
  alg: string;
  use: string;
  kid: string;
  n: string;
  e: string;
}

interface JwksCache {
  keys: Map<string, GoogleJwk>;
  cryptoKeys: Map<string, CryptoKey>;
  expiresAt: number;
}

const jwksCache: JwksCache = {
  keys: new Map(),
  cryptoKeys: new Map(),
  expiresAt: 0,
};

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtPart<T>(part: string): T | null {
  try {
    const bytes = base64UrlToUint8Array(part);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

interface GoogleJwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface GoogleJwtPayload {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  [key: string]: any;
}

async function getGooglePublicCryptoKey(kid: string, forceRefresh = false): Promise<CryptoKey | null> {
  const now = Date.now();
  if (forceRefresh || now > jwksCache.expiresAt || !jwksCache.keys.has(kid)) {
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/certs');
      if (!resp.ok) return null;

      const cacheControl = resp.headers.get('cache-control');
      let maxAge = 3600;
      if (cacheControl) {
        const match = cacheControl.match(/max-age=(\d+)/);
        if (match) maxAge = parseInt(match[1], 10);
      }

      const data = (await resp.json()) as { keys?: GoogleJwk[] };
      if (Array.isArray(data.keys)) {
        const newKeys = new Map<string, GoogleJwk>();
        for (const k of data.keys) {
          if (k.kid && k.kty === 'RSA') {
            newKeys.set(k.kid, k);
          }
        }
        jwksCache.keys = newKeys;
        jwksCache.cryptoKeys.clear();
        jwksCache.expiresAt = now + maxAge * 1000;
      }
    } catch (err) {
      console.error('[Auth] Failed to fetch Google JWKS:', err);
      if (jwksCache.keys.size === 0) return null;
    }
  }

  if (jwksCache.cryptoKeys.has(kid)) {
    return jwksCache.cryptoKeys.get(kid)!;
  }

  const jwk = jwksCache.keys.get(kid);
  if (!jwk) return null;

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    jwksCache.cryptoKeys.set(kid, cryptoKey);
    return cryptoKey;
  } catch (err) {
    console.error('[Auth] Failed to import JWK:', err);
    return null;
  }
}

export async function verifyGoogleIdToken(
  token: string,
  expectedAudience?: string
): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [rawHeader, rawPayload, rawSig] = parts;
  const header = decodeJwtPart<GoogleJwtHeader>(rawHeader);
  const payload = decodeJwtPart<GoogleJwtPayload>(rawPayload);

  if (!header || !payload) return null;
  if (header.alg !== 'RS256' || !header.kid) return null;

  // 1. Verify issuer
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    return null;
  }

  // 2. Verify expiration (with 60s skew tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now - 60) {
    return null;
  }

  // 2b. Verify not-before (with 60s skew tolerance if present)
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) {
    return null;
  }

  // 3. Verify audience (strictly required to prevent cross-app token reuse)
  const allowedAudiences = expectedAudience?.split(',').map((s) => s.trim()).filter(Boolean) || [];
  if (allowedAudiences.length === 0 || !payload.aud || !allowedAudiences.includes(payload.aud)) {
    return null;
  }

  // 4. Verify subject
  if (!payload.sub || typeof payload.sub !== 'string') {
    return null;
  }

  // 5. Verify cryptographic signature via cached JWKS
  let cryptoKey = await getGooglePublicCryptoKey(header.kid);
  if (!cryptoKey) {
    cryptoKey = await getGooglePublicCryptoKey(header.kid, true);
  }
  if (!cryptoKey) return null;

  try {
    const data = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
    const sigBytes = base64UrlToUint8Array(rawSig);
    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      sigBytes as unknown as BufferSource,
      data as unknown as BufferSource
    );
    return isValid ? payload.sub : null;
  } catch (err) {
    console.error('[Auth] Signature verification error:', err);
    return null;
  }
}

/**
 * Safely parse and validate Google OAuth token expiration duration.
 * Strictly accepts positive integers as numbers or clean digit strings (e.g. "3600").
 * Rejects non-finite numbers, floats, strings with trailing garbage (e.g. "3600garbage"), and values <= 0.
 */
export function parseExpiresIn(rawExpires: unknown): number | null {
  let expiresIn: number;

  if (typeof rawExpires === 'number') {
    expiresIn = rawExpires;
  } else if (typeof rawExpires === 'string' && /^\d+$/.test(rawExpires.trim())) {
    expiresIn = Number(rawExpires.trim());
  } else {
    return null;
  }

  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0) {
    return null;
  }

  return expiresIn;
}

/**
 * Verify Google OAuth Access Token via Google OAuth2 tokeninfo endpoint.
 * Fallback when client sends an OAuth access token instead of an ID token (JWT).
 */
export async function verifyGoogleAccessToken(
  token: string,
  expectedAudience?: string
): Promise<string | null> {
  const allowedAudiences = expectedAudience?.split(',').map((s) => s.trim()).filter(Boolean) || [];
  if (allowedAudiences.length === 0) return null;

  try {
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    if (!resp.ok) return null;

    const info = (await resp.json()) as {
      aud?: string;
      azp?: string;
      sub?: string;
      user_id?: string;
      issued_to?: string;
      expires_in?: string | number;
    };

    if (!info || typeof info !== 'object') return null;

    // Google OAuth access tokens return 'user_id' (or 'sub' when openid scope is present)
    const userId = (typeof info.sub === 'string' && info.sub.trim())
      ? info.sub.trim()
      : (typeof info.user_id === 'string' && info.user_id.trim())
        ? info.user_id.trim()
        : null;
    if (!userId) return null;

    // Audience may be reported in 'aud', 'azp', or 'issued_to'
    const tokenAud = info.aud || info.azp || info.issued_to;
    if (!tokenAud || !allowedAudiences.includes(tokenAud)) return null;

    // Strict expiration check: reject non-finite, trailing garbage strings, <= 0
    const expiresIn = parseExpiresIn(info.expires_in);
    if (!expiresIn) return null;

    return userId;
  } catch (err) {
    console.error('[Auth] Failed to verify Google access token:', err);
    return null;
  }
}

export async function authenticateUser(
  authorization: string | undefined,
  env?: Bindings
): Promise<string | null> {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  if (!token) return null;

  // Developer sandbox token: only permitted when explicitly enabled in non-production
  if (token.startsWith('demo_')) {
    if (env?.ALLOW_DEMO_AUTH === 'true' || env?.ENVIRONMENT === 'development') {
      return 'demo-google-user-001';
    }
    return null;
  }

  // Google ID Token (JWT) local verification (zero-latency fast path)
  if (token.split('.').length === 3) {
    const userId = await verifyGoogleIdToken(token, env?.GOOGLE_CLIENT_ID);
    if (userId) return userId;
  }

  // Fallback: Google Access Token verification via Google tokeninfo
  return await verifyGoogleAccessToken(token, env?.GOOGLE_CLIENT_ID);
}
