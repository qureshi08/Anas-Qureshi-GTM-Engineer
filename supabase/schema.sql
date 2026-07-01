-- Run once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- This sets up the three tables the app uses.

-- Safe to re-run: every statement is create-if-not-exists.

-- ── INBOUND (public landing form) ───────────────────────────────────
create table if not exists inbound_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  task text,
  status text default 'new',
  created_at timestamptz default now()
);
alter table inbound_leads enable row level security;
-- the public site (anon key) can submit but not read
drop policy if exists "anon insert inbound" on inbound_leads;
create policy "anon insert inbound" on inbound_leads for insert to anon with check (true);
-- you, logged in, can read and update
drop policy if exists "auth read inbound" on inbound_leads;
create policy "auth read inbound" on inbound_leads for select to authenticated using (true);
drop policy if exists "auth update inbound" on inbound_leads;
create policy "auth update inbound" on inbound_leads for update to authenticated using (true) with check (true);

-- ── CAMPAIGNS ───────────────────────────────────────────────────────
create table if not exists campaigns (
  id bigint generated always as identity primary key,
  name text not null,
  goal text,
  icp text,
  platform text default 'email',
  status text default 'draft',
  created_at timestamptz default now()
);
alter table campaigns enable row level security;
-- the admin reads/writes these with the service-role key (bypasses RLS).
-- RLS on with no anon policy means the public anon key cannot touch this table.

-- ── LEADS (campaign recipients) ─────────────────────────────────────
create table if not exists leads (
  id bigint generated always as identity primary key,
  campaign_id bigint references campaigns(id) on delete cascade,
  first_name text,
  email text,
  company text,
  status text default 'new',   -- new | sent | replied | booked | won | lost
  sent_at timestamptz,
  created_at timestamptz default now()
);
alter table leads enable row level security;
-- same as campaigns: service-role only, anon locked out.

-- ── PROSPECTS (your outbound pipeline) ──────────────────────────────
create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text,
  role text,
  website text,
  linkedin text,
  email text,
  niche text,
  source text,
  status text default 'new',   -- new | connected | replied | call | won | lost
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table prospects enable row level security;
-- service-role only (the admin), anon locked out.

-- phone + address (Google Maps provide these)
alter table prospects add column if not exists phone text;
alter table prospects add column if not exists address text;

-- ── SOURCING JOBS (outbound: the app queues, the worker fulfills) ────
create table if not exists sourcing_jobs (
  id bigint generated always as identity primary key,
  market text not null,
  industry text not null,
  source text default 'google_maps',
  max_results int default 40,
  status text default 'pending',   -- pending | running | done | error
  found int default 0,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table sourcing_jobs enable row level security;
-- service-role only (the app + the worker), anon locked out.

-- ── ADMIN USER ──────────────────────────────────────────────────────
-- Create your login: Authentication -> Users -> Add user (email + password,
-- tick "Auto Confirm User"). That account is the only thing that can reach /admin.
-- No public sign-up exists.
