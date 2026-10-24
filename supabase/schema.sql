-- Sovera privacy-first Supabase schema starter.
-- Apply in the Supabase SQL Editor only after creating a fresh project.
-- Private design payloads are NEVER exposed through the public preview table.
-- Admin events/roles are server-only; never put a service-role/secret key in browser code.

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

-- Full design payload is owner-only, even when a shareable preview is published.
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

-- This intentionally contains only approved, public-safe display metadata.
-- The preview file should be a watermarked/rendered image, not a source pattern or raw design file.
create table if not exists public.public_designs (
  id uuid primary key references public.designs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  caption text not null default '',
  garment_type text not null,
  display_color text,
  preview_image_path text not null,
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
  body text not null,
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending','visible','hidden')),
  created_at timestamptz not null default now(),
  constraint design_comments_body_length check (char_length(body) between 1 and 2000)
);

-- Events and roles are intentionally not accessible via the browser Data API.
-- A trusted Edge Function / server writes event rows and checks role membership.
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','moderator')),
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'sign_in','sign_out','design_created','design_updated','design_published',
    'design_made_private','design_deleted','comment_reported','user_reported'
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
create index if not exists activity_events_user_time_idx on public.activity_events(user_id, created_at desc);
create index if not exists activity_events_time_idx on public.activity_events(created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists designs_set_updated_at on public.designs;
create trigger designs_set_updated_at before update on public.designs
for each row execute function public.set_updated_at();

-- Turning a design private removes its shareable preview in the same transaction.
-- This avoids leaving stale public previews accessible after unpublishing.
create or replace function public.remove_preview_for_private_design()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if new.visibility <> 'public' then
    delete from public.public_designs
    where id = new.id and user_id = new.user_id;
  end if;
  return new;
end;
$;

drop trigger if exists designs_remove_preview_when_private on public.designs;
create trigger designs_remove_preview_when_private
after update of visibility on public.designs
for each row
when (new.visibility <> 'public')
execute function public.remove_preview_for_private_design();

alter table public.profiles enable row level security;
alter table public.designs enable row level security;
alter table public.public_designs enable row level security;
alter table public.design_likes enable row level security;
alter table public.design_comments enable row level security;
alter table public.admin_roles enable row level security;
alter table public.activity_events enable row level security;

-- Explicit privileges are used in addition to RLS.
revoke all on table public.profiles, public.designs, public.public_designs,
  public.design_likes, public.design_comments, public.admin_roles,
  public.activity_events from anon, authenticated;

grant select on table public.profiles, public.public_designs, public.design_likes,
  public.design_comments to anon;
grant select, insert, update, delete on table public.profiles, public.designs,
  public.public_designs, public.design_likes, public.design_comments to authenticated;

-- Profiles contain only display information intended for the community.
drop policy if exists "Public can read display profiles" on public.profiles;
create policy "Public can read display profiles" on public.profiles
for select to anon, authenticated using (true);

drop policy if exists "User can create own profile" on public.profiles;
create policy "User can create own profile" on public.profiles
for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "User can update own profile" on public.profiles;
create policy "User can update own profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- All design geometry, measurements and source payloads are owner-only.
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

-- The community sees only separate public preview rows (not public.designs).
drop policy if exists "Anyone can read public preview metadata" on public.public_designs;
create policy "Anyone can read public preview metadata" on public.public_designs
for select to anon, authenticated using (true);

drop policy if exists "Owner publishes own preview of public design" on public.public_designs;
create policy "Owner publishes own preview of public design" on public.public_designs
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.designs d
    where d.id = public_designs.id
      and d.user_id = (select auth.uid())
      and d.visibility = 'public'
  )
);

drop policy if exists "Owner updates own public preview" on public.public_designs;
create policy "Owner updates own public preview" on public.public_designs
for update to authenticated using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.designs d
    where d.id = public_designs.id
      and d.user_id = (select auth.uid())
      and d.visibility = 'public'
  )
);

drop policy if exists "Owner removes own public preview" on public.public_designs;
create policy "Owner removes own public preview" on public.public_designs
for delete to authenticated using ((select auth.uid()) = user_id);

-- Likes are readable only on public designs; users can only add/remove their own.
drop policy if exists "Read likes on public designs" on public.design_likes;
create policy "Read likes on public designs" on public.design_likes
for select to anon, authenticated using (
  exists (select 1 from public.public_designs p where p.id = design_likes.design_id)
);

drop policy if exists "User likes as self on public design" on public.design_likes;
create policy "User likes as self on public design" on public.design_likes
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from public.public_designs p where p.id = design_likes.design_id)
);

drop policy if exists "User removes own like" on public.design_likes;
create policy "User removes own like" on public.design_likes
for delete to authenticated using ((select auth.uid()) = user_id);

-- User-submitted comments are pending by default; the browser cannot make them visible.
drop policy if exists "Read visible comments or own comments" on public.design_comments;
create policy "Read visible comments or own comments" on public.design_comments
for select to anon, authenticated using (
  (user_id = (select auth.uid()))
  or (
    moderation_status = 'visible'
    and exists (select 1 from public.public_designs p where p.id = design_comments.design_id)
  )
);

drop policy if exists "Submit pending comment on public design" on public.design_comments;
create policy "Submit pending comment on public design" on public.design_comments
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and moderation_status = 'pending'
  and exists (select 1 from public.public_designs p where p.id = design_comments.design_id)
);

drop policy if exists "User deletes own comment" on public.design_comments;
create policy "User deletes own comment" on public.design_comments
for delete to authenticated using ((select auth.uid()) = user_id);

-- No browser grants or policies for admin_roles/activity_events. Trusted server code only.
-- RLS is enabled and there are no client-facing policies on these tables.

-- Private storage for source design files, original photos and design exports.
-- Never set this bucket to public. Only publish approved, watermarked preview images via a
-- server-side signed-URL endpoint that first confirms public_designs contains that design.
insert into storage.buckets (id, name, public)
values ('design-assets', 'design-assets', false)
on conflict (id) do update set public = false;

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

-- IMPORTANT: assign admins by inserting into public.admin_roles from the Supabase SQL Editor
-- after verifying the auth.users UUID. Never add admin controls/roles from client-side code.
