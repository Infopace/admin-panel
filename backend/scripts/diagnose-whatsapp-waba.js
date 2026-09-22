/**
 * One-off: finds the WhatsApp Business Account id(s) the connected
 * account's stored token actually has whatsapp_business_management
 * access to (per /debug_token's granular_scopes — the same lookup
 * connect.exchangeCode() used originally to pick a WABA), and for each
 * one lists its phone numbers so you can confirm which WABA id matches
 * the connected phone number before passing it to
 * subscribe-whatsapp-webhook.js.
 *
 * Usage: node scripts/diagnose-whatsapp-waba.js
 * Run from the backend/ directory so .env loads correctly.
 */

require('dotenv').config();
const { getSocialClient } = require('../social/db');
const tokenCrypto = require('../social/crypto');
const metaOAuth = require('../social/adapters/_meta-oauth');

async function main() {
  const client = getSocialClient();
  if (!client) {
    console.error('SUPABASE_URL_SOCIAL / SUPABASE_KEY_SOCIAL not set in backend/.env');
    process.exit(1);
  }

  const { data: row, error } = await client
    .from('social_accounts')
    .select('*')
    .eq('platform', 'whatsapp')
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    console.error('Supabase query failed:', error.message);
    process.exit(1);
  }
  if (!row) {
    console.error('No active whatsapp row found in social_accounts.');
    process.exit(1);
  }

  console.log(`Connected account: ${row.account_label || row.external_account_id}`);
  console.log(`Stored phone_number_id (external_account_id): ${row.external_account_id}`);

  const accessToken = tokenCrypto.decrypt(row.access_token);

  let wabaIds;
  try {
    wabaIds = await metaOAuth.grantedTargetIds(accessToken, 'whatsapp_business_management');
  } catch (err) {
    console.error('Could not read /debug_token granular_scopes:', err.message);
    process.exit(1);
  }

  if (wabaIds.length === 0) {
    console.error('This token has whatsapp_business_management granted but scoped to zero WhatsApp Business Accounts. The stored token itself may be stale — reconnect the account from Connect Accounts and try again.');
    process.exit(1);
  }

  console.log(`\nToken has whatsapp_business_management access to ${wabaIds.length} WABA(s):`);
  for (const wabaId of wabaIds) {
    let phoneNumbers;
    try {
      const res = await metaOAuth.graphFetch(`/${wabaId}/phone_numbers`, { access_token: accessToken });
      phoneNumbers = res.data || [];
    } catch (err) {
      console.log(`  - ${wabaId}  (could not list phone numbers: ${err.message})`);
      continue;
    }
    const match = phoneNumbers.some(p => p.id === row.external_account_id);
    console.log(`  - ${wabaId}${match ? '  <-- matches the connected phone number, use this one' : ''}`);
    for (const p of phoneNumbers) {
      console.log(`      phone: ${p.display_phone_number || p.id} (${p.id})`);
    }
  }
}

main();
