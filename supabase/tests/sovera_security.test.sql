-- Run with `supabase test db` after applying `supabase/schema.sql`.
-- These checks verify basic grants and RLS switches. They complement, but do not replace,
-- end-to-end tests with two real Auth users and private Storage files.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(19);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.designs'::regclass),
  'private source designs have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.public_designs'::regclass),
  'published preview metadata has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.design_likes'::regclass),
  'design likes have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.design_comments'::regclass),
  'comments have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.content_reports'::regclass),
  'content reports have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_roles'::regclass),
  'admin roles have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.activity_events'::regclass),
  'activity events have row-level security enabled'
);

select ok(
  not has_table_privilege('anon', 'public.designs', 'SELECT'),
  'anonymous role cannot directly read the private designs table'
);
select ok(
  has_table_privilege('authenticated', 'public.designs', 'SELECT'),
  'authenticated owners can query designs while RLS restricts rows to their account'
);
select ok(
  not has_table_privilege('anon', 'public.public_designs', 'SELECT'),
  'anonymous role cannot read rows containing internal preview storage paths'
);
select ok(
  not has_table_privilege('authenticated', 'public.admin_roles', 'SELECT'),
  'authenticated role cannot query admin roles directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.activity_events', 'SELECT'),
  'authenticated role cannot query audit events directly'
);
select ok(
  not has_table_privilege('anon', 'public.content_reports', 'SELECT'),
  'anonymous role cannot read private content reports'
);

select ok(
  has_function_privilege('authenticated', 'public.toggle_public_design_like(uuid)', 'EXECUTE'),
  'authenticated users can toggle their own likes through the guarded RPC'
);
select ok(
  not has_function_privilege('anon', 'public.toggle_public_design_like(uuid)', 'EXECUTE'),
  'anonymous visitors cannot toggle likes'
);
select ok(
  has_function_privilege('service_role', 'public.reserve_ai_tryon_job(uuid)', 'EXECUTE'),
  'AI rate-limit reservation is available to the server role'
);
select ok(
  not has_function_privilege('authenticated', 'public.reserve_ai_tryon_job(uuid)', 'EXECUTE'),
  'browser users cannot directly reserve or bypass AI rate limits'
);
select ok(
  not (select public from storage.buckets where id = 'public-design-previews'),
  'public preview images stay in a private bucket and are served through signed URLs'
);

select * from finish();
rollback();
