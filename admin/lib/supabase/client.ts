"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseConfig } from "./env";

/** Browser Supabase client (anon key). Returns null when env is missing. */
export function createClient() {
  const config = getPublicSupabaseConfig();
  if (!config) {
    return null;
  }

  return createBrowserClient(config.url, config.anonKey);
}
