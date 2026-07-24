-- AI Calorie Scanner — own Supabase project
-- DO NOT apply to Farq. Independent schema for feedback, models, nutrition.

create extension if not exists "pgcrypto";

-- Canonical nutrition items shipped to devices (synced from Farq identities, not provider_items)
create table if not exists public.nutrition_items (
  id uuid primary key default gen_random_uuid(),
  class_id integer not null unique,
  item_identity text not null unique,
  name_en text not null,
  name_ar text,
  calories_kcal numeric(10,2) not null default 0,
  protein_g numeric(10,2) not null default 0,
  carbs_g numeric(10,2) not null default 0,
  fat_g numeric(10,2) not null default 0,
  serving_size_g numeric(10,2) not null default 100,
  serving_label_en text default 'serving',
  serving_label_ar text,
  category text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_items_item_identity_idx on public.nutrition_items (item_identity);
create index if not exists nutrition_items_name_en_idx on public.nutrition_items using gin (to_tsvector('english', name_en));

-- Dataset build runs (from Farq read-only extract)
create table if not exists public.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  source text not null default 'farq_readonly',
  class_count integer not null default 0,
  image_count integer not null default 0,
  content_hash text not null,
  split_train integer not null default 0,
  split_val integer not null default 0,
  split_test integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Model registry with rollback support
create table if not exists public.model_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  dataset_version_id uuid references public.dataset_versions (id),
  trained_at timestamptz not null default now(),
  status text not null default 'candidate'
    check (status in ('candidate', 'accepted', 'rejected', 'production', 'rolled_back')),
  precision numeric(8,5),
  recall numeric(8,5),
  map50 numeric(8,5),
  map50_95 numeric(8,5),
  false_positives integer,
  false_negatives integer,
  metrics jsonb not null default '{}'::jsonb,
  artifact_urls jsonb not null default '{}'::jsonb,
  rejection_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists model_versions_one_production_idx
  on public.model_versions (status)
  where status = 'production';

-- User prediction corrections (separate feedback DB surface)
create table if not exists public.prediction_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  device_id text,
  predicted_class_id integer,
  predicted_item_identity text,
  predicted_confidence numeric(8,5),
  corrected_item_identity text,
  corrected_name text,
  image_storage_path text,
  locale text default 'en',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'used_in_training')),
  reviewer_notes text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists prediction_feedback_status_idx on public.prediction_feedback (status, created_at desc);

-- Client OTA model manifests
create table if not exists public.client_manifests (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios', 'android', 'all')),
  model_version_id uuid not null references public.model_versions (id),
  nutrition_db_url text,
  labels_url text,
  min_app_version text,
  force_update boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists client_manifests_active_idx on public.client_manifests (active, platform);

-- Admins
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'reviewer' check (role in ('reviewer', 'trainer', 'admin')),
  created_at timestamptz not null default now()
);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nutrition_items_updated_at on public.nutrition_items;
create trigger nutrition_items_updated_at
  before update on public.nutrition_items
  for each row execute function public.set_updated_at();

drop trigger if exists model_versions_updated_at on public.model_versions;
create trigger model_versions_updated_at
  before update on public.model_versions
  for each row execute function public.set_updated_at();

-- Promote model to production (atomic single-production invariant)
create or replace function public.promote_model_version(p_version text)
returns public.model_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.model_versions;
begin
  update public.model_versions
  set status = 'rolled_back'
  where status = 'production';

  update public.model_versions
  set status = 'production'
  where version = p_version
    and status in ('accepted', 'rolled_back', 'candidate')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Model version % not found or not promotable', p_version;
  end if;

  return v_row;
end;
$$;

revoke all on function public.promote_model_version(text) from public;
grant execute on function public.promote_model_version(text) to service_role;
