/**
 * One-off backfill for leads captured before the internal new-lead email
 * ever worked (SMTP was a placeholder password until this was fixed —
 * see backend/.env) — the team was never actually told about them.
 * Rather than send one "New lead: ..." email per lead (90+ emails each,
 * for every address in LEADS_NOTIFY_EMAIL), this sends ONE digest email
 * listing every lead that hasn't been internally notified yet.
 *
 * internal_notify_sent only flips to true for leads that were actually
 * included in a digest that sendMail() confirmed — if the send fails,
 * every row is left exactly as it was (still false), so re-running this
 * script after fixing whatever broke will pick up the exact same leads,
 * never silently skip one, and never double up once it's succeeded.
 *
 * Usage: node backend/scripts/backfill-lead-notification-digest.js
 *        node backend/scripts/backfill-lead-notification-digest.js --dry-run
 * --dry-run builds the digest and prints it (recipients, lead count, the
 * text body) without sending anything or touching the database — use it
 * to sanity-check content/count first.
 * Safe to re-run — only touches rows where internal_notify_sent is false.
 */

require('dotenv').config();
const { getSocialClient } = require('../social/db');
const email = require('../lib/email');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildDigest(leads) {
  const rows = leads.map(l => ({
    date: l.created_time ? new Date(l.created_time).toLocaleString() : '—',
    name: l.full_name || '—',
    email: l.email || '—',
    phone: l.phone || '—',
    source: l.campaign_name || l.form_name || '—',
    status: l.status || 'new'
  }));

  const subject = `Lead digest: ${leads.length} lead${leads.length === 1 ? '' : 's'} awaiting internal review`;

  const text = [
    `${leads.length} lead(s) captured in the admin panel hadn't triggered an internal notification yet (this is a one-time catch-up, not a sign new leads are being missed going forward).`,
    '',
    ...rows.map((r, i) => [
      `${i + 1}. ${r.name}`,
      `   Email: ${r.email}`,
      `   Phone: ${r.phone}`,
      `   Source: ${r.source}`,
      `   Status: ${r.status}`,
      `   Submitted: ${r.date}`
    ].join('\n')),
    '',
    'Open the Leads section in the admin panel to follow up.'
  ].join('\n');

  const html = `
    <p>${leads.length} lead(s) captured in the admin panel hadn't triggered an internal notification yet (this is a one-time catch-up, not a sign new leads are being missed going forward).</p>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
      <thead>
        <tr style="background:#f2f2f2">
          <th>Name</th><th>Email</th><th>Phone</th><th>Source</th><th>Status</th><th>Submitted</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.email)}</td>
          <td>${escapeHtml(r.phone)}</td>
          <td>${escapeHtml(r.source)}</td>
          <td>${escapeHtml(r.status)}</td>
          <td>${escapeHtml(r.date)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p>Open the Leads section in the admin panel to follow up.</p>
  `;

  return { subject, text, html };
}

async function main() {
  const client = getSocialClient();
  if (!client) { console.error('Social Supabase project not configured.'); process.exit(1); }

  const recipients = (process.env.LEADS_NOTIFY_EMAIL || '').split(',').map(s => s.trim()).filter(Boolean);
  if (recipients.length === 0) { console.error('LEADS_NOTIFY_EMAIL is not set — nothing to send to.'); process.exit(1); }
  if (!email.isConfigured()) { console.error('SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS).'); process.exit(1); }

  const { data: leads, error } = await client
    .from('leads')
    .select('*')
    .eq('internal_notify_sent', false)
    .order('created_time', { ascending: false });
  if (error) { console.error('Could not read leads:', error.message); process.exit(1); }

  if (!leads || leads.length === 0) {
    console.log('Nothing to do — every lead already has internal_notify_sent = true.');
    return;
  }

  const { subject, text, html } = buildDigest(leads);

  if (process.argv.includes('--dry-run')) {
    console.log(`[dry run] Would send to: ${recipients.join(', ')}`);
    console.log(`[dry run] Subject: ${subject}`);
    console.log(`[dry run] Lead count: ${leads.length}`);
    console.log('[dry run] ---- text body ----');
    console.log(text);
    console.log('[dry run] Nothing sent, nothing updated.');
    return;
  }

  console.log(`Sending one digest covering ${leads.length} lead(s) to: ${recipients.join(', ')}`);
  await email.sendMail({ to: recipients.join(','), subject, text, html });
  console.log('Digest sent.');

  const now = new Date().toISOString();
  const { error: updateError } = await client
    .from('leads')
    .update({ internal_notify_sent: true, notified_at: now })
    .in('id', leads.map(l => l.id));
  if (updateError) {
    // The email is already out — don't pretend otherwise, but make the
    // inconsistency loud so it gets fixed rather than silently re-sent.
    console.error('Digest sent but marking internal_notify_sent failed — fix and re-run will re-send the whole digest:', updateError.message);
    process.exit(1);
  }

  console.log(`Marked internal_notify_sent = true for ${leads.length} lead(s).`);
}

main().catch(err => { console.error('Backfill failed:', err.message); process.exit(1); });
