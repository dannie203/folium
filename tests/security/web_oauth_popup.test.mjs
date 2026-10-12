import test from 'node:test';
import assert from 'node:assert';
import {
  hasOAuthResponseInUrl,
  stripOAuthParamsFromUrl,
  classifyAuthPromptResult,
  completeWebAuthSession,
} from '../../apps/mobile/src/services/authSessionWeb.ts';

// ==============================================================================
//  WEB GOOGLE OAUTH POPUP REGRESSION SUITE
//
//  Covers the popup handshake that `WebBrowser.maybeCompleteAuthSession()`
//  drives: a successful redirect completes the session and scrubs tokens, an
//  OAuth error is surfaced, and a closed/cancelled popup is treated as a
//  cancellation (never a stuck loading state).
// ==============================================================================

const REDIRECT = 'https://aki.is-a.dev';

// --- Successful popup completion ---------------------------------------------

test('web oauth: successful redirect is detected and its tokens are scrubbed', () => {
  const href =
    `${REDIRECT}/#access_token=SECRET_ACCESS&id_token=SECRET_ID&token_type=Bearer` +
    '&expires_in=3600&scope=openid%20email&state=abc123&authuser=0';

  assert.strictEqual(hasOAuthResponseInUrl(href), true);

  const clean = stripOAuthParamsFromUrl(href);
  assert.ok(!clean.includes('SECRET_ACCESS'), 'access token must be removed');
  assert.ok(!clean.includes('SECRET_ID'), 'id token must be removed');
  assert.ok(!clean.includes('access_token'), 'access_token key must be removed');
  assert.ok(!clean.includes('id_token'), 'id_token key must be removed');
  assert.strictEqual(clean, `${REDIRECT}/`);
});

test('web oauth: completeWebAuthSession completes and scrubs on success', () => {
  let replaced = null;
  const href =
    `${REDIRECT}/#access_token=SECRET_ACCESS&id_token=SECRET_ID&state=abc123&expires_in=3600`;

  const outcome = completeWebAuthSession({
    maybeCompleteAuthSession: () => ({ type: 'success', message: 'Attempting to complete auth' }),
    getHref: () => href,
    replaceUrl: (clean) => {
      replaced = clean;
    },
  });

  assert.strictEqual(outcome.completed, true);
  assert.strictEqual(outcome.scrubbed, true);
  assert.ok(replaced && !replaced.includes('SECRET_ACCESS'));
  assert.ok(replaced && !replaced.includes('#' + 'access_token'));
});

test('web oauth: completeWebAuthSession is a no-op on the opener (no pending session)', () => {
  let replaceCalled = false;
  const outcome = completeWebAuthSession({
    maybeCompleteAuthSession: () => ({
      type: 'failed',
      message: 'No auth session is currently in progress',
    }),
    getHref: () => `${REDIRECT}/`,
    replaceUrl: () => {
      replaceCalled = true;
    },
  });

  assert.strictEqual(outcome.completed, false);
  assert.strictEqual(outcome.scrubbed, false);
  assert.strictEqual(replaceCalled, false, 'clean opener URL must be left untouched');
});

// --- OAuth errors -------------------------------------------------------------

test('web oauth: error redirect is detected and scrubbed, and classified as an error', () => {
  const href = `${REDIRECT}/#error=access_denied&error_description=User%20denied%20the%20request&state=abc123`;
  assert.strictEqual(hasOAuthResponseInUrl(href), true);

  const clean = stripOAuthParamsFromUrl(href);
  assert.strictEqual(clean, `${REDIRECT}/`);

  const outcome = classifyAuthPromptResult({
    type: 'error',
    params: { error: 'access_denied', error_description: 'User denied the request' },
  });
  assert.strictEqual(outcome.status, 'error');
  assert.strictEqual(outcome.message, 'User denied the request');
});

test('web oauth: error without a description falls back to the error code', () => {
  const outcome = classifyAuthPromptResult({ type: 'error', params: { error: 'invalid_client' } });
  assert.strictEqual(outcome.status, 'error');
  assert.strictEqual(outcome.message, 'invalid_client');
});

// --- Cancellation -------------------------------------------------------------

test('web oauth: closing the popup (dismiss/cancel/closed) is treated as cancellation, not failure', () => {
  assert.strictEqual(classifyAuthPromptResult({ type: 'dismiss' }).status, 'cancelled');
  assert.strictEqual(classifyAuthPromptResult({ type: 'cancel' }).status, 'cancelled');
  assert.strictEqual(classifyAuthPromptResult({ type: 'closed' }).status, 'cancelled');
});

test('web oauth: cancelled popup scrubs nothing because no response is present', () => {
  const outcome = completeWebAuthSession({
    maybeCompleteAuthSession: () => ({ type: 'failed', message: 'No auth session is currently in progress' }),
    getHref: () => `${REDIRECT}/`,
    replaceUrl: () => {
      throw new Error('replaceUrl must not be called without an OAuth response');
    },
  });
  assert.strictEqual(outcome.completed, false);
  assert.strictEqual(outcome.scrubbed, false);
});

test('web oauth: maybeCompleteAuthSession executes strictly before replaceUrl', () => {
  const callOrder = [];
  const href = `${REDIRECT}/#access_token=SECRET_ACCESS&state=abc123`;
  const outcome = completeWebAuthSession({
    maybeCompleteAuthSession: () => {
      callOrder.push('maybeCompleteAuthSession');
      return { type: 'success', message: 'Auth completed' };
    },
    getHref: () => href,
    replaceUrl: () => {
      callOrder.push('replaceUrl');
    },
  });

  assert.deepStrictEqual(callOrder, ['maybeCompleteAuthSession', 'replaceUrl']);
  assert.strictEqual(outcome.completed, true);
  assert.strictEqual(outcome.scrubbed, true);
});

test('web oauth: observable contract ensures opener receives raw tokens before location is scrubbed', () => {
  const mockLocation = {
    href: `${REDIRECT}/#access_token=SECRET_ACCESS&id_token=SECRET_ID&state=abc123`,
  };
  let messageReceivedByOpener = null;

  const mockMaybeCompleteAuthSession = () => {
    const rawUrl = mockLocation.href;
    messageReceivedByOpener = { url: rawUrl, expoSender: 'handle_123' };
    return { type: 'success', message: 'Attempting to complete auth' };
  };

  const outcome = completeWebAuthSession({
    maybeCompleteAuthSession: mockMaybeCompleteAuthSession,
    getHref: () => mockLocation.href,
    replaceUrl: (cleanHref) => {
      mockLocation.href = cleanHref;
    },
  });

  assert.strictEqual(outcome.completed, true);
  assert.strictEqual(outcome.scrubbed, true);
  assert.ok(messageReceivedByOpener, 'Opener must receive postMessage');
  assert.ok(messageReceivedByOpener.url.includes('SECRET_ACCESS'), 'Opener must receive access token');
  assert.ok(messageReceivedByOpener.url.includes('SECRET_ID'), 'Opener must receive id token');
  assert.strictEqual(mockLocation.href, `${REDIRECT}/`);
  assert.ok(!mockLocation.href.includes('SECRET_ACCESS'));
});

test('web oauth: enterprise (hd) and RFC 9207 (iss) parameters are detected and scrubbed', () => {
  const href =
    `${REDIRECT}/#access_token=SECRET_ACCESS&hd=example.com&iss=https%3A%2F%2Faccounts.google.com` +
    '&error_subtype=access_denied&session_state=xyz789';

  assert.strictEqual(hasOAuthResponseInUrl(href), true);
  const clean = stripOAuthParamsFromUrl(href);
  assert.ok(!clean.includes('example.com'));
  assert.ok(!clean.includes('accounts.google.com'));
  assert.ok(!clean.includes('access_denied'));
  assert.ok(!clean.includes('xyz789'));
  assert.strictEqual(clean, `${REDIRECT}/`);
});

test('web oauth: success classification is reported for a completed session', () => {
  assert.strictEqual(classifyAuthPromptResult({ type: 'success', params: { access_token: 'x' } }).status, 'success');
});

test('web oauth: error extraction formats various error representations correctly', () => {
  assert.deepStrictEqual(
    classifyAuthPromptResult({ type: 'error', error: 'string_error_reason' }),
    { status: 'error', message: 'string_error_reason' }
  );
  assert.deepStrictEqual(
    classifyAuthPromptResult({ type: 'error', error: { message: 'object_error_message' } }),
    { status: 'error', message: 'object_error_message' }
  );
  assert.deepStrictEqual(
    classifyAuthPromptResult({ type: 'error', error: { error_description: 'custom_error_description' } }),
    { status: 'error', message: 'custom_error_description' }
  );
  assert.deepStrictEqual(
    classifyAuthPromptResult({ type: 'error', error: { error: 'custom_error_code' } }),
    { status: 'error', message: 'custom_error_code' }
  );
  assert.deepStrictEqual(
    classifyAuthPromptResult({ type: 'unknown_type' }),
    { status: 'error', message: 'unknown_type' }
  );
  assert.deepStrictEqual(
    classifyAuthPromptResult(null),
    { status: 'error', message: 'unknown_error' }
  );
});

// --- Scrubbing preserves unrelated state --------------------------------------

test('web oauth: unrelated query and fragment parameters survive scrubbing', () => {
  const href = `${REDIRECT}/reader?id=42&access_token=SECRET#section-2`;
  const clean = stripOAuthParamsFromUrl(href);
  assert.ok(!clean.includes('SECRET'));
  assert.ok(clean.includes('id=42'), 'unrelated query params must be preserved');
  assert.ok(clean.includes('#section-2'), 'non-query fragments must be preserved');
});

test('web oauth: relative paths with OAuth parameters are scrubbed safely', () => {
  const relativeHref = '/reader?id=42&access_token=SECRET#token_type=Bearer';
  const clean = stripOAuthParamsFromUrl(relativeHref);
  assert.strictEqual(clean, '/reader?id=42');
});

test('web oauth: a normal URL without OAuth params is reported as clean', () => {
  assert.strictEqual(hasOAuthResponseInUrl(`${REDIRECT}/`), false);
  assert.strictEqual(hasOAuthResponseInUrl(`${REDIRECT}/reader?id=42#section-2`), false);
  // Truly malformed URL where URL constructor throws
  const malformed = 'http://[invalid-ipv6';
  assert.strictEqual(hasOAuthResponseInUrl(malformed), false);
  assert.strictEqual(stripOAuthParamsFromUrl(malformed), malformed);
});
