# Calora Supabase (own project)

Apply migrations **only** to the Calorie Scanner Supabase project.

**Never** run these against Farq.

```bash
supabase link --project-ref <CALORIE_PROJECT_REF>
supabase db push
```

| Migration | Purpose |
|-----------|---------|
| `20260723000001_init_calorie_scanner.sql` | nutrition, dataset/model versions, feedback, manifests, promote RPC |
| `20260723000002_rls_policies.sql` | RLS + feedback storage policies |

Farq remains an external read-only source configured via `FARQ_SUPABASE_*` env vars in the ML pipeline.
