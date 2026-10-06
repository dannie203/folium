import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '@folium/shared';

const STORAGE_KEY = 'folium_auth_user';

// Google OAuth Discovery Endpoints
const discovery: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  userInfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
};

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
];

// In-memory cache & listeners
let cachedUser: AuthUser | null = null;
const listeners = new Set<(user: AuthUser | null) => void>();

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener(cachedUser);
    } catch (err) {
      console.warn('[AuthService] Listener error:', err);
    }
  }
}

/**
 * Load persisted user session from storage.
 */
export function initAuthSession(): AuthUser | null {
  if (cachedUser) return cachedUser;

  try {
    let stored: string | null = null;
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        stored = localStorage.getItem(STORAGE_KEY);
      }
    } else {
      stored = SecureStore.getItem(STORAGE_KEY);
    }

    if (stored) {
      const parsed: AuthUser = JSON.parse(stored);
      if (parsed.expiresAt > Date.now()) {
        cachedUser = parsed;
        return cachedUser;
      } else {
        if (Platform.OS === 'web') {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY);
          }
        } else {
          SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[AuthService] Failed to load cached auth session:', err);
  }

  return null;
}

/**
 * Persist user session.
 */
function persistUser(user: AuthUser | null) {
  cachedUser = user;
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') {
        if (user) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } else {
      if (user) {
        SecureStore.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[AuthService] Failed to persist auth session:', err);
  }
  notifyListeners();
}

/**
 * Get the currently authenticated user.
 */
export function getCurrentUser(): AuthUser | null {
  if (!cachedUser) {
    initAuthSession();
  }
  return cachedUser;
}

/**
 * Check if the user is currently signed in and token is valid.
 */
export function isAuthenticated(): boolean {
  const user = getCurrentUser();
  return !!user && user.expiresAt > Date.now();
}

/**
 * Subscribe to authentication state changes.
 */
export function onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
  listeners.add(callback);
  callback(getCurrentUser());
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Retrieve active Google Client ID from environment variables.
 */
export function getGoogleClientId(): string | null {
  const id =
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ||
    (Platform.OS === 'web'
      ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
      : process.env.EXPO_PUBLIC_GOOGLE_MOBILE_CLIENT_ID);

  return id?.trim() || null;
}

/**
 * Sign in using Google OAuth with expo-auth-session.
 */
export async function signInWithGoogle(demoFallback = false): Promise<AuthUser> {
  // Sandbox mode is strictly restricted to development (__DEV__)
  if (__DEV__ && demoFallback) {
    console.log('[AuthService] Using developer sandbox Google OAuth session.');
    const demoUser: AuthUser = {
      id: 'demo-google-user-001',
      email: 'reader@folium.local',
      name: 'Folium Reader (Dev Mode)',
      picture: 'https://avatars.githubusercontent.com/u/9919?s=200&v=4',
      accessToken: 'demo_access_token_folium_sandbox',
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    };
    persistUser(demoUser);
    return demoUser;
  }

  const clientId = getGoogleClientId();

  // If real Google login requested but no Client ID is configured, fail with environment-appropriate guidance
  if (!clientId) {
    throw new Error(
      __DEV__
        ? 'Google Client ID chưa được cấu hình cho ứng dụng. Vui lòng cấu hình EXPO_PUBLIC_GOOGLE_CLIENT_ID trong biến môi trường hoặc chọn "Chế độ Sandbox (Dev Mode)" để dùng thử.'
        : 'Google Client ID chưa được cấu hình cho ứng dụng. Vui lòng liên hệ quản trị viên của deployment này.'
    );
  }

  const redirectUri = AuthSession.makeRedirectUri({
    path: Platform.OS === 'web' ? undefined : 'oauthredirect',
  });

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: SCOPES,
    redirectUri,
    responseType: 'token id_token',
    extraParams: {
      nonce: Math.random().toString(36).substring(2, 15) + Date.now().toString(36),
    },
    // Google OAuth rejects code_challenge_method on implicit flow (response_type=token id_token)
    usePKCE: false,
  });

  const result = await request.promptAsync(discovery);

  if (result.type !== 'success' || !result.params.access_token) {
    const params = 'params' in result ? (result.params as any) : undefined;
    const errorDetail = params?.error_description || params?.error || result.type;
    throw new Error(
      result.type === 'cancel'
        ? 'Đăng nhập Google đã bị hủy.'
        : `Đăng nhập Google thất bại: ${errorDetail}`
    );
  }

  const accessToken = result.params.access_token;
  const idToken = result.params.id_token;
  const expiresIn = parseInt(result.params.expires_in || '3600', 10);

  // Fetch Google User Profile
  const userinfoResp = await fetch(discovery.userInfoEndpoint!, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userinfoResp.ok) {
    throw new Error('Failed to load Google account info.');
  }

  const profile = await userinfoResp.json();

  const user: AuthUser = {
    id: profile.sub || profile.id,
    email: profile.email,
    name: profile.name || profile.email.split('@')[0],
    picture: profile.picture,
    accessToken,
    idToken: idToken || undefined,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  persistUser(user);
  return user;
}

/**
 * Sign out and clear stored session.
 */
export async function signOut(): Promise<void> {
  const user = getCurrentUser();
  if (user && user.accessToken && discovery.revocationEndpoint && !user.accessToken.startsWith('demo_')) {
    try {
      await fetch(`${discovery.revocationEndpoint}?token=${user.accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch (err) {
      console.warn('[AuthService] Token revocation failed (ignored):', err);
    }
  }

  persistUser(null);
}
