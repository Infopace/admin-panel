-- Meta Lead Ads capture. Applies to the same Supabase project as
-- 001_social_schema.sql (SUPABASE_URL_SOCIAL) — leads are pulled using
-- the connected Facebook Page's own access_token already sitting in
-- social_accounts, not a separate leads-specific OAuth connection. See
-- backend/social/adapters/facebook.js's fetchLeads() and
-- backend/leads/poller.js for what actually populates this table.
--
-- Run this against the same project as 001-003.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  social_account_id uuid references social_accounts(id),
  leadgen_id text not null,               -- Meta's own lead id, for de-dup across polls
  form_id text,
  form_name text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  ad_id text,
  ad_name text,
  full_name text,
  email text,
  phone text,
  field_data jsonb default '[]',          -- raw Meta field_data array — every question this form asked, answers included
  status text default 'new',              -- 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
  assigned_to text,                       -- backend/data/users.json user id, same convention as mentions/inbox_messages.assigned_to
  notes text,
  created_time timestamptz,               -- when the lead actually submitted the form, per Meta
  captured_at timestamptz default now(),  -- when this app first saw it
  notified_at timestamptz,
  unique(social_account_id, leadgen_id)
);

create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_social_account_id on leads(social_account_id);
create index if not exists idx_leads_created_time on leads(created_time desc);
