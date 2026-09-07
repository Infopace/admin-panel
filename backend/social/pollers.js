/**
 * Inbound sync: the piece Phase 1/2 never actually wired up. Every
 * adapter already exports fetchMentions()/fetchInbox() (see youtube.js's
 * header for the shared contract), but until now nothing called them —
 * routes/social.js's GET /social/mentions and /social/inbox just read
 * whatever was already in those tables, which was always empty. This
 * sweep is what actually populates them, on a plain setInterval like
 * social/scheduler.js's reconciliation sweep (not BullMQ — inbound
 * polling has no per-item retry/ordering need the way publishing does,
 * just "try again next sweep" on failure).
 *
 * Upserts on the tables' existing unique(platform, external_id) /
 * unique(platform, external_message_id) constraints, so a re-poll of
 * already-seen items is a no-op rather than a duplicate row.
 */

const { getSocialClient } = require('./db');
const { getUsableAccount } = require('./accounts');
const ADAPTERS = require('./adapters');

const POLL_INTERVAL_MS = 10 * 60 * 1000; // inbound APIs here are typically rate/quota-limited; no need to poll as tightly as the publish sweep
let intervalHandle = null;

async function pollAccount(client, row) {
  const usable = await getUsableAccount(row.id);
  if (!usable) return; // account row vanished between the list query and here
  const { account, adapter } = usable;

  if (typeof adapter.fetchMentions === 'function') {
    try {
      const mentions = await adapter.fetchMentions(account);
      if (mentions.length > 0) {
        const rows = mentions.map(m => ({
          social_account_id: account.id,
          platform: account.platform,
          external_id: m.externalId,
          author: m.author || null,
          text: m.text || null,
          url: m.url || null,
          captured_at: m.capturedAt || new Date().toISOString()
        }));
        const { error } = await client.from('mentions').upsert(rows, { onConflict: 'platform,external_id', ignoreDuplicates: true });
        if (error) throw error;
      }
    } catch (err) {
      console.error(`[social/pollers] fetchMentions failed for ${account.platform} account ${account.id}:`, err.message);
    }
  }

  if (typeof adapter.fetchInbox === 'function') {
    try {
      const messages = await adapter.fetchInbox(account);
      if (messages.length > 0) {
        const rows = messages.map(m => ({
          social_account_id: account.id,
          platform: account.platform,
          external_thread_id: m.externalThreadId,
          // Adapters return the conversation's current latest snippet, not
          // a stable per-message id (Graph API's /conversations endpoint
          // doesn't expose one without a second per-message fetch this
          // adapter layer doesn't do) — thread id + its own reported
          // timestamp is what makes a *new* message in an existing
          // thread upsert as a new row instead of being silently ignored
          // as a duplicate of the first message ever seen on that thread.
          external_message_id: m.externalMessageId || `${m.externalThreadId}:${m.receivedAt || ''}`,
          sender: m.sender || null,
          message: m.message || null,
          direction: 'inbound',
          received_at: m.receivedAt || new Date().toISOString()
        }));
        const { error } = await client.from('inbox_messages').upsert(rows, { onConflict: 'platform,external_message_id', ignoreDuplicates: true });
        if (error) throw error;
      }
    } catch (err) {
      console.error(`[social/pollers] fetchInbox failed for ${account.platform} account ${account.id}:`, err.message);
    }
  }
}

async function sweep() {
  const client = getSocialClient();
  if (!client) return; // social project not configured — nothing to poll yet

  const { data: accounts, error } = await client.from('social_accounts').select('id, platform').eq('status', 'active');
  if (error) {
    console.error('[social/pollers] Could not list active social_accounts:', error.message);
    return;
  }

  for (const row of accounts || []) {
    if (!ADAPTERS[row.platform]) continue; // e.g. a platform value with no registered adapter
    await pollAccount(client, row).catch(err => console.error(`[social/pollers] Unexpected failure polling account ${row.id}:`, err.message));
  }
}

function start() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => { sweep().catch(err => console.error('[social/pollers] sweep failed:', err.message)); }, POLL_INTERVAL_MS);
  sweep().catch(err => console.error('[social/pollers] initial sweep failed:', err.message));
  console.log('[social/pollers] Inbound mentions/inbox sync started (10 min interval).');
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { start, stop, sweep };
