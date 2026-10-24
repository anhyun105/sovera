#!/usr/bin/env python3
"""Parse the Sovera Supabase schema with PostgreSQL grammar and check critical guards."""
from pathlib import Path
from pglast import parse_sql

schema_path = Path("supabase/schema.sql")
if not schema_path.is_file():
    raise SystemExit("ERROR: supabase/schema.sql is missing")

sql = schema_path.read_text(encoding="utf-8")
try:
    statements = parse_sql(sql)
except Exception as exc:
    raise SystemExit(f"ERROR: PostgreSQL parser rejected schema.sql: {exc}") from exc

required = [
    "create table if not exists public.designs",
    "create table if not exists public.public_designs",
    "create table if not exists public.design_likes",
    "create table if not exists public.design_comments",
    "create table if not exists public.content_reports",
    "create table if not exists public.activity_events",
    "alter table public.designs enable row level security",
    "alter table public.public_designs enable row level security",
    "function public.is_public_design",
    "function public.toggle_public_design_like",
    "function public.reserve_ai_tryon_job",
    "values ('public-design-previews', 'public-design-previews', false",
]
missing = [item for item in required if item not in sql.lower()]
if missing:
    raise SystemExit("ERROR: required privacy or database construct is missing: " + ", ".join(missing))

if "grant select on table public.public_designs to anon" in sql.lower():
    raise SystemExit("ERROR: anonymous clients must not query rows containing private preview paths")

if "grant execute on function public.reserve_ai_tryon_job(uuid) to service_role" not in sql.lower():
    raise SystemExit("ERROR: AI rate reservation must remain server-only")

print(f"OK: PostgreSQL parsed {len(statements)} statements; critical RLS, private preview storage and server-only rate-limit checks passed.")
