-- Training capture: every real user scan (image + model labels) for YOLO / vision fine-tuning.

create table if not exists public.training_scans (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  image_storage_path text,
  locale text default 'en',
  platform text,
  model_version text,
  predicted_name_en text,
  predicted_name_ar text,
  predicted_confidence numeric(8,5),
  calories_kcal numeric(10,2),
  protein_g numeric(10,2),
  carbs_g numeric(10,2),
  fat_g numeric(10,2),
  serving_size_g numeric(10,2),
  items jsonb not null default '[]'::jsonb,
  detections jsonb not null default '[]'::jsonb,
  used_fallback boolean not null default false,
  corrected_item_identity text,
  corrected_name text,
  source text not null default 'scan'
    check (source in ('scan', 'correction', 'demo_excluded')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'used_in_training')),
  reviewer_notes text,
  created_at timestamptz not null default now()
);

create index if not exists training_scans_status_idx
  on public.training_scans (status, created_at desc);

create index if not exists training_scans_device_idx
  on public.training_scans (device_id, created_at desc);

alter table public.training_scans enable row level security;

create policy training_scans_insert_anon
  on public.training_scans for insert
  to anon
  with check (device_id is not null and length(device_id) > 0);

create policy training_scans_insert_authenticated
  on public.training_scans for insert
  to authenticated
  with check (device_id is not null and length(device_id) > 0);

create policy training_scans_staff_select
  on public.training_scans for select
  to authenticated
  using (public.is_staff());

create policy training_scans_staff_update
  on public.training_scans for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy training_scans_service
  on public.training_scans for all
  to service_role
  using (true)
  with check (true);

insert into storage.buckets (id, name, public)
values ('training-scans', 'training-scans', false)
on conflict (id) do nothing;

create policy training_scans_images_insert_anon
  on storage.objects for insert
  to anon
  with check (bucket_id = 'training-scans');

create policy training_scans_images_insert_authenticated
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'training-scans');

create policy training_scans_images_staff_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'training-scans' and public.is_staff());

create policy training_scans_images_service
  on storage.objects for all
  to service_role
  using (bucket_id = 'training-scans')
  with check (bucket_id = 'training-scans');
