/**
 * One-off: subscribes this app to a WhatsApp Business Account's webhook
 * events (POST /{waba-id}/subscribed_apps), using the access token already
 * stored for the connected whatsapp social_accounts row — the same token
 * that successfully fetched this WABA's phone numbers during connect, so
 * it's proven to have access, unlike an ad-hoc Graph API Explorer token.
 *
 * Usage: node scripts/subscribe-whatsapp-webhook.js <waba-id>
 * Run from the backend/ directory so .env loads correctly.
 */

require('dotenv').config();
const { getSocialClient } = require('../social/db');
const tokenCrypto = require('../social/crypto');
const metaOAuth = require('../social/adapters/_meta-oauth');

async function main() {
  const wabaId = process.argv[2];
  if (!wabaId) {
    console.error('Usage: node scripts/subscribe-whatsapp-webhook.js <waba-id>');
    process.exit(1);
  }

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

  console.log(`Found connected WhatsApp account: ${row.account_label || row.external_account_id}`);
  const accessToken = tokenCrypto.decrypt(row.access_token);

  try {
    const result = await metaOAuth.graphPost(`/${wabaId}/subscribed_apps`, { access_token: accessToken });
    console.log('Success:', JSON.stringify(result));
  } catch (err) {
    console.error('Failed:', err.message);
    if (err.graphErrorCode) console.error('Graph error code:', err.graphErrorCode);
    process.exit(1);
  }
}

main();
