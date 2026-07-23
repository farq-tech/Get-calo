import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseConfig } from "./env";

/** Service-role client for privileged ops (promote, rollback, feedback review). */
export function createAdminClient(): SupabaseClient | null {
  const config = getAdminSupabaseConfig();
  if (!config) {
    return null;
  }

  return createSupabaseClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
