/**
 * Force-reload when a newer web build is deployed (kills stale SPA tabs
 * that still run the old mock-scan JavaScript).
 */

import { Platform } from 'react-native';

export const CLIENT_BUILD_ID =
  process.env.EXPO_PUBLIC_BUILD_ID || '20260727-1400';

const STORAGE_KEY = 'get-calo-build-id';

export async function checkForWebAppUpdate(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof fetch === 'undefined') {
    return;
  }

  try {
    const resp = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) return;
    const data = (await resp.json()) as { build?: string };
    const remote = String(data?.build || '').trim();
    if (!remote) return;

    const previous =
      typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, remote);
    }

    // Reload when server build differs from this JS bundle, or from last visit.
    if (remote !== CLIENT_BUILD_ID || (previous && previous !== remote)) {
      console.info('[get-calo] newer build detected — reloading', {
        client: CLIENT_BUILD_ID,
        remote,
        previous,
      });
      window.location.reload();
    }
  } catch {
    // Ignore — offline / blocked.
  }
}
