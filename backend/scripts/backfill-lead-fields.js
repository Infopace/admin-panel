/**
 * One-off backfill for leads inserted before facebook.js's pickLeadField()
 * became case-insensitive and before 'work_email' was added to
 * EMAIL_FIELDS (see that file). The poller only ever inserts new leads —
 * it never re-derives full_name/email/phone for a leadgen_id already in
 * the table — so any lead captured with a form using differently-cased
 * or differently-named field keys (e.g. FULL_NAME/PHONE/EMAIL instead of
 * full_name/phone_number/email) is stuck showing "Unnamed lead" forever
 * unless corrected here, even though the raw answer was already saved in
 * field_data all along.
 *
 * Usage: node backend/scripts/backfill-lead-fields.js
 * Safe to re-run — only touches rows where the derived value differs
 * from what's stored, and only ever fills in a value, never blanks one.
 */

require('dotenv').config();
const { getSocialClient } = require('../social/db');

const NAME_FIELDS = ['full_name', 'first_name'];
const EMAIL_FIELDS = ['email', 'work_email'];
const PHONE_FIELDS = ['phone_number', 'phone'];

function pickLeadField(fieldData, names) {
  for (const name of names) {
    const field = (fieldData || []).find(f => f.name && f.name.toLowerCase() === name.toLowerCase());
    if (field && field.values && field.values[0]) return field.values[0];
  }
  return null;
}

async function main() {
  const client = getSocialClient();
  if (!client) {
    console.error('Social Supabase project not configured (SUPABASE_URL_SOCIAL / SUPABASE_KEY_SOCIAL).');
    process.exit(1);
  }

  const { data: leads, error } = await client
    .from('leads')
    .select('id, full_name, email, phone, field_data')
    .not('field_data', 'is', null);
  if (error) throw error;

  let updated = 0;
  for (const lead of leads || []) {
    const derivedName = pickLeadField(lead.field_data, NAME_FIELDS);
    const derivedEmail = pickLeadField(lead.field_data, EMAIL_FIELDS);
    const derivedPhone = pickLeadField(lead.field_data, PHONE_FIELDS);

    const patch = {};
    if (!lead.full_name && derivedName) patch.full_name = derivedName;
    if (!lead.email && derivedEmail) patch.email = derivedEmail;
    if (!lead.phone && derivedPhone) patch.phone = derivedPhone;

    if (Object.keys(patch).length === 0) continue;

    const { error: updateError } = await client.from('leads').update(patch).eq('id', lead.id);
    if (updateError) {
      console.error(`Could not update lead ${lead.id}:`, updateError.message);
      continue;
    }
    updated++;
    console.log(`Updated lead ${lead.id}:`, patch);
  }

  console.log(`Done — ${updated} lead(s) backfilled out of ${(leads || []).length} checked.`);
}

main().catch(err => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
