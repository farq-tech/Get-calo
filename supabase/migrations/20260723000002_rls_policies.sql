-- RLS policies for Calorie Scanner tables

alter table public.nutrition_items enable row level security;
alter table public.dataset_versions enable row level security;
alter table public.model_versions enable row level security;
alter table public.prediction_feedback enable row level security;
alter table public.client_manifests enable row level security;
alter table public.admin_users enable row level security;

-- Helper: is admin/reviewer
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au where au.user_id = auth.uid()
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated, anon;

-- nutrition_items: public read (bundled sync); write service only
create policy nutrition_items_select_all
  on public.nutrition_items for select
  to anon, authenticated
  using (true);

create policy nutrition_items_write_service
  on public.nutrition_items for all
  to service_role
  using (true)
  with check (true);

-- dataset_versions: staff read
create policy dataset_versions_staff_select
  on public.dataset_versions for select
  to authenticated
  using (public.is_staff());

create policy dataset_versions_service
  on public.dataset_versions for all
  to service_role
  using (true)
  with check (true);

-- model_versions: anyone can read production/accepted metadata; staff all
create policy model_versions_public_select
  on public.model_versions for select
  to anon, authenticated
  using (status in ('production', 'accepted'));

create policy model_versions_staff_select
  on public.model_versions for select
  to authenticated
  using (public.is_staff());

create policy model_versions_service
  on public.model_versions for all
  to service_role
  using (true)
  with check (true);

-- prediction_feedback: users insert own; staff review
create policy feedback_insert_own
  on public.prediction_feedback for insert
  to authenticated
  with check (auth.uid() = user_id or user_id is null);

create policy feedback_insert_anon_device
  on public.prediction_feedback for insert
  to anon
  with check (device_id is not null and user_id is null);

create policy feedback_select_own
  on public.prediction_feedback for select
  to authenticated
  using (auth.uid() = user_id or public.is_staff());

create policy feedback_update_staff
  on public.prediction_feedback for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy feedback_service
  on public.prediction_feedback for all
  to service_role
  using (true)
  with check (true);

-- client_manifests: public read active
create policy manifests_select_active
  on public.client_manifests for select
  to anon, authenticated
  using (active = true);

create policy manifests_service
  on public.client_manifests for all
  to service_role
  using (true)
  with check (true);

-- admin_users: staff only
create policy admin_users_staff
  on public.admin_users for select
  to authenticated
  using (public.is_staff());

create policy admin_users_service
  on public.admin_users for all
  to service_role
  using (true)
  with check (true);

-- Storage bucket for feedback images (create via dashboard or storage API)
-- Recommended bucket: feedback-images (private, staff read)
insert into storage.buckets (id, name, public)
values ('feedback-images', 'feedback-images', false)
on conflict (id) do nothing;

create policy feedback_images_insert_authenticated
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'feedback-images');

create policy feedback_images_insert_anon
  on storage.objects for insert
  to anon
  with check (bucket_id = 'feedback-images');

create policy feedback_images_staff_select
  on storage.objects for select
  to authenticated
  using (bucket_id = 'feedback-images' and public.is_staff());
