-- Phase 2 addition: an atomic merge into scheduled_posts.platform_results.
--
-- Phase 1's scheduler published every target account for a post
-- sequentially in one tick, so a plain read-modify-write on
-- platform_results was safe — nothing else could be writing to that row
-- at the same time. Phase 2's BullMQ queue processes one job per
-- (post, account) pair, and a post targeting multiple accounts now has
-- multiple workers potentially finishing at nearly the same instant — a
-- read-modify-write from application code would race and could silently
-- drop one account's result. This function makes the merge a single
-- atomic UPDATE instead.
--
-- Run this against the same project as 001_social_schema.sql.
create or replace function merge_platform_result(p_post_id uuid, p_key text, p_result jsonb)
returns void
language sql
as $$
  update scheduled_posts
  set platform_results = coalesce(platform_results, '{}'::jsonb) || jsonb_build_object(p_key, p_result)
  where id = p_post_id;
$$;
