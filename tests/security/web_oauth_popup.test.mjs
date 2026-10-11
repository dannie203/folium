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

test('web oauth: closing the popup (dismiss) is treated as cancellation, not failure', () => {
  assert.strictEqual(classifyAuthPromptResult({ type: 'dismiss' }).status, 'cancelled');
  assert.strictEqual(classifyAuthPromptResult({ type: 'cancel' }).status, 'cancelled');
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

test('web oauth: success classification is reported for a completed session', () => {
  assert.strictEqual(classifyAuthPromptResult({ type: 'success', params: { access_token: 'x' } }).status, 'success');
});

// --- Scrubbing preserves unrelated state --------------------------------------

test('web oauth: unrelated query and fragment parameters survive scrubbing', () => {
  const href = `${REDIRECT}/reader?id=42&access_token=SECRET#section-2`;
  const clean = stripOAuthParamsFromUrl(href);
  assert.ok(!clean.includes('SECRET'));
  assert.ok(clean.includes('id=42'), 'unrelated query params must be preserved');
  assert.ok(clean.includes('#section-2'), 'non-query fragments must be preserved');
});

test('web oauth: a normal URL without OAuth params is reported as clean', () => {
  assert.strictEqual(hasOAuthResponseInUrl(`${REDIRECT}/`), false);
  assert.strictEqual(hasOAuthResponseInUrl(`${REDIRECT}/reader?id=42#section-2`), false);
});
