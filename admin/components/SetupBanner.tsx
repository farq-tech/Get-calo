import { missingEnvKeys } from "@/lib/supabase/env";

export function SetupBanner({ requiredAdmin = false }: { requiredAdmin?: boolean }) {
  const missing = missingEnvKeys();
  const needsPublic =
    missing.includes("NEXT_PUBLIC_SUPABASE_URL") ||
    missing.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const needsService = missing.includes("SUPABASE_SERVICE_ROLE_KEY");

  if (!needsPublic && !(requiredAdmin && needsService)) {
    return null;
  }

  return (
    <aside className="setup-banner" role="status">
      <h2 className="setup-title">Supabase not configured</h2>
      <p>
        Copy <code>admin/.env.example</code> to <code>admin/.env.local</code> and fill
        Calorie Scanner project keys (not Farq).
      </p>
      <ul>
        {needsPublic ? (
          <li>
            <code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          </li>
        ) : null}
        {requiredAdmin && needsService ? (
          <li>
            <code>SUPABASE_SERVICE_ROLE_KEY</code> — required for promote, rollback, and
            feedback review
          </li>
        ) : null}
      </ul>
    </aside>
  );
}
