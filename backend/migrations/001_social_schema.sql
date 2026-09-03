-- Social module schema (Phase 1). Applies to whichever Supabase project
-- SUPABASE_URL_SOCIAL / SUPABASE_KEY_SOCIAL points at — a project
-- dedicated to social data, kept separate from the 6 per-tool assessment
-- projects (db1-db6) the rest of this repo talks to, since none of this
-- data is assessment data.
--
-- Run this once against that project (Supabase SQL Editor, or `psql` /
-- the Supabase CLI) before starting the backend with social routes wired
-- up. gen_random_uuid() needs pgcrypto, which Supabase enables by
-- default — the line below is a no-op there, but kept for any plain
-- Postgres project.
create extension if not exists pgcrypto;

create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  brand text not null,                    -- e.g. 'infopace', 'ipreneur'
  platform text not null,                 -- 'facebook' | 'instagram' | 'linkedin' | 'x' | 'youtube' | 'google_business' | 'pinterest'
  account_label text,                     -- human-readable, e.g. the page/channel name
  external_account_id text,               -- platform's own ID for this account (channel ID, page ID, location ID, ...)
  access_token text not null,             -- encrypted (see backend/social/crypto.js)
  refresh_token text,                     -- encrypted, nullable
  expires_at timestamptz,
  connected_at timestamptz default now(),
  status text default 'active'            -- 'active' | 'expired' | 'revoked'
);

create table if not exists scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  content text,
  media_urls text[],
  target_platforms text[] not null,       -- which social_accounts.platform values this goes to
  target_account_ids uuid[] not null,     -- which social_accounts.id rows
  scheduled_at timestamptz not null,
  status text default 'pending',          -- 'pending' | 'publishing' | 'published' | 'failed'
  platform_results jsonb default '{}',    -- per-platform post ID / error, filled in after publish
  created_at timestamptz default now()
);

create table if not exists mentions (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid references social_accounts(id),
  platform text not null,
  external_id text not null,              -- platform's own ID for the mention/comment, for de-duplication
  author text,
  text text,
  url text,
  captured_at timestamptz default now(),
  unique(platform, external_id)
);

create table if not exists inbox_messages (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid references social_accounts(id),
  platform text not null,
  external_thread_id text not null,
  external_message_id text not null,
  sender text,
  message text,
  direction text default 'inbound',       -- 'inbound' | 'outbound'
  status text default 'unread',           -- 'unread' | 'read' | 'replied'
  received_at timestamptz default now(),
  unique(platform, external_message_id)
);

create table if not exists analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid references social_accounts(id),
  platform text not null,
  metric text not null,                   -- 'followers' | 'impressions' | 'engagement_rate' | etc, per-platform vocabulary
  value numeric,
  captured_date date not null,
  unique(social_account_id, metric, captured_date)
);

create index if not exists idx_scheduled_posts_status_scheduled_at on scheduled_posts(status, scheduled_at);
create index if not exists idx_mentions_social_account_id on mentions(social_account_id);
create index if not exists idx_inbox_messages_social_account_id on inbox_messages(social_account_id);
create index if not exists idx_analytics_snapshots_account_metric on analytics_snapshots(social_account_id, metric, captured_date);
