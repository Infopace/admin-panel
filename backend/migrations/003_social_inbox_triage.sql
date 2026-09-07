-- Phase 3 addition: triage fields for the unified Inbox (mentions +
-- inbox_messages merged into one queries/leads view — see
-- GET /api/social/interactions in routes/social.js).
--
-- interaction_status is deliberately separate from inbox_messages'
-- existing `status` column (unread/read/replied, a read-tracking flag
-- routes/social.js already sets when a reply is sent) — this is a triage
-- workflow state instead, shared across both tables so mentions (which
-- had no status at all before this) and inbox_messages can be filtered
-- and sorted the same way in one merged list.
--
-- assigned_to stores a backend/data/users.json user id (see
-- backend/lib/users.js) — this repo's admin accounts, not a separate
-- "team members" table. Nullable: an interaction starts unassigned.
--
-- Run this against the same project as 001_social_schema.sql and
-- 002_social_phase2.sql.
alter table mentions
  add column if not exists interaction_status text not null default 'open',  -- 'open' | 'under_review' | 'closed'
  add column if not exists priority text not null default 'medium',          -- 'low' | 'medium' | 'high'
  add column if not exists assigned_to text;

alter table inbox_messages
  add column if not exists interaction_status text not null default 'open',
  add column if not exists priority text not null default 'medium',
  add column if not exists assigned_to text;

create index if not exists idx_mentions_interaction_status on mentions(interaction_status);
create index if not exists idx_inbox_messages_interaction_status on inbox_messages(interaction_status);
