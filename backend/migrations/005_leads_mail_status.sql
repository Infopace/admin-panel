-- Explicit sent/not-sent status for the two emails backend/leads/poller.js
-- fires per new lead (see notifyNewLead / notifyLeadSubmitter there).
-- Both default false and only ever flip to true right after
-- email.sendMail() actually succeeds; any failure (bad address, SMTP
-- error) — or simply nothing to send to (no email on the lead, SMTP not
-- configured) — leaves it false. notified_at is kept as-is (timestamp of
-- the internal alert specifically); these add a queryable boolean next
-- to it, split per email since one can succeed while the other fails.
--
-- Run this against the same project as 001-004.
alter table leads add column if not exists internal_notify_sent boolean not null default false;
alter table leads add column if not exists lead_ack_sent boolean not null default false;
