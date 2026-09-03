/**
 * Phase 1's publish scheduler — a plain setInterval poller over
 * scheduled_posts, deliberately NOT the BullMQ+Redis queue the build
 * spec calls for in Phase 2 (social/queue.js). Phase 1's acceptance bar
 * is "schedule a post, see it actually publish, see it show as
 * published" for YouTube/Google Business Profile only — this is the
 * smallest thing that can satisfy that honestly, matching this repo's
 * existing habit of a simple first pass (see health-stats.json's
 * counters-only tracking) over building infrastructure a phase early.
 *
 * Replace this file's tick() body with a BullMQ worker in Phase 2 without
 * changing its callers — server.js only calls start()/stop().
 */

const { getSocialClient } = require('./db');
const { getUsableAccount } = require('./accounts');

const POLL_INTERVAL_MS = 60 * 1000;
let intervalHandle = null;

async function publishOne(post) {
  const client = getSocialClient();
  await client.from('scheduled_posts').update({ status: 'publishing' }).eq('id', post.id);

  const results = { ...(post.platform_results || {}) };
  let anyFailure = false;

  for (const accountId of post.target_account_ids) {
    try {
      const usable = await getUsableAccount(accountId);
      if (!usable) throw new Error(`social_accounts row ${accountId} not found.`);
      const { account, adapter } = usable;
      if (typeof adapter.publish !== 'function') throw new Error(`${account.platform} adapter has no publish().`);

      const result = await adapter.publish(account, { content: post.content, mediaUrls: post.media_urls || [] });
      results[account.platform] = { status: 'published', ...result };
    } catch (err) {
      anyFailure = true;
      // account/platform not resolvable if getUsableAccount itself threw —
      // fall back to a generic key so the failure isn't silently dropped.
      results[accountId] = { status: 'failed', error: err.message };
      console.error(`[social/scheduler] Failed to publish scheduled_posts row ${post.id} to account ${accountId}:`, err.message);
    }
  }

  await client
    .from('scheduled_posts')
    .update({ status: anyFailure ? 'failed' : 'published', platform_results: results })
    .eq('id', post.id);
}

async function tick() {
  const client = getSocialClient();
  if (!client) return; // social project not configured — nothing to poll yet

  const { data: due, error } = await client
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString());

  if (error) {
    console.error('[social/scheduler] Could not query due scheduled_posts:', error.message);
    return;
  }

  for (const post of due || []) {
    await publishOne(post).catch(err => console.error(`[social/scheduler] Unhandled error publishing ${post.id}:`, err.message));
  }
}

function start() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => { tick().catch(err => console.error('[social/scheduler] tick failed:', err.message)); }, POLL_INTERVAL_MS);
  tick().catch(err => console.error('[social/scheduler] initial tick failed:', err.message));
  console.log('[social/scheduler] Started (60s poll interval, Phase 1 mode — no queue/retry yet).');
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { start, stop, tick };
