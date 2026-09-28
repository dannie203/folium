import { useState, useEffect } from 'react';
import type { AuthUser, DriveSyncResult } from '@folium/shared';
import {
  getCurrentUser,
  onAuthStateChanged,
  signInWithGoogle,
  signOut,
} from '../services/authService';
import { syncWithGoogleDrive } from '../services/googleDriveService';
import { useI18n } from '../i18n';

export interface UseDriveSyncOptions {
  onSyncComplete?: () => void;
}

export function useDriveSync(options?: UseDriveSyncOptions) {
  const { t } = useI18n();
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser());
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<DriveSyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged((newUser) => {
      setUser(newUser);
      setErrorMessage(null);
    });
  }, []);

  const handleSignIn = async (demo = false) => {
    try {
      setIsAuthenticating(true);
      setErrorMessage(null);
      await signInWithGoogle(demo);
    } catch (err: any) {
      setErrorMessage(err.message || t('error.signInFailed'));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setSyncResult(null);
    } catch (err: any) {
      setErrorMessage(err.message || t('error.signOutFailed'));
    }
  };

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      setErrorMessage(null);
      const res = await syncWithGoogleDrive();
      setSyncResult(res);
      if (options?.onSyncComplete) {
        options.onSyncComplete();
      }
    } catch (err: any) {
      setErrorMessage(err.message || t('error.syncFailed'));
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    user,
    isAuthenticating,
    isSyncing,
    syncResult,
    errorMessage,
    setErrorMessage,
    handleSignIn,
    handleSignOut,
    handleSyncNow,
  };
}
