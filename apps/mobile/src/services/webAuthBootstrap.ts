import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { completeWebAuthSession } from './authSessionWeb';

/**
 * Complete a pending web OAuth popup handshake.
 *
 * Must run at web app startup (module scope) so that the redirect page loaded
 * inside the Google popup calls `WebBrowser.maybeCompleteAuthSession()`. That
 * posts the OAuth result back to the opener window, which closes the popup and
 * resolves the original `AuthRequest.promptAsync()` call. It is a no-op on
 * native and during static-render/SSR passes.
 */
export function bootstrapWebAuthSession(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  try {
    completeWebAuthSession({
      maybeCompleteAuthSession: () => WebBrowser.maybeCompleteAuthSession(),
      getHref: () => window.location.href,
      replaceUrl: (cleanHref) => {
        window.history.replaceState(window.history.state, '', cleanHref);
      },
    });
  } catch (err) {
    console.warn('[AuthService] Failed to complete web auth session:', err);
  }
}
