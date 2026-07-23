# Production Deployment Guide — Calora (AI Calorie Scanner)

This guide deploys the **Calorie Scanner** stack. It never deploys or modifies Farq.

## Principles

| Concern | Production choice |
|---------|-------------------|
| Food recognition | On-device YOLO (CoreML / TFLite / ONNX) |
| Cloud Vision APIs | **None** |
| Farq | Read-only dataset source only |
| App backend | Own Supabase project |
| Admin UI | Next.js on Render |
| Model CDN | Object storage / CDN (R2, S3, or Supabase Storage) |
| Inference cost at scale | ≈ $0 |

## 1. Create the Calorie Scanner Supabase project

1. Create a **new** Supabase project (not Farq).
2. Apply migrations in order:

```bash
# Using Supabase CLI against the Calorie Scanner project ref
supabase link --project-ref <CALORIE_PROJECT_REF>
supabase db push
```

Or paste SQL from:

- `supabase/migrations/20260723000001_init_calorie_scanner.sql`
- `supabase/migrations/20260723000002_rls_policies.sql`

3. Create storage bucket `feedback-images` if the migration insert was skipped.
4. Add your ops user to `admin_users` after first Auth signup:

```sql
insert into public.admin_users (user_id, role)
values ('<auth-user-uuid>', 'admin');
```

5. Store keys in `.env` as `CALORIE_SUPABASE_*` — never put `service_role` in the mobile app.

## 2. Farq read-only credentials (dataset only)

1. Prefer a **read-only** Postgres role or restricted key on Farq.
2. Set `FARQ_SUPABASE_URL` + `FARQ_SUPABASE_SERVICE_KEY` (or a readonly key).
3. Map columns in `ml/config/settings.py` / env if Farq names differ (`farq_items_table`, `farq_identity_column`, …).
4. Confirm the pipeline only `select`s — no writes.

## 3. Train and export models

GPU machine (local or cloud VM):

```bash
cp .env.example .env   # fill Farq + Calorie keys
cd ml
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m scripts.run_full_pipeline
```

Acceptance gates (auto-reject):

- `map50 >= MIN_MAP50_ACCEPT` (default 0.55)
- `precision >= MIN_PRECISION_ACCEPT`
- `recall >= MIN_RECALL_ACCEPT`

Artifacts under `models/<version>/`:

- `model.onnx`, `model.tflite`, `model.mlpackage` (CoreML on macOS)
- `labels.json`, `nutrition.sqlite`, `manifest.json`, `metrics.json`

Promote an accepted build via Admin → Models or:

```sql
select * from public.promote_model_version('v20260723.1');
```

Upload artifacts to CDN and insert `client_manifests` rows for `ios` / `android`.

## 4. Mobile app (App Store / Play)

```bash
cd mobile
npm install
npx expo prebuild
# Wire native ONNX / CoreML / TFLite per mobile/README.md
eas build --platform ios
eas build --platform android
```

Checklist:

- [ ] Bundle baseline `nutrition.sqlite` + tiny YOLO for first launch (&lt;2s start)
- [ ] Background OTA via `modelManager` + `client_manifests`
- [ ] Confidence threshold aligned with training (`~0.45`)
- [ ] Arabic RTL verified on device
- [ ] Feedback uploads use Calorie Supabase only
- [ ] No Farq URLs in the mobile binary

Performance targets: recognition &lt;500 ms on mid-tier SoCs; use YOLO nano/small + NPU delegates (CoreML Neural Engine, TFLite GPU/NNAPI).

## 5. Admin dashboard (Render)

`render.yaml` defines `calora-admin` (Node web service).

Required env vars (sync: false for secrets):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Bind is handled by Next/`PORT`. After first Git remote exists:

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Render Dashboard → New → Blueprint → select repo.
3. Or: `render blueprints validate` then sync.

Admin URL is for staff only — protect with Supabase Auth + `admin_users` checks before production traffic.

## 6. Model CDN layout

```
https://cdn.example.com/models/v20260723.1/
  manifest.json
  model.onnx
  model.tflite
  model.mlpackage.zip
  labels.json
  nutrition.sqlite
```

Clients poll manifests on launch / daily; download deltas in background; swap atomically after checksum verify.

## 7. Feedback → retraining loop

1. Users correct predictions → `prediction_feedback` (`pending`).
2. Staff approve in Admin → `approved`.
3. Export approved rows + images into next dataset version (identity-canonical).
4. Retrain → evaluate gates → accept → promote → OTA.
5. Mark feedback `used_in_training`.

## 8. Observability & rollback

- Track client inference latency, confidence histograms, correction rate (privacy-safe aggregates).
- Rollback: `promote_model_version('<previous>')` + flip CDN manifest; clients pick up on next poll.
- Never hot-swap a rejected model into `production`.

## 9. Scale notes (millions of users)

- Recognition does not hit your servers.
- Bottlenecks are CDN bandwidth (model/nutrition updates) and feedback ingestion.
- Rate-limit feedback inserts; compress uploads; purge rejected images.
- Shard training offline; ship only slim on-device weights.

## 10. Security

- RLS enabled on all public tables.
- Mobile uses anon key only.
- Service role only on admin server / ML workers.
- Farq credentials never shipped to clients.
- Do not store meal photos unless the user submits a correction.

## Smoke test

1. Apply migrations → seed one `nutrition_items` row matching a class in the bundled sample DB.
2. Run mobile against mock inference → result screen macros.
3. Submit correction → appears in Admin Feedback.
4. Register a dummy `model_versions` row → Promote → `client_manifests` active.
5. Confirm Farq DB shows **zero** writes from this stack.
