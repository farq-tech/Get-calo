# Calora Ops (Admin)

Next.js 15 App Router dashboard for the AI Calorie Scanner ops team.

Dark premium UI (near-black + teal/emerald) for **Calora** — model registry, feedback review, dataset versions, and training run notes.

## Stack

- Next.js 15 (App Router) + TypeScript + React 19
- `@supabase/supabase-js` + `@supabase/ssr`
- Shared types from `@calorie-scanner/shared`
- Fonts: Syne + IBM Plex Sans (`next/font`)

## Setup

```bash
cd admin
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_* and SUPABASE_SERVICE_ROLE_KEY
# Use the Calorie Scanner Supabase project — never Farq.

npm install   # from repo root (workspaces) or here
npm run dev   # http://localhost:3001
```

### Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Calorie Scanner project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — required for `promote_model_version`, rollback, and feedback approve/reject |

If env vars are missing, pages render a clear setup banner instead of crashing.

## Pages

| Route | Role |
|-------|------|
| `/` | Overview — production model, pending feedback count, dataset/model stats |
| `/models` | `model_versions` list + promote / rollback actions |
| `/feedback` | Pending `prediction_feedback` queue — approve / reject |
| `/dataset` | `dataset_versions` registry |
| `/training` | ML pipeline instructions (see `ml/README.md`) + optional training-run note |

## Server actions

- `app/actions/models.ts` — `promoteModel`, `rollbackModel` (RPC `promote_model_version`, with status-update fallback)
- `app/actions/feedback.ts` — `approveFeedback`, `rejectFeedback`
- `app/actions/training.ts` — `noteTrainingRun` (ops note; does not remote-trigger training)

Privileged writes use `lib/supabase/admin.ts` (service role).

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
```

## Notes

- Prefer Server Components for data fetching; client components only for interactive actions.
- Apply `supabase/migrations` to your own Calorie Scanner project before using live data.
- Training is triggered locally/CI via `npm run ml:pipeline` — documented on `/training` and in `ml/README.md`.
