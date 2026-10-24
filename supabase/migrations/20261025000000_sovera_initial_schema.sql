-- Sovera privacy-first Supabase schema.
-- Review before applying to a fresh project. All private source design payloads remain owner-only.
-- Public sharing uses a separate preview table and a watermarked image in a public-preview-only bucket.
-- Never put a Supabase secret/service-role key in browser code.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique,
  display_name text not null default 'Sovera creator',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_handle_length check (handle is null or char_length(handle) between 3 and 32),
  constraint profiles_handle_format check (handle is null or handle ~ '^[a-zA-Z0-9_]+$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80)
);

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  garment_type text not null,
  description text not null default '',
  design_data jsonb not null default '{}'::jsonb,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint designs_title_length check (char_length(title) between 1 and 120),
  constraint designs_description_length check (char_length(description) <= 3000),
  constraint designs_garment_type check (garment_type in ('gown','skirt','blouse','jacket','trousers','saree','lehenga','dress','other'))
);

-- Safe-to-share fields only. No user ID and no raw design geometry/measurements.
create table if not exists public.public_designs (
  id uuid primary key references public.designs(id) on delete cascade,
  creator_name text not null default 'Sovera creator',
  title text not null,
  caption text not null default '',
  garment_type text not null,
  display_color text,
  preview_image_path text not null,
  like_count integer not null default 0 check (like_count >= 0),
  published_at timestamptz not null default now(),
  constraint public_designs_title_length check (char_length(title) between 1 and 120),
  constraint public_designs_caption_length check (char_length(caption) <= 1200)
);

create table if not exists public.design_likes (
  design_id uuid not null references public.public_designs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (design_id, user_id)
);

create table if not exists public.design_comments (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null references public.public_designs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Sovera creator',
  body text not null,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending','visible','hidden')),
  created_at timestamptz not null default now(),
  constraint design_comments_name_length check (char_length(display_name) between 1 and 80),
  constraint design_comments_body_length check (char_length(body) between 1 and 2000)
);

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','moderator')),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_tryon_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested','succeeded','failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  -- Keep report history even if moderators later remove the reported content.
  design_id uuid,
  comment_id uuid,
  -- A creator UUID is retained as a moderation target only; it is never public API output.
  reported_user_id uuid,
  reason text not null check (reason in ('copied_work','harassment','spam','unsafe_content','privacy','other')),
  details text not null default '',
  status text not null default 'open' check (status in ('open','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  constraint content_reports_one_target check (num_nonnulls(design_id, comment_id, reported_user_id) = 1),
  constraint content_reports_details_length check (char_length(details) <= 800)
);

-- Keep this schema re-runnable if a development project was created with an earlier draft.
alter table public.content_reports add column if not exists reported_user_id uuid;
alter table public.content_reports drop constraint if exists content_reports_one_target;
alter table public.content_reports add constraint content_reports_one_target
  check (num_nonnulls(design_id, comment_id, reported_user_id) = 1);

create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'sign_in','sign_out','design_created','design_updated','design_published',
    'design_made_private','design_deleted','design_liked','design_unliked',
    'comment_reported','comment_submitted','user_reported','design_reported','comment_moderated',
    'ai_tryon_requested','ai_tryon_succeeded','ai_tryon_failed','user_banned','user_deleted'
  )),
  design_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_metadata_size check (octet_length(metadata::text) <= 4096)
);

create index if not exists designs_owner_updated_idx on public.designs(user_id, updated_at desc);
create index if not exists designs_visibility_created_idx on public.designs(visibility, created_at desc);
create index if not exists public_designs_published_idx on public.public_designs(published_at desc);
create index if not exists design_comments_design_time_idx on public.design_comments(design_id, created_at desc);
create index if not exists content_reports_status_time_idx on public.content_reports(status, created_at desc);
create index if not exists content_reports_target_user_idx on public.content_reports(reported_user_id, created_at desc) where reported_user_id is not null;
create index if not exists content_reports_reporter_time_idx on public.content_reports(reporter_id, created_at desc);
create index if not exists ai_tryon_jobs_user_time_idx on public.ai_tryon_jobs(user_id, created_at desc);
create index if not exists activity_events_user_time_idx on public.activity_events(user_id, created_at desc);
create index if not exists activity_events_time_idx on public.activity_events(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $sovera$
begin
  new.updated_at = now();
  return new;
end;
$sovera$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists designs_set_updated_at on public.designs;
create trigger designs_set_updated_at before update on public.designs
for each row execute function public.set_updated_at();

-- Ensure a public creator label comes from the signed-in user's own profile,
-- not an arbitrary value supplied by a browser request.
create or replace function public.set_public_design_creator()
returns trigger
language plpgsql
set search_path = ''
as $sovera$
declare display_label text;
begin
  select p.display_name into display_label
  from public.profiles p
  where p.id = (select auth.uid());

  new.creator_name := coalesce(nullif(display_label, ''), 'Sovera creator');
  return new;
end;
$sovera$;

drop trigger if exists public_design_creator_from_profile on public.public_designs;
create trigger public_design_creator_from_profile
before insert on public.public_designs
for each row execute function public.set_public_design_creator();

-- If a draft becomes private, its public preview row is removed in the same transaction.
-- SECURITY DEFINER is narrowly scoped to this trigger, with a pinned empty search_path.
create or replace function public.remove_preview_for_private_design()
returns trigger
language plpgsql
security definer
set search_path = ''
as $sovera$
begin
  if new.visibility <> 'public' then
    delete from public.public_designs where id = new.id;
  end if;
  return new;
end;
$sovera$;

drop trigger if exists designs_remove_preview_when_private on public.designs;
create trigger designs_remove_preview_when_private
after update of visibility on public.designs
for each row
when (new.visibility <> 'public')
execute function public.remove_preview_for_private_design();

-- Maintain safe aggregate counts without exposing which account liked a design.
create or replace function public.refresh_public_design_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $sovera$
declare target_design_id uuid;
begin
  if tg_op = 'DELETE' then
    target_design_id := old.design_id;
  else
    target_design_id := new.design_id;
  end if;

  update public.public_designs p
  set like_count = (
    select count(*)::integer
    from public.design_likes l
    where l.design_id = target_design_id
  )
  where p.id = target_design_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$sovera$;

drop trigger if exists design_likes_refresh_count_insert on public.design_likes;
create trigger design_likes_refresh_count_insert
after insert on public.design_likes
for each row execute function public.refresh_public_design_like_count();

drop trigger if exists design_likes_refresh_count_delete on public.design_likes;
create trigger design_likes_refresh_count_delete
after delete on public.design_likes
for each row execute function public.refresh_public_design_like_count();

-- Set comment name from the user's own profile; it cannot be spoofed through client data.
create or replace function public.set_comment_display_name()
returns trigger
language plpgsql
set search_path = ''
as $sovera$
declare display_label text;
begin
  select p.display_name into display_label
  from public.profiles p
  where p.id = new.user_id;

  new.display_name := coalesce(nullif(display_label, ''), 'Sovera creator');
  return new;
end;
$sovera$;

drop trigger if exists comment_display_name_from_profile on public.design_comments;
create trigger comment_display_name_from_profile
before insert on public.design_comments
for each row execute function public.set_comment_display_name();

alter table public.profiles enable row level security;
alter table public.designs enable row level security;
alter table public.public_designs enable row level security;
alter table public.design_likes enable row level security;
alter table public.design_comments enable row level security;
alter table public.admin_roles enable row level security;
alter table public.activity_events enable row level security;
alter table public.ai_tryon_jobs enable row level security;
alter table public.content_reports enable row level security;

-- Privileges AND row policies are required; RLS alone does not remove table grants.
revoke all on table public.profiles, public.designs, public.public_designs,
  public.design_likes, public.design_comments, public.admin_roles,
  public.activity_events, public.ai_tryon_jobs, public.content_reports from anon, authenticated;

grant select, insert, update, delete on table public.designs to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, delete on table public.public_designs to authenticated;
grant insert (id, title, caption, garment_type, display_color, preview_image_path, published_at) on table public.public_designs to authenticated;
grant update (title, caption, garment_type, display_color, preview_image_path, published_at) on table public.public_designs to authenticated;

-- Only the design_id and safe aggregate count are visible, never the liking account UUID.
grant select (design_id) on table public.design_likes to anon, authenticated;
grant insert, delete on table public.design_likes to authenticated;

-- Column grants prevent user UUIDs from being returned to public clients.
grant select (id, design_id, display_name, body, moderation_status, created_at)
  on table public.design_comments to anon, authenticated;
grant insert, delete on table public.design_comments to authenticated;

-- Profiles are private by default. Public creator labels are stored as safe display snapshots.
drop policy if exists "Owner reads own profile" on public.profiles;
create policy "Owner reads own profile" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "User can create own profile" on public.profiles;
create policy "User can create own profile" on public.profiles
for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "User can update own profile" on public.profiles;
create policy "User can update own profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Complete geometry, measurements and source payloads are owner-only.
drop policy if exists "Owner reads own designs" on public.designs;
create policy "Owner reads own designs" on public.designs
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Owner creates own designs" on public.designs;
create policy "Owner creates own designs" on public.designs
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Owner updates own designs" on public.designs;
create policy "Owner updates own designs" on public.designs
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Owner deletes own designs" on public.designs;
create policy "Owner deletes own designs" on public.designs
for delete to authenticated using ((select auth.uid()) = user_id);

-- Public clients receive approved preview metadata only; no full designs or account UUID.
drop policy if exists "Anyone can read public preview metadata" on public.public_designs;
drop policy if exists "Owner reads own public preview path" on public.public_designs;
create policy "Owner reads own public preview path" on public.public_designs
for select to authenticated using (
  exists (
    select 1 from public.designs d
    where d.id = public_designs.id
      and d.user_id = (select auth.uid())
  )
);

-- Safe boolean used by community policies without exposing preview paths or owner rows.
create or replace function public.is_public_design(p_design_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $sovera$
  select exists (
    select 1 from public.public_designs p
    where p.id = p_design_id
  );
$sovera$;
revoke all on function public.is_public_design(uuid) from public;
grant execute on function public.is_public_design(uuid) to anon, authenticated;

-- Toggle likes atomically without returning other members' user IDs.
create or replace function public.toggle_public_design_like(p_design_id uuid)
returns table(liked boolean, like_count integer)
language plpgsql
security definer
set search_path = ''
as $sovera$
declare
  v_user_id uuid := auth.uid();
  v_liked boolean;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_public_design(p_design_id) then
    raise exception 'Public design not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_design_id::text, 0));
  select exists (
    select 1 from public.design_likes l
    where l.design_id = p_design_id and l.user_id = v_user_id
  ) into v_liked;

  if v_liked then
    delete from public.design_likes l
    where l.design_id = p_design_id and l.user_id = v_user_id;
    v_liked := false;
  else
    insert into public.design_likes (design_id, user_id)
    values (p_design_id, v_user_id)
    on conflict do nothing;
    v_liked := true;
  end if;

  select count(*)::integer into v_count
  from public.design_likes l where l.design_id = p_design_id;

  update public.public_designs p set like_count = v_count where p.id = p_design_id;

  insert into public.activity_events (user_id, event_type, design_id, metadata)
  values (
    v_user_id,
    case when v_liked then 'design_liked' else 'design_unliked' end,
    p_design_id,
    jsonb_build_object('source', 'community')
  );

  return query select v_liked, v_count;
end;
$sovera$;
revoke all on function public.toggle_public_design_like(uuid) from public, anon;
grant execute on function public.toggle_public_design_like(uuid) to authenticated;

drop policy if exists "Owner publishes own preview of public design" on public.public_designs;
create policy "Owner publishes own preview of public design" on public.public_designs
for insert to authenticated with check (
  exists (
    select 1 from public.designs d
    where d.id = public_designs.id
      and d.user_id = (select auth.uid())
      and d.visibility = 'public'
  )
);

drop policy if exists "Owner updates own public preview" on public.public_designs;
create policy "Owner updates own public preview" on public.public_designs
for update to authenticated
using (
  exists (
    select 1 from public.designs d
    where d.id = public_designs.id
      and d.user_id = (select auth.uid())
      and d.visibility = 'public'
  )
)
with check (
  exists (
    select 1 from public.designs d
    where d.id = public_designs.id
      and d.user_id = (select auth.uid())
      and d.visibility = 'public'
  )
);

drop policy if exists "Owner removes own public preview" on public.public_designs;
create policy "Owner removes own public preview" on public.public_designs
for delete to authenticated using (
  exists (
    select 1 from public.designs d
    where d.id = public_designs.id
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists "Read likes for public designs" on public.design_likes;
create policy "Read likes for public designs" on public.design_likes
for select to anon, authenticated using (
  public.is_public_design(design_likes.design_id)
);

drop policy if exists "User likes as self on public design" on public.design_likes;
create policy "User likes as self on public design" on public.design_likes
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and public.is_public_design(design_likes.design_id)
);

drop policy if exists "User removes own like" on public.design_likes;
create policy "User removes own like" on public.design_likes
for delete to authenticated using ((select auth.uid()) = user_id);

-- Public clients can read only visible comments; authors can read their own pending items.
drop policy if exists "Read visible comments or own comments" on public.design_comments;
create policy "Read visible comments or own comments" on public.design_comments
for select to anon, authenticated using (
  (user_id = (select auth.uid()))
  or (
    moderation_status = 'visible'
    and public.is_public_design(design_comments.design_id)
  )
);

drop policy if exists "Submit pending comment on public design" on public.design_comments;
create policy "Submit pending comment on public design" on public.design_comments
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and moderation_status = 'pending'
  and public.is_public_design(design_comments.design_id)
);

drop policy if exists "User deletes own comment" on public.design_comments;
create policy "User deletes own comment" on public.design_comments
for delete to authenticated using ((select auth.uid()) = user_id);

-- Admin roles and activity events have no browser-facing grants or policies.
-- Trusted server-side code must validate the user's role before reading/writing them.

-- Private source files and original photos live only in this non-public bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-assets', 'design-assets', false, 15728640, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Owner reads own design assets" on storage.objects;
create policy "Owner reads own design assets" on storage.objects
for select to authenticated using (
  bucket_id = 'design-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Owner uploads own design assets" on storage.objects;
create policy "Owner uploads own design assets" on storage.objects
for insert to authenticated with check (
  bucket_id = 'design-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Owner updates own design assets" on storage.objects;
create policy "Owner updates own design assets" on storage.objects
for update to authenticated using (
  bucket_id = 'design-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'design-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Owner deletes own design assets" on storage.objects;
create policy "Owner deletes own design assets" on storage.objects
for delete to authenticated using (
  bucket_id = 'design-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Keep even watermarked previews in a private bucket. The public gallery endpoint
-- returns short-lived signed URLs only for rows that are explicitly published.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-design-previews', 'public-design-previews', false, 4194304, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 4194304;

drop policy if exists "Owner uploads own public preview" on storage.objects;
create policy "Owner uploads own public preview" on storage.objects
for insert to authenticated with check (
  bucket_id = 'public-design-previews'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.designs d
    where d.id = ((storage.foldername(name))[1])::uuid
      and d.user_id = (select auth.uid())
  )
);

drop policy if exists "Owner deletes own public preview" on storage.objects;
create policy "Owner deletes own public preview" on storage.objects
for delete to authenticated using (
  bucket_id = 'public-design-previews'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.designs d
    where d.id = ((storage.foldername(name))[1])::uuid
      and d.user_id = (select auth.uid())
  )
);

-- Atomic per-user reservation: at most five AI requests in any rolling hour.
create or replace function public.reserve_ai_tryon_job(p_user_id uuid)
returns table(allowed boolean, job_id bigint, requests_last_hour integer)
language plpgsql
security definer
set search_path = ''
as $sovera$
declare
  v_count integer;
  v_job_id bigint;
begin
  if p_user_id is null then
    raise exception 'User ID is required';
  end if;
  -- This function is executable only by service_role. The Edge Function validates
  -- the user JWT before calling it, so auth.uid() is intentionally not used here.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':sovera-ai', 0));
  -- Keep only a short rolling history for throttling and operations; older rows are not needed.
  delete from public.ai_tryon_jobs j
  where j.created_at < now() - interval '48 hours';

  select count(*)::integer into v_count
  from public.ai_tryon_jobs j
  where j.user_id = p_user_id
    and j.created_at >= now() - interval '1 hour';

  if v_count >= 5 then
    return query select false, null::bigint, v_count;
    return;
  end if;

  insert into public.ai_tryon_jobs(user_id, status)
  values (p_user_id, 'requested')
  returning id into v_job_id;

  return query select true, v_job_id, v_count + 1;
end;
$sovera$;
revoke all on function public.reserve_ai_tryon_job(uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_tryon_job(uuid) to service_role;

-- Trigger functions are invoked by their triggers, not by direct client RPC calls.
-- Revoke default PUBLIC execution to avoid exposing SECURITY DEFINER helpers as RPC endpoints.
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_public_design_creator() from public, anon, authenticated;
revoke all on function public.remove_preview_for_private_design() from public, anon, authenticated;
revoke all on function public.refresh_public_design_like_count() from public, anon, authenticated;
revoke all on function public.set_comment_display_name() from public, anon, authenticated;

-- Assign administrator roles only from the Supabase SQL Editor after verifying auth.users.id.
-- A trusted Edge Function must read admin_roles; never trust a client role flag.
