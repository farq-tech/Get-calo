/** Shared env helpers — never throw at import time; pages show setup UI instead. */

export type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
};

export type AdminSupabaseConfig = PublicSupabaseConfig & {
  serviceRoleKey: string;
};

function trim(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && v.length > 0 ? v : undefined;
}

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = trim(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = trim(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getAdminSupabaseConfig(): AdminSupabaseConfig | null {
  const publicConfig = getPublicSupabaseConfig();
  const serviceRoleKey = trim(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!publicConfig || !serviceRoleKey) return null;
  return { ...publicConfig, serviceRoleKey };
}

export function missingEnvKeys(): string[] {
  const missing: string[] = [];
  if (!trim(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!trim(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (!trim(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return missing;
}

export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseConfig() !== null;
}

export function isAdminConfigured(): boolean {
  return getAdminSupabaseConfig() !== null;
}
