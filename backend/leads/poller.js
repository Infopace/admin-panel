/**
 * Meta Lead Ads capture — same "plain setInterval sweep" shape as
 * social/pollers.js's inbound sync, not BullMQ (there's no per-item
 * retry/ordering need here, just "try again next sweep" on failure).
 *
 * Every active Facebook social_accounts row gets its leadgen forms
 * polled every POLL_INTERVAL_MS; genuinely new leads (not already in the
 * `leads` table, checked by leadgen_id before inserting so a re-poll of
 * already-seen leads is a no-op) get inserted and trigger one email
 * notification each via backend/lib/email.js. Instagram doesn't need its
 * own sweep here — Instant Form leads are a Page-owned asset regardless
 * of which placement the ad ran on, so facebook.js's fetchLeads()
 * already covers both (see that file's header).
 */

const { getSocialClient } = require('../social/db');
const { getUsableAccount } = require('../social/accounts');
const email = require('../lib/email');

const POLL_INTERVAL_MS = 5 * 60 * 1000; // leads are time-sensitive for sales follow-up — tighter than the 10 min mentions/inbox cadence
let intervalHandle = null;

function formatFieldData(fieldData) {
  return (fieldData || [])
    .map(f => `${f.name}: ${(f.values || []).join(', ')}`)
    .join('\n');
}

async function notifyNewLead(lead) {
  const recipients = (process.env.LEADS_NOTIFY_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean);
  if (recipients.length === 0 || !email.isConfigured()) return; // notification is best-effort/opt-in — the lead itself is already saved either way

  const subject = `New lead: ${lead.full_name || lead.email || lead.phone || 'Untitled'} (${lead.campaign_name || lead.form_name || 'Meta Lead Ad'})`;
  const text = [
    `A new lead came in from ${lead.form_name || 'a Meta Lead Ad form'}.`,
    '',
    `Name: ${lead.full_name || '—'}`,
    `Email: ${lead.email || '—'}`,
    `Phone: ${lead.phone || '—'}`,
    `Campaign: ${lead.campaign_name || '—'}`,
    `Ad: ${lead.ad_name || '—'}`,
    `Submitted: ${lead.created_time || '—'}`,
    '',
    'All answers:',
    formatFieldData(lead.field_data),
    '',
    'Open the Leads section in the admin panel to follow up.'
  ].join('\n');

  await email.sendMail({ to: recipients.join(','), subject, text });
}

async function pollAccount(client, row) {
  const usable = await getUsableAccount(row.id);
  if (!usable) return; // account row vanished between the list query and here
  const { account, adapter } = usable;
  if (typeof adapter.fetchLeads !== 'function') return;

  const fetched = await adapter.fetchLeads(account);
  if (fetched.length === 0) return;

  const { data: existing, error: existingError } = await client
    .from('leads')
    .select('leadgen_id')
    .eq('social_account_id', account.id)
    .in('leadgen_id', fetched.map(l => l.externalId));
  if (existingError) throw existingError;

  const existingIds = new Set((existing || []).map(r => r.leadgen_id));
  const newLeads = fetched.filter(l => !existingIds.has(l.externalId));
  if (newLeads.length === 0) return;

  const rows = newLeads.map(l => ({
    social_account_id: account.id,
    leadgen_id: l.externalId,
    form_id: l.formId,
    form_name: l.formName,
    campaign_id: l.campaignId,
    campaign_name: l.campaignName,
    adset_id: l.adsetId,
    ad_id: l.adId,
    ad_name: l.adName,
    full_name: l.fullName,
    email: l.email,
    phone: l.phone,
    field_data: l.fieldData,
    created_time: l.createdTime
  }));

  const { data: inserted, error: insertError } = await client.from('leads').insert(rows).select();
  if (insertError) throw insertError;

  for (const lead of inserted || []) {
    try {
      await notifyNewLead(lead);
      await client.from('leads').update({ notified_at: new Date().toISOString() }).eq('id', lead.id);
    } catch (err) {
      console.error(`[leads/poller] Could not send notification for lead ${lead.id}:`, err.message);
    }
  }
}

async function sweep() {
  const client = getSocialClient();
  if (!client) return; // social project not configured — nothing to poll yet

  const { data: accounts, error } = await client
    .from('social_accounts')
    .select('id, platform')
    .eq('platform', 'facebook')
    .eq('status', 'active');
  if (error) {
    console.error('[leads/poller] Could not list active Facebook accounts:', error.message);
    return;
  }

  for (const row of accounts || []) {
    await pollAccount(client, row).catch(err => console.error(`[leads/poller] Unexpected failure polling account ${row.id}:`, err.message));
  }
}

function start() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => { sweep().catch(err => console.error('[leads/poller] sweep failed:', err.message)); }, POLL_INTERVAL_MS);
  sweep().catch(err => console.error('[leads/poller] initial sweep failed:', err.message));
  console.log('[leads/poller] Meta Lead Ads sync started (5 min interval).');
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { start, stop, sweep };
