/**
 * Stable anonymous device id for training / feedback attribution.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'get-calo-device-id-v1';

function randomId(): string {
  return `gc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function readStore(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }
  return AsyncStorage.getItem(key);
}

async function writeStore(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
    return;
  }
  await AsyncStorage.setItem(key, value);
}

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await readStore(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const next = randomId();
    await writeStore(KEY, next);
    cached = next;
    return next;
  } catch {
    const fallback = randomId();
    cached = fallback;
    return fallback;
  }
}
