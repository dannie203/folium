/**
 * Platform-agnostic helpers for completing the web OAuth popup handshake.
 *
 * On web, `expo-auth-session`'s implicit flow opens Google in a popup through
 * `WebBrowser.openAuthSessionAsync`. Google redirects that popup back to the app
 * origin with the OAuth response in the URL fragment, but nothing completes the
 * handshake automatically: the redirect page must call
 * `WebBrowser.maybeCompleteAuthSession()`, which posts the result to the opener
 * (`window.opener`) so the opener can close the popup and resolve `promptAsync`.
 *
 * These helpers stay free of `expo`/`react-native` imports so they can be unit
 * tested under `node --test` without a browser. None of them ever return, log,
 * or otherwise expose token material.
 */

export const OAUTH_RESPONSE_PARAM_KEYS = [
  'access_token',
  'id_token',
  'token_type',
  'expires_in',
  'scope',
  'state',
  'code',
  'error',
  'error_description',
  'error_uri',
  'error_subtype',
  'authuser',
  'prompt',
  'session_state',
  'hd',
  'iss',
] as const;

const OAUTH_PARAM_SET: ReadonlySet<string> = new Set(OAUTH_RESPONSE_PARAM_KEYS);

const PLACEHOLDER_ORIGIN = 'https://folium.invalid';

function collectParams(href: string): URLSearchParams {
  const combined = new URLSearchParams();
  try {
    const url = new URL(href, PLACEHOLDER_ORIGIN);
    url.searchParams.forEach((value, key) => combined.append(key, value));
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    if (hash.includes('=')) {
      new URLSearchParams(hash).forEach((value, key) => combined.append(key, value));
    }
  } catch {
    // Malformed URL: treat as having no OAuth response.
  }
  return combined;
}

/** True when a URL carries an OAuth response in its query string or fragment. */
export function hasOAuthResponseInUrl(href: string): boolean {
  const params = collectParams(href);
  for (const key of OAUTH_PARAM_SET) {
    if (params.has(key)) {
      return true;
    }
  }
  return false;
}

function stripQuery(search: string): string {
  if (!search || search === '?') {
    return '';
  }
  const kept = new URLSearchParams();
  new URLSearchParams(search).forEach((value, key) => {
    if (!OAUTH_PARAM_SET.has(key)) {
      kept.append(key, value);
    }
  });
  const remaining = kept.toString();
  return remaining ? `?${remaining}` : '';
}

function stripFragment(hash: string): string {
  if (!hash || hash === '#') {
    return '';
  }
  const raw = hash.slice(1);
  // A plain route hash has no `=`; leave non-query fragments untouched.
  if (!raw.includes('=')) {
    return hash;
  }
  const kept = new URLSearchParams();
  new URLSearchParams(raw).forEach((value, key) => {
    if (!OAUTH_PARAM_SET.has(key)) {
      kept.append(key, value);
    }
  });
  const remaining = kept.toString();
  return remaining ? `#${remaining}` : '';
}

/**
 * Remove OAuth response parameters from a URL's query string and fragment while
 * preserving unrelated parameters. The return value is safe to write back with
 * `history.replaceState`.
 */
export function stripOAuthParamsFromUrl(href: string): string {
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(href);
  let url: URL;
  try {
    url = new URL(href, PLACEHOLDER_ORIGIN);
  } catch {
    return href;
  }

  url.search = stripQuery(url.search);
  url.hash = stripFragment(url.hash);

  if (isAbsolute) {
    return url.toString();
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export type AuthPromptOutcome =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/** Shape shared by `AuthSessionResult` and the raw `openAuthSessionAsync` result. */
export interface PromptResultLike {
  type?: string;
  params?: Record<string, unknown> | null;
  error?: unknown;
}

function readErrorMessage(error: unknown): string | undefined {
  if (!error) {
    return undefined;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object') {
    const candidate = error as {
      message?: unknown;
      error_description?: unknown;
      error?: unknown;
    };
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error_description === 'string') return candidate.error_description;
    if (typeof candidate.error === 'string') return candidate.error;
  }
  return undefined;
}

/**
 * Classify the result of `promptAsync` into success, user cancellation, or
 * error so callers can reset the loading state and show the right message.
 *
 * A closed popup surfaces as `{ type: 'dismiss' }`; both `cancel` and `dismiss`
 * are treated as user cancellation rather than a failure.
 */
export function classifyAuthPromptResult(result: PromptResultLike | null | undefined): AuthPromptOutcome {
  const type = result?.type;
  if (type === 'success') {
    return { status: 'success' };
  }
  if (type === 'cancel' || type === 'dismiss' || type === 'closed') {
    return { status: 'cancelled' };
  }

  const params = result?.params ?? undefined;
  const paramMessage =
    params &&
    (typeof params.error_description === 'string'
      ? params.error_description
      : typeof params.error === 'string'
        ? params.error
        : undefined);
  const detail = paramMessage || readErrorMessage(result?.error) || type || 'unknown_error';

  return { status: 'error', message: String(detail) };
}

export interface CompleteWebAuthDeps {
  maybeCompleteAuthSession: () => { type: 'success' | 'failed'; message?: string };
  getHref: () => string;
  replaceUrl: (cleanHref: string) => void;
}

export interface CompleteWebAuthOutcome {
  completed: boolean;
  scrubbed: boolean;
  message?: string;
}

/**
 * Run `maybeCompleteAuthSession()` for a pending web auth session and scrub any
 * OAuth response parameters left in the URL. Injectable so it can be exercised
 * in tests without a DOM.
 */
export function completeWebAuthSession(deps: CompleteWebAuthDeps): CompleteWebAuthOutcome {
  const result = deps.maybeCompleteAuthSession();

  let scrubbed = false;
  const href = deps.getHref();
  if (hasOAuthResponseInUrl(href)) {
    deps.replaceUrl(stripOAuthParamsFromUrl(href));
    scrubbed = true;
  }

  return { completed: result.type === 'success', scrubbed, message: result.message };
}
