/**
 * Calorie Scanner Supabase client — NOT Farq.
 * Used for feedback uploads and client_manifests / model OTA only.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey && !url.includes('your-calorie-scanner'));
}

/**
 * Soft placeholder client when env is missing so the app boots in Expo Go demos.
 * Network calls will fail gracefully; UI remains offline-first.
 */
export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'public-anon-placeholder',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

export function getSupabaseConfigStatus(): {
  configured: boolean;
  urlHost: string | null;
} {
  if (!isSupabaseConfigured()) {
    return { configured: false, urlHost: null };
  }
  try {
    return { configured: true, urlHost: new URL(url).host };
  } catch {
    return { configured: false, urlHost: null };
  }
}
